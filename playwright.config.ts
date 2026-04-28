import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * task-6003 Playwright config.
 *
 * - Boots an E2E-only server that migrates and seeds a temporary SQLite DB
 *   before starting the app, so smoke tests never mutate the local/prod DB.
 * - Uses a dynamically-allocated PORT to avoid clashing with a local dev server
 * - Persists a trace on failure under `test-results/`
 * - Only chromium is required by the smoke spec (webkit / firefox skipped)
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const E2E_DB_DIR = process.env.HANARE_E2E_DB_DIR ?? mkdtempSync(join(tmpdir(), "hanare-e2e-"));
const E2E_DB_PATH = process.env.HANARE_E2E_DB_PATH ?? join(E2E_DB_DIR, "hanare.db");

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "test-results/",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "tsx tests/e2e/e2e-server.ts",
    url: BASE_URL,
    env: {
      HANARE_DB_PATH: E2E_DB_PATH,
      PORT: String(PORT),
      NODE_ENV: "production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
