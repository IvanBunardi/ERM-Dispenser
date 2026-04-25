import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import { machines } from "../db/schema.js";

export const updateCodesRoute: FastifyPluginAsync = async (app) => {
  app.post("/api/admin/update-codes", async (request, reply) => {
    const db = app.services.dbClient.db as any;

    try {
      await db.update(machines).set({ shortCode: "123456" }).where(eq(machines.machineCode, "VM-001"));
      await db.update(machines).set({ shortCode: "654321" }).where(eq(machines.machineCode, "VM-002"));
      await db.update(machines).set({ shortCode: "112233" }).where(eq(machines.machineCode, "VM-003"));
      
      return { success: true, message: "Codes updated successfully" };
    } catch (error) {
      return reply.status(500).send({ error: "Failed to update codes", details: error });
    }
  });
};
