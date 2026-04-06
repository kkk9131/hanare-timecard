import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createPunchSchema,
  listPunchesQuerySchema,
  myPunchesQuerySchema,
} from "../../shared/schemas.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import {
  createPunch,
  getCurrentState,
  listMyPunches,
  listPunches,
  summarizeCurrentMonth,
} from "../services/punches.js";

export const punchesRoutes = new Hono<{ Variables: HonoVariables }>();

/**
 * POST /api/punches
 * Body: { punch_type, store_id, note? }
 * 状態遷移を検証して打刻を 1 件挿入する。
 */
punchesRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const raw = await c.req.json().catch(() => null);
  const parsed = createPunchSchema.safeParse(raw);
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

  const result = createPunch({
    employee_id: user.employeeId,
    store_id: parsed.data.store_id,
    punch_type: parsed.data.punch_type,
    note: parsed.data.note,
    source: "kiosk",
  });

  if (result.kind === "invalid_transition") {
    return c.json(
      {
        error: "invalid_transition",
        message: "現在の状態ではこの打刻はできません",
        current_state: result.current_state,
      },
      409,
    );
  }

  return c.json({
    punch: result.punch,
    message: result.message,
    next_state: result.next_state,
  });
});

/**
 * GET /api/punches/me?from=&to=
 */
punchesRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const parsed = myPunchesQuerySchema.safeParse({
    from: c.req.query("from"),
    to: c.req.query("to"),
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

  const punches = listMyPunches(user.employeeId, parsed.data.from, parsed.data.to);
  return c.json({ punches });
});

/**
 * GET /api/punches/me/summary
 * 当月集計 {worked, overtime, break, night} (分)
 */
punchesRoutes.get("/me/summary", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const summary = summarizeCurrentMonth(user.employeeId);
  return c.json(summary);
});

/**
 * GET /api/punches/me/state
 * 現在の打刻状態と直近打刻
 */
punchesRoutes.get("/me/state", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const state = getCurrentState(user.employeeId);
  return c.json(state);
});

/**
 * GET /api/punches?store_id=&employee_id=&from=&to=
 * manager+ 全打刻
 */
punchesRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const parsed = listPunchesQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    employee_id: c.req.query("employee_id"),
    from: c.req.query("from"),
    to: c.req.query("to"),
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

  const fromMs = parsed.data.from ? dateToMs(parsed.data.from) : undefined;
  const toMs = parsed.data.to ? dateToMs(parsed.data.to) + 24 * 60 * 60 * 1000 : undefined;

  const punches = listPunches({
    employee_id: parsed.data.employee_id,
    store_id: parsed.data.store_id,
    from: fromMs,
    to: toMs,
  });
  return c.json({ punches });
});

function dateToMs(date: string): number {
  const [y, m, d] = date.split("-").map((x) => Number.parseInt(x, 10));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime();
}
