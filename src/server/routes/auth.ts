import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { adminGateSchema, adminLoginSchema, kioskLoginSchema } from "../../shared/schemas.js";
import { requireAuth } from "../middleware/auth.js";
import {
  createSession,
  destroySession,
  grantAdminGate,
  type HonoVariables,
  readAdminGate,
} from "../middleware/session.js";
import {
  getEmployeeProfile,
  listPublicEmployees,
  startKioskSession,
  verifyAdminGatePin,
  verifyAdminLogin,
} from "../services/auth.js";

export const authRoutes = new Hono<{ Variables: HonoVariables }>();

/**
 * GET /api/auth/employees
 * Public kiosk endpoint: list active employees grouped per store.
 * Optional `?store_id=` filter.
 */
authRoutes.get("/employees", (c) => {
  const storeIdParam = c.req.query("store_id");
  let filterStoreId: number | undefined;
  if (storeIdParam != null) {
    const n = Number.parseInt(storeIdParam, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new HTTPException(400, {
        message: "store_id must be a positive integer",
      });
    }
    filterStoreId = n;
  }
  const employees = listPublicEmployees(filterStoreId);
  return c.json({ employees });
});

/**
 * POST /api/auth/kiosk-login
 * Body: { employee_id }
 */
authRoutes.post("/kiosk-login", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = kioskLoginSchema.safeParse(raw);
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

  const result = startKioskSession(parsed.data.employee_id);

  if (result.kind === "not_found") {
    return c.json(
      {
        error: "employee_not_found",
        message: "従業員が見つかりません",
      },
      404,
    );
  }

  const session = createSession(c, result.employee.id, result.employee.role);
  return c.json({
    employee: result.employee,
    session_expires_at: session.expiresAt,
  });
});

/**
 * POST /api/auth/admin-login
 * Body: { login_id, password }
 */
authRoutes.post("/admin-login", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = adminLoginSchema.safeParse(raw);
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

  const result = verifyAdminLogin(parsed.data.login_id, parsed.data.password);

  if (result.kind === "locked") {
    return c.json(
      {
        error: "locked",
        message: "5 回連続で誤入力されたため、5 分間ロックされています",
        lock_until: result.lock_until,
      },
      423,
    );
  }
  if (result.kind === "invalid") {
    return c.json(
      {
        error: "invalid_credentials",
        message: "ログイン ID またはパスワードが違います",
      },
      401,
    );
  }

  const session = createSession(c, result.employee.id, result.employee.role);
  return c.json({
    employee: result.employee,
    session_expires_at: session.expiresAt,
  });
});

/**
 * GET /api/auth/admin-gate-status
 * Short-lived cookie status used to allow entry to the admin login screen.
 */
authRoutes.get("/admin-gate-status", (c) => {
  const gateExpiresAt = readAdminGate(c);
  const user = c.get("user");
  const sessionAllowsAdminLogin = user?.role === "manager" || user?.role === "admin";

  if (sessionAllowsAdminLogin) {
    return c.json({
      allowed: true,
      expires_at: user.expiresAt,
    });
  }

  return c.json({
    allowed: gateExpiresAt != null,
    expires_at: gateExpiresAt,
  });
});

/**
 * POST /api/auth/admin-gate
 * Body: { pin }
 */
authRoutes.post("/admin-gate", async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = adminGateSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "PIN は 4〜6 桁の数字でご入力ください",
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  if (!verifyAdminGatePin(parsed.data.pin)) {
    return c.json(
      {
        error: "invalid_pin",
        message: "PIN が違います。もう一度ご確認ください。",
      },
      401,
    );
  }

  const expiresAt = grantAdminGate(c);
  return c.json({
    ok: true,
    expires_at: expiresAt,
  });
});

/**
 * POST /api/auth/logout
 */
authRoutes.post("/logout", requireAuth, (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

/**
 * GET /api/auth/me
 */
authRoutes.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, { message: "認証が必要です" });
  }
  const profile = getEmployeeProfile(user.employeeId);
  if (!profile) {
    throw new HTTPException(401, { message: "認証が必要です" });
  }
  return c.json({
    employee: profile,
    session_expires_at: user.expiresAt,
  });
});
