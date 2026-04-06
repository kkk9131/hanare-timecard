import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import bcrypt from "bcrypt";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-corrections-test-"));
const TMP_DB_PATH = join(TMP_DIR, "corrections-test.db");
process.env.HANARE_DB_PATH = TMP_DB_PATH;

const { db, schema } = await import("../../src/server/db/client.js");
const {
  approveCorrection,
  createCorrection,
  listCorrections,
  rejectCorrection,
} = await import("../../src/server/services/corrections.js");
const { createPunch } = await import("../../src/server/services/punches.js");

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
  sqlite.exec("DELETE FROM correction_requests");
  sqlite.exec("DELETE FROM time_punches");
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM sessions");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

function seed(): { storeId: number; staffId: number; managerId: number } {
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

  db.insert(schema.employeeStores)
    .values({ employeeId: 11, storeId: 1, isPrimary: 1 })
    .run();
  db.insert(schema.employeeStores)
    .values({ employeeId: 10, storeId: 1, isPrimary: 1 })
    .run();

  return { storeId: 1, staffId: 11, managerId: 10 };
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clearTables();
});

describe("corrections service - createCorrection", () => {
  it("creates a pending correction without target punch", () => {
    const { staffId } = seed();
    const result = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-01",
      requested_value: new Date(2026, 3, 1, 10, 0, 0).getTime(),
      requested_type: "clock_in",
      reason: "打刻漏れ",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.correction.status).toBe("pending");
    expect(result.correction.employee_id).toBe(staffId);
  });

  it("returns forbidden when target punch belongs to another employee", () => {
    const { storeId, staffId, managerId } = seed();
    const punch = createPunch({
      employee_id: managerId,
      store_id: storeId,
      punch_type: "clock_in",
      now: new Date(2026, 3, 1, 9, 0, 0).getTime(),
    });
    if (punch.kind !== "ok") throw new Error("setup failed");
    const result = createCorrection({
      employee_id: staffId,
      target_punch_id: punch.punch.id,
      target_date: "2026-04-01",
      requested_value: new Date(2026, 3, 1, 10, 0, 0).getTime(),
      reason: "...",
    });
    expect(result.kind).toBe("forbidden");
  });
});

describe("corrections service - approveCorrection", () => {
  it("updates the target punch and writes audit before/after", () => {
    const { storeId, staffId, managerId } = seed();
    const original = createPunch({
      employee_id: staffId,
      store_id: storeId,
      punch_type: "clock_in",
      now: new Date(2026, 3, 1, 9, 5, 0).getTime(),
    });
    if (original.kind !== "ok") throw new Error("setup failed");

    const newPunchedAt = new Date(2026, 3, 1, 9, 0, 0).getTime();
    const created = createCorrection({
      employee_id: staffId,
      target_punch_id: original.punch.id,
      target_date: "2026-04-01",
      requested_value: newPunchedAt,
      reason: "5 分早く出勤していた",
    });
    if (created.kind !== "ok") throw new Error("create failed");

    const result = approveCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
      comment: "確認しました",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.correction.status).toBe("approved");
    expect(result.correction.reviewer_id).toBe(managerId);
    expect(result.correction.reviewed_at).not.toBeNull();

    // punch row was updated
    const updatedPunch = db
      .select()
      .from(schema.timePunches)
      .all()
      .find((p) => p.id === original.punch.id);
    expect(updatedPunch?.punchedAt).toBe(newPunchedAt);
    expect(updatedPunch?.source).toBe("correction");

    // audit_logs has before/after
    const logs = db.select().from(schema.auditLogs).all();
    expect(logs.length).toBe(1);
    const log = logs[0];
    expect(log.action).toBe("correction.approve");
    expect(log.beforeJson).not.toBeNull();
    expect(log.afterJson).not.toBeNull();
    const before = JSON.parse(log.beforeJson ?? "{}");
    const after = JSON.parse(log.afterJson ?? "{}");
    expect(before.punched_at).toBe(original.punch.punched_at);
    expect(after.punched_at).toBe(newPunchedAt);
  });

  it("inserts a new punch when target_punch_id is null (打刻漏れ)", () => {
    const { staffId, managerId } = seed();
    const requested = new Date(2026, 3, 2, 10, 0, 0).getTime();
    const created = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-02",
      requested_value: requested,
      requested_type: "clock_in",
      reason: "出勤打刻を忘れました",
    });
    if (created.kind !== "ok") throw new Error("create failed");

    const result = approveCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
    });
    expect(result.kind).toBe("ok");

    const punches = db.select().from(schema.timePunches).all();
    expect(punches).toHaveLength(1);
    expect(punches[0].punchedAt).toBe(requested);
    expect(punches[0].source).toBe("correction");
    expect(punches[0].punchType).toBe("clock_in");

    const logs = db.select().from(schema.auditLogs).all();
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("correction.approve");
    expect(logs[0].beforeJson).toBeNull();
    expect(logs[0].afterJson).not.toBeNull();
  });

  it("rejects double approval (invalid_state)", () => {
    const { staffId, managerId } = seed();
    const created = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-02",
      requested_value: Date.now(),
      requested_type: "clock_in",
      reason: "x",
    });
    if (created.kind !== "ok") throw new Error("create failed");

    approveCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
    });
    const second = approveCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
    });
    expect(second.kind).toBe("invalid_state");
  });
});

describe("corrections service - rejectCorrection", () => {
  it("transitions to rejected and stores the comment", () => {
    const { staffId, managerId } = seed();
    const created = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-02",
      requested_value: Date.now(),
      requested_type: "clock_in",
      reason: "x",
    });
    if (created.kind !== "ok") throw new Error("create failed");

    const result = rejectCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
      comment: "理由が不十分です",
    });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.correction.status).toBe("rejected");
    expect(result.correction.review_comment).toBe("理由が不十分です");
    expect(result.correction.reviewer_id).toBe(managerId);

    // No punch was inserted
    const punches = db.select().from(schema.timePunches).all();
    expect(punches).toHaveLength(0);

    // audit_logs row exists
    const logs = db.select().from(schema.auditLogs).all();
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("correction.reject");
  });

  it("cannot reject a non-pending correction", () => {
    const { staffId, managerId } = seed();
    const created = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-02",
      requested_value: Date.now(),
      requested_type: "clock_in",
      reason: "x",
    });
    if (created.kind !== "ok") throw new Error("create failed");
    rejectCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
      comment: "却下",
    });
    const second = rejectCorrection({
      correction_id: created.correction.id,
      reviewer_id: managerId,
      comment: "もう一度",
    });
    expect(second.kind).toBe("invalid_state");
  });
});

describe("corrections service - listCorrections", () => {
  it("filters by status", () => {
    const { staffId, managerId } = seed();
    const a = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-01",
      requested_value: Date.now(),
      requested_type: "clock_in",
      reason: "1",
    });
    const b = createCorrection({
      employee_id: staffId,
      target_date: "2026-04-02",
      requested_value: Date.now(),
      requested_type: "clock_in",
      reason: "2",
    });
    if (a.kind !== "ok" || b.kind !== "ok") throw new Error("setup failed");
    rejectCorrection({
      correction_id: a.correction.id,
      reviewer_id: managerId,
      comment: "却下",
    });
    expect(listCorrections({ status: "pending" })).toHaveLength(1);
    expect(listCorrections({ status: "rejected" })).toHaveLength(1);
  });
});
