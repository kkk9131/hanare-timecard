import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db/client.js";
import type { HonoVariables, Role, SessionUser } from "./session.js";

/**
 * Require any authenticated session.
 */
export const requireAuth: MiddlewareHandler<{
  Variables: HonoVariables;
}> = async (c, next) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "認証が必要です" });
  }
  await next();
};

/**
 * Require the session to hold one of the given roles.
 */
export function requireRole(...roles: Role[]): MiddlewareHandler<{ Variables: HonoVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      throw new HTTPException(401, { message: "認証が必要です" });
    }
    if (!roles.includes(user.role)) {
      throw new HTTPException(403, { message: "権限がありません" });
    }
    await next();
  };
}

export interface ScopedStoreQuery {
  store_id?: number;
  store_ids?: number[];
}

export function getUserStoreIds(employeeId: number): number[] {
  return db
    .select({ storeId: schema.employeeStores.storeId })
    .from(schema.employeeStores)
    .where(eq(schema.employeeStores.employeeId, employeeId))
    .all()
    .map((r) => r.storeId);
}

export function assertCanAccessStore(user: SessionUser, storeId: number): void {
  if (user.role === "admin") return;
  if (!getUserStoreIds(user.employeeId).includes(storeId)) {
    throw new HTTPException(403, { message: "この店舗のデータを操作する権限がありません" });
  }
}

export function scopeStoreQuery(user: SessionUser, requestedStoreId?: number): ScopedStoreQuery {
  if (user.role === "admin") {
    return requestedStoreId == null ? {} : { store_id: requestedStoreId };
  }

  const storeIds = getUserStoreIds(user.employeeId);
  if (requestedStoreId != null) {
    if (!storeIds.includes(requestedStoreId)) {
      throw new HTTPException(403, { message: "この店舗のデータを参照する権限がありません" });
    }
    return { store_id: requestedStoreId };
  }

  return storeIds.length === 1 ? { store_id: storeIds[0] } : { store_ids: storeIds };
}

export function assertCanAccessEmployee(user: SessionUser, employeeId: number): void {
  if (user.role === "admin" || user.employeeId === employeeId) return;
  const userStoreIds = getUserStoreIds(user.employeeId);
  const employeeStoreIds = getUserStoreIds(employeeId);
  if (!employeeStoreIds.some((storeId) => userStoreIds.includes(storeId))) {
    throw new HTTPException(403, { message: "この従業員のデータを操作する権限がありません" });
  }
}
