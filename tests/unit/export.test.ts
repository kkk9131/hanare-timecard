/**
 * task-4006: export service unit test.
 *
 * - buildPeriodSummary が punches を集計し、手計算と一致することを確認
 * - toCsv が UTF-8 BOM + CRLF を含むこと
 * - toXlsx が xlsx の magic bytes (PK) を含む Buffer を返すこと
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAllMigrations } from "../helpers/migrations.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-export-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "export.db");

const { db, schema } = await import("../../src/server/db/client.js");
const { buildPeriodSummary, toCsv, toXlsx } = await import("../../src/server/services/exports.js");

function applyMigrations(): void {
  applyAllMigrations(db);
}

function clear(): void {
  // biome-ignore lint/suspicious/noExplicitAny: internal handle access for tests
  const sqlite = (db as any).$client;
  sqlite.exec("DELETE FROM time_punches");
  sqlite.exec("DELETE FROM employee_stores");
  sqlite.exec("DELETE FROM employees");
  sqlite.exec("DELETE FROM stores");
}

function ts(y: number, mo: number, d: number, h: number, m: number): number {
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clear();
});

describe("buildPeriodSummary", () => {
  it("従業員 1 名 1 日分の集計を生成する (手計算と一致)", () => {
    const now = Date.now();
    db.insert(schema.stores)
      .values({
        id: 1,
        code: "suzumean",
        name: "雀庵",
        displayName: "雀庵",
        openingTime: "10:00",
        closingTime: "22:00",
        createdAt: now,
      })
      .run();
    db.insert(schema.employees)
      .values({
        id: 10,
        name: "山田 太郎",
        kana: "ヤマダタロウ",
        role: "staff",
        pinHash: "x",
        hireDate: "2026-01-01",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.employeeStores).values({ employeeId: 10, storeId: 1, isPrimary: 1 }).run();

    // 2026-04-05 10:00 出勤, 12:00 休憩開始, 13:00 休憩終了, 19:30 退勤
    // 実働 = (19:30-10:00) - 1h = 9.5h - 1h = 8h30m = 510 分
    // 休憩 = 60 分
    // 残業 = 510 - 480 = 30 分
    // 深夜 = 0
    db.insert(schema.timePunches)
      .values([
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_in",
          punchedAt: ts(2026, 4, 5, 10, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 10,
          storeId: 1,
          punchType: "break_start",
          punchedAt: ts(2026, 4, 5, 12, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 10,
          storeId: 1,
          punchType: "break_end",
          punchedAt: ts(2026, 4, 5, 13, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_out",
          punchedAt: ts(2026, 4, 5, 19, 30),
          source: "kiosk",
          createdAt: now,
        },
      ])
      .run();

    const rows = buildPeriodSummary({
      from: "2026-04-01",
      to: "2026-04-30",
      store_id: 1,
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.store_name).toBe("雀庵");
    expect(r.employee_id).toBe(10);
    expect(r.employee_name).toBe("山田 太郎");
    expect(r.date).toBe("2026-04-05");
    expect(r.clock_in).toBe("10:00");
    expect(r.clock_out).toBe("19:30");
    expect(r.break_minutes).toBe(60);
    expect(r.worked_minutes).toBe(510);
    expect(r.worked_hhmm).toBe("8:30");
    expect(r.overtime_minutes).toBe(30);
    expect(r.night_minutes).toBe(0);
    expect(r.modified).toBe(false);
  });

  it("store_id 省略時は全店舗の行を返す", () => {
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
          createdAt: now,
        },
        {
          id: 2,
          code: "hanare",
          name: "雀庵 離れ",
          displayName: "雀庵 離れ",
          openingTime: "10:00",
          closingTime: "22:00",
          createdAt: now,
        },
      ])
      .run();
    db.insert(schema.employees)
      .values([
        {
          id: 10,
          name: "A",
          kana: "エー",
          role: "staff",
          pinHash: "x",
          hireDate: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 11,
          name: "B",
          kana: "ビー",
          role: "staff",
          pinHash: "x",
          hireDate: "2026-01-01",
          createdAt: now,
          updatedAt: now,
        },
      ])
      .run();
    db.insert(schema.employeeStores)
      .values([
        { employeeId: 10, storeId: 1, isPrimary: 1 },
        { employeeId: 11, storeId: 2, isPrimary: 1 },
      ])
      .run();
    db.insert(schema.timePunches)
      .values([
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_in",
          punchedAt: ts(2026, 4, 5, 10, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_out",
          punchedAt: ts(2026, 4, 5, 18, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 11,
          storeId: 2,
          punchType: "clock_in",
          punchedAt: ts(2026, 4, 5, 11, 0),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 11,
          storeId: 2,
          punchType: "clock_out",
          punchedAt: ts(2026, 4, 5, 19, 0),
          source: "kiosk",
          createdAt: now,
        },
      ])
      .run();

    const rows = buildPeriodSummary({ from: "2026-04-01", to: "2026-04-30" });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.store_id)).toEqual([1, 2]);
  });
});

describe("toCsv", () => {
  it("UTF-8 BOM + CRLF + ヘッダーを含む", () => {
    const csv = toCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("店舗");
    expect(csv).toContain("実働(分)");
  });

  it("カンマやダブルクォートをエスケープする", () => {
    const csv = toCsv([
      {
        store_id: 1,
        store_name: "雀, 庵",
        employee_id: 1,
        employee_name: 'A "B"',
        date: "2026-04-05",
        clock_in: "10:00",
        clock_out: "18:00",
        break_minutes: 0,
        worked_minutes: 480,
        worked_hhmm: "8:00",
        overtime_minutes: 0,
        night_minutes: 0,
        modified: false,
        note: "",
      },
    ]);
    expect(csv).toContain('"雀, 庵"');
    expect(csv).toContain('"A ""B"""');
  });
});

describe("toXlsx", () => {
  it("xlsx (zip PK) Buffer を返す", async () => {
    const buf = await toXlsx([
      {
        store_id: 1,
        store_name: "雀庵",
        employee_id: 1,
        employee_name: "山田",
        date: "2026-04-05",
        clock_in: "10:00",
        clock_out: "18:30",
        break_minutes: 60,
        worked_minutes: 450,
        worked_hhmm: "7:30",
        overtime_minutes: 0,
        night_minutes: 0,
        modified: false,
        note: "",
      },
    ]);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(100);
    // xlsx は zip フォーマット → magic bytes "PK\x03\x04"
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
