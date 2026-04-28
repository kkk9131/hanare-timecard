import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function applyAllMigrations(db: unknown): void {
  const sqlite = db as { $client: { exec: (sql: string) => void } };
  const migrationDir = resolve("drizzle");
  const files = readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(resolve(migrationDir, file), "utf8");
    const statements = sql
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      sqlite.$client.exec(stmt);
    }
  }
}
