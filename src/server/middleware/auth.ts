import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { HonoVariables, Role } from "./session.js";

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
