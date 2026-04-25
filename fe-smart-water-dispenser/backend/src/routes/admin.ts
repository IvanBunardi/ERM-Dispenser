import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";
import {
  adminUsers,
  alerts,
  auditLogs,
  deviceCommands,
  dispenseSessions,
  machineEvents,
  machineStatusSnapshots,
  machineVolumeOptions,
  machines,
  payments,
  transactions,
  customerImpactSnapshots,
} from "../db/schema.js";
import { getAdminAuth } from "../lib/auth.js";
import {
  appendTransactionState,
  buildDashboardSummary,
  getActiveMachineTransaction,
  getLatestMachineStatus,
  getMachineSummaryList,
  parseCommandPayload,
  publishMachineCommand,
} from "../lib/domain.js";
import { ADMIN_COOKIE_NAME, clearSessionCookie, fail, ok, setSessionCookie } from "../lib/http.js";
import { jsonStringify } from "../lib/utils.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const machineActionSchema = z.object({
  action: z.enum(["SET_MAINTENANCE", "RESUME_OPERATION", "CANCEL_ACTIVE_TRANSACTION", "SYNC_STATUS", "RESEND_LAST_COMMAND", "TOGGLE_QRIS_ACCEPTANCE"]),
  payload: z.record(z.any()).optional(),
});

export async function registerAdminRoutes(app: FastifyInstance, services: AppServices) {
  app.post("/api/admin/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid login payload");
    }

    const db = services.dbClient.db as any;
    const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.email, parsed.data.email)).limit(1);
    if (!admin) {
      return fail(reply, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const isValid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
    if (!isValid) {
      return fail(reply, 401, "INVALID_CREDENTIALS", "Invalid credentials");
    }

    const token = await services.session.sign(
      {
        sub: admin.id,
        kind: "admin",
        sid: `admin-${admin.id}`,
        role: "owner",
      },
      "7d",
    );
    setSessionCookie(reply, ADMIN_COOKIE_NAME, token, 7 * 24 * 60 * 60);
    return ok(reply, {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
      },
    });
  });

  app.post("/api/admin/auth/logout", async (_request, reply) => {
    clearSessionCookie(reply, ADMIN_COOKIE_NAME);
    return ok(reply, { loggedOut: true });
  });

  app.get("/api/admin/auth/me", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");
    }

    return ok(reply, {
      admin: {
        id: auth.user.id,
        email: auth.user.email,
        fullName: auth.user.fullName,
      },
      roles: auth.roles,
    });
  });

  app.get("/api/admin/dashboard/summary", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");
    }
    return ok(reply, await buildDashboardSummary(services));
  });

  app.get("/api/admin/transactions", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const db = services.dbClient.db as any;
    const rows = await db
      .select({
        transaction: transactions,
        payment: payments,
        machineName: machines.displayName,
        machineCode: machines.machineCode,
      })
      .from(transactions)
      .leftJoin(payments, eq(payments.transactionId, transactions.id))
      .innerJoin(machines, eq(machines.id, transactions.machineId))
      .orderBy(desc(transactions.createdAt));

    return ok(reply, rows);
  });

  app.get("/api/admin/transactions/:transactionId", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { transactionId } = request.params as { transactionId: string };
    const db = services.dbClient.db as any;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) return fail(reply, 404, "NOT_FOUND", "Transaction not found");
    const [payment] = await db.select().from(payments).where(eq(payments.transactionId, transactionId)).limit(1);
    const [dispenseSession] = await db.select().from(dispenseSessions).where(eq(dispenseSessions.transactionId, transactionId)).limit(1);
    const logs = await db.select().from(machineEvents).where(eq(machineEvents.transactionId, transactionId)).orderBy(desc(machineEvents.occurredAt));
    return ok(reply, {
      transaction,
      payment,
      dispenseSession,
      logs,
    });
  });

  app.post("/api/admin/transactions/:transactionId/reconcile", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { transactionId } = request.params as { transactionId: string };
    const db = services.dbClient.db as any;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) return fail(reply, 404, "NOT_FOUND", "Transaction not found");

    const verified = await services.midtrans.verifyNotification({ order_id: transaction.orderId });
    await db
      .update(payments)
      .set({
        transactionStatus: verified.transactionStatus,
        fraudStatus: verified.fraudStatus ?? null,
        providerTransactionId: verified.providerTransactionId ?? null,
      })
      .where(eq(payments.transactionId, transaction.id));

    if (verified.transactionStatus === "settlement" || verified.transactionStatus === "capture") {
      await db
        .update(transactions)
        .set({
          paymentStatus: "PAID",
          dispenseStatus: transaction.dispenseStatus === "WAITING_PAYMENT" ? "WAITING_BOTTLE" : transaction.dispenseStatus,
        })
        .where(eq(transactions.id, transaction.id));
    }

    await db.insert(auditLogs).values({
      id: randomUUID(),
      adminUserId: auth.user.id,
      action: "RECONCILE_TRANSACTION",
      targetType: "transaction",
      targetId: transaction.id,
      afterData: jsonStringify(verified),
    });

    return ok(reply, { reconciled: true, status: verified.transactionStatus });
  });

  app.get("/api/admin/machines", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");
    return ok(reply, await getMachineSummaryList(services));
  });

  app.get("/api/admin/machines/:machineId", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { machineId } = request.params as { machineId: string };
    const db = services.dbClient.db as any;
    const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
    if (!machine) return fail(reply, 404, "NOT_FOUND", "Machine not found");

    const latestStatus = await getLatestMachineStatus(services, machine.id);
    const volumeOptions = await db.select().from(machineVolumeOptions).where(eq(machineVolumeOptions.machineId, machine.id));
    const logs = await db
      .select()
      .from(machineEvents)
      .where(eq(machineEvents.machineId, machine.id))
      .orderBy(desc(machineEvents.occurredAt))
      .limit(20);
    const activeTransaction = await getActiveMachineTransaction(services, machine.id);
    const openAlerts = await db
      .select()
      .from(alerts)
      .where(eq(alerts.machineId, machine.id))
      .orderBy(desc(alerts.createdAt))
      .limit(20);

    return ok(reply, {
      machine,
      latestStatus,
      volumeOptions,
      logs,
      activeTransaction,
      openAlerts,
    });
  });

  app.get("/api/admin/machines/:machineId/logs", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { machineId } = request.params as { machineId: string };
    const db = services.dbClient.db as any;
    const rows = await db
      .select()
      .from(machineEvents)
      .where(eq(machineEvents.machineId, machineId))
      .orderBy(desc(machineEvents.occurredAt))
      .limit(100);

    return ok(reply, rows);
  });

  app.post("/api/admin/machines/:machineId/actions", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const parsed = machineActionSchema.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, "BAD_REQUEST", "Invalid machine action");

    const { machineId } = request.params as { machineId: string };
    const db = services.dbClient.db as any;
    const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
    if (!machine) return fail(reply, 404, "NOT_FOUND", "Machine not found");

    if (parsed.data.action === "SET_MAINTENANCE") {
      await db
        .update(machines)
        .set({
          operationStatus: "MAINTENANCE",
          updatedAt: new Date(),
        })
        .where(eq(machines.id, machine.id));
    }

    if (parsed.data.action === "RESUME_OPERATION") {
      await db
        .update(machines)
        .set({
          operationStatus: "IDLE",
          updatedAt: new Date(),
        })
        .where(eq(machines.id, machine.id));
    }

    if (parsed.data.action === "CANCEL_ACTIVE_TRANSACTION") {
      const active = await getActiveMachineTransaction(services, machine.id);
      if (active) {
        await db
          .update(transactions)
          .set({
            dispenseStatus: "CANCELLED",
          })
          .where(eq(transactions.id, active.id));
        await appendTransactionState(services, active.id, "CANCELLED", "ADMIN", auth.user.id, active.dispenseStatus);
        await publishMachineCommand(services, {
          machineId: machine.id,
          machineCode: machine.machineCode,
          transactionId: active.id,
          adminUserId: auth.user.id,
          commandType: "CANCEL_ORDER",
          payload: {
            transactionId: active.id,
          },
        });
      }
    }

    if (parsed.data.action === "SYNC_STATUS") {
      await publishMachineCommand(services, {
        machineId: machine.id,
        machineCode: machine.machineCode,
        adminUserId: auth.user.id,
        commandType: "SYNC_STATUS",
        payload: {},
      });
    }

    if (parsed.data.action === "RESEND_LAST_COMMAND") {
      const [lastCommand] = await db
        .select()
        .from(deviceCommands)
        .where(eq(deviceCommands.machineId, machine.id))
        .orderBy(desc(deviceCommands.issuedAt))
        .limit(1);
      if (lastCommand) {
        await publishMachineCommand(services, {
          machineId: machine.id,
          machineCode: machine.machineCode,
          transactionId: lastCommand.transactionId ?? null,
          adminUserId: auth.user.id,
          commandType: lastCommand.commandType,
          payload: parseCommandPayload(lastCommand.payload),
        });
      }
    }

    await db.insert(auditLogs).values({
      id: randomUUID(),
      adminUserId: auth.user.id,
      action: parsed.data.action,
      targetType: "machine",
      targetId: machine.id,
      afterData: jsonStringify(parsed.data.payload ?? {}),
    });

    return ok(reply, { executed: true, action: parsed.data.action });
  });

  app.get("/api/admin/reports/environmental-impact", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const db = services.dbClient.db as any;
    const txRows = await db.select().from(transactions);
    const impactRows = await db.select().from(customerImpactSnapshots);
    const waterDistributedLiters =
      txRows.filter((row: any) => row.dispenseStatus === "COMPLETED").reduce((sum: number, row: any) => sum + row.volumeMl, 0) / 1000;
    const plasticBottlesSaved = impactRows.reduce((sum: number, row: any) => sum + row.bottlesSaved, 0);
    const co2ReducedKg = impactRows.reduce((sum: number, row: any) => sum + row.co2ReducedGrams, 0) / 1000;
    return ok(reply, {
      waterDistributedLiters,
      plasticBottlesSaved,
      co2ReducedKg,
      wastePreventedLiters: Math.round(waterDistributedLiters * 0.05),
      energyEfficiencyPct: 94,
    });
  });

  app.get("/api/admin/alerts", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const db = services.dbClient.db as any;
    const rows = await db.select().from(alerts).orderBy(desc(alerts.createdAt));
    return ok(reply, rows);
  });

  app.post("/api/admin/alerts/:alertId/resolve", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { alertId } = request.params as { alertId: string };
    const db = services.dbClient.db as any;
    await db
      .update(alerts)
      .set({
        status: "RESOLVED",
        resolvedByAdminId: auth.user.id,
        resolvedAt: new Date(),
      })
      .where(eq(alerts.id, alertId));
    return ok(reply, { resolved: true });
  });

  app.get("/api/admin/audit-logs", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");
    const db = services.dbClient.db as any;
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
    return ok(reply, rows);
  });
}
