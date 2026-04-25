import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { adminRoles, adminUserRoles, adminUsers, guestSessions, guestUsers } from "../db/schema.js";
import { hashValue } from "./utils.js";
import { ADMIN_COOKIE_NAME, GUEST_COOKIE_NAME } from "./http.js";
import type { AppServices } from "../types.js";

export async function getGuestAuth(request: FastifyRequest, services: AppServices) {
  const token = request.cookies[GUEST_COOKIE_NAME];
  const payload = await services.session.verify(token);
  if (!payload || payload.kind !== "guest") return null;
  if (!token) return null;

  const db = services.dbClient.db as any;
  const sessions = await db
    .select()
    .from(guestSessions)
    .where(
      and(
        eq(guestSessions.id, payload.sid),
        eq(guestSessions.guestUserId, payload.sub),
        eq(guestSessions.sessionTokenHash, hashValue(token)),
      ),
    )
    .limit(1);

  if (!sessions[0]) return null;

  const users = await db.select().from(guestUsers).where(eq(guestUsers.id, payload.sub)).limit(1);
  if (!users[0]) return null;

  return {
    session: sessions[0],
    user: users[0],
    token,
    payload,
  };
}

export async function getAdminAuth(request: FastifyRequest, services: AppServices) {
  const token = request.cookies[ADMIN_COOKIE_NAME];
  const payload = await services.session.verify(token);
  if (!payload || payload.kind !== "admin") return null;
  if (!token) return null;

  const db = services.dbClient.db as any;
  const users = await db.select().from(adminUsers).where(eq(adminUsers.id, payload.sub)).limit(1);
  const user = users[0];
  if (!user || !user.isActive) return null;

  const roleRows = await db
    .select({
      roleKey: adminRoles.roleKey,
      roleName: adminRoles.roleName,
    })
    .from(adminUserRoles)
    .innerJoin(adminRoles, eq(adminUserRoles.adminRoleId, adminRoles.id))
    .where(eq(adminUserRoles.adminUserId, user.id));

  return {
    user,
    roles: roleRows,
    token,
    payload,
  };
}
