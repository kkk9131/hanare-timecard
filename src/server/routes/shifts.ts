import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createShiftRequestSchema,
  createShiftSchema,
  listShiftRequestsQuerySchema,
  listShiftsQuerySchema,
  publishShiftSchema,
  shiftConflictsQuerySchema,
  updateShiftSchema,
} from "../../shared/schemas.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import {
  createShift,
  createShiftRequest,
  deleteShift,
  deleteShiftRequest,
  detectConflicts,
  getShift,
  getShiftRequest,
  listShiftRequests,
  listShifts,
  publishShifts,
  updateShift,
} from "../services/shifts.js";

export const shiftsRoutes = new Hono<{ Variables: HonoVariables }>();
export const shiftRequestsRoutes = new Hono<{ Variables: HonoVariables }>();

// ----- helpers -----

function parseIdParam(raw: string | undefined): number {
  if (raw == null) throw new HTTPException(400, { message: "id is required" });
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HTTPException(400, { message: "id must be a positive integer" });
  }
  return n;
}

// ===== /api/shifts =====

/**
 * GET /api/shifts
 * staff: published のみ + 自分のみ
 * manager+: 全件 (クエリで絞り込み)
 */
shiftsRoutes.get("/", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const parsed = listShiftsQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    status: c.req.query("status"),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const q = { ...parsed.data } as Parameters<typeof listShifts>[0];

  if (user.role === "staff") {
    q.status = "published";
    q.employee_id = user.employeeId;
  }

  const shifts = listShifts(q);
  return c.json({ shifts });
});

/**
 * GET /api/shifts/conflicts
 */
shiftsRoutes.get("/conflicts", requireRole("manager", "admin"), (c) => {
  const parsed = shiftConflictsQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    from: c.req.query("from"),
    to: c.req.query("to"),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const report = detectConflicts(parsed.data.store_id, parsed.data.from, parsed.data.to);
  return c.json(report);
});

/**
 * POST /api/shifts (manager+)
 */
shiftsRoutes.post("/", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const raw = await c.req.json().catch(() => null);
  const parsed = createShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const result = createShift({
    employee_id: parsed.data.employee_id,
    store_id: parsed.data.store_id,
    date: parsed.data.date,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    created_by: user.employeeId,
  });

  if (result.kind === "conflict") {
    return c.json(
      {
        error: "conflict",
        message: "同じ従業員の時間帯が重複しています",
        details: { conflicting: result.conflicting },
      },
      409,
    );
  }
  if (result.kind === "invalid") {
    return c.json({ error: "bad_request", message: result.message }, 400);
  }
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "見つかりません" }, 404);
  }
  return c.json({ shift: result.shift }, 201);
});

/**
 * POST /api/shifts/publish (manager+) - range publish
 */
shiftsRoutes.post("/publish", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const raw = await c.req.json().catch(() => null);
  const parsed = publishShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const result = publishShifts(
    parsed.data.store_id,
    parsed.data.from,
    parsed.data.to,
    user.employeeId,
  );
  return c.json(result);
});

/**
 * PATCH /api/shifts/:id (manager+)
 */
shiftsRoutes.patch("/:id", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const id = parseIdParam(c.req.param("id"));
  const raw = await c.req.json().catch(() => null);
  const parsed = updateShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  const result = updateShift(id, parsed.data, user.employeeId);
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "シフトが見つかりません" }, 404);
  }
  if (result.kind === "conflict") {
    return c.json(
      {
        error: "conflict",
        message: "同じ従業員の時間帯が重複しています",
        details: { conflicting: result.conflicting },
      },
      409,
    );
  }
  if (result.kind === "invalid") {
    return c.json({ error: "bad_request", message: result.message }, 400);
  }
  return c.json({ shift: result.shift });
});

/**
 * DELETE /api/shifts/:id (manager+, draft only)
 */
shiftsRoutes.delete("/:id", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const id = parseIdParam(c.req.param("id"));
  const existing = getShift(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "シフトが見つかりません" }, 404);
  }
  const result = deleteShift(id, user.employeeId);
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "シフトが見つかりません" }, 404);
  }
  if (result.kind === "invalid") {
    return c.json({ error: "conflict", message: result.message }, 409);
  }
  return c.json({ ok: true });
});

// ===== /api/shift-requests =====

/**
 * GET /api/shift-requests (manager+)
 */
shiftRequestsRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const parsed = listShiftRequestsQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const requests = listShiftRequests(parsed.data);
  return c.json({ requests });
});

/**
 * GET /api/shift-requests/me (staff)
 */
shiftRequestsRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = listShiftRequestsQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
  });
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const requests = listShiftRequests({
    ...parsed.data,
    employee_id: user.employeeId,
  });
  return c.json({ requests });
});

/**
 * POST /api/shift-requests (auth)
 */
shiftRequestsRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const raw = await c.req.json().catch(() => null);
  const parsed = createShiftRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "リクエストが不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const created = createShiftRequest({
    employee_id: user.employeeId,
    date: parsed.data.date,
    start_time: parsed.data.start_time ?? null,
    end_time: parsed.data.end_time ?? null,
    preference: parsed.data.preference,
    note: parsed.data.note,
  });
  return c.json({ request: created }, 201);
});

/**
 * DELETE /api/shift-requests/:id (本人 or manager+)
 */
shiftRequestsRoutes.delete("/:id", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const id = parseIdParam(c.req.param("id"));
  const existing = getShiftRequest(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "希望が見つかりません" }, 404);
  }
  const isOwner = existing.employee_id === user.employeeId;
  const isManager = user.role === "manager" || user.role === "admin";
  if (!isOwner && !isManager) {
    return c.json({ error: "forbidden", message: "権限がありません" }, 403);
  }
  deleteShiftRequest(id);
  return c.json({ ok: true });
});
