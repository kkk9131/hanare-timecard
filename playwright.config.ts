import { defineConfig, devices } from "@playwright/test";

/**
 * task-6003 Playwright config.
 *
 * - Boots the production server via `npm run start` (assumes `npm run build`
 *   was already executed; CI / local both rely on the same prebuilt artifact)
 * - Uses a dynamically-allocated PORT to avoid clashing with a local dev server
 * - Persists a trace on failure under `test-results/`
 * - Only chromium is required by the smoke spec (webkit / firefox skipped)
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;

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
    command: "npm run start",
    url: BASE_URL,
    env: {
      PORT: String(PORT),
      NODE_ENV: "production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
