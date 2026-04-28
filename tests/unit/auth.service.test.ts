import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAllMigrations } from "../helpers/migrations.js";

// IMPORTANT: HANARE_DB_PATH must be set BEFORE importing modules that touch
// `src/server/db/client.ts`, because that module instantiates a singleton
// SQLite database at import time using `resolveDbPath()`.
const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-auth-test-"));
const TMP_DB_PATH = join(TMP_DIR, "auth-test.db");
process.env.HANARE_DB_PATH = TMP_DB_PATH;

// Dynamic imports so the env var above is honoured.
const { db, schema } = await import("../../src/server/db/client.js");
const {
  MAX_AUTH_FAIL_COUNT,
  AUTH_LOCK_DURATION_MS,
  getEmployeeProfile,
  listPublicEmployees,
  startKioskSession,
  verifyAdminLogin,
} = await import("../../src/server/services/auth.js");

interface TestSqliteClient {
  exec(sql: string): void;
  close(): void;
}

function sqliteClient(): TestSqliteClient {
  return (db as unknown as { $client: TestSqliteClient }).$client;
}

function applyMigrations(): void {
  applyAllMigrations(db);
}

function clearTables(): void {
  const sqlite = sqliteClient();
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
  const passwordHash = opts.password != null ? bcrypt.hashSync(opts.password, 4) : null;

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
    db.insert(schema.employeeStores).values({ employeeId: empId, storeId, isPrimary: 0 }).run();
  }
  return empId;
}

beforeAll(() => {
  applyMigrations();
});

afterAll(() => {
  try {
    sqliteClient().close();
  } catch {
    /* noop */
  }
  rmSync(TMP_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  clearTables();
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

  it("locks admin account after MAX_AUTH_FAIL_COUNT failures", () => {
    seedEmployee({
      role: "admin",
      loginId: "admin",
      password: "secret",
      pinFailCount: MAX_AUTH_FAIL_COUNT - 1,
    });
    const now = 1_700_000_000_000;
    const result = verifyAdminLogin("admin", "wrong", now);
    expect(result.kind).toBe("locked");
    if (result.kind === "locked") {
      expect(result.lock_until).toBe(now + AUTH_LOCK_DURATION_MS);
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

describe("startKioskSession", () => {
  it("returns the selected employee profile directly for kiosk punching", () => {
    seedStore(1, "S1");
    const empId = seedEmployee({
      role: "staff",
      name: "打刻 花子",
      kana: "ダコク ハナコ",
      storeIds: [1],
    });

    const result = startKioskSession(empId);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.employee.id).toBe(empId);
      expect(result.employee.name).toBe("打刻 花子");
      expect(result.employee.store_ids).toEqual([1]);
    }
  });

  it("rejects retired employees", () => {
    const empId = seedEmployee({
      retireDate: "2024-12-31",
    });

    const result = startKioskSession(empId);
    expect(result.kind).toBe("not_found");
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
