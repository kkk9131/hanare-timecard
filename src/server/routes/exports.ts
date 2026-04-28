/**
 * GET /api/exports/period.csv  ?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=
 * GET /api/exports/period.xlsx ?from=YYYY-MM-DD&to=YYYY-MM-DD&store_id=
 *
 * 別名 (api-spec.md 互換):
 *  GET /api/exports/csv
 *  GET /api/exports/xlsx
 *
 * admin 限定。
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { exportQuerySchema } from "../../shared/schemas.js";
import { requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import { buildExportBasename, buildPeriodSummary, toCsv, toXlsx } from "../services/exports.js";

type Ctx = Context<{ Variables: HonoVariables }>;

export const exportsRoutes = new Hono<{ Variables: HonoVariables }>();

function parseQuery(c: Ctx) {
  return exportQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    store_id: c.req.query("store_id"),
  });
}

/**
 * RFC 5987 / RFC 6266 形式で日本語ファイル名を Content-Disposition に乗せる。
 * ASCII 7bit fallback + UTF-8 percent-encoded 版を併記する。
 */
function contentDisposition(basename: string, ext: "csv" | "xlsx"): string {
  const fullname = `${basename}.${ext}`;
  // 7bit fallback: 非 ASCII を '_' に。ASCII printable 範囲のみ残す
  const ascii = fullname.replace(/[^ -~]/g, "_");
  const encoded = encodeURIComponent(fullname);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function handleCsv(c: Ctx) {
  const parsed = parseQuery(c);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "クエリが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const rows = buildPeriodSummary(parsed.data);
  const csv = toCsv(rows);
  const basename = buildExportBasename(parsed.data);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header("Content-Disposition", contentDisposition(basename, "csv"));
  return c.body(csv);
}

async function handleXlsx(c: Ctx) {
  const parsed = parseQuery(c);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "クエリが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const rows = buildPeriodSummary(parsed.data);
  const buf = await toXlsx(rows);
  const basename = buildExportBasename(parsed.data);
  c.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  c.header("Content-Disposition", contentDisposition(basename, "xlsx"));
  // Hono は ArrayBuffer/Uint8Array を body に取れる
  return c.body(new Uint8Array(buf));
}

exportsRoutes.get("/period.csv", requireRole("admin"), handleCsv);
exportsRoutes.get("/period.xlsx", requireRole("admin"), handleXlsx);
// api-spec.md 互換エイリアス
exportsRoutes.get("/csv", requireRole("admin"), handleCsv);
exportsRoutes.get("/xlsx", requireRole("admin"), handleXlsx);
