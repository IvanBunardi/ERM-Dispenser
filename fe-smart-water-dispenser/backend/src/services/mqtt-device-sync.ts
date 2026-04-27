import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  appendTransactionState,
  applyDeviceEvent,
  ensureMachineWaitPaymentTransaction,
  getActiveMachineTransaction,
  updateCustomerImpact,
} from "../lib/domain.js";
import { machineStatusSnapshots, machines, transactions, dispenseSessions } from "../db/schema.js";
import type { AppServices } from "../types.js";
import type { IncomingMqttMessage, MqttProvider } from "./mqtt.js";

type TelemetryPayload = {
  machineId: string;
  transactionId: string | null;
  state: string | null;
  source: string | null;
  tankLevelPct: number | null;
  bottleDetected: boolean | null;
  pumpRunning: boolean | null;
  filledMl: number | null;
  flowRateLpm: number | null;
  error: string | null;
  targetVolumeMl: number | null;
  amount: number | null;
};

const STATE_TO_DISPENSE_STATUS: Record<string, string> = {
  WAIT_PAYMENT: "WAITING_PAYMENT",
  PAYMENT_SUCCESS: "WAITING_BOTTLE",
  WAIT_BOTTLE: "WAITING_BOTTLE",
  READY_TO_FILL: "READY_TO_FILL",
  FILLING: "FILLING",
  COMPLETE: "COMPLETED",
  CANCELLED: "CANCELLED",
  ERROR: "FAILED",
};

function parseTopic(topic: string) {
  const parts = topic.split("/");
  if (parts.length !== 3 || parts[0] !== "vending") return null;

  return {
    machineCode: parts[1],
    channel: parts[2],
  };
}

function parseJsonPayload(payload: string) {
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toTelemetryPayload(machineCode: string, payload: Record<string, unknown>): TelemetryPayload {
  const transactionId = typeof payload.transactionId === "string" && payload.transactionId.length > 0
    ? payload.transactionId
    : null;

  return {
    machineId: typeof payload.machineId === "string" && payload.machineId.length > 0
      ? payload.machineId
      : machineCode,
    transactionId,
    state: typeof payload.state === "string" ? payload.state : null,
    source: typeof payload.source === "string" && payload.source.length > 0 ? payload.source : null,
    tankLevelPct: asNumber(payload.tankLevelPct ?? payload.tankLevelPercent),
    bottleDetected: typeof payload.bottleDetected === "boolean" ? payload.bottleDetected : null,
    pumpRunning: typeof payload.pumpRunning === "boolean" ? payload.pumpRunning : null,
    filledMl: asNumber(payload.filledMl),
    flowRateLpm: asNumber(payload.flowRateLpm),
    error: typeof payload.error === "string" && payload.error.length > 0 ? payload.error : null,
    targetVolumeMl: asNumber(payload.targetVolumeMl ?? payload.volumeMl),
    amount: asNumber(payload.amount),
  };
}

function mapOperationStatus(state: string | null, pumpRunning: boolean) {
  if (state === "ERROR") return "ERROR";
  if (pumpRunning || ["WAIT_PAYMENT", "PAYMENT_SUCCESS", "WAIT_BOTTLE", "READY_TO_FILL", "FILLING"].includes(state ?? "")) {
    return "BUSY";
  }

  return "IDLE";
}

function isUuidLike(value: string | null | undefined) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function findMachineByCode(services: AppServices, machineCode: string) {
  const db = services.dbClient.db as any;
  const [machine] = await db.select().from(machines).where(eq(machines.machineCode, machineCode)).limit(1);
  return machine ?? null;
}

async function ingestTelemetrySnapshot(
  services: AppServices,
  machineCode: string,
  channel: string,
  telemetry: TelemetryPayload,
) {
  const db = services.dbClient.db as any;
  const machine = await findMachineByCode(services, machineCode);
  if (!machine) return;

  const [latestSnapshot] = await db
    .select()
    .from(machineStatusSnapshots)
    .where(eq(machineStatusSnapshots.machineId, machine.id))
    .orderBy(desc(machineStatusSnapshots.reportedAt))
    .limit(1);

  const resolvedState = telemetry.state ?? latestSnapshot?.state ?? channel.toUpperCase();
  const resolvedSource = telemetry.source ?? latestSnapshot?.source ?? `MQTT_${channel.toUpperCase()}`;
  const resolvedTankLevelPct = telemetry.tankLevelPct ?? latestSnapshot?.tankLevelPct ?? null;
  const resolvedBottleDetected = telemetry.bottleDetected ?? latestSnapshot?.bottleDetected ?? false;
  const resolvedPumpRunning = telemetry.pumpRunning ?? latestSnapshot?.pumpRunning ?? false;
  const resolvedFilledMl = telemetry.filledMl ?? latestSnapshot?.filledMl ?? 0;
  const resolvedFlowRateLpm = telemetry.flowRateLpm ?? asNumber(latestSnapshot?.flowRateLpm);

  if (
    resolvedState === "WAIT_PAYMENT" &&
    telemetry.targetVolumeMl !== null &&
    telemetry.targetVolumeMl > 0 &&
    telemetry.amount !== null &&
    telemetry.amount > 0
  ) {
    await ensureMachineWaitPaymentTransaction(services, {
      machineCode,
      volumeMl: Math.round(telemetry.targetVolumeMl),
      grossAmount: Math.round(telemetry.amount),
      sourceChannel: "IOT_TABLET_SYNC",
      transactionId: telemetry.transactionId,
    });
  }

  await db.insert(machineStatusSnapshots).values({
    id: randomUUID(),
    machineId: machine.id,
    state: resolvedState,
    tankLevelPct: resolvedTankLevelPct !== null ? Math.round(resolvedTankLevelPct) : null,
    bottleDetected: resolvedBottleDetected,
    pumpRunning: resolvedPumpRunning,
    filledMl: Math.round(resolvedFilledMl),
    flowRateLpm: resolvedFlowRateLpm !== null ? String(resolvedFlowRateLpm) : null,
    source: resolvedSource,
  });

  await db
    .update(machines)
    .set({
      connectivityStatus: "ONLINE",
      operationStatus: mapOperationStatus(resolvedState, resolvedPumpRunning),
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(machines.id, machine.id));

  if (!resolvedState) return;

  const nextDispenseStatus = STATE_TO_DISPENSE_STATUS[resolvedState];
  if (!nextDispenseStatus) return;

  let transaction = null;

  if (isUuidLike(telemetry.transactionId)) {
    const normalizedTransactionId = telemetry.transactionId!;
    const [matchedTransaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, normalizedTransactionId))
      .limit(1);

    transaction = matchedTransaction ?? null;
  }

  if (!transaction) {
    transaction = await getActiveMachineTransaction(services, machine.id);
  }

  if (!transaction || transaction.machineId !== machine.id || transaction.dispenseStatus === nextDispenseStatus) {
    return;
  }

  const requiresPaidState = ["WAITING_BOTTLE", "READY_TO_FILL", "FILLING", "COMPLETED"].includes(nextDispenseStatus);
  if (requiresPaidState && transaction.paymentStatus !== "PAID") {
    return;
  }

  const nextValues: Record<string, unknown> = {
    dispenseStatus: nextDispenseStatus,
  };

  if (nextDispenseStatus === "COMPLETED" || nextDispenseStatus === "CANCELLED" || nextDispenseStatus === "FAILED") {
    nextValues.completedAt = new Date();
  }

  await db
    .update(transactions)
    .set(nextValues)
    .where(eq(transactions.id, transaction.id));

  if (nextDispenseStatus === "FILLING") {
    await db
      .update(dispenseSessions)
      .set({
        startedAt: new Date(),
        resultStatus: "IN_PROGRESS",
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));
  }

  if (nextDispenseStatus === "COMPLETED") {
    await db
      .update(dispenseSessions)
      .set({
        actualFilledMl: resolvedFilledMl > 0 ? resolvedFilledMl : transaction.volumeMl,
        averageFlowRateLpm: resolvedFlowRateLpm !== null ? String(resolvedFlowRateLpm) : null,
        endedAt: new Date(),
        resultStatus: "COMPLETED",
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));

    await updateCustomerImpact(
      services,
      transaction.guestUserId,
      transaction.grossAmount,
      resolvedFilledMl > 0 ? resolvedFilledMl : transaction.volumeMl,
    );
  }

  if (nextDispenseStatus === "CANCELLED" || nextDispenseStatus === "FAILED") {
    await db
      .update(dispenseSessions)
      .set({
        endedAt: new Date(),
        resultStatus: nextDispenseStatus,
      })
      .where(eq(dispenseSessions.transactionId, transaction.id));
  }

  await appendTransactionState(
    services,
    transaction.id,
    nextDispenseStatus,
    "MQTT_STATUS",
    machineCode,
    transaction.dispenseStatus,
    {
      state: resolvedState,
      flowRateLpm: resolvedFlowRateLpm,
      filledMl: resolvedFilledMl,
      tankLevelPct: resolvedTankLevelPct,
      source: resolvedSource,
    },
  );
}

async function ingestAvailability(
  services: AppServices,
  machineCode: string,
  payload: string,
) {
  const db = services.dbClient.db as any;
  const machine = await findMachineByCode(services, machineCode);
  if (!machine) return;

  const isOnline = payload.trim().toLowerCase() === "online";
  await db
    .update(machines)
    .set({
      connectivityStatus: isOnline ? "ONLINE" : "OFFLINE",
      lastSeenAt: isOnline ? new Date() : machine.lastSeenAt,
      updatedAt: new Date(),
    })
    .where(eq(machines.id, machine.id));
}

async function ingestEvent(
  services: AppServices,
  machineCode: string,
  payload: Record<string, unknown>,
) {
  const rawEvent = typeof payload.event === "string" ? payload.event : null;
  if (!rawEvent) return;

  const mappedEvent =
    rawEvent === "BOTTLE_SIMULATED" || rawEvent === "BOTTLE_SIMULATED_READY" ? "BOTTLE_DETECTED" :
    rawEvent === "FILLING_FORCE_COMPLETED" ? "FILLING_COMPLETED" :
    rawEvent === "FILLING_COMPLETE" ? "FILLING_COMPLETED" :
    rawEvent === "ORDER_CANCELLED" || rawEvent === "CANCEL_BUTTON" ? "TRANSACTION_CANCELLED" :
    rawEvent === "DEVICE_ERROR" || rawEvent === "BOTTLE_REMOVED_FILLING" ? "ERROR_RAISED" :
    rawEvent;

  const telemetry = toTelemetryPayload(machineCode, payload);
  await applyDeviceEvent(services, {
    machineCode,
    transactionId: telemetry.transactionId,
    topic: `vending/${machineCode}/event`,
    eventType: mappedEvent,
    payload: {
      ...payload,
      state: telemetry.state,
      source: telemetry.source,
      tankLevelPct: telemetry.tankLevelPct,
      bottleDetected: telemetry.bottleDetected,
      pumpRunning: telemetry.pumpRunning,
      filledMl: telemetry.filledMl ?? 0,
      flowRateLpm: telemetry.flowRateLpm,
    },
  });
}

export async function handleInboundMqttMessage(services: AppServices, message: IncomingMqttMessage) {
  const parsedTopic = parseTopic(message.topic);
  if (!parsedTopic) return;

  const { machineCode, channel } = parsedTopic;
  if (channel === "availability") {
    await ingestAvailability(services, machineCode, message.payload);
    return;
  }

  const payload = parseJsonPayload(message.payload);
  if (!payload) return;

  if (channel === "event") {
    await ingestEvent(services, machineCode, payload);
    return;
  }

  if (channel === "status" || channel === "progress") {
    await ingestTelemetrySnapshot(services, machineCode, channel, toTelemetryPayload(machineCode, payload));
  }
}

export function registerMqttDeviceSync(services: AppServices) {
  const provider = services.mqtt as MqttProvider;
  provider.setMessageHandler?.((message) => handleInboundMqttMessage(services, message));
}
