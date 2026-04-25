import type { FastifyReply } from "fastify";

export const GUEST_COOKIE_NAME = "ecoflow_guest_session";
export const ADMIN_COOKIE_NAME = "ecoflow_admin_session";

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.code(statusCode).send({
    success: true,
    data,
  });
}

export function fail(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({
    success: false,
    error: {
      code,
      message,
    },
  });
}

export function setSessionCookie(reply: FastifyReply, name: string, token: string, maxAgeSeconds: number) {
  reply.setCookie(name, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply, name: string) {
  reply.clearCookie(name, {
    path: "/",
  });
}
