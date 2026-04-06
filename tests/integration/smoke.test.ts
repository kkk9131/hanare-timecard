/**
 * task-6003: E2E smoke test
 *
 * Drives the real Hono app via `app.fetch` against an isolated SQLite DB
 * and walks the primary end-to-end flows in a single scenario.
 *
 * Note:
 * - Playwright is not available in this environment; per instructions this
 *   test exercises the server end-to-end using the same stack that
 *   `npm run start` boots. It imports the unmodified `createApp()` and talks
 *   to it purely over HTTP-shaped Request/Response, so the coverage matches
 *   what a browser client would hit.
 * - A dedicated DB path is wired via `HANARE_DB_PATH` BEFORE importing the
 *   server modules, so the singleton `db` client binds to the isolated file.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-e2e-"));
const DB_PATH = join(TMP_DIR, "hanare-e2e.db");
process.env.HANARE_DB_PATH = DB_PATH;

// Dynamic import AFTER env is set so that the db singleton picks up DB_PATH.
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

function seedMinimal(): { storeId: number; adminId: number } {
  const now = Date.now();
  db.insert(schema.stores)
    .values({
      id: 1,
      code: "jakuan",
      name: "雀庵",
      displayName: "雀庵 本店",
      openingTime: "17:00",
      closingTime: "23:30",
      closedDays: null,
      createdAt: now,
    })
    .run();
  db.insert(schema.employees)
    .values({
      id: 1,
      name: "店主 雀子",
      kana: "てんしゅ すずこ",
      role: "admin",
      loginId: "oyakata",
      passwordHash: bcrypt.hashSync("hanare2026", 4),
      pinHash: bcrypt.hashSync("9999", 4),
      hourlyWage: 0,
      hireDate: "2020-01-01",
      retireDate: null,
      pinFailCount: 0,
      lockUntil: null,
      note: "オーナー",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schema.employeeStores).values({ employeeId: 1, storeId: 1, isPrimary: 1 }).run();
  return { storeId: 1, adminId: 1 };
}

interface ReqInit extends RequestInit {
  cookie?: string;
}

async function req(path: string, init: ReqInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return app.fetch(new Request(`http://localhost${path}`, { ...init, headers }));
}

/**
 * Extract the hanare_sid cookie value from a Set-Cookie header.
 * Returns the full "hanare_sid=..." fragment ready to be passed as a Cookie header.
 */
function extractSid(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no Set-Cookie on response");
  const match = setCookie.match(/hanare_sid=[^;]+/);
  if (!match) throw new Error(`hanare_sid not in Set-Cookie: ${setCookie}`);
  return match[0];
}

beforeAll(() => {
  applyMigrations();
  seedMinimal();
});

afterAll(() => {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
    (db as any).$client.close();
  } catch {
    // ignore
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("task-6003 smoke: primary end-to-end flow", () => {
  it("health -> admin login -> employee CRUD -> PIN login -> punch -> shift -> correction -> audit -> export", async () => {
    // 1. health
    const health = await req("/api/system/health");
    expect(health.status).toBe(200);
    const healthJson = (await health.json()) as { status: string; ok: boolean };
    expect(healthJson.status).toBe("ok");
    expect(healthJson.ok).toBe(true);

    // 2. admin login
    const adminLogin = await req("/api/auth/admin-login", {
      method: "POST",
      body: JSON.stringify({ login_id: "oyakata", password: "hanare2026" }),
    });
    expect(adminLogin.status).toBe(200);
    const adminCookie = extractSid(adminLogin);
    const adminBody = (await adminLogin.json()) as {
      employee: { id: number; role: string };
    };
    expect(adminBody.employee.role).toBe("admin");

    // 3. admin creates a new staff employee
    const createEmp = await req("/api/employees", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        name: "E2E 太郎",
        kana: "イーツーイー タロウ",
        role: "staff",
        pin: "4242",
        hire_date: "2026-04-01",
        store_ids: [1],
        hourly_wage: 1200,
      }),
    });
    expect(createEmp.status).toBe(201);
    const created = (await createEmp.json()) as {
      employee: { id: number; name: string; store_ids: number[] };
    };
    expect(created.employee.name).toBe("E2E 太郎");
    expect(created.employee.store_ids).toEqual([1]);
    const staffId = created.employee.id;

    // 4. PIN login as the newly created staff
    const pinLogin = await req("/api/auth/pin-login", {
      method: "POST",
      body: JSON.stringify({ employee_id: staffId, pin: "4242" }),
    });
    expect(pinLogin.status).toBe(200);
    const staffCookie = extractSid(pinLogin);

    // 5. clock_in
    const clockIn = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_in", store_id: 1 }),
    });
    expect(clockIn.status).toBe(200);
    const clockInBody = (await clockIn.json()) as {
      punch: { id: number };
      next_state: string;
    };
    expect(clockInBody.next_state).toBe("working");

    // 6. state === working
    const state1 = await req("/api/punches/me/state", { cookie: staffCookie });
    expect(state1.status).toBe(200);
    const state1Body = (await state1.json()) as { state: string };
    expect(state1Body.state).toBe("working");

    // Backdate the clock_in punch so that the subsequent clock_out yields
    // strictly positive worked minutes (the state machine only looks at the
    // last punch type, so mutating punched_at is safe for this flow).
    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
    const sqlite = (db as any).$client;
    const backdate = Date.now() - 90 * 60 * 1000; // 90 minutes ago
    sqlite
      .prepare("UPDATE time_punches SET punched_at = ? WHERE id = ?")
      .run(backdate, clockInBody.punch.id);

    // 7. clock_out
    const clockOut = await req("/api/punches", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({ punch_type: "clock_out", store_id: 1 }),
    });
    expect(clockOut.status).toBe(200);
    const clockOutBody = (await clockOut.json()) as { next_state: string };
    expect(clockOutBody.next_state).toBe("off");

    // 8. summary.worked > 0
    const summary = await req("/api/punches/me/summary", {
      cookie: staffCookie,
    });
    expect(summary.status).toBe(200);
    const summaryBody = (await summary.json()) as {
      worked: number;
      overtime: number;
      break: number;
      night: number;
    };
    expect(summaryBody.worked).toBeGreaterThan(0);

    // 9. admin creates a shift
    const shiftCreate = await req("/api/shifts", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        employee_id: staffId,
        store_id: 1,
        date: "2026-05-01",
        start_time: "17:00",
        end_time: "23:00",
      }),
    });
    expect(shiftCreate.status).toBe(201);
    const shiftBody = (await shiftCreate.json()) as {
      shift: { id: number; status: string };
    };
    expect(shiftBody.shift.id).toBeGreaterThan(0);

    // 10. staff submits a correction request
    const correction = await req("/api/corrections", {
      method: "POST",
      cookie: staffCookie,
      body: JSON.stringify({
        target_date: "2026-04-05",
        requested_type: "clock_in",
        // 2026-04-05 17:00 JST, expressed as a concrete unix ms value
        requested_value: new Date(2026, 3, 5, 17, 0, 0, 0).getTime(),
        reason: "打刻忘れのため修正をお願いします",
      }),
    });
    expect(correction.status).toBe(201);
    const correctionBody = (await correction.json()) as {
      correction: { id: number; status: string };
    };
    expect(correctionBody.correction.status).toBe("pending");
    const correctionId = correctionBody.correction.id;

    // 11. admin approves the correction
    const approve = await req(`/api/corrections/${correctionId}/approve`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ review_comment: "承認します" }),
    });
    expect(approve.status).toBe(200);
    const approveBody = (await approve.json()) as {
      correction: { status: string };
    };
    expect(approveBody.correction.status).toBe("approved");

    // 12. audit logs contain entries (at least employee.create + shift.create
    //     + correction.* + approve were generated above)
    const audit = await req("/api/audit?limit=100", { cookie: adminCookie });
    expect(audit.status).toBe(200);
    const auditBody = (await audit.json()) as {
      logs: Array<{ action: string }>;
    };
    expect(auditBody.logs.length).toBeGreaterThan(0);
    const actions = auditBody.logs.map((l) => l.action);
    expect(actions).toContain("employee.create");

    // 13. xlsx export for current period
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const from = `${yyyy}-${mm}-01`;
    // last day of the current month
    const lastDay = new Date(yyyy, today.getMonth() + 1, 0).getDate();
    const to = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
    const xlsx = await req(`/api/exports/period.xlsx?from=${from}&to=${to}&store_id=1`, {
      cookie: adminCookie,
    });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const arrayBuf = await xlsx.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    expect(buf.length).toBeGreaterThan(0);
    // xlsx files are ZIP containers; magic bytes 'PK\x03\x04'
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K'
  });
});
