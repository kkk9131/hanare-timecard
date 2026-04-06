import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export function resolveDbPath(): string {
  return resolve(process.env.HANARE_DB_PATH ?? "data/hanare.db");
}

export function createSqlite(dbPath: string = resolveDbPath()): Database.Database {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

const sqlite = createSqlite();
export const db = drizzle(sqlite, { schema });
export { schema };
export type DB = typeof db;
