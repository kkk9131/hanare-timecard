import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  approveCorrectionSchema,
  createCorrectionSchema,
  listCorrectionsQuerySchema,
  rejectCorrectionSchema,
} from "../../shared/schemas.js";
import {
  assertCanAccessStore,
  requireAuth,
  requireRole,
  scopeStoreQuery,
} from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import {
  approveCorrection,
  type CorrectionRow,
  createCorrection,
  getCorrection,
  listCorrections,
  rejectCorrection,
} from "../services/corrections.js";

export const correctionsRoutes = new Hono<{ Variables: HonoVariables }>();

function parseIdParam(raw: string | undefined): number {
  if (raw == null) throw new HTTPException(400, { message: "id is required" });
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new HTTPException(400, { message: "id must be a positive integer" });
  }
  return n;
}

function assertCanApproveCorrection(
  user: NonNullable<HonoVariables["user"]>,
  correction: CorrectionRow,
): void {
  if (user.role === "admin") return;
  assertCanAccessStore(user, correction.store_id);
}

/**
 * GET /api/corrections/me
 * 自分の申請一覧
 */
correctionsRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const corrections = listCorrections({ employee_id: user.employeeId });
  return c.json({ corrections });
});

/**
 * GET /api/corrections?status=&store_id=
 * manager+ 一覧
 */
correctionsRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });
  const parsed = listCorrectionsQuerySchema.safeParse({
    status: c.req.query("status"),
    store_id: c.req.query("store_id"),
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
  const storeScope = scopeStoreQuery(user, parsed.data.store_id);
  const corrections = listCorrections({
    status: parsed.data.status,
    ...storeScope,
  });
  return c.json({ corrections });
});

/**
 * POST /api/corrections
 * staff: 申請作成
 */
correctionsRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const raw = await c.req.json().catch(() => null);
  const parsed = createCorrectionSchema.safeParse(raw);
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

  const result = createCorrection({
    employee_id: user.employeeId,
    store_id: parsed.data.store_id ?? null,
    target_punch_id: parsed.data.target_punch_id ?? null,
    target_date: parsed.data.target_date,
    requested_value: parsed.data.requested_value ?? null,
    requested_type: parsed.data.requested_type ?? null,
    reason: parsed.data.reason,
  });

  if (result.kind === "forbidden") {
    return c.json(
      {
        error: "forbidden",
        message:
          result.reason === "not_owner"
            ? "他人の打刻に対する申請はできません"
            : "所属していない店舗への申請はできません",
      },
      403,
    );
  }
  if (result.kind === "invalid_store") {
    return c.json(
      {
        error: "invalid_store",
        message:
          result.reason === "store_required"
            ? "申請対象の店舗を指定してください"
            : "指定された店舗と対象打刻の店舗が一致しません",
      },
      400,
    );
  }
  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "対象の打刻が見つかりません" }, 404);
  }
  return c.json({ correction: result.correction }, 201);
});

/**
 * POST /api/corrections/:id/approve
 * manager+: 承認
 */
correctionsRoutes.post("/:id/approve", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const id = parseIdParam(c.req.param("id"));
  const existing = getCorrection(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "申請が見つかりません" }, 404);
  }
  assertCanApproveCorrection(user, existing);
  const raw = (await c.req.json().catch(() => ({}))) ?? {};
  const parsed = approveCorrectionSchema.safeParse(raw);
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

  const result = approveCorrection({
    correction_id: id,
    reviewer_id: user.employeeId,
    comment: parsed.data.review_comment,
  });

  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "申請が見つかりません" }, 404);
  }
  if (result.kind === "invalid_state") {
    return c.json(
      {
        error: "invalid_state",
        message: "保留中の申請のみ承認できます",
        current_state: result.current,
      },
      409,
    );
  }
  if (result.kind === "missing_value") {
    return c.json(
      {
        error: "missing_value",
        message: "承認に必要な値が不足しています",
      },
      422,
    );
  }
  return c.json({ correction: result.correction });
});

/**
 * POST /api/corrections/:id/reject
 * manager+: 却下（review_comment 必須）
 */
correctionsRoutes.post("/:id/reject", requireRole("manager", "admin"), async (c) => {
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const id = parseIdParam(c.req.param("id"));
  const existing = getCorrection(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "申請が見つかりません" }, 404);
  }
  assertCanApproveCorrection(user, existing);
  const raw = await c.req.json().catch(() => null);
  const parsed = rejectCorrectionSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "unprocessable_entity",
        message: "却下理由は必須です",
        details: parsed.error.flatten(),
      },
      422,
    );
  }

  const result = rejectCorrection({
    correction_id: id,
    reviewer_id: user.employeeId,
    comment: parsed.data.review_comment,
  });

  if (result.kind === "not_found") {
    return c.json({ error: "not_found", message: "申請が見つかりません" }, 404);
  }
  if (result.kind === "invalid_state") {
    return c.json(
      {
        error: "invalid_state",
        message: "保留中の申請のみ却下できます",
        current_state: result.current,
      },
      409,
    );
  }
  return c.json({ correction: result.correction });
});
