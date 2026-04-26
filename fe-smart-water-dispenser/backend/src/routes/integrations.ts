import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";
import { machineVolumeOptions, machines, paymentNotifications, payments, transactions } from "../db/schema.js";
import { applyDeviceEvent, appendTransactionState, publishMachineCommand } from "../lib/domain.js";
import { fail, ok } from "../lib/http.js";

export async function registerIntegrationRoutes(app: FastifyInstance, services: AppServices) {
  app.post("/api/integrations/midtrans/notifications", async (request, reply) => {
    const payload = (request.body ?? {}) as Record<string, unknown>;
    const orderId = String(payload.order_id ?? "");
    if (!orderId) {
      return fail(reply, 400, "BAD_REQUEST", "order_id is required");
    }

    const db = services.dbClient.db as any;
    const [transaction] = await db.select().from(transactions).where(eq(transactions.orderId, orderId)).limit(1);
    if (!transaction) {
      return fail(reply, 404, "NOT_FOUND", "Transaction not found for order_id");
    }

    await db.insert(paymentNotifications).values({
      id: randomUUID(),
      transactionId: transaction.id,
      provider: "MIDTRANS",
      providerNotificationId: typeof payload.transaction_id === "string" ? payload.transaction_id : null,
      payload: JSON.stringify(payload),
      processingStatus: "RECEIVED",
    });

    const verified = await services.midtrans.verifyNotification(payload);
    await db
      .update(payments)
      .set({
        providerTransactionId: verified.providerTransactionId ?? null,
        transactionStatus: verified.transactionStatus,
        fraudStatus: verified.fraudStatus ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.transactionId, transaction.id));

    let nextPaymentStatus = transaction.paymentStatus;
    let nextDispenseStatus = transaction.dispenseStatus;

    if (["settlement", "capture"].includes(verified.transactionStatus)) {
      nextPaymentStatus = "PAID";
      nextDispenseStatus = transaction.dispenseStatus === "WAITING_PAYMENT" ? "WAITING_BOTTLE" : transaction.dispenseStatus;
    } else if (verified.transactionStatus === "expire") {
      nextPaymentStatus = "EXPIRED";
      nextDispenseStatus = "CANCELLED";
    } else if (["cancel", "deny", "failure"].includes(verified.transactionStatus)) {
      nextPaymentStatus = "FAILED";
      nextDispenseStatus = "FAILED";
    }

    await db
      .update(transactions)
      .set({
        paymentStatus: nextPaymentStatus,
        dispenseStatus: nextDispenseStatus,
      })
      .where(eq(transactions.id, transaction.id));

    await appendTransactionState(
      services,
      transaction.id,
      nextDispenseStatus,
      "PAYMENT_NOTIFICATION",
      orderId,
      transaction.dispenseStatus,
      { paymentStatus: nextPaymentStatus, providerStatus: verified.transactionStatus },
    );

    if (nextPaymentStatus === "PAID") {
      const [machine] = await db.select().from(machines).where(eq(machines.id, transaction.machineId)).limit(1);
      if (machine) {
        await publishMachineCommand(services, {
          machineId: machine.id,
          machineCode: machine.machineCode,
          transactionId: transaction.id,
          commandType: "START_ORDER",
          payload: {
            transactionId: transaction.id,
            volumeMl: transaction.volumeMl,
            amount: transaction.grossAmount,
          },
        });
        // Wokwi enters WAIT_PAYMENT after START_ORDER, so send a second
        // signal to advance the simulator into the post-payment flow.
        await publishMachineCommand(services, {
          machineId: machine.id,
          machineCode: machine.machineCode,
          transactionId: transaction.id,
          commandType: "PAYMENT_PAID",
          payload: {
            transactionId: transaction.id,
          },
        });
      }
    }

    return ok(reply, { processed: true, paymentStatus: nextPaymentStatus, dispenseStatus: nextDispenseStatus });
  });

  app.post("/api/integrations/device/events", async (request, reply) => {
    const secret = request.headers["x-integration-secret"];
    if (secret !== services.config.INTEGRATION_SHARED_SECRET) {
      return fail(reply, 401, "UNAUTHORIZED", "Invalid integration secret");
    }

    const body = (request.body ?? {}) as {
      machineCode?: string;
      transactionId?: string;
      topic?: string;
      eventType?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.machineCode || !body.topic || !body.eventType) {
      return fail(reply, 400, "BAD_REQUEST", "machineCode, topic, and eventType are required");
    }

    await applyDeviceEvent(services, {
      machineCode: body.machineCode,
      transactionId: body.transactionId ?? null,
      topic: body.topic,
      eventType: body.eventType,
      payload: body.payload ?? {},
    });

    return ok(reply, { processed: true });
  });
}
