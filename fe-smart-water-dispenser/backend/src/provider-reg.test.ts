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

describe("Machine Provider Registration", () => {
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
        ADMIN_EMAIL: "admin@prasmul.ac.id",
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

  it("registers a new machine provider successfully", async () => {
    const payload = {
      fullName: "Provider Baru",
      institutionName: "Institusi Test",
      email: "provider@test.com",
      phoneNumber: "081234567890",
      password: "password123",
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/auth/register-provider",
      payload,
    });

    expect(response.statusCode).toBe(201);
    const data = response.json().data;
    expect(data.admin.email).toBe(payload.email);
    expect(data.admin.fullName).toBe(payload.fullName);
    expect(data.admin.institutionName).toBe(payload.institutionName);

    const cookie = extractCookie(response.headers["set-cookie"], "ecoflow_admin_session");
    expect(cookie).toBeTruthy();
  });

  it("fails to register with an existing email", async () => {
    const payload = {
      fullName: "Provider Duplicate",
      institutionName: "Institusi Test",
      email: "provider@test.com", // Same as previous test
      phoneNumber: "081234567891",
      password: "password123",
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/auth/register-provider",
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe("DUPLICATE_EMAIL");
  });

  it("fails to register with invalid payload", async () => {
    const payload = {
      fullName: "Pr", // too short
      email: "not-an-email",
      password: "123", // too short
    };

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/auth/register-provider",
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");
  });
});
