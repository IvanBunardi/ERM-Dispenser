import { and, desc, eq, sum } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";
import {
  customerImpactSnapshots,
  guestPreferences,
  guestUsers,
  leaderboardSnapshots,
  machines,
  transactions,
} from "../db/schema.js";
import { getGuestAuth } from "../lib/auth.js";
import { fail, ok } from "../lib/http.js";
import { getEcoLevel } from "../lib/utils.js";

const profileSchema = z.object({
  displayName: z.string().min(1).max(32).regex(/^[\w\s-]+$/),
});

const preferenceSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  publicLeaderboard: z.boolean().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export async function registerUserRoutes(app: FastifyInstance, services: AppServices) {
  app.get("/api/user/stats", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const db = services.dbClient.db as any;
    const [stats] = await db
      .select({
        bottlesSaved: sum(customerImpactSnapshots.bottlesSaved),
        co2ReducedGrams: sum(customerImpactSnapshots.co2ReducedGrams),
        totalSpent: sum(customerImpactSnapshots.totalSpent),
        totalVolumeMl: sum(customerImpactSnapshots.totalVolumeMl),
      })
      .from(customerImpactSnapshots)
      .where(eq(customerImpactSnapshots.guestUserId, auth.user.id));

    const bottlesSaved = Number(stats?.bottlesSaved ?? 0);
    return ok(reply, {
      bottlesSaved,
      co2ReducedKg: Number(stats?.co2ReducedGrams ?? 0) / 1000,
      weeklyChangePct: bottlesSaved > 0 ? 12 : 0,
      ecoLevel: getEcoLevel(bottlesSaved),
      totalSpent: Number(stats?.totalSpent ?? 0),
      totalVolumeMl: Number(stats?.totalVolumeMl ?? 0),
    });
  });

  app.get("/api/user/history", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const db = services.dbClient.db as any;
    const rows = await db
      .select({
        id: transactions.id,
        stationName: machines.displayName,
        waterType: transactions.volumeMl,
        amount: transactions.grossAmount,
        date: transactions.createdAt,
        paymentStatus: transactions.paymentStatus,
        dispenseStatus: transactions.dispenseStatus,
      })
      .from(transactions)
      .innerJoin(machines, eq(transactions.machineId, machines.id))
      .where(eq(transactions.guestUserId, auth.user.id))
      .orderBy(desc(transactions.createdAt));

    return ok(
      reply,
      rows.map((row: any) => ({
        id: row.id,
        stationName: row.stationName,
        waterType: `${row.waterType}ml Smart Dispenser Water`,
        amount: row.amount,
        currency: "IDR",
        date: new Date(row.date).toLocaleDateString("en-US"),
        time: new Date(row.date).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
        paymentStatus: row.paymentStatus,
        dispenseStatus: row.dispenseStatus,
      })),
    );
  });

  app.put("/api/user/profile", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const parsed = profileSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid display name");
    }

    const db = services.dbClient.db as any;
    await db
      .update(guestUsers)
      .set({
        displayName: parsed.data.displayName.trim(),
        lastActiveAt: new Date(),
      })
      .where(eq(guestUsers.id, auth.user.id));

    return ok(reply, { updated: true });
  });

  app.get("/api/leaderboard", async (_request, reply) => {
    const db = services.dbClient.db as any;
    const users = await db.select().from(guestUsers);
    const stats = await db
      .select({
        guestUserId: customerImpactSnapshots.guestUserId,
        bottlesSaved: sum(customerImpactSnapshots.bottlesSaved),
      })
      .from(customerImpactSnapshots)
      .groupBy(customerImpactSnapshots.guestUserId);

    const rows = users
      .map((user: any) => ({
        guestUserId: user.id,
        name: user.displayName,
        points: Number(stats.find((row: any) => row.guestUserId === user.id)?.bottlesSaved ?? 0),
      }))
      .sort((a: any, b: any) => b.points - a.points)
      .map((row: any, index: number) => ({
        rank: index + 1,
        name: row.name,
        location: "Eco Flow Network",
        points: row.points,
      }));

    return ok(reply, rows);
  });

  app.get("/api/settings/preferences", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const db = services.dbClient.db as any;
    const [preferences] = await db
      .select()
      .from(guestPreferences)
      .where(eq(guestPreferences.guestUserId, auth.user.id))
      .limit(1);

    return ok(reply, preferences);
  });

  app.patch("/api/settings/preferences", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const parsed = preferenceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid preferences payload");
    }

    const db = services.dbClient.db as any;
    await db
      .update(guestPreferences)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(guestPreferences.guestUserId, auth.user.id));

    return ok(reply, { updated: true });
  });
}
