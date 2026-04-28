import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-permission-scope-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "permission-scope.db");

const { db, schema } = await import("../../src/server/db/client.js");
const { createApp } = await import("../../src/server/app.js");

const app = createApp();

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
  sqlite.exec("DELETE FROM correction_requests");
  sqlite.exec("DELETE FROM shift_requests");
  sqlite.exec("DELETE FROM shifts");
  sqlite.exec("DELETE FROM work_days");
  sqlite.exec("DELETE FROM time_punches");
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM sessions");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

function makeSession(employeeId: number, role: "staff" | "manager" | "admin"): string {
  const id = `sid-${role}-${employeeId}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  db.insert(schema.sessions)
    .values({ id, employeeId, role, expiresAt: now + 3600_000, createdAt: now })
    .run();
  return id;
}

function seed() {
  const now = Date.now();
  db.insert(schema.stores)
    .values([
      {
        id: 1,
        code: "suzumean",
        name: "雀庵",
        displayName: "雀庵",
        openingTime: "10:00",
        closingTime: "22:00",
        closedDays: null,
        createdAt: now,
      },
      {
        id: 2,
        code: "hanare",
        name: "雀庵 離れ",
        displayName: "雀庵 離れ",
        openingTime: "10:00",
        closingTime: "22:00",
        closedDays: null,
        createdAt: now,
      },
    ])
    .run();

  const pinHash = bcrypt.hashSync("1234", 4);
  const employees = [
    { id: 1, name: "全店管理者", kana: "ゼンテンカンリシャ", role: "admin", storeId: 1 },
    { id: 10, name: "雀庵 店長", kana: "スズメアンテンチョウ", role: "manager", storeId: 1 },
    { id: 11, name: "雀庵 スタッフ", kana: "スズメアンスタッフ", role: "staff", storeId: 1 },
    { id: 21, name: "離れ スタッフ", kana: "ハナレススタッフ", role: "staff", storeId: 2 },
  ] as const;
  for (const emp of employees) {
    db.insert(schema.employees)
      .values({
        id: emp.id,
        name: emp.name,
        kana: emp.kana,
        role: emp.role,
        loginId: emp.role === "staff" ? null : `login-${emp.id}`,
        passwordHash: emp.role === "staff" ? null : bcrypt.hashSync("password", 4),
        pinHash,
        hourlyWage: 1000,
        hireDate: "2024-01-01",
        retireDate: null,
        pinFailCount: 0,
        lockUntil: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.employeeStores)
      .values({ employeeId: emp.id, storeId: emp.storeId, isPrimary: 1 })
      .run();
  }

  db.insert(schema.timePunches)
    .values([
      {
        employeeId: 11,
        storeId: 1,
        punchType: "clock_in",
        punchedAt: new Date(2026, 3, 5, 10, 0).getTime(),
        source: "kiosk",
        note: null,
        createdAt: now,
      },
      {
        employeeId: 21,
        storeId: 2,
        punchType: "clock_in",
        punchedAt: new Date(2026, 3, 5, 11, 0).getTime(),
        source: "kiosk",
        note: null,
        createdAt: now,
      },
      {
        employeeId: 11,
        storeId: 2,
        punchType: "clock_out",
        punchedAt: new Date(2026, 3, 5, 19, 0).getTime(),
        source: "admin",
        note: null,
        createdAt: now,
      },
    ])
    .run();

  const store2PunchByStore1Staff = db
    .select()
    .from(schema.timePunches)
    .where(eq(schema.timePunches.employeeId, 11))
    .all()
    .find((p) => p.storeId === 2);
  if (!store2PunchByStore1Staff) {
    throw new Error("failed to seed store2 punch for store1 staff");
  }

  const correction = db
    .insert(schema.correctionRequests)
    .values({
      employeeId: 21,
      targetPunchId: null,
      targetDate: "2026-04-05",
      requestedValue: new Date(2026, 3, 5, 18, 0).getTime(),
      requestedType: "clock_out",
      reason: "退勤打刻漏れ",
      status: "pending",
      reviewerId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: now,
    })
    .returning()
    .get();

  const correctionByPunchStore = db
    .insert(schema.correctionRequests)
    .values({
      employeeId: 11,
      targetPunchId: store2PunchByStore1Staff.id,
      targetDate: "2026-04-05",
      requestedValue: new Date(2026, 3, 5, 18, 30).getTime(),
      requestedType: "clock_out",
      reason: "別店舗打刻の修正",
      status: "pending",
      reviewerId: null,
      reviewedAt: null,
      reviewComment: null,
      createdAt: now + 1,
    })
    .returning()
    .get();

  return {
    adminSid: makeSession(1, "admin"),
    managerSid: makeSession(10, "manager"),
    staffStore1Id: 11,
    staffStore2Id: 21,
    correctionStore2Id: correction.id,
    correctionPunchStore2Id: correctionByPunchStore.id,
  };
}

function req(path: string, init: RequestInit & { sid?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.sid) headers.set("cookie", `hanare_sid=${init.sid}`);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return Promise.resolve(app.fetch(new Request(`http://localhost${path}`, { ...init, headers })));
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clear();
});

describe("task-7001 権限スコープ強化", () => {
  it("manager は自店舗の従業員だけ参照でき、他店舗指定は 403", async () => {
    const s = seed();

    const list = await req("/api/employees", { sid: s.managerSid });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { employees: Array<{ id: number }> };
    expect(body.employees.map((e) => e.id).sort()).toEqual([1, 10, 11]);

    const denied = await req("/api/employees?store_id=2", { sid: s.managerSid });
    expect(denied.status).toBe(403);

    const adminList = await req("/api/employees?store_id=2", { sid: s.adminSid });
    expect(adminList.status).toBe(200);
    const adminBody = (await adminList.json()) as { employees: Array<{ id: number }> };
    expect(adminBody.employees.map((e) => e.id)).toEqual([21]);
  });

  it("manager は他店舗の打刻一覧・従業員指定を参照できない", async () => {
    const s = seed();

    const list = await req("/api/punches", { sid: s.managerSid });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      punches: Array<{ employee_id: number; store_id: number }>;
    };
    expect(body.punches).toHaveLength(1);
    expect(body.punches[0]).toMatchObject({ employee_id: s.staffStore1Id, store_id: 1 });

    const byStore = await req("/api/punches?store_id=2", { sid: s.managerSid });
    expect(byStore.status).toBe(403);

    const byEmployee = await req(`/api/punches?employee_id=${s.staffStore2Id}`, {
      sid: s.managerSid,
    });
    expect(byEmployee.status).toBe(403);
  });

  it("manager は他店舗のシフト作成・公開・希望一覧取得ができない", async () => {
    const s = seed();

    const createOwn = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffStore1Id,
        store_id: 1,
        date: "2026-05-01",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(createOwn.status).toBe(201);

    const createOther = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffStore2Id,
        store_id: 2,
        date: "2026-05-01",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(createOther.status).toBe(403);

    const publishOther = await req("/api/shifts/publish", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({ store_id: 2, from: "2026-05-01", to: "2026-05-01" }),
    });
    expect(publishOther.status).toBe(403);

    await req("/api/shift-requests", {
      method: "POST",
      sid: makeSession(s.staffStore2Id, "staff"),
      body: JSON.stringify({
        date: "2026-05-02",
        start_time: "10:00",
        end_time: "14:00",
        preference: "preferred",
      }),
    });
    const requests = await req("/api/shift-requests", { sid: s.managerSid });
    expect(requests.status).toBe(200);
    const requestBody = (await requests.json()) as { requests: Array<{ employee_id: number }> };
    expect(requestBody.requests.some((r) => r.employee_id === s.staffStore2Id)).toBe(false);
  });

  it("manager は従業員の未所属店舗にシフトを作成・移動できない", async () => {
    const s = seed();
    db.insert(schema.employeeStores).values({ employeeId: 10, storeId: 2, isPrimary: 0 }).run();

    const createAssigned = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffStore1Id,
        store_id: 1,
        date: "2026-05-03",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(createAssigned.status).toBe(201);
    const created = (await createAssigned.json()) as { shift: { id: number } };

    const createUnassigned = await req("/api/shifts", {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({
        employee_id: s.staffStore1Id,
        store_id: 2,
        date: "2026-05-04",
        start_time: "10:00",
        end_time: "14:00",
      }),
    });
    expect(createUnassigned.status).toBe(400);

    const moveUnassigned = await req(`/api/shifts/${created.shift.id}`, {
      method: "PATCH",
      sid: s.managerSid,
      body: JSON.stringify({ store_id: 2 }),
    });
    expect(moveUnassigned.status).toBe(400);
  });

  it("manager は他店舗スタッフの修正申請を承認できず、export は admin 限定", async () => {
    const s = seed();

    const approve = await req(`/api/corrections/${s.correctionStore2Id}/approve`, {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({ review_comment: "承認" }),
    });
    expect(approve.status).toBe(403);

    const managerExport = await req("/api/exports/period.csv?from=2026-04-01&to=2026-04-30", {
      sid: s.managerSid,
    });
    expect(managerExport.status).toBe(403);

    const adminExport = await req("/api/exports/period.csv?from=2026-04-01&to=2026-04-30", {
      sid: s.adminSid,
    });
    expect(adminExport.status).toBe(200);
    expect(adminExport.headers.get("content-type")).toContain("text/csv");
  });

  it("manager は対象打刻の店舗が他店舗の修正申請を一覧表示・却下できない", async () => {
    const s = seed();

    const list = await req("/api/corrections", { sid: s.managerSid });
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      corrections: Array<{ id: number; employee_id: number; target_punch_id: number | null }>;
    };
    expect(body.corrections.some((c) => c.id === s.correctionPunchStore2Id)).toBe(false);

    const reject = await req(`/api/corrections/${s.correctionPunchStore2Id}/reject`, {
      method: "POST",
      sid: s.managerSid,
      body: JSON.stringify({ review_comment: "却下" }),
    });
    expect(reject.status).toBe(403);
  });
});
