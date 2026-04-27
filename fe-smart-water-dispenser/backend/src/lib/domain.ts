import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { AppServices } from "../types.js";
import {
  customerImpactSnapshots,
  deviceCommands,
  dispenseSessions,
  machineEvents,
  machineStatusSnapshots,
  machineVolumeOptions,
  machines,
  payments,
  transactionStateLogs,
  transactions,
} from "../db/schema.js";
import { jsonStringify, safeJsonParse, toIsoDate } from "./utils.js";

export async function appendTransactionState(
  services: AppServices,
  transactionId: string,
  toState: string,
  sourceType: string,
  sourceRef?: string,
  fromState?: string | null,
  metadata?: Record<string, unknown>,
) {
  const db = services.dbClient.db as any;
  await db.insert(transactionStateLogs).values({
    id: randomUUID(),
    transactionId,
    fromState: fromState ?? null,
    toState,
    sourceType,
    sourceRef: sourceRef ?? null,
    metadata: metadata ? jsonStringify(metadata) : null,
  });
}

export async function getLatestMachineStatus(services: AppServices, machineId: string) {
  const db = services.dbClient.db as any;
  const rows = await db
    .select()
    .from(machineStatusSnapshots)
    .where(eq(machineStatusSnapshots.machineId, machineId))
    .orderBy(desc(machineStatusSnapshots.reportedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createTransactionWithPayment(
  services: AppServices,
  input: {
    guestUserId?: string | null;
    machineId: string;
    machineCode: string;
    volumeMl: number;
    grossAmount: number;
    sourceChannel: string;
  },
) {
  const db = services.dbClient.db as any;
  const orderId = `TRX-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const transactionId = randomUUID();

  const charge = await services.midtrans.createQrisCharge({
    orderId,
    amount: input.grossAmount,
    machineCode: input.machineCode,
  });

  await db.insert(transactions).values({
    id: transactionId,
    orderId,
    guestUserId: input.guestUserId ?? null,
    machineId: input.machineId,
    volumeMl: input.volumeMl,
    grossAmount: input.grossAmount,
    paymentStatus: "PENDING",
    dispenseStatus: "WAITING_PAYMENT",
    sourceChannel: input.sourceChannel,
  });

  await db.insert(payments).values({
    id: randomUUID(),
    transactionId,
    provider: "MIDTRANS",
    providerTransactionId: charge.providerTransactionId,
    providerReference: charge.providerReference,
    paymentType: charge.paymentType,
    transactionStatus: charge.transactionStatus,
    grossAmount: input.grossAmount,
    qrString: charge.qrString,
    qrUrl: charge.qrUrl,
    expiresAt: new Date(charge.expiresAt),
  });

  await db.insert(dispenseSessions).values({
    id: randomUUID(),
    transactionId,
    machineId: input.machineId,
    targetVolumeMl: input.volumeMl,
    actualFilledMl: 0,
    resultStatus: "PENDING",
  });

  await appendTransactionState(services, transactionId, "WAITING_PAYMENT", "SYSTEM", orderId, "CREATED", {
    amount: input.grossAmount,
    volumeMl: input.volumeMl,
  });

  return {
    transactionId,
    orderId,
    payment: charge,
  };
}

export async function ensureMachineWaitPaymentTransaction(
  services: AppServices,
  input: {
    machineCode: string;
    volumeMl: number;
    grossAmount: number;
    sourceChannel: string;
    transactionId?: string | null;
  },
) {
  const db = services.dbClient.db as any;
  const [machine] = await db
    .select()
    .from(machines)
    .where(eq(machines.machineCode, input.machineCode))
    .limit(1);

  if (!machine) {
    return null;
  }

  const activeTransaction = await getActiveMachineTransaction(services, machine.id);
  if (activeTransaction) {
    if (input.transactionId && activeTransaction.id === input.transactionId) {
      return {
        created: false,
        transactionId: activeTransaction.id,
        orderId: activeTransaction.orderId,
      };
    }

    if (activeTransaction.sourceChannel === "TABLET_KIOSK") {
      await cancelTransactionForMachineOverride(services, activeTransaction.id, machine.machineCode, {
        reason: "IOT_WAIT_PAYMENT_OVERRIDE",
        replacementSource: input.sourceChannel,
        volumeMl: input.volumeMl,
        grossAmount: input.grossAmount,
      });
    } else {
      return {
        created: false,
        transactionId: activeTransaction.id,
        orderId: activeTransaction.orderId,
      };
    }
  }

  const result = await createTransactionWithPayment(services, {
    guestUserId: null,
    machineId: machine.id,
    machineCode: machine.machineCode,
    volumeMl: input.volumeMl,
    grossAmount: input.grossAmount,
    sourceChannel: input.sourceChannel,
  });

  return {
    created: true,
    transactionId: result.transactionId,
    orderId: result.orderId,
  };
}

export async function cancelTransactionForMachineOverride(
  services: AppServices,
  transactionId: string,
  machineCode: string,
  metadata?: Record<string, unknown>,
) {
  const db = services.dbClient.db as any;
  const [transaction] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  if (!transaction || ["COMPLETED", "CANCELLED", "FAILED"].includes(transaction.dispenseStatus)) {
    return false;
  }

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

  await appendTransactionState(
    services,
    transaction.id,
    "CANCELLED",
    "SYSTEM",
    machineCode,
    transaction.dispenseStatus,
    metadata,
  );

  return true;
}

export async function getMachineByCode(services: AppServices, machineCode: string) {
  const db = services.dbClient.db as any;
  const [machine] = await db
    .select()
    .from(machines)
    .where(eq(machines.machineCode, machineCode))
    .limit(1);

  return machine ?? null;
}

export async function createTabletKioskTransaction(
  services: AppServices,
  input: {
    machineCode: string;
    volumeMl: number;
    guestUserId?: string | null;
  },
) {
  const db = services.dbClient.db as any;
  const machine = await getMachineByCode(services, input.machineCode);
  if (!machine) {
    throw new Error(`Machine ${input.machineCode} not found`);
  }

  const activeTransaction = await getActiveMachineTransaction(services, machine.id);
  if (activeTransaction) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, activeTransaction.id))
      .limit(1);

    if (!payment) {
      throw new Error(`Payment for active transaction ${activeTransaction.id} not found`);
    }

    return {
      created: false,
      transactionId: activeTransaction.id,
      orderId: activeTransaction.orderId,
      payment: {
        paymentType: payment.paymentType,
        qrString: payment.qrString,
        qrUrl: payment.qrUrl,
        expiresAt: payment.expiresAt?.toISOString() ?? null,
      },
      grossAmount: activeTransaction.grossAmount,
    };
  }

  const [volumeOption] = await db
    .select()
    .from(machineVolumeOptions)
    .where(
      and(
        eq(machineVolumeOptions.machineId, machine.id),
        eq(machineVolumeOptions.volumeMl, input.volumeMl),
        eq(machineVolumeOptions.isActive, true),
      ),
    )
    .limit(1);

  if (!volumeOption) {
    throw new Error(`Volume ${input.volumeMl} is not available for ${input.machineCode}`);
  }

  const result = await createTransactionWithPayment(services, {
    guestUserId: input.guestUserId ?? null,
    machineId: machine.id,
    machineCode: machine.machineCode,
    volumeMl: input.volumeMl,
    grossAmount: volumeOption.priceAmount,
    sourceChannel: "TABLET_KIOSK",
  });

  return {
    created: true,
    transactionId: result.transactionId,
    orderId: result.orderId,
    payment: {
      paymentType: result.payment.paymentType,
      qrString: result.payment.qrString,
      qrUrl: result.payment.qrUrl,
      expiresAt: result.payment.expiresAt,
    },
    grossAmount: volumeOption.priceAmount,
  };
}

export async function publishMachineCommand(
  services: AppServices,
  input: {
    machineId: string;
    machineCode: string;
    transactionId?: string | null;
    adminUserId?: string | null;
    commandType: string;
    payload: Record<string, unknown>;
  },
) {
  const db = services.dbClient.db as any;
  const commandId = randomUUID();
  await db.insert(deviceCommands).values({
    id: commandId,
    machineId: input.machineId,
    transactionId: input.transactionId ?? null,
    issuedByAdminId: input.adminUserId ?? null,
    commandType: input.commandType,
    payload: jsonStringify(input.payload),
    deliveryStatus: "SENT",
    deliveredAt: new Date(),
  });

  await services.mqtt.publishCommand({
    machineCode: input.machineCode,
    topic: `vending/${input.machineCode}/command`,
    payload: {
      command: input.commandType,
      ...input.payload,
    },
  });

  return commandId;
}

function isUuidLike(value: string | null | undefined) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function resolveMachineTransactionForDevice(
  services: AppServices,
  machineId: string,
  transactionId?: string | null,
) {
  const db = services.dbClient.db as any;

  if (isUuidLike(transactionId)) {
    const normalizedTransactionId = transactionId!;
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, normalizedTransactionId))
      .limit(1);

    if (transaction?.machineId === machineId) {
      return transaction;
    }
  }

  return getActiveMachineTransaction(services, machineId);
}

async function confirmMachinePaymentFromDevice(
  services: AppServices,
  input: {
    machineId: string;
    machineCode: string;
    transactionId?: string | null;
    payload: Record<string, unknown>;
  },
) {
  const db = services.dbClient.db as any;
  const transaction = await resolveMachineTransactionForDevice(services, input.machineId, input.transactionId);

  if (!transaction) {
    return null;
  }

  if (transaction.paymentStatus === "PAID") {
    return transaction;
  }

  const nextDispenseStatus = transaction.dispenseStatus === "WAITING_PAYMENT"
    ? "WAITING_BOTTLE"
    : transaction.dispenseStatus;

  await db
    .update(payments)
    .set({
      transactionStatus: "settlement",
      updatedAt: new Date(),
    })
    .where(eq(payments.transactionId, transaction.id));

  await db
    .update(transactions)
    .set({
      paymentStatus: "PAID",
      dispenseStatus: nextDispenseStatus,
    })
    .where(eq(transactions.id, transaction.id));

  await appendTransactionState(
    services,
    transaction.id,
    nextDispenseStatus,
    "DEVICE_PAYMENT",
    input.machineCode,
    transaction.dispenseStatus,
    {
      eventType: "PAYMENT_CONFIRMED_BY_BUTTON",
      providerStatus: "settlement",
      paymentStatus: "PAID",
      deviceTransactionId: input.transactionId ?? null,
      ...input.payload,
    },
  );

  await publishMachineCommand(services, {
    machineId: input.machineId,
    machineCode: input.machineCode,
    transactionId: transaction.id,
    commandType: "PAYMENT_PAID",
    payload: {
      transactionId: transaction.id,
    },
  });

  return {
    ...transaction,
    paymentStatus: "PAID",
    dispenseStatus: nextDispenseStatus,
  };
}

export async function applyDeviceEvent(
  services: AppServices,
  input: {
    machineCode: string;
    transactionId?: string | null;
    topic: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
) {
  const db = services.dbClient.db as any;
  const machineRows = await db.select().from(machines).where(eq(machines.machineCode, input.machineCode)).limit(1);
  const machine = machineRows[0];
  if (!machine) {
    throw new Error(`Machine ${input.machineCode} not found`);
  }

  const transaction = await resolveMachineTransactionForDevice(services, machine.id, input.transactionId);

  await db.insert(machineEvents).values({
    id: randomUUID(),
    machineId: machine.id,
    transactionId: transaction?.id ?? null,
    topic: input.topic,
    eventType: input.eventType,
    payload: jsonStringify(input.payload),
  });

  const statusPayload = {
    state: typeof input.payload.state === "string" ? input.payload.state : null,
    tankLevelPct:
      typeof input.payload.tankLevelPct === "number"
        ? input.payload.tankLevelPct
        : typeof input.payload.tankLevelPercent === "number"
          ? input.payload.tankLevelPercent
          : null,
    bottleDetected: typeof input.payload.bottleDetected === "boolean" ? input.payload.bottleDetected : false,
    pumpRunning: typeof input.payload.pumpRunning === "boolean" ? input.payload.pumpRunning : false,
    filledMl: typeof input.payload.filledMl === "number" ? input.payload.filledMl : 0,
    flowRateLpm: typeof input.payload.flowRateLpm === "number" ? String(input.payload.flowRateLpm) : "0.00",
    source: typeof input.payload.source === "string" && input.payload.source.length > 0 ? input.payload.source : "DEVICE_EVENT",
  };

  await db.insert(machineStatusSnapshots).values({
    id: randomUUID(),
    machineId: machine.id,
    state: statusPayload.state ?? input.eventType,
    tankLevelPct: statusPayload.tankLevelPct,
    bottleDetected: statusPayload.bottleDetected,
    pumpRunning: statusPayload.pumpRunning,
    filledMl: statusPayload.filledMl,
    flowRateLpm: statusPayload.flowRateLpm,
    source: statusPayload.source,
  });

  await db
    .update(machines)
    .set({
      connectivityStatus: "ONLINE",
      operationStatus: statusPayload.pumpRunning ? "BUSY" : "IDLE",
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(machines.id, machine.id));

  if (!transaction) return;

  if (input.eventType === "PAYMENT_CONFIRMED_BY_BUTTON") {
    await confirmMachinePaymentFromDevice(services, {
      machineId: machine.id,
      machineCode: machine.machineCode,
      transactionId: input.transactionId,
      payload: input.payload,
    });
    return;
  }

  const requiresPaidState = ["BOTTLE_DETECTED", "FILLING_STARTED", "FILLING_COMPLETED"].includes(input.eventType);
  if (requiresPaidState && transaction.paymentStatus !== "PAID") {
    return;
  }

  if (input.eventType === "BOTTLE_DETECTED") {
    await db
      .update(transactions)
      .set({ dispenseStatus: "READY_TO_FILL" })
      .where(eq(transactions.id, transaction.id));
    await appendTransactionState(services, transaction.id, "READY_TO_FILL", "DEVICE", machine.machineCode, transaction.dispenseStatus);
    return;
  }

  if (input.eventType === "FILLING_STARTED") {
    await db
      .update(transactions)
      .set({ dispenseStatus: "FILLING" })
      .where(eq(transactions.id, transaction.id));
    await db
      .update(dispenseSessions)
      .set({ startedAt: new Date(), resultStatus: "IN_PROGRESS" })
      .where(eq(dispenseSessions.transactionId, transaction.id));
    await appendTransactionState(services, transaction.id, "FILLING", "DEVICE", machine.machineCode, transaction.dispenseStatus);
    return;
  }

  if (input.eventType === "FILLING_COMPLETED") {
    const actualFilledMl =
      typeof input.payload.filledMl === "number" ? input.payload.filledMl : transaction.volumeMl;
    await db
      .update(transactions)
      .set({
        dispenseStatus: "COMPLETED",
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));
    await db
      .update(dispenseSessions)
      .set({
        actualFilledMl,
        averageFlowRateLpm: statusPayload.flowRateLpm,
        endedAt: new Date(),
        resultStatus: "COMPLETED",
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));
    await appendTransactionState(services, transaction.id, "COMPLETED", "DEVICE", machine.machineCode, transaction.dispenseStatus);
    await updateCustomerImpact(services, transaction.guestUserId, transaction.grossAmount, actualFilledMl);
    return;
  }

  if (input.eventType === "ERROR_RAISED" || input.eventType === "TRANSACTION_CANCELLED") {
    const nextState = input.eventType === "ERROR_RAISED" ? "FAILED" : "CANCELLED";
    await db
      .update(transactions)
      .set({
        dispenseStatus: nextState,
        completedAt: new Date(),
      })
      .where(eq(transactions.id, transaction.id));
    await db
      .update(dispenseSessions)
      .set({
        endedAt: new Date(),
        resultStatus: nextState,
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));
    await appendTransactionState(services, transaction.id, nextState, "DEVICE", machine.machineCode, transaction.dispenseStatus, input.payload);
  }
}

export async function updateCustomerImpact(
  services: AppServices,
  guestUserId: string | null | undefined,
  totalSpent: number,
  totalVolumeMl: number,
) {
  if (!guestUserId) return;
  const db = services.dbClient.db as any;
  const snapshotDate = toIsoDate();
  const existingRows = await db
    .select()
    .from(customerImpactSnapshots)
    .where(
      and(
        eq(customerImpactSnapshots.guestUserId, guestUserId),
        eq(customerImpactSnapshots.snapshotDate, snapshotDate),
      ),
    )
    .limit(1);

  const bottlesSaved = Math.max(1, Math.round(totalVolumeMl / 500));
  const co2ReducedGrams = bottlesSaved * 57;

  if (!existingRows[0]) {
    await db.insert(customerImpactSnapshots).values({
      id: randomUUID(),
      guestUserId,
      snapshotDate,
      bottlesSaved,
      co2ReducedGrams,
      totalSpent,
      totalVolumeMl,
    });
    return;
  }

  const row = existingRows[0];
  await db
    .update(customerImpactSnapshots)
    .set({
      bottlesSaved: row.bottlesSaved + bottlesSaved,
      co2ReducedGrams: row.co2ReducedGrams + co2ReducedGrams,
      totalSpent: row.totalSpent + totalSpent,
      totalVolumeMl: row.totalVolumeMl + totalVolumeMl,
    })
    .where(eq(customerImpactSnapshots.id, row.id));
}

export function parseCommandPayload(value: string | null) {
  return safeJsonParse<Record<string, unknown>>(value, {});
}

export async function getActiveMachineTransaction(services: AppServices, machineId: string) {
  const db = services.dbClient.db as any;
  const rows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.machineId, machineId))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  for (const row of rows) {
    if (["COMPLETED", "CANCELLED", "FAILED"].includes(row.dispenseStatus)) continue;
    if (["FAILED", "EXPIRED", "REFUNDED"].includes(row.paymentStatus)) continue;

    if (row.dispenseStatus !== "WAITING_PAYMENT") {
      return row;
    }

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.transactionId, row.id))
      .limit(1);

    if (payment?.expiresAt && new Date(payment.expiresAt) <= new Date()) {
      continue;
    }

    return row;
  }

  return null;
}

export async function buildDashboardSummary(services: AppServices) {
  const db = services.dbClient.db as any;
  const txRows = await db.select().from(transactions);
  const eventRows = await db.select().from(machineEvents);
  const impactRows = await db.select().from(customerImpactSnapshots);

  const totalTransactions = txRows.length;
  const successfulTransactions = txRows.filter((row: any) => row.dispenseStatus === "COMPLETED").length;
  const pendingTransactions = txRows.filter((row: any) => ["WAITING_PAYMENT", "WAITING_BOTTLE", "READY_TO_FILL", "FILLING"].includes(row.dispenseStatus)).length;
  const cancelledTransactions = txRows.filter((row: any) => row.dispenseStatus === "CANCELLED").length;
  const totalRevenue = txRows
    .filter((row: any) => row.paymentStatus === "PAID")
    .reduce((sum: number, row: any) => sum + row.grossAmount, 0);
  const bottlesSaved = impactRows.reduce((sum: number, row: any) => sum + row.bottlesSaved, 0);
  const totalWaterDistributedLiters =
    txRows
      .filter((row: any) => row.dispenseStatus === "COMPLETED")
      .reduce((sum: number, row: any) => sum + row.volumeMl, 0) / 1000;
  const sensorWarnings = eventRows.filter((row: any) => row.eventType === "ERROR_RAISED").length;

  return {
    totalTransactions,
    successfulTransactions,
    pendingTransactions,
    cancelledTransactions,
    totalRevenue,
    bottlesSaved,
    totalWaterDistributedLiters,
    activeSensors: 4,
    sensorWarnings,
  };
}

export async function getMachineSummaryList(services: AppServices) {
  const db = services.dbClient.db as any;
  const machineRows = await db.select().from(machines).orderBy(machines.displayName);
  const result = [];

  for (const machine of machineRows) {
    const latestStatus = await getLatestMachineStatus(services, machine.id);
    const activeTransaction = await getActiveMachineTransaction(services, machine.id);
    result.push({
      ...machine,
      latestStatus,
      activeTransaction,
    });
  }

  return result;
}

export async function createAlert(
  services: AppServices,
  machineId: string,
  alertType: string,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  context?: Record<string, unknown>,
) {
  const db = services.dbClient.db as any;
  await db.execute?.(sql`select 1`);
  await db.insert((await import("../db/schema.js")).alerts).values({
    id: randomUUID(),
    machineId,
    alertType,
    severity,
    status: "OPEN",
    context: context ? jsonStringify(context) : null,
  });
}
