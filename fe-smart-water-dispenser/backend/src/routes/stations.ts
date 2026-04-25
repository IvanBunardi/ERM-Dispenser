import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { AppServices } from "../types.js";
import { machineStatusSnapshots, machineVolumeOptions, machines, sites } from "../db/schema.js";
import { fail, ok } from "../lib/http.js";
import { calculateDistanceMeters, formatDistanceLabel } from "../lib/utils.js";

function mapCapacityToStatus(capacityPct: number) {
  if (capacityPct <= 0) return "unavailable";
  if (capacityPct < 70) return "partial";
  return "available";
}

export async function registerStationRoutes(app: FastifyInstance, services: AppServices) {
  app.get("/api/stations", async (request, reply) => {
    const db = services.dbClient.db as any;
    const lat = typeof request.query === "object" && request.query && "lat" in request.query ? Number((request.query as any).lat) : null;
    const lng = typeof request.query === "object" && request.query && "lng" in request.query ? Number((request.query as any).lng) : null;
    const filter = typeof request.query === "object" && request.query && "filter" in request.query ? String((request.query as any).filter) : null;
    const search = typeof request.query === "object" && request.query && "search" in request.query ? String((request.query as any).search).toLowerCase() : "";

    const machineRows = await db.select().from(machines);
    const siteRows = await db.select().from(sites);
    const statusRows = await db.select().from(machineStatusSnapshots).orderBy(desc(machineStatusSnapshots.reportedAt));

    const stationRows = machineRows
      .map((machine: any) => {
        const site = siteRows.find((row: any) => row.id === machine.siteId);
        const latestStatus = statusRows.find((row: any) => row.machineId === machine.id);
        const distanceMeters = calculateDistanceMeters(
          lat,
          lng,
          site?.latitude ? Number(site.latitude) : null,
          site?.longitude ? Number(site.longitude) : null,
        );
        const capacityPct = latestStatus?.tankLevelPct ?? 0;
        return {
          id: machine.id,
          machineCode: machine.machineCode,
          shortCode: machine.shortCode,
          name: machine.displayName,
          distanceMeters,
          distance: formatDistanceLabel(distanceMeters),
          lastRefilled: latestStatus?.reportedAt
            ? `Refilled ${new Date(latestStatus.reportedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
            : "No recent refill",
          capacity: capacityPct,
          status: mapCapacityToStatus(capacityPct),
          imageUrl: machine.imageUrl,
          lat: site?.latitude ? Number(site.latitude) : null,
          lng: site?.longitude ? Number(site.longitude) : null,
          isVerified: machine.isVerified,
        };
      })
      .filter((row: any) => row.name.toLowerCase().includes(search));

    let filtered = stationRows;
    if (filter === "verified") {
      filtered = filtered.filter((row: any) => row.isVerified);
    }
    if (filter === "highCapacity") {
      filtered = filtered.filter((row: any) => row.capacity >= 70);
    }
    if (filter === "nearest") {
      filtered = filtered.sort((a: any, b: any) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
    }

    return ok(reply, filtered);
  });

  app.get("/api/stations/:stationId", async (request, reply) => {
    const db = services.dbClient.db as any;
    const { stationId } = request.params as { stationId: string };
    const [machine] = await db.select().from(machines).where(eq(machines.id, stationId)).limit(1);
    if (!machine) {
      return fail(reply, 404, "NOT_FOUND", "Station not found");
    }

    const [site] = await db.select().from(sites).where(eq(sites.id, machine.siteId)).limit(1);
    const [status] = await db
      .select()
      .from(machineStatusSnapshots)
      .where(eq(machineStatusSnapshots.machineId, machine.id))
      .orderBy(desc(machineStatusSnapshots.reportedAt))
      .limit(1);
    const volumeOptions = await db
      .select()
      .from(machineVolumeOptions)
      .where(eq(machineVolumeOptions.machineId, machine.id));

    return ok(reply, {
      ...machine,
      site,
      status,
      volumeOptions,
    });
  });

  app.post("/api/scan/verify", async (request, reply) => {
    const db = services.dbClient.db as any;
    const body = request.body as { code?: string };
    const code = body?.code?.trim().toUpperCase();
    if (!code) {
      return fail(reply, 400, "BAD_REQUEST", "QR code is required");
    }

    const [machine] = await db.select().from(machines).where(eq(machines.shortCode, code)).limit(1);
    if (!machine) {
      return fail(reply, 404, "NOT_FOUND", "Machine code not found");
    }

    const [status] = await db
      .select()
      .from(machineStatusSnapshots)
      .where(eq(machineStatusSnapshots.machineId, machine.id))
      .orderBy(desc(machineStatusSnapshots.reportedAt))
      .limit(1);

    return ok(reply, {
      machine: {
        id: machine.id,
        machineCode: machine.machineCode,
        shortCode: machine.shortCode,
        displayName: machine.displayName,
        status: status ? mapCapacityToStatus(status.tankLevelPct ?? 0) : "unavailable",
        capacityPct: status?.tankLevelPct ?? 0,
      },
    });
  });
}
