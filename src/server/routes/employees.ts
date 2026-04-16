import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  createEmployeeSchema,
  listEmployeesQuerySchema,
  retireEmployeeSchema,
  updateEmployeeSchema,
} from "../../shared/schemas.js";
import { requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import {
  createEmployee,
  EmployeeServiceError,
  getEmployee,
  listEmployees,
  retireEmployee,
  updateEmployee,
} from "../services/employees.js";

export const employeesRoutes = new Hono<{ Variables: HonoVariables }>();

function handleServiceError(e: unknown) {
  if (e instanceof EmployeeServiceError) {
    return { body: { error: e.code, message: e.message }, status: e.status };
  }
  return null;
}

/** GET /api/employees?store_id&include_retired&search  (manager+) */
employeesRoutes.get("/", requireRole("manager", "admin"), (c) => {
  const parsed = listEmployeesQuerySchema.safeParse({
    store_id: c.req.query("store_id"),
    include_retired: c.req.query("include_retired"),
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
  const search = c.req.query("search");
  const employees = listEmployees({
    store_id: parsed.data.store_id,
    include_retired: parsed.data.include_retired,
    search,
  });
  return c.json({ employees });
});

/** GET /api/employees/:id  (manager+) */
employeesRoutes.get("/:id", requireRole("manager", "admin"), (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: "bad_request", message: "id が不正です" }, 400);
  }
  const emp = getEmployee(id);
  if (!emp) return c.json({ error: "not_found", message: "従業員が見つかりません" }, 404);
  return c.json({ employee: emp });
});

/** POST /api/employees  (admin) */
employeesRoutes.post("/", requireRole("admin"), async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createEmployeeSchema.safeParse(raw);
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
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  try {
    const emp = createEmployee(parsed.data, user.employeeId);
    return c.json({ employee: emp }, 201);
  } catch (e) {
    const handled = handleServiceError(e);
    if (handled) return c.json(handled.body, handled.status as 400 | 404 | 409 | 422);
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: "conflict", message: "login_id は既に使用されています" }, 409);
    }
    throw e;
  }
});

/** PATCH /api/employees/:id  (admin) */
employeesRoutes.patch("/:id", requireRole("admin"), async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: "bad_request", message: "id が不正です" }, 400);
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = updateEmployeeSchema.safeParse(raw);
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
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  try {
    const emp = updateEmployee(id, parsed.data, user.employeeId);
    if (!emp) return c.json({ error: "not_found", message: "従業員が見つかりません" }, 404);
    return c.json({ employee: emp });
  } catch (e) {
    const handled = handleServiceError(e);
    if (handled) return c.json(handled.body, handled.status as 400 | 404 | 409 | 422);
    throw e;
  }
});

/** POST /api/employees/:id/retire  (admin) */
employeesRoutes.post("/:id/retire", requireRole("admin"), async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: "bad_request", message: "id が不正です" }, 400);
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = retireEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "bad_request",
        message: "retire_date が不正です",
        details: parsed.error.flatten(),
      },
      400,
    );
  }
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  const emp = retireEmployee(id, parsed.data.retire_date, user.employeeId);
  if (!emp) return c.json({ error: "not_found", message: "従業員が見つかりません" }, 404);
  return c.json({ employee: emp });
});
