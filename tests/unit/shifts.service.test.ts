import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-shifts-test-"));
const TMP_DB_PATH = join(TMP_DIR, "shifts-test.db");
process.env.HANARE_DB_PATH = TMP_DB_PATH;

const { db, schema } = await import("../../src/server/db/client.js");
const {
  createShift,
  createShiftRequest,
  deleteShift,
  detectConflicts,
  findConflicts,
  listShifts,
  publishShift,
  publishShifts,
  updateShift,
} = await import("../../src/server/services/shifts.js");

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

function clearTables(): void {
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

function seedBaseline(): {
  storeId: number;
  empA: number;
  empB: number;
  managerId: number;
} {
  db.insert(schema.stores)
    .values({
      id: 1,
      code: "suzumean",
      name: "雀庵",
      displayName: "雀庵",
      openingTime: "10:00",
      closingTime: "22:00",
      closedDays: null,
      createdAt: 0,
    })
    .run();

  const pinHash = bcrypt.hashSync("1234", 4);
  const insertEmp = (id: number, name: string, role: "staff" | "manager") =>
    db
      .insert(schema.employees)
      .values({
        id,
        name,
        kana: name,
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

  insertEmp(10, "Manager", "manager");
  insertEmp(11, "Alice", "staff");
  insertEmp(12, "Bob", "staff");

  return { storeId: 1, empA: 11, empB: 12, managerId: 10 };
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clearTables();
});

describe("shifts service - findConflicts", () => {
  it("returns empty when no overlap", () => {
    const { storeId, empA, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(findConflicts(empA, "2026-04-10", "14:00", "18:00")).toHaveLength(0);
  });

  it("detects overlapping window", () => {
    const { storeId, empA, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(findConflicts(empA, "2026-04-10", "13:00", "17:00")).toHaveLength(1);
  });

  it("treats touching boundaries as non-overlap", () => {
    const { storeId, empA, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(findConflicts(empA, "2026-04-10", "14:00", "18:00")).toHaveLength(0);
    expect(findConflicts(empA, "2026-04-10", "06:00", "10:00")).toHaveLength(0);
  });

  it("ignores other employees and other dates", () => {
    const { storeId, empA, empB, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(findConflicts(empB, "2026-04-10", "10:00", "14:00")).toHaveLength(0);
    expect(findConflicts(empA, "2026-04-11", "10:00", "14:00")).toHaveLength(0);
  });
});

describe("shifts service - createShift", () => {
  it("returns conflict when overlapping", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const ok = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(ok.kind).toBe("ok");

    const dup = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "12:00",
      end_time: "16:00",
      created_by: managerId,
    });
    expect(dup.kind).toBe("conflict");
  });

  it("creates draft and writes audit log", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const r = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "14:00",
      created_by: managerId,
    });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.shift.status).toBe("draft");
    const audits = db.select().from(schema.auditLogs).all();
    expect(audits.length).toBe(1);
    expect(audits[0]?.action).toBe("shift.create");
  });
});

describe("shifts service - updateShift", () => {
  it("rejects update that would conflict with sibling", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const a = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    const b = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "13:00",
      end_time: "16:00",
      created_by: managerId,
    });
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    if (b.kind !== "ok") return;
    const upd = updateShift(b.shift.id, { start_time: "11:00" }, managerId);
    expect(upd.kind).toBe("conflict");
  });

  it("allows updating itself without self-conflict", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const a = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    if (a.kind !== "ok") throw new Error("setup");
    const upd = updateShift(a.shift.id, { end_time: "13:00" }, managerId);
    expect(upd.kind).toBe("ok");
  });
});

describe("shifts service - publish", () => {
  it("publishShift flips draft -> published and audits", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const a = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    if (a.kind !== "ok") throw new Error("setup");
    const r = publishShift(a.shift.id, managerId);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.shift.status).toBe("published");
  });

  it("publishShifts publishes range", () => {
    const { storeId, empA, empB, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    createShift({
      employee_id: empB,
      store_id: storeId,
      date: "2026-04-11",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    const r = publishShifts(storeId, "2026-04-10", "2026-04-11", managerId);
    expect(r.published).toBe(2);
    const all = listShifts({ store_id: storeId });
    expect(all.every((s) => s.status === "published")).toBe(true);
  });
});

describe("shifts service - deleteShift", () => {
  it("only deletes drafts", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const a = createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    if (a.kind !== "ok") throw new Error("setup");
    publishShift(a.shift.id, managerId);
    const r = deleteShift(a.shift.id, managerId);
    expect(r.kind).toBe("invalid");
  });
});

describe("shifts service - detectConflicts", () => {
  it("flags days with no shifts as understaffed", () => {
    const { storeId, empA, managerId } = seedBaseline();
    createShift({
      employee_id: empA,
      store_id: storeId,
      date: "2026-04-10",
      start_time: "10:00",
      end_time: "12:00",
      created_by: managerId,
    });
    const report = detectConflicts(storeId, "2026-04-10", "2026-04-12");
    expect(report.understaffed.map((u) => u.date)).toEqual(["2026-04-11", "2026-04-12"]);
  });
});

describe("shift requests", () => {
  it("creates and stores", () => {
    const { empA } = seedBaseline();
    const r = createShiftRequest({
      employee_id: empA,
      date: "2026-04-15",
      preference: "preferred",
      start_time: "10:00",
      end_time: "16:00",
      note: "afternoon",
    });
    expect(r.id).toBeGreaterThan(0);
  });
});
