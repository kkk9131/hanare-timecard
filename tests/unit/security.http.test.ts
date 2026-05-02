import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAllMigrations } from "../helpers/migrations.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-security-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "security.db");

const { db, schema } = await import("../../src/server/db/client.js");
const { createApp } = await import("../../src/server/app.js");

const originalEnv = {
  HANARE_ALLOWED_ORIGINS: process.env.HANARE_ALLOWED_ORIGINS,
  HANARE_TLS: process.env.HANARE_TLS,
  NODE_ENV: process.env.NODE_ENV,
};

function applyMigrations(): void {
  applyAllMigrations(db);
}

function resetEnv(): void {
  process.env.NODE_ENV = originalEnv.NODE_ENV;
  if (originalEnv.HANARE_ALLOWED_ORIGINS == null) {
    delete process.env.HANARE_ALLOWED_ORIGINS;
  } else {
    process.env.HANARE_ALLOWED_ORIGINS = originalEnv.HANARE_ALLOWED_ORIGINS;
  }
  if (originalEnv.HANARE_TLS == null) {
    delete process.env.HANARE_TLS;
  } else {
    process.env.HANARE_TLS = originalEnv.HANARE_TLS;
  }
}

function clear(): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  const sqlite = (db as any).$client;
  sqlite.exec("DELETE FROM audit_logs");
  sqlite.exec("DELETE FROM correction_requests");
  sqlite.exec("DELETE FROM shift_requests");
  sqlite.exec("DELETE FROM shift_requirement_slots");
  sqlite.exec("DELETE FROM shift_recruitment_periods");
  sqlite.exec("DELETE FROM shift_monthly_settings");
  sqlite.exec("DELETE FROM shifts");
  sqlite.exec("DELETE FROM work_days");
  sqlite.exec("DELETE FROM time_punches");
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM sessions");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

function seedDebugSession(): string {
  const now = Date.now();
  db.insert(schema.employees)
    .values({
      id: 1,
      name: "管理者",
      kana: "カンリシャ",
      role: "admin",
      loginId: "admin",
      passwordHash: "unused",
      pinHash: "unused",
      hourlyWage: 0,
      hireDate: "2026-04-01",
      retireDate: null,
      pinFailCount: 0,
      lockUntil: null,
      note: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schema.sessions)
    .values({
      id: "debug-session-secret",
      employeeId: 1,
      role: "admin",
      expiresAt: now + 60_000,
      createdAt: now,
    })
    .run();
  return "debug-session-secret";
}

function req(path: string, init: RequestInit = {}): Promise<Response> {
  return createApp().fetch(new Request(`http://localhost${path}`, init));
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  resetEnv();
  clear();
});

afterAll(() => {
  resetEnv();
  try {
    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
    (db as any).$client.close();
  } catch {
    // ignore
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("task-7003 本番セキュリティヘッダー", () => {
  it("主要セキュリティヘッダーを返す", async () => {
    process.env.NODE_ENV = "production";
    process.env.HANARE_TLS = "1";

    const res = await req("/api/system/health");

    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("production では debug endpoint が 404", async () => {
    process.env.NODE_ENV = "production";

    const res = await req("/api/system/_debug/whoami");

    expect(res.status).toBe(404);
  });

  it("development の debug response から sessionId を除外する", async () => {
    process.env.NODE_ENV = "development";
    const sid = seedDebugSession();

    const res = await req("/api/system/_debug/whoami", {
      headers: { cookie: `hanare_sid=${sid}` },
    });
    const body = (await res.json()) as {
      user: { employeeId: number; role: string; expiresAt: number; sessionId?: string };
    };

    expect(res.status).toBe(200);
    expect(body.user).toMatchObject({ employeeId: 1, role: "admin" });
    expect(body.user.sessionId).toBeUndefined();
  });

  it("production CORS は同一 origin と HANARE_ALLOWED_ORIGINS だけ許可する", async () => {
    process.env.NODE_ENV = "production";
    process.env.HANARE_ALLOWED_ORIGINS = "https://timecard.example.local";

    const sameOrigin = await req("/api/system/health", {
      headers: { origin: "http://localhost" },
    });
    const allowed = await req("/api/system/health", {
      headers: { origin: "https://timecard.example.local" },
    });
    const denied = await req("/api/system/health", {
      headers: { origin: "https://unknown.example.local" },
    });

    expect(sameOrigin.headers.get("access-control-allow-origin")).toBe("http://localhost");
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      "https://timecard.example.local",
    );
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });
});
