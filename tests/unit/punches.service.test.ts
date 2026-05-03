import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyAllMigrations } from "../helpers/migrations.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-punches-service-"));
process.env.HANARE_DB_PATH = join(TMP_DIR, "punches-service.db");

const { db, schema } = await import("../../src/server/db/client.js");
const { listPunches } = await import("../../src/server/services/punches.js");

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

function ts(y: number, mo: number, d: number, h: number, m: number, s = 0, ms = 0): number {
  return new Date(y, mo - 1, d, h, m, s, ms).getTime();
}

beforeAll(() => {
  applyMigrations();
});

beforeEach(() => {
  clear();
});

describe("listPunches", () => {
  it("to は排他的境界として扱う", () => {
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
    db.insert(schema.timePunches)
      .values([
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_in",
          punchedAt: ts(2026, 5, 3, 23, 59, 59, 999),
          source: "kiosk",
          createdAt: now,
        },
        {
          employeeId: 10,
          storeId: 1,
          punchType: "clock_out",
          punchedAt: ts(2026, 5, 4, 0, 0, 0, 0),
          source: "kiosk",
          createdAt: now,
        },
      ])
      .run();

    const punches = listPunches({
      employee_id: 10,
      from: ts(2026, 5, 3, 0, 0),
      to: ts(2026, 5, 4, 0, 0, 0, 0),
    });

    expect(punches.map((p) => p.punched_at)).toEqual([ts(2026, 5, 3, 23, 59, 59, 999)]);
  });
});
