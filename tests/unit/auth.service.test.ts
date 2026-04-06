import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// IMPORTANT: HANARE_DB_PATH must be set BEFORE importing modules that touch
// `src/server/db/client.ts`, because that module instantiates a singleton
// SQLite database at import time using `resolveDbPath()`.
const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-auth-test-"));
const TMP_DB_PATH = join(TMP_DIR, "auth-test.db");
process.env.HANARE_DB_PATH = TMP_DB_PATH;

// Dynamic imports so the env var above is honoured.
const { db, schema } = await import("../../src/server/db/client.js");
const {
  MAX_PIN_FAIL_COUNT,
  PIN_LOCK_DURATION_MS,
  getEmployeeProfile,
  listPublicEmployees,
  verifyAdminLogin,
  verifyPin,
} = await import("../../src/server/services/auth.js");

function applyMigrations(): void {
  // Replicate scripts/migrate.ts inline to avoid the top-level side-effect.
  const sqlPath = resolve("drizzle/0000_init.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const statements = sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Use the same underlying sqlite handle through drizzle.
  for (const stmt of statements) {
    // drizzle exposes the underlying better-sqlite3 handle via `$client`.
    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
    (db as any).$client.exec(stmt);
  }
}

function clearTables(): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  const sqlite = (db as any).$client;
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM sessions");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

interface SeedEmployeeOptions {
  id?: number;
  name?: string;
  kana?: string;
  role?: "staff" | "manager" | "admin";
  loginId?: string | null;
  password?: string | null;
  pin?: string;
  retireDate?: string | null;
  pinFailCount?: number;
  lockUntil?: number | null;
  storeIds?: number[];
}

function seedStore(id: number, code: string): void {
  db.insert(schema.stores)
    .values({
      id,
      code,
      name: `Store ${code}`,
      displayName: `Store ${code}`,
      openingTime: "09:00",
      closingTime: "22:00",
      closedDays: null,
      createdAt: 0,
    })
    .run();
}

function seedEmployee(opts: SeedEmployeeOptions = {}): number {
  const pin = opts.pin ?? "1234";
  const pinHash = bcrypt.hashSync(pin, 4);
  const passwordHash =
    opts.password != null ? bcrypt.hashSync(opts.password, 4) : null;

  const inserted = db
    .insert(schema.employees)
    .values({
      id: opts.id,
      name: opts.name ?? "山田 太郎",
      kana: opts.kana ?? "ヤマダ タロウ",
      role: opts.role ?? "staff",
      loginId: opts.loginId ?? null,
      passwordHash,
      pinHash,
      hourlyWage: 1000,
      hireDate: "2024-01-01",
      retireDate: opts.retireDate ?? null,
      pinFailCount: opts.pinFailCount ?? 0,
      lockUntil: opts.lockUntil ?? null,
      note: null,
      createdAt: 0,
      updatedAt: 0,
    })
    .returning({ id: schema.employees.id })
    .get();

  const empId = inserted.id;
  for (const storeId of opts.storeIds ?? []) {
    db.insert(schema.employeeStores)
      .values({ employeeId: empId, storeId, isPrimary: 0 })
      .run();
  }
  return empId;
}

beforeAll(() => {
  applyMigrations();
});

afterAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  try {
    (db as any).$client.close();
  } catch {
    /* noop */
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  clearTables();
});

describe("verifyPin", () => {
  it("returns ok with employee profile and store_ids on success", () => {
    seedStore(1, "S1");
    seedStore(2, "S2");
    const empId = seedEmployee({ pin: "9999", storeIds: [1, 2] });

    const result = verifyPin(empId, "9999");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.employee.id).toBe(empId);
      expect(result.employee.role).toBe("staff");
      expect(result.employee.store_ids.sort()).toEqual([1, 2]);
    }
  });

  it("clears pin_fail_count and lock_until on successful login", () => {
    const empId = seedEmployee({
      pin: "1111",
      pinFailCount: 3,
      lockUntil: null,
    });
    const result = verifyPin(empId, "1111");
    expect(result.kind).toBe("ok");

    const row = db
      .select()
      .from(schema.employees)
      .where(eqHelper(schema.employees.id, empId))
      .get();
    expect(row?.pinFailCount).toBe(0);
    expect(row?.lockUntil).toBeNull();
  });

  it("returns invalid_pin and increments fail count on wrong pin", () => {
    const empId = seedEmployee({ pin: "1111" });
    const result = verifyPin(empId, "9999");
    expect(result.kind).toBe("invalid_pin");
    if (result.kind === "invalid_pin") {
      expect(result.remaining).toBe(MAX_PIN_FAIL_COUNT - 1);
    }
    const row = db
      .select()
      .from(schema.employees)
      .where(eqHelper(schema.employees.id, empId))
      .get();
    expect(row?.pinFailCount).toBe(1);
  });

  it("locks the account when reaching MAX_PIN_FAIL_COUNT", () => {
    const empId = seedEmployee({
      pin: "1111",
      pinFailCount: MAX_PIN_FAIL_COUNT - 1,
    });
    const now = 1_700_000_000_000;
    const result = verifyPin(empId, "0000", now);
    expect(result.kind).toBe("locked");
    if (result.kind === "locked") {
      expect(result.lock_until).toBe(now + PIN_LOCK_DURATION_MS);
    }

    const row = db
      .select()
      .from(schema.employees)
      .where(eqHelper(schema.employees.id, empId))
      .get();
    expect(row?.pinFailCount).toBe(0);
    expect(row?.lockUntil).toBe(now + PIN_LOCK_DURATION_MS);
  });

  it("returns locked while lock_until is in the future, even with correct pin", () => {
    const future = Date.now() + 60_000;
    const empId = seedEmployee({ pin: "1111", lockUntil: future });
    const result = verifyPin(empId, "1111");
    expect(result.kind).toBe("locked");
    if (result.kind === "locked") {
      expect(result.lock_until).toBe(future);
    }
  });

  it("returns not_found for unknown employees", () => {
    const result = verifyPin(99999, "0000");
    expect(result.kind).toBe("not_found");
  });

  it("treats retired employees as not_found", () => {
    const empId = seedEmployee({ pin: "1111", retireDate: "2024-12-31" });
    const result = verifyPin(empId, "1111");
    expect(result.kind).toBe("not_found");
  });
});

describe("verifyAdminLogin", () => {
  it("returns ok for matching admin credentials", () => {
    seedStore(1, "S1");
    const empId = seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
      storeIds: [1],
    });

    const result = verifyAdminLogin("admin", "secret");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.employee.id).toBe(empId);
      expect(result.employee.role).toBe("admin");
      expect(result.employee.store_ids).toEqual([1]);
    }
  });

  it("rejects unknown login_id", () => {
    const result = verifyAdminLogin("nope", "x");
    expect(result.kind).toBe("invalid");
  });

  it("rejects staff role even with correct password", () => {
    seedEmployee({
      role: "staff",
      loginId: "staffer",
      password: "secret",
    });
    const result = verifyAdminLogin("staffer", "secret");
    expect(result.kind).toBe("invalid");
  });

  it("rejects wrong password and increments fail count", () => {
    const empId = seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
    });
    const result = verifyAdminLogin("admin", "wrong");
    expect(result.kind).toBe("invalid");

    const row = db
      .select()
      .from(schema.employees)
      .where(eqHelper(schema.employees.id, empId))
      .get();
    expect(row?.pinFailCount).toBe(1);
  });

  it("locks admin account after MAX_PIN_FAIL_COUNT failures", () => {
    seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
      pinFailCount: MAX_PIN_FAIL_COUNT - 1,
    });
    const now = 1_700_000_000_000;
    const result = verifyAdminLogin("admin", "wrong", now);
    expect(result.kind).toBe("locked");
    if (result.kind === "locked") {
      expect(result.lock_until).toBe(now + PIN_LOCK_DURATION_MS);
    }
  });

  it("returns locked when account is currently locked", () => {
    const future = Date.now() + 60_000;
    seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
      lockUntil: future,
    });
    const result = verifyAdminLogin("admin", "secret");
    expect(result.kind).toBe("locked");
  });

  it("rejects retired admins", () => {
    seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
      retireDate: "2024-12-31",
    });
    const result = verifyAdminLogin("admin", "secret");
    expect(result.kind).toBe("invalid");
  });
});

describe("listPublicEmployees", () => {
  it("excludes retired employees and orders by kana", () => {
    seedStore(1, "S1");
    seedStore(2, "S2");
    seedEmployee({ name: "B", kana: "ビー", storeIds: [1] });
    seedEmployee({ name: "A", kana: "アー", storeIds: [1, 2] });
    seedEmployee({
      name: "Z retired",
      kana: "ゼット",
      retireDate: "2024-12-31",
    });

    const list = listPublicEmployees();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("A");
    expect(list[0].store_ids.sort()).toEqual([1, 2]);
    expect(list[1].name).toBe("B");
  });

  it("filters by store id when provided", () => {
    seedStore(1, "S1");
    seedStore(2, "S2");
    seedEmployee({ name: "OnlyStore1", kana: "ワン", storeIds: [1] });
    seedEmployee({ name: "OnlyStore2", kana: "ツー", storeIds: [2] });
    seedEmployee({ name: "BothStores", kana: "スリー", storeIds: [1, 2] });

    const filtered = listPublicEmployees(1);
    const names = filtered.map((e) => e.name).sort();
    expect(names).toEqual(["BothStores", "OnlyStore1"]);
  });
});

describe("getEmployeeProfile", () => {
  it("returns the profile with role and store_ids", () => {
    seedStore(1, "S1");
    const empId = seedEmployee({
      role: "manager",
      name: "佐藤",
      kana: "サトウ",
      storeIds: [1],
    });
    const profile = getEmployeeProfile(empId);
    expect(profile).not.toBeNull();
    expect(profile?.id).toBe(empId);
    expect(profile?.role).toBe("manager");
    expect(profile?.store_ids).toEqual([1]);
  });

  it("returns null for unknown employee", () => {
    expect(getEmployeeProfile(99999)).toBeNull();
  });
});

// `eq` is imported at the top of the file from drizzle-orm.
const eqHelper = eq;
