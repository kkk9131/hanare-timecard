import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createStoreSchema, updateStoreSchema } from "../../shared/schemas.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import type { HonoVariables } from "../middleware/session.js";
import { createStore, getStore, listStores, updateStore } from "../services/stores.js";

export const storesRoutes = new Hono<{ Variables: HonoVariables }>();

/** GET /api/stores  (any authenticated user) */
storesRoutes.get("/", requireAuth, (c) => {
  const stores = listStores();
  return c.json({ stores });
});

/** POST /api/stores  (admin) */
storesRoutes.post("/", requireRole("admin"), async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createStoreSchema.safeParse(raw);
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
    const store = createStore(parsed.data, user.employeeId);
    return c.json({ store }, 201);
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: "conflict", message: "code は既に使用されています" }, 409);
    }
    throw e;
  }
});

/** PATCH /api/stores/:id  (admin) */
storesRoutes.patch("/:id", requireRole("admin"), async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return c.json({ error: "bad_request", message: "id が不正です" }, 400);
  }
  const raw = await c.req.json().catch(() => null);
  const parsed = updateStoreSchema.safeParse(raw);
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
  const existing = getStore(id);
  if (!existing) {
    return c.json({ error: "not_found", message: "店舗が見つかりません" }, 404);
  }
  const user = c.get("user");
  if (!user) throw new HTTPException(401, { message: "認証が必要です" });

  try {
    const store = updateStore(id, parsed.data, user.employeeId);
    return c.json({ store });
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE")) {
      return c.json({ error: "conflict", message: "code は既に使用されています" }, 409);
    }
    throw e;
  }
});
