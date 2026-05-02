import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createShiftPeriodSchema,
  createShiftRequestSchema,
  createShiftSchema,
  listShiftMonthlySettingsQuerySchema,
  listShiftPeriodsQuerySchema,
  listShiftRequestsQuerySchema,
  listShiftsQuerySchema,
  publishShiftSchema,
  shiftConflictsQuerySchema,
  shiftPeriodIdParamSchema,
  updateShiftPeriodSchema,
  updateShiftSchema,
  upsertShiftMonthlySettingsSchema,
} from "../../shared/schemas.js";
import {
  assertCanAccessEmployee,
  assertCanAccessStore,
  requireAuth,
  requireRole,
  scopeStoreQuery,
} from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import {
  autoDraftShiftsFromPeriod,
  createShift,
  createShiftPeriod,
  createShiftRequest,
  deleteShift,
  deleteShiftRequest,
  detectConflicts,
  getShift,
  getShiftPeriod,
  getShiftPeriodSummary,
  getShiftRequest,
  listOpenShiftPeriodsForEmployee,
  listShiftMonthlySettings,
  listShiftPeriods,
  listShiftRequests,
  listShifts,
  publishShifts,
  todayYmd,
  updateShift,
  updateShiftPeriodStatus,
  upsertShiftMonthlySettings,
} from "../services/shifts.js";

export const shiftsRoutes = new Hono<{ Variables: HonoVariables }>();
export const shiftRequestsRoutes = new Hono<{ Variables: HonoVariables }>();
export const shiftPeriodsRoutes = new Hono<{ Variables: HonoVariables }>();
export const shiftSettingsRoutes = new Hono<{ Variables: HonoVariables }>();

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
  } else {
    Object.assign(q, scopeStoreQuery(user, parsed.data.store_id));
  }

  const shifts = listShifts(q);
  return c.json({ shifts });
});

/**
 * GET /api/shifts/conflicts
 */
shiftsRoutes.get("/conflicts", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
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
  assertCanAccessStore(user, parsed.data.store_id);
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

  assertCanAccessStore(user, parsed.data.store_id);
  assertCanAccessEmployee(user, parsed.data.employee_id);

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
  assertCanAccessStore(user, parsed.data.store_id);
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

  const existing = getShift(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "シフトが見つかりません" }, 404);
  }
  assertCanAccessStore(user, existing.store_id);
  if (parsed.data.store_id != null) assertCanAccessStore(user, parsed.data.store_id);
  if (parsed.data.employee_id != null) assertCanAccessEmployee(user, parsed.data.employee_id);
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
  assertCanAccessStore(user, existing.store_id);
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

// ===== /api/shift-periods =====

// ===== /api/shift-settings =====

shiftSettingsRoutes.get("/monthly", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = listShiftMonthlySettingsQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
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
  assertCanAccessStore(user, parsed.data.store_id);
  const settings = listShiftMonthlySettings(parsed.data.store_id);
  return c.json({ settings });
});

shiftSettingsRoutes.put("/monthly", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const raw = await c.req.json().catch(() => null);
  const parsed = upsertShiftMonthlySettingsSchema.safeParse(raw);
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
  assertCanAccessStore(user, parsed.data.store_id);
  const result = upsertShiftMonthlySettings(
    parsed.data.store_id,
    parsed.data.settings,
    user.employeeId,
  );
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "店舗が見つかりません" }, 404);
  }
  if (result.kind === "invalid") {
    return c.json({ error: "bad_request", message: result.message }, 400);
  }
  if (result.kind === "conflict") {
    return c.json({ error: "conflict", message: "設定が重複しています" }, 409);
  }
  return c.json({ settings: result.settings });
});

shiftPeriodsRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = listShiftPeriodsQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    open_only: c.req.query("open_only"),
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
  const storeScope = scopeStoreQuery(user, parsed.data.store_id);
  const periods = listShiftPeriods({
    ...parsed.data,
    store_ids: storeScope.store_id != null ? [storeScope.store_id] : storeScope.store_ids,
  });
  return c.json({ periods });
});

shiftPeriodsRoutes.get("/public-open", (c) => {
  const parsed = listShiftPeriodsQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    open_only: "true",
  });
  if (!parsed.success || parsed.data.store_id == null) {
    return c.json({ error: "bad_request", message: "store_idが必要です" }, 400);
  }
  const today = todayYmd();
  const periods = listShiftPeriods({ store_id: parsed.data.store_id, open_only: true }).filter(
    (p) => p.submission_from <= today && today <= p.submission_to,
  );
  return c.json({ periods });
});

shiftPeriodsRoutes.get("/open", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const today = todayYmd();
  const periods = listOpenShiftPeriodsForEmployee(user.employeeId, today);
  return c.json({ periods });
});

shiftPeriodsRoutes.post("/", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const raw = await c.req.json().catch(() => null);
  const parsed = createShiftPeriodSchema.safeParse(raw);
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
  assertCanAccessStore(user, parsed.data.store_id);
  const result = createShiftPeriod({ ...parsed.data, created_by: user.employeeId });
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "店舗が見つかりません" }, 404);
  }
  if (result.kind === "invalid") {
    return c.json({ error: "bad_request", message: result.message }, 400);
  }
  if (result.kind === "conflict") {
    return c.json({ error: "conflict", message: "募集期間が重複しています" }, 409);
  }
  return c.json({ period: result.period, slots: result.slots }, 201);
});

shiftPeriodsRoutes.get("/:id/summary", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = shiftPeriodIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return c.json({ error: "bad_request", message: "idが不正です" }, 400);
  const period = getShiftPeriod(parsed.data.id);
  if (!period) return c.json({ error: "not_found", message: "募集期間が見つかりません" }, 404);
  assertCanAccessStore(user, period.store_id);
  const summary = getShiftPeriodSummary(period.id);
  return c.json(summary);
});

shiftPeriodsRoutes.post("/:id/auto-draft", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = shiftPeriodIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return c.json({ error: "bad_request", message: "idが不正です" }, 400);
  const period = getShiftPeriod(parsed.data.id);
  if (!period) return c.json({ error: "not_found", message: "募集期間が見つかりません" }, 404);
  assertCanAccessStore(user, period.store_id);
  const result = autoDraftShiftsFromPeriod(period.id, user.employeeId);
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "募集期間が見つかりません" }, 404);
  }
  if (result.kind === "invalid") {
    return c.json({ error: "bad_request", message: result.message }, 400);
  }
  return c.json(result);
});

shiftPeriodsRoutes.patch("/:id", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const idParsed = shiftPeriodIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!idParsed.success) return c.json({ error: "bad_request", message: "idが不正です" }, 400);
  const period = getShiftPeriod(idParsed.data.id);
  if (!period) return c.json({ error: "not_found", message: "募集期間が見つかりません" }, 404);
  assertCanAccessStore(user, period.store_id);
  const raw = await c.req.json().catch(() => null);
  const parsed = updateShiftPeriodSchema.safeParse(raw);
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
  const result = updateShiftPeriodStatus(period.id, parsed.data.status, user.employeeId);
  if (result.kind !== "ok") {
    return c.json({ error: "not_found", message: "募集期間が見つかりません" }, 404);
  }
  return c.json({ period: result.period });
});

/**
 * GET /api/shift-requests (manager+)
 */
shiftRequestsRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = listShiftRequestsQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
    period_id: c.req.query("period_id"),
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
  const storeScope = scopeStoreQuery(user);
  const requests = listShiftRequests({
    ...parsed.data,
    store_ids: storeScope.store_id != null ? [storeScope.store_id] : storeScope.store_ids,
  });
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
    period_id: c.req.query("period_id"),
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
    period_id: parsed.data.period_id ?? null,
    store_id: parsed.data.store_id ?? null,
    date: parsed.data.date,
    start_time: parsed.data.start_time ?? null,
    end_time: parsed.data.end_time ?? null,
    preference: parsed.data.preference,
    note: parsed.data.note,
  });
  if ("kind" in created) {
    if (created.kind === "invalid") {
      return c.json({ error: "bad_request", message: created.message }, 400);
    }
    if (created.kind === "not_found") {
      return c.json({ error: "not_found", message: "見つかりません" }, 404);
    }
    if (created.kind === "conflict") {
      return c.json({ error: "conflict", message: "希望が重複しています" }, 409);
    }
  }
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
  if (!isOwner && isManager) {
    assertCanAccessEmployee(user, existing.employee_id);
  }
  deleteShiftRequest(id);
  return c.json({ ok: true });
});
