import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";
import {
  machineVolumeOptions,
  machines,
  payments,
  transactions,
  dispenseSessions,
  machineEvents,
  machineStatusSnapshots,
} from "../db/schema.js";
import { getGuestAuth } from "../lib/auth.js";
import {
  appendTransactionState,
  createTabletKioskTransaction,
  createTransactionWithPayment,
  getActiveMachineTransaction,
  publishMachineCommand,
} from "../lib/domain.js";
import { fail, ok } from "../lib/http.js";

const transactionSchema = z.object({
  machineId: z.string().min(1).optional(),
  machineCode: z.string().min(1).optional(),
  volumeMl: z.number().int().positive(),
  sourceChannel: z.string().default("TABLET_KIOSK"),
}).refine((value) => Boolean(value.machineId || value.machineCode), {
  message: "machineId or machineCode is required",
});

export async function registerCustomerRoutes(app: FastifyInstance, services: AppServices) {
  async function createMachineTransaction(
    requestBody: unknown,
    guestUserId: string | null,
    reply: any,
  ) {
    const db = services.dbClient.db as any;
    const parsed = transactionSchema.safeParse(requestBody);
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid transaction payload");
    }

    const lookupByMachineCode = parsed.data.machineCode?.trim().toUpperCase();
    const [machine] = lookupByMachineCode
      ? await db.select().from(machines).where(eq(machines.machineCode, lookupByMachineCode)).limit(1)
      : await db.select().from(machines).where(eq(machines.id, parsed.data.machineId!)).limit(1);
    if (!machine) {
      return fail(reply, 404, "NOT_FOUND", "Machine not found");
    }

    const activeTransaction = await getActiveMachineTransaction(services, machine.id);
    if (activeTransaction) {
      return fail(reply, 409, "MACHINE_BUSY", "Machine already has an active transaction");
    }

    const [volumeOption] = await db
      .select()
      .from(machineVolumeOptions)
      .where(
        and(
          eq(machineVolumeOptions.machineId, machine.id),
          eq(machineVolumeOptions.volumeMl, parsed.data.volumeMl),
          eq(machineVolumeOptions.isActive, true),
        ),
      )
      .limit(1);

    if (!volumeOption) {
      return fail(reply, 400, "INVALID_VOLUME", "Requested volume is not available");
    }

    const result = await createTransactionWithPayment(services, {
      guestUserId,
      machineId: machine.id,
      machineCode: machine.machineCode,
      volumeMl: parsed.data.volumeMl,
      grossAmount: volumeOption.priceAmount,
      sourceChannel: parsed.data.sourceChannel,
    });

    return ok(reply, {
      transactionId: result.transactionId,
      orderId: result.orderId,
      paymentStatus: "PENDING",
      dispenseStatus: "WAITING_PAYMENT",
      machine: {
        id: machine.id,
        machineCode: machine.machineCode,
        displayName: machine.displayName,
      },
      payment: {
        provider: "midtrans",
        paymentType: result.payment.paymentType,
        qrString: result.payment.qrString,
        qrUrl: result.payment.qrUrl,
        expiresAt: result.payment.expiresAt,
      },
    }, 201);
  }

  app.post("/api/dispense", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    return createMachineTransaction(
      {
        ...(request.body as Record<string, unknown>),
        sourceChannel: "CUSTOMER_APP",
      },
      auth?.user.id ?? null,
      reply,
    );
  });

  app.get("/api/customer/machines/:machineId", async (request, reply) => {
    const db = services.dbClient.db as any;
    const auth = await getGuestAuth(request, services);
    const query = request.query as { mode?: string } | undefined;
    const isTabletMode = query?.mode === "tablet";
    const { machineId } = request.params as { machineId: string };
    const [machine] = await db.select().from(machines).where(eq(machines.machineCode, machineId)).limit(1);
    if (!machine) {
      return fail(reply, 404, "NOT_FOUND", "Machine not found");
    }

    const volumeOptions = await db
      .select()
      .from(machineVolumeOptions)
      .where(eq(machineVolumeOptions.machineId, machine.id));
    const [status] = await db
      .select()
      .from(machineStatusSnapshots)
      .where(eq(machineStatusSnapshots.machineId, machine.id))
      .orderBy(desc(machineStatusSnapshots.reportedAt))
      .limit(1);
    const activeTransaction = await getActiveMachineTransaction(services, machine.id);
    const guestUserId = auth?.user.id ?? null;
    const resumableTransaction = activeTransaction?.guestUserId && guestUserId && activeTransaction.guestUserId === guestUserId
      ? activeTransaction
      : null;
    const visibleTransaction = isTabletMode ? activeTransaction : resumableTransaction;
    const busyState = activeTransaction && !visibleTransaction
      ? activeTransaction.dispenseStatus
      : null;

    return ok(reply, {
      machine,
      volumeOptions,
      status,
      activeTransaction: visibleTransaction,
      busyState,
    });
  });

  app.post("/api/customer/transactions", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    return createMachineTransaction(request.body, auth?.user.id ?? null, reply);
  });

  app.post("/api/customer/machines/:machineId/tablet-transaction", async (request, reply) => {
    const db = services.dbClient.db as any;
    const auth = await getGuestAuth(request, services);
    const { machineId } = request.params as { machineId: string };
    const parsed = z.object({ volumeMl: z.number().int().positive() }).safeParse(request.body);
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid tablet transaction payload");
    }

    try {
      const result = await createTabletKioskTransaction(services, {
        machineCode: machineId,
        volumeMl: parsed.data.volumeMl,
        guestUserId: auth?.user.id ?? null,
      });

      const [machine] = await db.select().from(machines).where(eq(machines.machineCode, machineId)).limit(1);
      if (!machine) {
        return fail(reply, 404, "NOT_FOUND", "Machine not found");
      }

      return ok(reply, {
        transactionId: result.transactionId,
        orderId: result.orderId,
        paymentStatus: "PENDING",
        dispenseStatus: "WAITING_PAYMENT",
        machine: {
          id: machine.id,
          machineCode: machine.machineCode,
          displayName: machine.displayName,
        },
        payment: {
          provider: "midtrans",
          paymentType: result.payment.paymentType,
          qrString: result.payment.qrString,
          qrUrl: result.payment.qrUrl,
          expiresAt: result.payment.expiresAt,
        },
      }, result.created ? 201 : 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create tablet transaction";
      if (message.includes("not found")) {
        return fail(reply, 404, "NOT_FOUND", message);
      }
      if (message.includes("not available")) {
        return fail(reply, 400, "INVALID_VOLUME", message);
      }
      return fail(reply, 500, "SERVER_ERROR", message);
    }
  });

  app.get("/api/customer/transactions/:transactionId", async (request, reply) => {
    const db = services.dbClient.db as any;
    const { transactionId } = request.params as { transactionId: string };
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) {
      return fail(reply, 404, "NOT_FOUND", "Transaction not found");
    }

    const [payment] = await db.select().from(payments).where(eq(payments.transactionId, transaction.id)).limit(1);
    const [dispenseSession] = await db
      .select()
      .from(dispenseSessions)
      .where(eq(dispenseSessions.transactionId, transaction.id))
      .limit(1);
    const [latestStatus] = await db
      .select()
      .from(machineStatusSnapshots)
      .where(eq(machineStatusSnapshots.machineId, transaction.machineId))
      .orderBy(desc(machineStatusSnapshots.reportedAt))
      .limit(1);
    const recentEvents = await db
      .select()
      .from(machineEvents)
      .where(eq(machineEvents.transactionId, transaction.id))
      .orderBy(desc(machineEvents.occurredAt))
      .limit(10);

    return ok(reply, {
      transaction,
      payment,
      dispenseSession,
      latestStatus,
      recentEvents,
    });
  });

  app.post("/api/customer/transactions/:transactionId/cancel", async (request, reply) => {
    const db = services.dbClient.db as any;
    const { transactionId } = request.params as { transactionId: string };
    const [transaction] = await db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1);
    if (!transaction) {
      return fail(reply, 404, "NOT_FOUND", "Transaction not found");
    }

    const [machine] = await db.select().from(machines).where(eq(machines.id, transaction.machineId)).limit(1);
    if (!machine) {
      return fail(reply, 404, "NOT_FOUND", "Machine not found");
    }

    await db
      .update(transactions)
      .set({
        dispenseStatus: "CANCELLED",
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transactionId));

    await db
      .update(dispenseSessions)
      .set({
        endedAt: new Date(),
        resultStatus: "CANCELLED",
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));

    await appendTransactionState(
      services,
      transaction.id,
      "CANCELLED",
      "CUSTOMER",
      machine.machineCode,
      transaction.dispenseStatus,
      {
        origin: "TABLET_CANCEL",
        sourceChannel: transaction.sourceChannel,
      },
    );

    await publishMachineCommand(services, {
      machineId: machine.id,
      machineCode: machine.machineCode,
      transactionId: transaction.id,
      commandType: "CANCEL_ORDER",
      payload: transaction.sourceChannel === "IOT_TABLET_SYNC"
        ? {}
        : { transactionId: transaction.id },
    });

    return ok(reply, { cancelled: true });
  });
}
