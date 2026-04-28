import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-punch-store-integrity-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "punch-store-integrity.db");

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

function seed(): { adminId: number; sharedStaffId: number; store1StaffId: number } {
  const now = Date.now();
  db.insert(schema.stores)
    .values([
      {
        id: 1,
        code: "suzumean",
        name: "雀庵",
        displayName: "雀庵 本店",
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

  db.insert(schema.employees)
    .values([
      {
        id: 1,
        name: "全店管理者",
        kana: "ゼンテンカンリシャ",
        role: "admin",
        loginId: "admin",
        passwordHash: "unused",
        pinHash: "x",
        hourlyWage: 0,
        hireDate: "2024-01-01",
        retireDate: null,
        pinFailCount: 0,
        lockUntil: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 30,
        name: "兼務 花子",
        kana: "ケンムハナコ",
        role: "staff",
        loginId: null,
        passwordHash: null,
        pinHash: "x",
        hourlyWage: 1200,
        hireDate: "2024-01-01",
        retireDate: null,
        pinFailCount: 0,
        lockUntil: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 31,
        name: "本店 太郎",
        kana: "ホンテンタロウ",
        role: "staff",
        loginId: null,
        passwordHash: null,
        pinHash: "x",
        hourlyWage: 1200,
        hireDate: "2024-01-01",
        retireDate: null,
        pinFailCount: 0,
        lockUntil: null,
        note: null,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  db.insert(schema.employeeStores)
    .values([
      { employeeId: 1, storeId: 1, isPrimary: 1 },
      { employeeId: 1, storeId: 2, isPrimary: 0 },
      { employeeId: 30, storeId: 1, isPrimary: 1 },
      { employeeId: 30, storeId: 2, isPrimary: 0 },
      { employeeId: 31, storeId: 1, isPrimary: 1 },
    ])
    .run();

  return { adminId: 1, sharedStaffId: 30, store1StaffId: 31 };
}

function makeSession(employeeId: number, role: "staff" | "manager" | "admin"): string {
  const id = `sid-${role}-${employeeId}-${Math.random().toString(36).slice(2)}`;
  const now = Date.now();
  db.insert(schema.sessions)
    .values({ id, employeeId, role, expiresAt: now + 3600_000, createdAt: now })
    .run();
  return id;
}

function extractSid(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no Set-Cookie on response");
  const match = setCookie.match(/hanare_sid=[^;]+/);
  if (!match) throw new Error(`hanare_sid not in Set-Cookie: ${setCookie}`);
  return match[0];
}

function req(path: string, init: RequestInit & { cookie?: string } = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return Promise.resolve(app.fetch(new Request(`http://localhost${path}`, { ...init, headers })));
}

function localMonthRange(): { from: string; to: string } {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
  return { from: `${yyyy}-${mm}-01`, to: `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function setPunchTime(punchId: number, punchedAt: number): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  (db as any).$client
    .prepare("UPDATE time_punches SET punched_at = ? WHERE id = ?")
    .run(punchedAt, punchId);
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clear();
});

describe("task-7002 打刻店舗整合性", () => {
  it("兼務スタッフは選択店舗で打刻され、店舗別 export にも分かれて反映される", async () => {
    const s = seed();

    const kioskLogin = await req("/api/auth/kiosk-login", {
      method: "POST",
      body: JSON.stringify({ employee_id: s.sharedStaffId }),
    });
    expect(kioskLogin.status).toBe(200);
    const staffCookie = extractSid(kioskLogin);

    const clockInHanare = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_in", store_id: 2 }),
    });
    expect(clockInHanare.status).toBe(200);
    const hanareInBody = (await clockInHanare.json()) as {
      punch: { id: number; employee_id: number; store_id: number };
    };
    expect(hanareInBody.punch).toMatchObject({
      employee_id: s.sharedStaffId,
      store_id: 2,
    });
    setPunchTime(hanareInBody.punch.id, Date.now() - 20 * 60 * 1000);

    const clockOutHanare = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_out", store_id: 2 }),
    });
    expect(clockOutHanare.status).toBe(200);
    const hanareOutBody = (await clockOutHanare.json()) as { punch: { id: number } };
    setPunchTime(hanareOutBody.punch.id, Date.now() - 10 * 60 * 1000);

    const clockInMain = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_in", store_id: 1 }),
    });
    expect(clockInMain.status).toBe(200);
    const mainInBody = (await clockInMain.json()) as {
      punch: { id: number; employee_id: number; store_id: number };
    };
    expect(mainInBody.punch).toMatchObject({
      employee_id: s.sharedStaffId,
      store_id: 1,
    });
    setPunchTime(mainInBody.punch.id, Date.now() - 5 * 60 * 1000);

    const clockOutMain = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_out", store_id: 1 }),
    });
    expect(clockOutMain.status).toBe(200);

    const adminCookie = `hanare_sid=${makeSession(s.adminId, "admin")}`;
    const { from, to } = localMonthRange();
    const hanareExport = await req(`/api/exports/period.csv?from=${from}&to=${to}&store_id=2`, {
      cookie: adminCookie,
    });
    expect(hanareExport.status).toBe(200);
    const hanareCsv = await hanareExport.text();
    expect(hanareCsv).toContain("雀庵 離れ");
    expect(hanareCsv).toContain("兼務 花子");

    const mainExport = await req(`/api/exports/period.csv?from=${from}&to=${to}&store_id=1`, {
      cookie: adminCookie,
    });
    expect(mainExport.status).toBe(200);
    const mainCsv = await mainExport.text();
    expect(mainCsv).toContain("雀庵");
    expect(mainCsv).not.toContain("雀庵 離れ");
    expect(mainCsv).toContain("兼務 花子");
  });

  it("未所属店舗への直接 API 打刻は 403", async () => {
    const s = seed();
    const staffCookie = `hanare_sid=${makeSession(s.store1StaffId, "staff")}`;

    const denied = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_in", store_id: 2 }),
    });

    expect(denied.status).toBe(403);
    const body = (await denied.json()) as { error: string };
    expect(body.error).toBe("store_forbidden");
  });
});
