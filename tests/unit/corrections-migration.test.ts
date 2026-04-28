import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";

const TMP_DIR = mkdtempSync(join(tmpdir(), "hanare-correction-migration-"));
const DB_PATH = join(TMP_DIR, "migration.db");

function splitStatements(sql: string): string[] {
  return sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function applyMigration(db: Database.Database, file: string): void {
  const sql = readFileSync(resolve("drizzle", file), "utf8");
  for (const stmt of splitStatements(sql)) {
    db.exec(stmt);
  }
}

describe("correction_requests store_id migration", () => {
  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("backfills store_id from target punch or employee primary store", () => {
    const db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");
    try {
      applyMigration(db, "0000_init.sql");
      applyMigration(db, "0001_rename_jakuan_to_suzumean.sql");
      applyMigration(db, "0002_normalize_legacy_suzumean_codes.sql");
      applyMigration(db, "0003_normalize_store_labels.sql");

      db.exec(`
        INSERT INTO stores
          (id, code, name, display_name, opening_time, closing_time, closed_days, created_at)
        VALUES
          (1, 'suzumean', '雀庵', '雀庵', '10:00', '22:00', NULL, 0),
          (2, 'hanare', '雀庵 離れ', '雀庵 離れ', '10:00', '22:00', NULL, 0);

        INSERT INTO employees
          (id, name, kana, role, login_id, password_hash, pin_hash, hourly_wage, hire_date,
           retire_date, pin_fail_count, lock_until, note, created_at, updated_at)
        VALUES
          (11, 'Alice', 'Alice', 'staff', NULL, NULL, 'hash', 1000, '2024-01-01',
           NULL, 0, NULL, NULL, 0, 0);

        INSERT INTO employee_stores (employee_id, store_id, is_primary)
        VALUES (11, 1, 0), (11, 2, 1);

        INSERT INTO time_punches
          (id, employee_id, store_id, punch_type, punched_at, source, note, created_at)
        VALUES
          (101, 11, 1, 'clock_in', 1775000000000, 'kiosk', NULL, 0);

        INSERT INTO correction_requests
          (id, employee_id, target_punch_id, target_date, requested_value, requested_type,
           reason, status, reviewer_id, reviewed_at, review_comment, created_at)
        VALUES
          (201, 11, 101, '2026-04-01', 1775000000000, 'clock_in',
           '既存打刻の修正', 'pending', NULL, NULL, NULL, 0),
          (202, 11, NULL, '2026-04-02', 1775086400000, 'clock_in',
           '新規打刻申請', 'pending', NULL, NULL, NULL, 1);
      `);

      applyMigration(db, "0004_add_correction_store_id.sql");

      const rows = db
        .prepare("SELECT id, store_id FROM correction_requests ORDER BY id")
        .all() as Array<{ id: number; store_id: number }>;

      expect(rows).toEqual([
        { id: 201, store_id: 1 },
        { id: 202, store_id: 2 },
      ]);
    } finally {
      db.close();
    }
  });
});
