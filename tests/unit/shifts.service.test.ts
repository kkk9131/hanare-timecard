import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcrypt";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAllMigrations } from "../helpers/migrations.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-shifts-test-"));
const TMP_DB_PATH = join(TMP_DIR, "shifts-test.db");
process.env.HANARE_DB_PATH = TMP_DB_PATH;

const { db, schema } = await import("../../src/server/db/client.js");
const {
  autoDraftShiftsFromPeriod,
  createShift,
  createShiftPeriod,
  createShiftRequest,
  deleteShift,
  detectConflicts,
  findConflicts,
  listShifts,
  listShiftMonthlySettings,
  listShiftRequests,
  publishShift,
  publishShifts,
  updateShift,
  upsertShiftMonthlySettings,
} = await import("../../src/server/services/shifts.js");

function applyMigrations(): void {
  applyAllMigrations(db);
}

function clearTables(): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  const sqlite = (db as any).$client;
  sqlite.exec("DELETE FROM audit_logs");
  sqlite.exec("DELETE FROM shift_requests");
  sqlite.exec("DELETE FROM shift_requirement_slots");
  sqlite.exec("DELETE FROM shift_recruitment_periods");
  sqlite.exec("DELETE FROM shift_monthly_settings");
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
  db.insert(schema.employeeStores)
    .values([
      { employeeId: 10, storeId: 1, isPrimary: 1 },
      { employeeId: 11, storeId: 1, isPrimary: 1 },
      { employeeId: 12, storeId: 1, isPrimary: 1 },
    ])
    .run();

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
    expect("kind" in r).toBe(false);
    if ("kind" in r) return;
    expect(r.id).toBeGreaterThan(0);
  });

  it("replaces same-day period request with one row", () => {
    const { storeId, empA, managerId } = seedBaseline();
    const periodResult = createShiftPeriod({
      store_id: storeId,
      target_from: "2026-05-11",
      target_to: "2026-05-12",
      submission_from: "2026-05-01",
      submission_to: "2026-05-10",
      created_by: managerId,
    });
    expect(periodResult.kind).toBe("ok");
    if (periodResult.kind !== "ok") return;

    const first = createShiftRequest(
      {
        employee_id: empA,
        period_id: periodResult.period.id,
        date: "2026-05-11",
        preference: "preferred",
        start_time: "10:00",
        end_time: "14:00",
        note: "first",
      },
      Date.parse("2026-05-05T00:00:00Z"),
    );
    expect("kind" in first).toBe(false);
    if ("kind" in first) return;

    const second = createShiftRequest(
      {
        employee_id: empA,
        period_id: periodResult.period.id,
        date: "2026-05-11",
        preference: "unavailable",
        start_time: null,
        end_time: null,
        note: "changed",
      },
      Date.parse("2026-05-06T00:00:00Z"),
    );
    expect("kind" in second).toBe(false);
    if ("kind" in second) return;

    const requests = listShiftRequests({ period_id: periodResult.period.id });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.id).toBe(first.id);
    expect(requests[0]?.preference).toBe("unavailable");
    expect(requests[0]?.note).toBe("changed");

    // biome-ignore lint/suspicious/noExplicitAny: internal handle access for schema verification
    const indexes = (db as any).$client.pragma("index_list('shift_requests')") as Array<{
      name: string;
      unique: number;
    }>;
    expect(indexes.some((idx) => idx.name === "idx_shift_req_period_emp_date" && idx.unique)).toBe(
      true,
    );
  });
});

describe("shift recruitment periods", () => {
  it("returns conflict for overlapping open periods in the same store", () => {
    const { storeId, managerId } = seedBaseline();
    const first = createShiftPeriod({
      store_id: storeId,
      target_from: "2026-05-11",
      target_to: "2026-05-12",
      submission_from: "2026-05-01",
      submission_to: "2026-05-10",
      created_by: managerId,
    });
    expect(first.kind).toBe("ok");

    const overlapping = createShiftPeriod({
      store_id: storeId,
      target_from: "2026-05-12",
      target_to: "2026-05-13",
      submission_from: "2026-05-01",
      submission_to: "2026-05-10",
      created_by: managerId,
    });
    expect(overlapping.kind).toBe("conflict");
  });

  it("creates requirement slots and auto-drafts matching requests", () => {
    const { storeId, empA, empB, managerId } = seedBaseline();
    const periodResult = createShiftPeriod({
      store_id: storeId,
      target_from: "2026-05-11",
      target_to: "2026-05-12",
      submission_from: "2026-05-01",
      submission_to: "2026-05-10",
      created_by: managerId,
      rules: [
        {
          slot_name: "昼",
          start_time: "10:00",
          end_time: "14:00",
          required_count: 1,
          weekdays: [1, 2, 3, 4, 5],
        },
      ],
    });
    expect(periodResult.kind).toBe("ok");
    if (periodResult.kind !== "ok") return;
    expect(periodResult.slots.length).toBe(2);

    const a = createShiftRequest(
      {
        employee_id: empA,
        period_id: periodResult.period.id,
        date: "2026-05-11",
        preference: "preferred",
        start_time: "09:00",
        end_time: "15:00",
      },
      Date.parse("2026-05-05T00:00:00Z"),
    );
    const b = createShiftRequest(
      {
        employee_id: empB,
        period_id: periodResult.period.id,
        date: "2026-05-12",
        preference: "available",
        start_time: null,
        end_time: null,
      },
      Date.parse("2026-05-05T00:00:00Z"),
    );
    expect("kind" in a).toBe(false);
    expect("kind" in b).toBe(false);

    const drafted = autoDraftShiftsFromPeriod(periodResult.period.id, managerId);
    expect(drafted.kind).toBe("ok");
    if (drafted.kind !== "ok") return;
    expect(drafted.created).toHaveLength(2);
    expect(drafted.unfilled_slots).toHaveLength(0);
  });

  it("uses store monthly settings when creating a period without inline rules", () => {
    const { storeId, managerId } = seedBaseline();
    const saved = upsertShiftMonthlySettings(
      storeId,
      [
        {
          month: 5,
          slot_name: "月次枠",
          weekday_required_count: 2,
          holiday_required_count: 3,
          busy_required_count: 5,
          busy_from_day: 12,
          busy_to_day: 12,
        },
      ],
      managerId,
    );
    expect(saved.kind).toBe("ok");
    expect(
      listShiftMonthlySettings(storeId).find((s) => s.month === 5)?.weekday_required_count,
    ).toBe(2);

    const periodResult = createShiftPeriod({
      store_id: storeId,
      target_from: "2026-05-11",
      target_to: "2026-05-12",
      submission_from: "2026-05-01",
      submission_to: "2026-05-10",
      created_by: managerId,
    });
    expect(periodResult.kind).toBe("ok");
    if (periodResult.kind !== "ok") return;
    expect(periodResult.slots.map((s) => s.required_count)).toEqual([2, 5]);
    expect(periodResult.slots[0]?.start_time).toBe("10:00");
    expect(periodResult.slots[0]?.end_time).toBe("22:00");
  });
});
