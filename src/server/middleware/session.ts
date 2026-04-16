import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db, schema } from "../db/client.js";
import { generateSessionId } from "../lib/crypto.js";

export const SESSION_COOKIE_NAME = "hanare_sid";

/** TTL for kiosk punch sessions: 5 minutes. */
export const KIOSK_SESSION_TTL_MS = 5 * 60 * 1000;
/** TTL for admin/manager sessions: 2 hours (sliding). */
export const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type Role = "staff" | "manager" | "admin";

export interface SessionUser {
  sessionId: string;
  employeeId: number;
  role: Role;
  expiresAt: number;
}

export interface HonoVariables {
  user: SessionUser | null;
}

/**
 * Look up the current cookie session, validate expiration, and attach to context.
 * Performs sliding renewal for manager/admin sessions.
 */
export const sessionMiddleware: MiddlewareHandler<{
  Variables: HonoVariables;
}> = async (c, next) => {
  c.set("user", null);
  const raw = getCookie(c, SESSION_COOKIE_NAME);
  if (!raw) {
    await next();
    return;
  }

  const now = Date.now();
  const row = db.select().from(schema.sessions).where(eq(schema.sessions.id, raw)).get();

  if (!row) {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    await next();
    return;
  }

  if (row.expiresAt <= now) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, raw)).run();
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    await next();
    return;
  }

  const role = row.role as Role;
  // Sliding renewal for non-kiosk sessions.
  let expiresAt = row.expiresAt;
  if (role === "manager" || role === "admin") {
    expiresAt = now + ADMIN_SESSION_TTL_MS;
    db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.id, raw)).run();
    writeSessionCookie(c, raw, expiresAt);
  }

  c.set("user", {
    sessionId: row.id,
    employeeId: row.employeeId,
    role,
    expiresAt,
  });

  await next();
};

/**
 * Create a new session row and emit the Set-Cookie header.
 */
export function createSession(c: Context, employeeId: number, role: Role): SessionUser {
  const id = generateSessionId();
  const now = Date.now();
  const ttl = role === "staff" ? KIOSK_SESSION_TTL_MS : ADMIN_SESSION_TTL_MS;
  const expiresAt = now + ttl;

  db.insert(schema.sessions)
    .values({
      id,
      employeeId,
      role,
      expiresAt,
      createdAt: now,
    })
    .run();

  writeSessionCookie(c, id, expiresAt);

  return { sessionId: id, employeeId, role, expiresAt };
}

/**
 * Destroy the current session (both the DB row and the cookie).
 */
export function destroySession(c: Context): void {
  const raw = getCookie(c, SESSION_COOKIE_NAME);
  if (raw) {
    db.delete(schema.sessions).where(eq(schema.sessions.id, raw)).run();
  }
  deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

function writeSessionCookie(c: Context, id: string, expiresAt: number): void {
  const secure = process.env.HANARE_TLS === "1";
  setCookie(c, SESSION_COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure,
    expires: new Date(expiresAt),
  });
}
