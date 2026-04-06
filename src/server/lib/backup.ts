import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { resolveDbPath } from "../db/client.js";

export const MAX_GENERATIONS = 30;

function timestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `-${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
}

export interface BackupResult {
  backupPath: string;
  removed: string[];
  totalRetained: number;
}

/**
 * SQLite DB のバックアップを `data/backups/hanare-YYYYMMDD-HHmmss.db` に作成し、
 * 直近 MAX_GENERATIONS 世代を残して古いファイルを削除する。
 */
export function runBackup(dbPath: string = resolveDbPath()): BackupResult {
  const resolved = resolve(dbPath);
  if (!existsSync(resolved)) {
    throw new Error(`[backup] DB ファイルが存在しません: ${resolved}`);
  }

  const dataDir = dirname(resolved);
  const backupsDir = join(dataDir, "backups");
  mkdirSync(backupsDir, { recursive: true });

  const ts = timestamp();
  const backupPath = join(backupsDir, `hanare-${ts}.db`);

  // VACUUM INTO はチェックポイント済みの一貫したコピーを作成する
  const sqlite = new Database(resolved, { readonly: false });
  try {
    sqlite.pragma("journal_mode = WAL");
    // WAL を main DB に反映してからコピーする
    sqlite.pragma("wal_checkpoint(TRUNCATE)");
    // 絶対パスを SQL リテラル化（シングルクォートをエスケープ）
    const escaped = backupPath.replace(/'/g, "''");
    sqlite.exec(`VACUUM INTO '${escaped}'`);
  } finally {
    sqlite.close();
  }

  console.log(`[backup] created ${backupPath}`);

  // 30 世代を超える古いファイルを削除
  const entries = readdirSync(backupsDir)
    .filter((f) => /^hanare-\d{8}-\d{6}\.db$/.test(f))
    .map((f) => {
      const full = join(backupsDir, f);
      return { full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const removed: string[] = [];
  if (entries.length > MAX_GENERATIONS) {
    for (const entry of entries.slice(MAX_GENERATIONS)) {
      unlinkSync(entry.full);
      removed.push(entry.full);
      console.log(`[backup] removed old ${entry.full}`);
    }
  }

  const totalRetained = Math.min(entries.length, MAX_GENERATIONS);
  console.log(`[backup] done. retained=${totalRetained} removed=${removed.length}`);

  return { backupPath, removed, totalRetained };
}
