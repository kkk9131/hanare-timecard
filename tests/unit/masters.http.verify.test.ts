// Integration-style verify for task-4007 done_when (HTTP-level through Hono app.fetch).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-masters-http-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "masters-http.db");

const { db, schema } = await import("../../src/server/db/client.js");
const { createApp } = await import("../../src/server/app.js");

function applyMigrations(): void {
  const sqlPath = resolve("drizzle/0000_init.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of statements) {
    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
    (db as any).$client.exec(stmt);
  }
}
function clear(): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  const sqlite = (db as any).$client;
  sqlite.exec("DELETE FROM audit_logs");
  sqlite.exec("DELETE FROM shift_requests");
  sqlite.exec("DELETE FROM shifts");
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM sessions");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

const app = createApp();

interface Seed {
  storeId: number;
  adminId: number;
  staffId: number;
  adminSid: string;
  staffSid: string;
}

function makeSession(
  employeeId: number,
  role: "staff" | "manager" | "admin",
): string {
  const id = `sid-${role}-${employeeId}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  db.insert(schema.sessions)
    .values({ id, employeeId, role, expiresAt: now + 3600_000, createdAt: now })
    .run();
  return id;
}

function seed(): Seed {
  db.insert(schema.stores)
    .values({
      id: 1,
      code: "jakuan",
      name: "雀庵",
      displayName: "雀庵",
      openingTime: "10:00",
      closingTime: "22:00",
      closedDays: null,
      createdAt: 0,
    })
    .run();
  const pinHash = bcrypt.hashSync("1234", 4);
  const insertEmp = (id: number, role: "admin" | "staff") =>
    db
      .insert(schema.employees)
      .values({
        id,
        name: `E${id}`,
        kana: `E${id}`,
        role,
        loginId: role === "admin" ? `admin${id}` : null,
        passwordHash: role === "admin" ? bcrypt.hashSync("password", 4) : null,
        pinHash,
        hourlyWage: 1000,
        hireDate: "2024-01-01",
        retireDate: null,
        pinFailCount: 0,
        lockUntil: null,
        note: null,
        createdAt: 0,
        updatedAt: 0,
      })
      .run();
  insertEmp(10, "admin");
  insertEmp(11, "staff");
  db.insert(schema.employeeStores)
    .values({ employeeId: 10, storeId: 1, isPrimary: 1 })
    .run();
  db.insert(schema.employeeStores)
    .values({ employeeId: 11, storeId: 1, isPrimary: 1 })
    .run();
  return {
    storeId: 1,
    adminId: 10,
    staffId: 11,
    adminSid: makeSession(10, "admin"),
    staffSid: makeSession(11, "staff"),
  };
}

function req(
  path: string,
  init: RequestInit & { sid?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.sid) headers.set("cookie", `hanare_sid=${init.sid}`);
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  return Promise.resolve(
    app.fetch(new Request(`http://localhost${path}`, { ...init, headers })),
  );
}

beforeAll(() => {
  applyMigrations();
});
beforeEach(() => {
  clear();
});

describe("task-4007 done_when (HTTP)", () => {
  it("admin POST /api/employees creates employee and employee_stores link; audit logged", async () => {
    const s = seed();
    const beforeAudit = db.select().from(schema.auditLogs).all().length;
    const r = await req("/api/employees", {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({
        name: "山田太郎",
        kana: "ヤマダタロウ",
        role: "staff",
        pin: "1234",
        hire_date: "2026-01-01",
        store_ids: [s.storeId],
      }),
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as {
      employee: { id: number; store_ids: number[] };
    };
    expect(body.employee.store_ids).toEqual([s.storeId]);

    // employee_stores row exists
    const links = db
      .select()
      .from(schema.employeeStores)
      .all()
      .filter((l) => l.employeeId === body.employee.id);
    expect(links.length).toBe(1);
    expect(links[0].storeId).toBe(s.storeId);

    // audit log recorded
    const audits = db.select().from(schema.auditLogs).all();
    expect(audits.length).toBe(beforeAudit + 1);
    expect(audits.some((a) => a.action === "employee.create")).toBe(true);
  });

  it("staff POST /api/employees returns 403", async () => {
    const s = seed();
    const r = await req("/api/employees", {
      method: "POST",
      sid: s.staffSid,
      body: JSON.stringify({
        name: "X",
        kana: "X",
        role: "staff",
        pin: "1234",
        hire_date: "2026-01-01",
        store_ids: [s.storeId],
      }),
    });
    expect(r.status).toBe(403);
  });

  it("PATCH /api/employees/:id updates hourly_wage and writes audit", async () => {
    const s = seed();
    // create via API to have a target
    const create = await req("/api/employees", {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({
        name: "A",
        kana: "A",
        role: "staff",
        pin: "1234",
        hire_date: "2026-01-01",
        store_ids: [s.storeId],
      }),
    });
    const { employee } = (await create.json()) as { employee: { id: number } };
    const beforeAudit = db.select().from(schema.auditLogs).all().length;
    const patch = await req(`/api/employees/${employee.id}`, {
      method: "PATCH",
      sid: s.adminSid,
      body: JSON.stringify({ hourly_wage: 1500 }),
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as { employee: { hourly_wage: number } };
    expect(body.employee.hourly_wage).toBe(1500);
    const audits = db.select().from(schema.auditLogs).all();
    expect(audits.length).toBe(beforeAudit + 1);
    expect(audits.some((a) => a.action === "employee.update")).toBe(true);
  });

  it("POST /api/employees/:id/retire sets retire_date and is excluded from default GET", async () => {
    const s = seed();
    const create = await req("/api/employees", {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({
        name: "R",
        kana: "R",
        role: "staff",
        pin: "1234",
        hire_date: "2026-01-01",
        store_ids: [s.storeId],
      }),
    });
    const { employee } = (await create.json()) as { employee: { id: number } };
    const beforeAudit = db.select().from(schema.auditLogs).all().length;

    const retire = await req(`/api/employees/${employee.id}/retire`, {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({ retire_date: "2026-06-30" }),
    });
    expect(retire.status).toBe(200);
    const retireBody = (await retire.json()) as {
      employee: { retire_date: string | null };
    };
    expect(retireBody.employee.retire_date).toBe("2026-06-30");

    // audit recorded
    const audits = db.select().from(schema.auditLogs).all();
    expect(audits.length).toBe(beforeAudit + 1);
    expect(audits.some((a) => a.action === "employee.retire")).toBe(true);

    // default GET should exclude
    const listDefault = await req("/api/employees", { sid: s.adminSid });
    expect(listDefault.status).toBe(200);
    const listDefJson = (await listDefault.json()) as {
      employees: { id: number }[];
    };
    expect(listDefJson.employees.some((e) => e.id === employee.id)).toBe(false);

    // include_retired=true should include
    const listAll = await req("/api/employees?include_retired=true", {
      sid: s.adminSid,
    });
    const listAllJson = (await listAll.json()) as {
      employees: { id: number }[];
    };
    expect(listAllJson.employees.some((e) => e.id === employee.id)).toBe(true);
  });

  it("POST /api/employees/:id/pin updates pin hash", async () => {
    const s = seed();
    const create = await req("/api/employees", {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({
        name: "P",
        kana: "P",
        role: "staff",
        pin: "1234",
        hire_date: "2026-01-01",
        store_ids: [s.storeId],
      }),
    });
    const { employee } = (await create.json()) as { employee: { id: number } };
    const beforeRow = db
      .select()
      .from(schema.employees)
      .all()
      .find((e) => e.id === employee.id);
    expect(beforeRow).toBeTruthy();
    const beforeHash = beforeRow?.pinHash;

    const r = await req(`/api/employees/${employee.id}/pin`, {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({ pin: "5678" }),
    });
    expect(r.status).toBe(200);

    const afterRow = db
      .select()
      .from(schema.employees)
      .all()
      .find((e) => e.id === employee.id);
    expect(afterRow?.pinHash).toBeTruthy();
    expect(afterRow?.pinHash).not.toBe(beforeHash);
    // new pin must verify
    expect(bcrypt.compareSync("5678", afterRow?.pinHash ?? "")).toBe(true);
  });

  it("store CRUD: admin create/patch work, staff create returns 403, audits recorded", async () => {
    const s = seed();

    // staff create -> 403
    const denied = await req("/api/stores", {
      method: "POST",
      sid: s.staffSid,
      body: JSON.stringify({
        code: "honten",
        name: "本店",
        display_name: "本店",
        opening_time: "09:00",
        closing_time: "21:00",
      }),
    });
    expect(denied.status).toBe(403);

    // admin GET list works (seed has 1)
    const list = await req("/api/stores", { sid: s.adminSid });
    expect(list.status).toBe(200);
    const listJson = (await list.json()) as { stores: { id: number }[] };
    expect(listJson.stores.length).toBe(1);

    // admin create
    const beforeAudit = db.select().from(schema.auditLogs).all().length;
    const create = await req("/api/stores", {
      method: "POST",
      sid: s.adminSid,
      body: JSON.stringify({
        code: "honten",
        name: "本店",
        display_name: "本店",
        opening_time: "09:00",
        closing_time: "21:00",
      }),
    });
    expect(create.status).toBe(201);
    const createBody = (await create.json()) as {
      store: { id: number; name: string };
    };
    expect(createBody.store.name).toBe("本店");

    // admin patch
    const patch = await req(`/api/stores/${createBody.store.id}`, {
      method: "PATCH",
      sid: s.adminSid,
      body: JSON.stringify({ display_name: "本店 (改称)" }),
    });
    expect(patch.status).toBe(200);
    const patchBody = (await patch.json()) as {
      store: { display_name: string };
    };
    expect(patchBody.store.display_name).toBe("本店 (改称)");

    // audits recorded (create + update)
    const audits = db.select().from(schema.auditLogs).all();
    expect(audits.length).toBe(beforeAudit + 2);
    expect(audits.some((a) => a.action === "store.create")).toBe(true);
    expect(audits.some((a) => a.action === "store.update")).toBe(true);
  });
});
