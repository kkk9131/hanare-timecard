import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import { listAuditQuerySchema } from "../../shared/schemas.js";
import { db, schema } from "../db/client.js";
import { requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";

export const auditRoutes = new Hono<{ Variables: HonoVariables }>();

function dateToMs(date: string): number {
  const [y, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}

/**
 * GET /api/audit?from=&to=&actor_id=&action=&limit=&offset=
 * admin only.
 */
auditRoutes.get("/", requireRole("admin"), (c) => {
  const parsed = listAuditQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    actor_id: c.req.query("actor_id"),
    action: c.req.query("action"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
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

  const conds = [] as Array<ReturnType<typeof eq>>;
  if (parsed.data.from != null)
    conds.push(gte(schema.auditLogs.occurredAt, dateToMs(parsed.data.from)));
  if (parsed.data.to != null)
    conds.push(lte(schema.auditLogs.occurredAt, dateToMs(parsed.data.to) + 24 * 60 * 60 * 1000));
  if (parsed.data.actor_id != null) conds.push(eq(schema.auditLogs.actorId, parsed.data.actor_id));
  if (parsed.data.action != null) conds.push(eq(schema.auditLogs.action, parsed.data.action));

  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);

  const limit = parsed.data.limit ?? 100;
  const offset = parsed.data.offset ?? 0;

  const rows = db
    .select()
    .from(schema.auditLogs)
    .where(where)
    .orderBy(desc(schema.auditLogs.occurredAt))
    .limit(limit)
    .offset(offset)
    .all();

  const logs = rows.map((r) => ({
    id: r.id,
    actor_id: r.actorId,
    action: r.action,
    entity_type: r.entityType,
    entity_id: r.entityId,
    before_json: r.beforeJson,
    after_json: r.afterJson,
    occurred_at: r.occurredAt,
  }));

  return c.json({ logs, limit, offset });
});
