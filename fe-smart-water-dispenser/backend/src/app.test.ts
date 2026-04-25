import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { closeServices } from "./services/index.js";
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

    const verifyResponse = await app.inject({
      method: "POST",
      url: "/api/scan/verify",
      payload: {
        code: "PRASMUL1",
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
});
