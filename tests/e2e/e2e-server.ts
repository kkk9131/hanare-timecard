import { rmSync } from "node:fs";

const dbPath = process.env.HANARE_DB_PATH;

if (!dbPath) {
  throw new Error("HANARE_DB_PATH is required for E2E server startup");
}

for (const suffix of ["", "-wal", "-shm"]) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

const { runMigrations } = await import("../../scripts/migrate.js");
const { seedDatabase } = await import("../../scripts/seed.js");

runMigrations(dbPath);
seedDatabase(dbPath);

await import("../../src/server/index.js");
