import { randomUUID } from "node:crypto";
import { and, desc, eq, sum } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../types.js";
import { guestPreferences, guestSessions, guestUsers, customerImpactSnapshots } from "../db/schema.js";
import { getGuestAuth } from "../lib/auth.js";
import { clearSessionCookie, fail, GUEST_COOKIE_NAME, ok, setSessionCookie } from "../lib/http.js";
import { generateDisplayId, getEcoLevel, hashValue } from "../lib/utils.js";

const initGuestSchema = z.object({
  deviceFingerprint: z.string().optional(),
});

export async function registerGuestRoutes(app: FastifyInstance, services: AppServices) {
  app.post("/api/guest/init", async (request, reply) => {
    const parsed = initGuestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return fail(reply, 400, "BAD_REQUEST", "Invalid guest initialization payload");
    }

    const db = services.dbClient.db as any;
    const guestId = randomUUID();
    const sessionId = randomUUID();
    const displayId = generateDisplayId();
    const displayName = `Guest_${displayId}`;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const token = await services.session.sign(
      {
        sub: guestId,
        kind: "guest",
        sid: sessionId,
      },
      "90d",
    );

    await db.insert(guestUsers).values({
      id: guestId,
      displayId,
      displayName,
      lastActiveAt: new Date(),
    });
    await db.insert(guestPreferences).values({
      guestUserId: guestId,
      notificationsEnabled: true,
      publicLeaderboard: true,
      languageCode: "en",
    });
    await db.insert(guestSessions).values({
      id: sessionId,
      guestUserId: guestId,
      sessionTokenHash: hashValue(token),
      csrfTokenHash: hashValue(`${sessionId}:${guestId}`),
      userAgent: request.headers["user-agent"] ?? null,
      lastIp: request.ip,
      expiresAt,
    });

    setSessionCookie(reply, GUEST_COOKIE_NAME, token, 90 * 24 * 60 * 60);
    return ok(reply, {
      guest: {
        id: guestId,
        displayId,
        displayName,
        createdAt: new Date().toISOString(),
      },
      preferences: {
        language: "en",
        notificationsEnabled: true,
        publicLeaderboard: true,
      },
    }, 201);
  });

  app.post("/api/guest/refresh", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const token = await services.session.sign(
      {
        sub: auth.user.id,
        kind: "guest",
        sid: auth.session.id,
      },
      "90d",
    );
    const db = services.dbClient.db as any;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await db
      .update(guestSessions)
      .set({
        sessionTokenHash: hashValue(token),
        expiresAt,
      })
      .where(eq(guestSessions.id, auth.session.id));

    setSessionCookie(reply, GUEST_COOKIE_NAME, token, 90 * 24 * 60 * 60);
    return ok(reply, { refreshed: true });
  });

  app.get("/api/guest/me", async (request, reply) => {
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
    const [stats] = await db
      .select({
        bottlesSaved: sum(customerImpactSnapshots.bottlesSaved),
        co2ReducedGrams: sum(customerImpactSnapshots.co2ReducedGrams),
        totalSpent: sum(customerImpactSnapshots.totalSpent),
      })
      .from(customerImpactSnapshots)
      .where(eq(customerImpactSnapshots.guestUserId, auth.user.id));

    const bottlesSaved = Number(stats?.bottlesSaved ?? 0);
    return ok(reply, {
      guest: {
        ...auth.user,
        bottlesSaved,
        totalSpent: Number(stats?.totalSpent ?? 0),
        co2Reduced: Number(stats?.co2ReducedGrams ?? 0) / 1000,
        ecoLevel: getEcoLevel(bottlesSaved),
      },
      preferences: preferences ?? {
        notificationsEnabled: true,
        publicLeaderboard: true,
        languageCode: "en",
      },
    });
  });

  app.delete("/api/guest/reset", async (request, reply) => {
    const auth = await getGuestAuth(request, services);
    if (!auth) {
      return fail(reply, 401, "UNAUTHENTICATED", "Guest session not found");
    }

    const db = services.dbClient.db as any;
    await db.delete(guestUsers).where(eq(guestUsers.id, auth.user.id));
    clearSessionCookie(reply, GUEST_COOKIE_NAME);
    return ok(reply, { reset: true });
  });
}
