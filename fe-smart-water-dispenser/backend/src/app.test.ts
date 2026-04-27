import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { closeServices } from "./services/index.js";
import { handleInboundMqttMessage } from "./services/mqtt-device-sync.js";
import type { AppServices } from "./types.js";

function extractCookie(setCookieHeader: string | string[] | undefined, cookieName: string) {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  const found = headers.find((value) => value.startsWith(`${cookieName}=`));
  if (!found) return null;
  return found.split(";")[0];
}

describe("backend service", () => {
  let app: FastifyInstance;
  let services: AppServices;

  beforeAll(async () => {
    const built = await buildApp({
      configOverrides: {
        NODE_ENV: "test",
        DATABASE_URL: "pglite://memory",
        MIDTRANS_MODE: "mock",
        MQTT_MODE: "mock",
        SESSION_SECRET: "test-secret-that-is-long-enough",
        INTEGRATION_SHARED_SECRET: "integration-secret",
        ADMIN_EMAIL: "admin@ecoflow.local",
        ADMIN_PASSWORD: "admin12345",
      },
    });
    app = built.app;
    services = built.services;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await closeServices(services);
  });

  it("exposes health status", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().success).toBe(true);
    expect(response.json().data.databaseMode).toBe("pglite");
  });

  it("runs core customer and admin flow end-to-end", async () => {
    const guestInit = await app.inject({
      method: "POST",
      url: "/api/guest/init",
      payload: {},
    });
    expect(guestInit.statusCode).toBe(201);
    const guestCookie = extractCookie(guestInit.headers["set-cookie"], "ecoflow_guest_session");
    expect(guestCookie).toBeTruthy();

    const stationsResponse = await app.inject({
      method: "GET",
      url: "/api/stations?filter=nearest",
    });
    expect(stationsResponse.statusCode).toBe(200);
    const stations = stationsResponse.json().data;
    expect(stations.length).toBeGreaterThan(0);
    const lobbyStation = stations.find((row: { machineCode: string }) => row.machineCode === "VM-002");
    const pmbsStation = stations.find((row: { machineCode: string }) => row.machineCode === "VM-003");
    expect(lobbyStation?.imageUrl).toContain("prasetiyamulya.ac.id");
    expect(pmbsStation?.imageUrl).toContain("prasetiyamulya.ac.id");

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/scan/verify",
      payload: {
        code: "123456",
      },
    });
    expect(verifyResponse.statusCode).toBe(200);
    const machine = verifyResponse.json().data.machine;
    expect(machine.machineCode).toBe("VM-001");

    const dispenseResponse = await app.inject({
      method: "POST",
      url: "/api/dispense",
      headers: {
        cookie: guestCookie ?? "",
      },
      payload: {
        machineId: machine.id,
        volumeMl: 500,
      },
    });
    expect(dispenseResponse.statusCode).toBe(201);
    const dispensePayload = dispenseResponse.json().data;
    expect(dispensePayload.payment.paymentType).toBe("qris");

    const paymentNotification = await app.inject({
      method: "POST",
      url: "/api/integrations/midtrans/notifications",
      payload: {
        order_id: dispensePayload.orderId,
        transaction_id: "mock-payment-001",
        transaction_status: "settlement",
      },
    });
    expect(paymentNotification.statusCode).toBe(200);
    expect(paymentNotification.json().data.paymentStatus).toBe("PAID");

    const bottleDetected = await app.inject({
      method: "POST",
      url: "/api/integrations/device/events",
      headers: {
        "x-integration-secret": "integration-secret",
      },
      payload: {
        machineCode: "VM-001",
        transactionId: dispensePayload.transactionId,
        topic: "vending/VM-001/event",
        eventType: "BOTTLE_DETECTED",
        payload: {
          state: "READY_TO_FILL",
          bottleDetected: true,
          filledMl: 0,
        },
      },
    });
    expect(bottleDetected.statusCode).toBe(200);

    const fillingStarted = await app.inject({
      method: "POST",
      url: "/api/integrations/device/events",
      headers: {
        "x-integration-secret": "integration-secret",
      },
      payload: {
        machineCode: "VM-001",
        transactionId: dispensePayload.transactionId,
        topic: "vending/VM-001/event",
        eventType: "FILLING_STARTED",
        payload: {
          state: "FILLING",
          pumpRunning: true,
          filledMl: 100,
          flowRateLpm: 4.2,
        },
      },
    });
    expect(fillingStarted.statusCode).toBe(200);

    const fillingCompleted = await app.inject({
      method: "POST",
      url: "/api/integrations/device/events",
      headers: {
        "x-integration-secret": "integration-secret",
      },
      payload: {
        machineCode: "VM-001",
        transactionId: dispensePayload.transactionId,
        topic: "vending/VM-001/event",
        eventType: "FILLING_COMPLETED",
        payload: {
          state: "COMPLETE",
          pumpRunning: false,
          filledMl: 500,
          flowRateLpm: 4.1,
        },
      },
    });
    expect(fillingCompleted.statusCode).toBe(200);

    const transactionResponse = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${dispensePayload.transactionId}`,
    });
    expect(transactionResponse.statusCode).toBe(200);
    expect(transactionResponse.json().data.transaction.paymentStatus).toBe("PAID");
    expect(transactionResponse.json().data.transaction.dispenseStatus).toBe("COMPLETED");

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/admin/auth/login",
      payload: {
        email: "admin@ecoflow.local",
        password: "admin12345",
      },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookie = extractCookie(adminLogin.headers["set-cookie"], "ecoflow_admin_session");
    expect(adminCookie).toBeTruthy();

    const dashboardResponse = await app.inject({
      method: "GET",
      url: "/api/admin/dashboard/summary",
      headers: {
        cookie: adminCookie ?? "",
      },
    });
    expect(dashboardResponse.statusCode).toBe(200);
    const dashboard = dashboardResponse.json().data;
    expect(dashboard.totalTransactions).toBe(1);
    expect(dashboard.successfulTransactions).toBe(1);
    expect(dashboard.totalRevenue).toBe(2000);
  });

  it("syncs local refill telemetry from MQTT into station capacity", async () => {
    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        state: "REFILLING_TANK",
        source: "LOCAL_REFILL",
        tankLevelPercent: 82,
        pumpRunning: true,
        refillRunning: true,
        flowRateLpm: 3.4,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/progress",
      payload: JSON.stringify({
        machineId: "VM-002",
        refillId: "LOCAL-REFILL-123",
        tankLevelPercent: 100,
        pumpRunning: true,
        refillRunning: true,
        flowRateLpm: 3.6,
      }),
      qos: 1,
      retain: false,
    });

    const stationsResponse = await app.inject({
      method: "GET",
      url: "/api/stations",
    });

    expect(stationsResponse.statusCode).toBe(200);
    const station = stationsResponse.json().data.find((row: { machineCode: string }) => row.machineCode === "VM-002");
    expect(station).toBeTruthy();
    expect(station.capacity).toBe(100);
    expect(station.status).toBe("available");

    const stationDetailResponse = await app.inject({
      method: "GET",
      url: `/api/stations/${station.id}`,
    });

    expect(stationDetailResponse.statusCode).toBe(200);
    const stationDetail = stationDetailResponse.json().data;
    expect(stationDetail.status.tankLevelPct).toBe(100);
    expect(stationDetail.status.state).toBe("REFILLING_TANK");
    expect(stationDetail.status.source).toBe("LOCAL_REFILL");
  });

  it("creates a QRIS transaction from WAIT_PAYMENT telemetry and exposes it to the tablet view", async () => {
    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        targetVolumeMl: 1000,
        amount: 4000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const tabletMachineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-002?mode=tablet",
    });

    expect(tabletMachineResponse.statusCode).toBe(200);
    const tabletMachine = tabletMachineResponse.json().data;
    expect(tabletMachine.activeTransaction).toBeTruthy();
    expect(tabletMachine.activeTransaction.volumeMl).toBe(1000);
    expect(tabletMachine.activeTransaction.grossAmount).toBe(4000);
    const firstTransactionId = tabletMachine.activeTransaction.id;

    const transactionDetailResponse = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${firstTransactionId}`,
    });

    expect(transactionDetailResponse.statusCode).toBe(200);
    const transactionDetail = transactionDetailResponse.json().data;
    expect(transactionDetail.transaction.paymentStatus).toBe("PENDING");
    expect(transactionDetail.transaction.dispenseStatus).toBe("WAITING_PAYMENT");
    expect(transactionDetail.payment.paymentType).toBe("qris");

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        targetVolumeMl: 1000,
        amount: 4000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const secondTabletMachineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-002?mode=tablet",
    });

    expect(secondTabletMachineResponse.statusCode).toBe(200);
    expect(secondTabletMachineResponse.json().data.activeTransaction.id).toBe(firstTransactionId);
  });

  it("overrides an active tablet transaction when IoT WAIT_PAYMENT arrives", async () => {
    const tabletCreateResponse = await app.inject({
      method: "POST",
      url: "/api/customer/machines/VM-003/tablet-transaction",
      payload: {
        volumeMl: 500,
      },
    });

    expect(tabletCreateResponse.statusCode).toBe(201);
    const tabletTransactionId = tabletCreateResponse.json().data.transactionId;

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-003/status",
      payload: JSON.stringify({
        machineId: "VM-003",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        targetVolumeMl: 1000,
        amount: 4000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const overriddenTabletTransaction = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${tabletTransactionId}`,
    });

    expect(overriddenTabletTransaction.statusCode).toBe(200);
    expect(overriddenTabletTransaction.json().data.transaction.dispenseStatus).toBe("CANCELLED");

    const tabletMachineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-003?mode=tablet",
    });

    expect(tabletMachineResponse.statusCode).toBe(200);
    const activeTransaction = tabletMachineResponse.json().data.activeTransaction;
    expect(activeTransaction).toBeTruthy();
    expect(activeTransaction.id).not.toBe(tabletTransactionId);
    expect(activeTransaction.volumeMl).toBe(1000);
    expect(activeTransaction.grossAmount).toBe(4000);
  });

  it("cancels the active IoT-synced transaction on the device when tablet mode requests cancel", async () => {
    await handleInboundMqttMessage(services, {
      topic: "vending/VM-001/status",
      payload: JSON.stringify({
        machineId: "VM-001",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        targetVolumeMl: 500,
        amount: 2000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const tabletMachineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-001?mode=tablet",
    });

    expect(tabletMachineResponse.statusCode).toBe(200);
    const activeTransaction = tabletMachineResponse.json().data.activeTransaction;
    expect(activeTransaction).toBeTruthy();

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/api/customer/transactions/${activeTransaction.id}/cancel`,
    });

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json().data.cancelled).toBe(true);

    const cancelledTransactionResponse = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${activeTransaction.id}`,
    });

    expect(cancelledTransactionResponse.statusCode).toBe(200);
    expect(cancelledTransactionResponse.json().data.transaction.dispenseStatus).toBe("CANCELLED");

    const publishedCommands = (services.mqtt as any).published as Array<{
      machineCode: string;
      topic: string;
      payload: Record<string, unknown>;
    }>;
    const cancelCommand = [...publishedCommands].reverse().find((entry) => entry.payload.command === "CANCEL_ORDER");
    expect(cancelCommand).toBeTruthy();
    expect(cancelCommand?.machineCode).toBe("VM-001");
    expect(cancelCommand?.topic).toBe("vending/VM-001/command");
    expect(cancelCommand?.payload).toEqual({
      command: "CANCEL_ORDER",
    });
  });

  it("marks the active machine transaction as paid when PAYMENT_CONFIRMED_BY_BUTTON arrives from the IoT", async () => {
    await handleInboundMqttMessage(services, {
      topic: "vending/VM-004/status",
      payload: JSON.stringify({
        machineId: "VM-004",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        transactionId: "LOCAL-DEVICE-123",
        targetVolumeMl: 500,
        amount: 2000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const tabletMachineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-004?mode=tablet",
    });

    expect(tabletMachineResponse.statusCode).toBe(200);
    const activeTransaction = tabletMachineResponse.json().data.activeTransaction;
    expect(activeTransaction).toBeTruthy();
    expect(activeTransaction.paymentStatus).toBe("PENDING");

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-004/event",
      payload: JSON.stringify({
        machineId: "VM-004",
        transactionId: "LOCAL-DEVICE-123",
        event: "PAYMENT_CONFIRMED_BY_BUTTON",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
      }),
      qos: 1,
      retain: false,
    });

    const transactionDetailResponse = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${activeTransaction.id}`,
    });

    expect(transactionDetailResponse.statusCode).toBe(200);
    expect(transactionDetailResponse.json().data.transaction.paymentStatus).toBe("PAID");
    expect(transactionDetailResponse.json().data.transaction.dispenseStatus).toBe("WAITING_BOTTLE");

    const publishedCommands = (services.mqtt as any).published as Array<{
      machineCode: string;
      topic: string;
      payload: Record<string, unknown>;
    }>;
    const paidCommand = [...publishedCommands]
      .reverse()
      .find((entry) => entry.machineCode === "VM-004" && entry.payload.command === "PAYMENT_PAID");
    expect(paidCommand).toBeTruthy();
    expect(paidCommand?.topic).toBe("vending/VM-004/command");
    expect(paidCommand?.payload).toEqual({
      command: "PAYMENT_PAID",
      transactionId: activeTransaction.id,
    });
  });

  it("advances the tablet transaction timeline as simulated bottle and filling events arrive from MQTT", async () => {
    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
        transactionId: "LOCAL-TIMELINE-1",
        targetVolumeMl: 500,
        amount: 2000,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    const machineResponse = await app.inject({
      method: "GET",
      url: "/api/customer/machines/VM-002?mode=tablet",
    });

    expect(machineResponse.statusCode).toBe(200);
    const transactionId = machineResponse.json().data.activeTransaction.id as string;

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/event",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        event: "PAYMENT_CONFIRMED_BY_BUTTON",
        state: "WAIT_PAYMENT",
        source: "LOCAL",
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        state: "WAIT_BOTTLE",
        source: "LOCAL",
        bottleDetected: false,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/event",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        event: "BOTTLE_SIMULATED_READY",
        state: "READY_TO_FILL",
        source: "LOCAL",
        bottleDetected: true,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        state: "READY_TO_FILL",
        source: "LOCAL",
        bottleDetected: true,
        pumpRunning: false,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/event",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        event: "FILLING_STARTED",
        state: "FILLING",
        source: "LOCAL",
        bottleDetected: true,
        pumpRunning: true,
        filledMl: 120,
        flowRateLpm: 4.4,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/status",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        state: "FILLING",
        source: "LOCAL",
        bottleDetected: true,
        pumpRunning: true,
        filledMl: 300,
        flowRateLpm: 4.2,
      }),
      qos: 1,
      retain: false,
    });

    await handleInboundMqttMessage(services, {
      topic: "vending/VM-002/event",
      payload: JSON.stringify({
        machineId: "VM-002",
        transactionId: "LOCAL-TIMELINE-1",
        event: "FILLING_FORCE_COMPLETED",
        state: "COMPLETE",
        source: "LOCAL",
        filledMl: 500,
        flowRateLpm: 4.0,
      }),
      qos: 1,
      retain: false,
    });

    const transactionResponse = await app.inject({
      method: "GET",
      url: `/api/customer/transactions/${transactionId}`,
    });

    expect(transactionResponse.statusCode).toBe(200);
    const transactionData = transactionResponse.json().data;
    expect(transactionData.transaction.paymentStatus).toBe("PAID");
    expect(transactionData.transaction.dispenseStatus).toBe("COMPLETED");
    expect(transactionData.latestStatus.state).toBe("COMPLETE");
    expect(transactionData.recentEvents.some((event: { eventType: string }) => event.eventType === "BOTTLE_DETECTED")).toBe(true);
    expect(transactionData.recentEvents.some((event: { eventType: string }) => event.eventType === "FILLING_COMPLETED")).toBe(true);
  });
});
