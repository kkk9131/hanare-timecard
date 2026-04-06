import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { type HonoVariables, sessionMiddleware } from "./middleware/session.js";
import { auditRoutes } from "./routes/audit.js";
import { authRoutes } from "./routes/auth.js";
import { correctionsRoutes } from "./routes/corrections.js";
import { employeesRoutes } from "./routes/employees.js";
import { exportsRoutes } from "./routes/exports.js";
import { punchesRoutes } from "./routes/punches.js";
import { shiftRequestsRoutes, shiftsRoutes } from "./routes/shifts.js";
import { storesRoutes } from "./routes/stores.js";
import { systemRoutes } from "./routes/system.js";

export function createApp(): Hono<{ Variables: HonoVariables }> {
  const app = new Hono<{ Variables: HonoVariables }>();

  app.use("*", logger());
  app.use(
    "*",
    cors({
      // LAN 想定: Vite dev server (5173) と同一オリジン (3000) からのアクセスを許可
      origin: (origin) => origin ?? "*",
      credentials: true,
    }),
  );
  app.use("*", sessionMiddleware);

  // API 配下はサブアプリで集約。後続チケットでルートをここに追加する。
  const api = new Hono<{ Variables: HonoVariables }>();
  api.route("/auth", authRoutes);
  api.route("/stores", storesRoutes);
  api.route("/employees", employeesRoutes);
  api.route("/punches", punchesRoutes);
  api.route("/shifts", shiftsRoutes);
  api.route("/shift-requests", shiftRequestsRoutes);
  api.route("/corrections", correctionsRoutes);
  api.route("/audit", auditRoutes);
  api.route("/exports", exportsRoutes);
  api.route("/system", systemRoutes);
  // Backwards-compatible simple health path (task-4001 動作確認用)
  api.get("/health", (c) => c.json({ ok: true, status: "ok", time: Date.now() }));

  app.route("/api", api);

  // 本番: dist/client を静的配信 (dev は Vite が担当)
  if (process.env.NODE_ENV === "production") {
    app.use(
      "/*",
      serveStatic({
        root: "./dist/client",
        // SPA フォールバック: 拡張子を持たない未知のパスは index.html を返す
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, max-age=3600");
        },
      }),
    );
    app.get("*", serveStatic({ path: "./dist/client/index.html" }));
  }

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
