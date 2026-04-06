// Integration-style verify for task-4004 done_when (HTTP-level through Hono app.fetch).
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-shifts-http-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "shifts-http.db");

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
  managerId: number;
  staffId: number;
  managerSid: string;
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
  const insertEmp = (id: number, role: "manager" | "staff") =>
    db
      .insert(schema.employees)
      .values({
        id,
        name: `E${id}`,
        kana: `E${id}`,
        role,
        loginId: null,
        passwordHash: null,
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
  insertEmp(10, "manager");
  insertEmp(11, "staff");
  return {
    storeId: 1,
    managerId: 10,
    staffId: 11,
    managerSid: makeSession(10, "manager"),
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

describe("task-4004 done_when (HTTP)", () => {
  it("staff sees only published; manager sees draft+published", async () => {
    const s = seed();
    // create two shifts: one draft, one published
    const rDraft = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffId,
        store_id: s.storeId,
        date: "2026-05-10",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(rDraft.status).toBe(201);

    const rPub = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffId,
        store_id: s.storeId,
        date: "2026-05-11",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(rPub.status).toBe(201);

    // publish the 2nd shift via range publish
    const pub = await req("/api/shifts/publish", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        store_id: s.storeId,
        from: "2026-05-11",
        to: "2026-05-11",
      }),
    });
    expect(pub.status).toBe(200);

    const mgrList = await req("/api/shifts", { sid: s.managerSid });
    expect(mgrList.status).toBe(200);
    const mgrJson = (await mgrList.json()) as { shifts: { status: string }[] };
    const mgrStatuses = mgrJson.shifts.map((x) => x.status).sort();
    expect(mgrStatuses).toEqual(["draft", "published"]);

    const staffList = await req("/api/shifts", { sid: s.staffSid });
    expect(staffList.status).toBe(200);
    const staffJson = (await staffList.json()) as {
      shifts: { status: string }[];
    };
    expect(staffJson.shifts.every((x) => x.status === "published")).toBe(true);
    expect(staffJson.shifts.length).toBe(1);
  });

  it("overlapping POST returns 409", async () => {
    const s = seed();
    const a = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffId,
        store_id: s.storeId,
        date: "2026-05-10",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(a.status).toBe(201);
    const b = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffId,
        store_id: s.storeId,
        date: "2026-05-10",
        start_time: "12:00",
        end_time: "16:00",
      }),
    });
    expect(b.status).toBe(409);
  });

  it("publish endpoint flips draft -> published in range and audits", async () => {
    const s = seed();
    await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffId,
        store_id: s.storeId,
        date: "2026-05-12",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    const before = db.select().from(schema.auditLogs).all().length;
    const r = await req("/api/shifts/publish", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        store_id: s.storeId,
        from: "2026-05-12",
        to: "2026-05-12",
      }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { published: number };
    expect(body.published).toBe(1);
    const after = db.select().from(schema.auditLogs).all();
    expect(after.length).toBe(before + 1);
    expect(after.some((x) => x.action === "shift.publish")).toBe(true);
  });

  it("shift-requests POST/GET/DELETE works", async () => {
    const s = seed();
    const create = await req("/api/shift-requests", {
      method: "POST",
      sid: s.staffSid,
      body: JSON.stringify({
        date: "2026-05-20",
        start_time: "10:00",
        end_time: "14:00",
        preference: "preferred",
        note: "x",
      }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { request: { id: number } };

    const me = await req("/api/shift-requests/me", { sid: s.staffSid });
    expect(me.status).toBe(200);
    const meJson = (await me.json()) as { requests: { id: number }[] };
    expect(meJson.requests.some((r) => r.id === created.request.id)).toBe(true);

    const del = await req(`/api/shift-requests/${created.request.id}`, {
      method: "DELETE",
      sid: s.staffSid,
    });
    expect(del.status).toBe(200);

    const me2 = await req("/api/shift-requests/me", { sid: s.staffSid });
    const me2Json = (await me2.json()) as { requests: unknown[] };
    expect(me2Json.requests.length).toBe(0);
  });
});
