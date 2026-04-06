import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";

/**
 * task-6003 — E2E smoke (Playwright / chromium).
 *
 * Walks the 10 primary steps required by the verify ticket against a real
 * Hono server booted by `playwright.config.ts` (`webServer`) and the seeded
 * SQLite DB (`oyakata/hanare2026`, 雀庵, staff PIN 1001 / admin PIN 9999).
 *
 * Steps:
 *   1. K01 open → tile visible
 *   2. K01 select staff tile (山田 太郎 / 1001)
 *   3. K02 PIN entry → K03
 *   4. K03 出勤する → confirm → K04
 *   5. K04 → auto-back to K01
 *   6. K01 same staff → PIN → K03
 *   7. K03 退勤する → confirm → K04
 *   8. /admin/login → oyakata / hanare2026 → /admin dashboard
 *   9. dashboard 「現在勤務中の従業員」 KPI visible
 *  10. /admin/exports → 「今月をエクスポート」 → download capture (.xlsx, size > 0)
 */

const STAFF_NAME = "山田 太郎";
const STAFF_PIN = "1001";
const ADMIN_LOGIN_ID = "oyakata";
const ADMIN_PASSWORD = "hanare2026";

async function enterPin(page: import("@playwright/test").Page, pin: string) {
  for (const ch of pin) {
    await page.getByRole("button", { name: `数字 ${ch}` }).click();
  }
  await page.getByRole("button", { name: "決定" }).click();
}

test.describe("task-6003 smoke", () => {
  test("kiosk punch in/out + admin login + export download", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);

    // ---- Step 1: K01 open ----
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /ようこそ、雀庵へ/ }),
    ).toBeVisible();
    const staffTile = page.getByRole("button", {
      name: new RegExp(`${STAFF_NAME}`),
    });
    await expect(staffTile.first()).toBeVisible();

    // ---- Step 2: K01 select staff tile ----
    await staffTile.first().click();

    // ---- Step 3: K02 PIN entry → K03 ----
    await expect(page).toHaveURL(/\/punch\/pin$/);
    await expect(
      page.getByRole("heading", { name: new RegExp(STAFF_NAME) }),
    ).toBeVisible();
    await enterPin(page, STAFF_PIN);
    await expect(page).toHaveURL(/\/punch\/board$/, { timeout: 10_000 });

    // ---- Step 4: 出勤する → confirm → K04 ----
    const clockInBtn = page.getByRole("button", { name: "出勤する" });
    await expect(clockInBtn).toBeEnabled({ timeout: 10_000 });
    await clockInBtn.click();
    // confirm dialog
    await expect(page.getByRole("dialog", { name: "確認" })).toBeVisible();
    await page.getByRole("button", { name: "はい、記録します" }).click();
    await expect(page).toHaveURL(/\/punch\/done$/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /記録しました/ }),
    ).toBeVisible();

    // ---- Step 5: K04 → auto-back to K01 ----
    await expect(page).toHaveURL(/\/$|\/$/, { timeout: 15_000 });
    // confirm we landed back at the kiosk top
    await page.waitForURL("**/", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /ようこそ、雀庵へ/ }),
    ).toBeVisible();

    // ---- Step 6: K01 → same staff → PIN → K03 ----
    await page
      .getByRole("button", { name: new RegExp(STAFF_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/punch\/pin$/);
    await enterPin(page, STAFF_PIN);
    await expect(page).toHaveURL(/\/punch\/board$/, { timeout: 10_000 });

    // ---- Step 7: 退勤する → confirm → K04 ----
    const clockOutBtn = page.getByRole("button", { name: "退勤する" });
    await expect(clockOutBtn).toBeEnabled({ timeout: 10_000 });
    await clockOutBtn.click();
    await expect(page.getByRole("dialog", { name: "確認" })).toBeVisible();
    await page.getByRole("button", { name: "はい、記録します" }).click();
    await expect(page).toHaveURL(/\/punch\/done$/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: /記録しました/ }),
    ).toBeVisible();

    // wait for auto-logout to land back on K01 before switching contexts
    await page.waitForURL("**/", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: /ようこそ、雀庵へ/ }),
    ).toBeVisible();

    // ---- Step 8: /admin/login (use a fresh context to isolate session cookies) ----
    const adminContext = await context.browser()!.newContext();
    const adminPage = await adminContext.newPage();
    await adminPage.goto("/admin/login");
    await expect(
      adminPage.getByRole("heading", { name: /雀庵 管理画面/ }),
    ).toBeVisible();
    await adminPage.locator('input[name="login_id"]').fill(ADMIN_LOGIN_ID);
    await adminPage.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "管理者ログイン" }).click();
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });

    // ---- Step 9: dashboard KPI visible ----
    // The dashboard renders KPI tiles; assert at least one expected label
    // ("現在勤務中" or similar) is on the page.
    await expect(
      adminPage.getByText(/現在.*勤務中|勤務中.*従業員|本日の打刻/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // ---- Step 10: /admin/exports → 今月をエクスポート → download capture ----
    await adminPage.goto("/admin/exports");
    await expect(
      adminPage.getByRole("heading", { name: /勤怠を巻き取る/ }),
    ).toBeVisible();

    const downloadPromise = adminPage.waitForEvent("download", {
      timeout: 30_000,
    });
    await adminPage
      .getByRole("button", { name: "今月分の勤怠をxlsxでダウンロード" })
      .click();
    const download = await downloadPromise;

    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/\.xlsx$/);

    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    const fileStat = await stat(savedPath!);
    expect(fileStat.size).toBeGreaterThan(0);

    await adminContext.close();
  });
});
