import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";
import {
  adminUsers,
  adminRoles,
  adminUserRoles,
  alerts,
  auditLogs,
  deviceCommands,
  dispenseSessions,
  machineEvents,
  machineStatusSnapshots,
  machineVolumeOptions,
  machines,
  payments,
  sites,
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
import { jsonStringify, safeJsonParse } from "../lib/utils.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const machineActionSchema = z.object({
  action: z.enum(["SET_MAINTENANCE", "RESUME_OPERATION", "CANCEL_ACTIVE_TRANSACTION", "SYNC_STATUS", "RESEND_LAST_COMMAND", "TOGGLE_QRIS_ACCEPTANCE", "REFILL_TANK"]),
  payload: z.record(z.any()).optional(),
});

const FULL_TANK_LITERS = 19;

const createMachineSchema = z.object({
  machineCode: z.string().trim().min(3).max(32),
  shortCode: z.string().trim().min(3).max(16),
  displayName: z.string().trim().min(3).max(120),
  siteName: z.string().trim().min(3).max(120),
  siteAddress: z.string().trim().max(240).optional().default(""),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  imageUrl: z.string().url().optional().or(z.literal("")).default(""),
  firmwareVersion: z.string().trim().max(60).optional().default("sim-1.0.0"),
  initialTankLevelPct: z.number().int().min(0).max(100).optional().default(100),
  price500ml: z.number().int().positive().optional().default(2000),
  price1l: z.number().int().positive().optional().default(4000),
});

const registerProviderSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().email(),
  password: z.string().min(8),
  institutionName: z.string().trim().min(3).max(120),
  phoneNumber: z.string().trim().min(10).max(20),
});

export async function registerAdminRoutes(app: FastifyInstance, services: AppServices) {
  async function cancelTransactionById(transactionId: string, adminUserId: string) {
    const db = services.dbClient.db as any;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) {
      return { ok: false as const, status: 404, code: "NOT_FOUND", message: "Transaction not found" };
    }

    if (["COMPLETED", "CANCELLED", "FAILED"].includes(transaction.dispenseStatus)) {
      return { ok: false as const, status: 409, code: "INVALID_STATE", message: "Transaction cannot be cancelled" };
    }

    const [machine] = await db.select().from(machines).where(eq(machines.id, transaction.machineId)).limit(1);

    await db
      .update(transactions)
      .set({
        dispenseStatus: "CANCELLED",
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));

    await db
      .update(dispenseSessions)
      .set({
        endedAt: new Date(),
        resultStatus: "CANCELLED",
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));

    await appendTransactionState(services, transaction.id, "CANCELLED", "ADMIN", adminUserId, transaction.dispenseStatus);

    if (machine) {
      await publishMachineCommand(services, {
        machineId: machine.id,
        machineCode: machine.machineCode,
        transactionId: transaction.id,
        adminUserId,
        commandType: "CANCEL_ORDER",
        payload: {
          transactionId: transaction.id,
        },
      });
    }

    await db.insert(auditLogs).values({
      id: randomUUID(),
      adminUserId,
      action: "CANCEL_TRANSACTION",
      targetType: "transaction",
      targetId: transaction.id,
      afterData: jsonStringify({ dispenseStatus: "CANCELLED" }),
    });

    return { ok: true as const, transactionId: transaction.id };
  }

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

  app.post("/api/admin/auth/register-provider", async (request, reply) => {
    const parsed = registerProviderSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid registration payload");
    }

    const { fullName, email, password, institutionName, phoneNumber } = parsed.data;
    const db = services.dbClient.db as any;

    // Check if user already exists
    const [existing] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
    if (existing) {
      return fail(reply, 409, "DUPLICATE_EMAIL", "Email already registered");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    const [admin] = await db
      .insert(adminUsers)
      .values({
        id: userId,
        email,
        fullName,
        institutionName,
        phoneNumber,
        passwordHash,
        isActive: true,
      })
      .returning();

    // Assign machine_provider role
    const [providerRole] = await db
      .select()
      .from(adminRoles)
      .where(eq(adminRoles.roleKey, "machine_provider"))
      .limit(1);

    if (providerRole) {
      await db.insert(adminUserRoles).values({
        id: randomUUID(),
        adminUserId: userId,
        adminRoleId: providerRole.id,
      });
    }

    const token = await services.session.sign(
      {
        sub: admin.id,
        kind: "admin",
        sid: `admin-${admin.id}`,
        role: "machine_provider",
      },
      "7d",
    );

    setSessionCookie(reply, ADMIN_COOKIE_NAME, token, 7 * 24 * 60 * 60);

    return ok(reply, {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        institutionName: admin.institutionName,
      },
    }, 201);
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

  app.post("/api/admin/transactions/:transactionId/cancel", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { transactionId } = request.params as { transactionId: string };
    const result = await cancelTransactionById(transactionId, auth.user.id);
    if (!result.ok) {
      return fail(reply, result.status, result.code, result.message);
    }

    return ok(reply, { cancelled: true, transactionId: result.transactionId });
  });

  app.get("/api/admin/machines", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");
    return ok(reply, await getMachineSummaryList(services));
  });

  app.post("/api/admin/machines", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const parsed = createMachineSchema.safeParse(request.body ?? {});
    if (!parsed.success) return fail(reply, 400, "BAD_REQUEST", "Invalid machine payload");

    const input = parsed.data;
    const db = services.dbClient.db as any;
    const [existingMachine] = await db
      .select()
      .from(machines)
      .where(eq(machines.machineCode, input.machineCode))
      .limit(1);
    if (existingMachine) return fail(reply, 409, "DUPLICATE_MACHINE", "Machine code already exists");

    const [existingShortCode] = await db
      .select()
      .from(machines)
      .where(eq(machines.shortCode, input.shortCode))
      .limit(1);
    if (existingShortCode) return fail(reply, 409, "DUPLICATE_SHORT_CODE", "Short code already exists");

    const siteId = randomUUID();
    const machineId = randomUUID();
    const siteCode = `SITE-${input.machineCode}`.toUpperCase();

    await db.insert(sites).values({
      id: siteId,
      code: siteCode,
      name: input.siteName,
      address: input.siteAddress || null,
      latitude: input.latitude !== null && input.latitude !== undefined ? String(input.latitude) : null,
      longitude: input.longitude !== null && input.longitude !== undefined ? String(input.longitude) : null,
    });

    const [machine] = await db
      .insert(machines)
      .values({
        id: machineId,
        machineCode: input.machineCode,
        shortCode: input.shortCode,
        siteId,
        displayName: input.displayName,
        imageUrl: input.imageUrl || null,
        isVerified: false,
        firmwareVersion: input.firmwareVersion || "sim-1.0.0",
        connectivityStatus: "OFFLINE",
        operationStatus: "IDLE",
      })
      .returning();

    await db.insert(machineVolumeOptions).values([
      {
        id: randomUUID(),
        machineId,
        volumeMl: 500,
        priceAmount: input.price500ml,
        isActive: true,
        sortOrder: 1,
      },
      {
        id: randomUUID(),
        machineId,
        volumeMl: 1000,
        priceAmount: input.price1l,
        isActive: true,
        sortOrder: 2,
      },
    ]);

    await db.insert(machineStatusSnapshots).values({
      id: randomUUID(),
      machineId,
      state: "IDLE",
      tankLevelPct: input.initialTankLevelPct,
      bottleDetected: false,
      pumpRunning: false,
      filledMl: 0,
      flowRateLpm: "0.00",
      source: "ADMIN_CREATE_MACHINE",
    });

    await db.insert(auditLogs).values({
      id: randomUUID(),
      adminUserId: auth.user.id,
      action: "CREATE_MACHINE",
      targetType: "machine",
      targetId: machineId,
      afterData: jsonStringify({
        machineCode: input.machineCode,
        shortCode: input.shortCode,
        displayName: input.displayName,
        siteName: input.siteName,
        initialTankLevelPct: input.initialTankLevelPct,
      }),
    });

    return ok(reply, { machine }, 201);
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

  app.get("/api/admin/machines/:machineId/refill-logs", async (request, reply) => {
    const auth = await getAdminAuth(request, services);
    if (!auth) return fail(reply, 401, "UNAUTHENTICATED", "Admin session not found");

    const { machineId } = request.params as { machineId: string };
    const db = services.dbClient.db as any;
    const [machine] = await db.select().from(machines).where(eq(machines.id, machineId)).limit(1);
    if (!machine) return fail(reply, 404, "NOT_FOUND", "Machine not found");

    const [eventRows, commandRows] = await Promise.all([
      db
        .select()
        .from(machineEvents)
        .where(eq(machineEvents.machineId, machineId))
        .orderBy(desc(machineEvents.occurredAt))
        .limit(100),
      db
        .select()
        .from(deviceCommands)
        .where(eq(deviceCommands.machineId, machineId))
        .orderBy(desc(deviceCommands.issuedAt))
        .limit(100),
    ]);

    const refillEvents = eventRows
      .filter((row: any) => String(row.eventType).includes("REFILL"))
      .map((row: any) => {
        const payload = safeJsonParse<Record<string, unknown>>(row.payload, {});
        return {
          id: row.id,
          occurredAt: row.occurredAt,
          source: typeof payload.source === "string" ? payload.source : "DEVICE",
          eventType: row.eventType,
          tankLevelPct: typeof payload.tankLevelPct === "number"
            ? payload.tankLevelPct
            : typeof payload.tankLevelPercent === "number"
              ? payload.tankLevelPercent
              : null,
          tankLiters: typeof payload.tankLiters === "number" ? payload.tankLiters : null,
          refillId: typeof payload.refillId === "string" ? payload.refillId : null,
        };
      });

    const refillCommands = commandRows
      .filter((row: any) => row.commandType === "REFILL_TANK")
      .map((row: any) => {
        const payload = safeJsonParse<Record<string, unknown>>(row.payload, {});
        return {
          id: row.id,
          occurredAt: row.issuedAt,
          source: "ADMIN_DASHBOARD",
          eventType: row.commandType,
          tankLevelPct: typeof payload.tankLevelPercent === "number" ? payload.tankLevelPercent : 100,
          tankLiters: typeof payload.tankLiters === "number" ? payload.tankLiters : FULL_TANK_LITERS,
          refillId: typeof payload.refillId === "string" ? payload.refillId : null,
        };
      });

    const rows = [...refillEvents, ...refillCommands]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 50);

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
        const result = await cancelTransactionById(active.id, auth.user.id);
        if (!result.ok) {
          return fail(reply, result.status, result.code, result.message);
        }
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

    if (parsed.data.action === "REFILL_TANK") {
      const refillId = `ADMIN-REFILL-${Date.now()}`;
      await db.insert(machineStatusSnapshots).values({
        id: randomUUID(),
        machineId: machine.id,
        state: "REFILL_COMPLETE",
        tankLevelPct: 100,
        bottleDetected: false,
        pumpRunning: false,
        filledMl: 0,
        flowRateLpm: "0.00",
        source: "ADMIN_DASHBOARD",
      });

      await db.insert(machineEvents).values({
        id: randomUUID(),
        machineId: machine.id,
        topic: `vending/${machine.machineCode}/event`,
        eventType: "REFILL_TANK_ADMIN",
        payload: jsonStringify({
          refillId,
          source: "ADMIN_DASHBOARD",
          tankLiters: FULL_TANK_LITERS,
          tankLevelPercent: 100,
          tankLevelPct: 100,
        }),
      });

      await db
        .update(machines)
        .set({
          operationStatus: "IDLE",
          updatedAt: new Date(),
        })
        .where(eq(machines.id, machine.id));

      await publishMachineCommand(services, {
        machineId: machine.id,
        machineCode: machine.machineCode,
        adminUserId: auth.user.id,
        commandType: "REFILL_TANK",
        payload: {
          refillId,
          tankLiters: FULL_TANK_LITERS,
          tankLevelPercent: 100,
        },
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
