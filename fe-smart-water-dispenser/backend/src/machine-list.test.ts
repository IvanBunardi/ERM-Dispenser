import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { closeServices } from "./services/index.js";
import type { AppServices } from "./types.js";

describe("Machine List API", () => {
  let app: FastifyInstance;
  let services: AppServices;

  beforeAll(async () => {
    const built = await buildApp({
      configOverrides: {
        NODE_ENV: "test",
        DATABASE_URL: "pglite://memory",
        SESSION_SECRET: "test-secret-that-is-long-enough-for-validation",
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

  it("returns a list of machines with name and machineCode for selection", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/stations",
    });

    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    
    if (result.data.length > 0) {
      const machine = result.data[0];
      expect(machine).toHaveProperty("name");
      expect(machine).toHaveProperty("machineCode");
      expect(typeof machine.name).toBe("string");
      expect(typeof machine.machineCode).toBe("string");
    }
  });
});
