import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { runBackup } from "../lib/backup.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";

export const systemRoutes = new Hono<{ Variables: HonoVariables }>();

systemRoutes.get("/health", (c) => {
  return c.json({ status: "ok", ok: true, time: Date.now() });
});

systemRoutes.get(
  "/_debug/whoami",
  async (c, next) => {
    if (process.env.NODE_ENV === "production") {
      return c.notFound();
    }
    await next();
  },
  requireAuth,
  (c) => {
    const user = c.get("user");
    return c.json({
      user: user
        ? {
            employeeId: user.employeeId,
            role: user.role,
            expiresAt: user.expiresAt,
          }
        : null,
    });
  },
);

// 管理画面からの即時バックアップ実行 (admin のみ)
systemRoutes.post("/backup", requireRole("admin"), (c) => {
  try {
    const result = runBackup();
    return c.json({
      ok: true,
      backupPath: result.backupPath,
      removed: result.removed,
      retained: result.totalRetained,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HTTPException(500, { message: `バックアップ失敗: ${message}` });
  }
});
