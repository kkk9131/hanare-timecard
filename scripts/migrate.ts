import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSqlite, resolveDbPath } from "../src/server/db/client.js";

const DRIZZLE_DIR = resolve("drizzle");

function ensureMigrationsTable(db: ReturnType<typeof createSqlite>): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )`,
  );
}

function listMigrationFiles(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(DRIZZLE_DIR);
  } catch {
    return [];
  }
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

function splitStatements(sql: string): string[] {
  // drizzle-kit uses '--> statement-breakpoint' between statements.
  return sql
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function runMigrations(dbPath?: string): void {
  const resolvedPath = dbPath ?? resolveDbPath();
  console.log(`[migrate] db = ${resolvedPath}`);
  const db = createSqlite(resolvedPath);
  try {
    ensureMigrationsTable(db);
    const applied = new Set(
      (
        db.prepare("SELECT name FROM __drizzle_migrations").all() as Array<{
          name: string;
        }>
      ).map((r) => r.name),
    );

    const files = listMigrationFiles();
    if (files.length === 0) {
      console.log("[migrate] no migration files found in drizzle/");
      return;
    }

    const insertApplied = db.prepare(
      "INSERT INTO __drizzle_migrations (name, applied_at) VALUES (?, ?)",
    );

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const fullPath = resolve(DRIZZLE_DIR, file);
      const sql = readFileSync(fullPath, "utf8");
      const statements = splitStatements(sql);
      const tx = db.transaction(() => {
        for (const stmt of statements) {
          db.exec(stmt);
        }
        insertApplied.run(file, Date.now());
      });
      tx();
      console.log(`[migrate] applied ${file} (${statements.length} stmts)`);
      appliedCount += 1;
    }
    console.log(`[migrate] done. applied=${appliedCount} total=${files.length}`);
  } finally {
    db.close();
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return entry ? import.meta.url === pathToFileURL(entry).href : false;
}

if (isDirectRun()) {
  runMigrations();
}
