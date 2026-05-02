import { stat } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { disableAdminOnboarding } from "./helpers";

/**
 * task-6003 — E2E smoke (Playwright / chromium).
 *
 * Walks the 10 primary steps required by the verify ticket against a real
 * Hono server booted by `playwright.config.ts` (`webServer`) and the seeded
 * SQLite DB (`oyakata/hanare2026`, 雀庵, 氏名選択打刻 / 管理者ログイン).
 *
 * Steps:
 *   1. K01 open → tile visible
 *   2. K01 select staff tile (山田 太郎 / 1001)
 *   3. K01 からそのまま K03
 *   4. K03 出勤する → confirm → K04
 *   5. K04 → auto-back to K01
 *   6. K01 same staff → そのまま K03
 *   7. K03 退勤する → confirm → K04
 *   8. トップ画面から管理者ログイン画面へ → oyakata / hanare2026 → /admin dashboard
 *   9. dashboard 「現在勤務中の従業員」 KPI visible
 *  10. /admin/exports → 「今月をエクスポート」 → download capture (.xlsx, size > 0)
 */

const STAFF_NAME = "山田 太郎";
const ADMIN_LOGIN_ID = "oyakata";
const ADMIN_PASSWORD = "hanare2026";

test.describe("task-6003 smoke", () => {
  test("kiosk punch in/out + admin login + export download", async ({ page, context }) => {
    test.setTimeout(120_000);

    // ---- Step 1: K01 open ----
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /お疲れさまです/ })).toBeVisible();
    const staffTile = page.getByRole("button", {
      name: new RegExp(`${STAFF_NAME}`),
    });
    await expect(staffTile.first()).toBeVisible();

    // ---- Step 2: K01 select staff tile ----
    await staffTile.first().click();

    // ---- Step 3: K01 からそのまま K03 ----
    await expect(page).toHaveURL(/\/punch\/board$/, { timeout: 10_000 });

    // ---- Step 4: 出勤する → confirm → K04 ----
    const clockInBtn = page.getByRole("button", { name: "出勤する" });
    await expect(clockInBtn).toBeEnabled({ timeout: 10_000 });
    await clockInBtn.click();
    // confirm dialog
    await expect(page.getByRole("dialog", { name: "確認" })).toBeVisible();
    await page.getByRole("button", { name: "はい、記録します" }).click();
    await expect(page).toHaveURL(/\/punch\/done$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /記録しました/ })).toBeVisible();

    // ---- Step 5: K04 → auto-back to K01 ----
    await expect(page).toHaveURL(/\/$|\/$/, { timeout: 15_000 });
    // confirm we landed back at the kiosk top
    await page.waitForURL("**/", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /お疲れさまです/ })).toBeVisible();

    // ---- Step 6: K01 → same staff → K03 ----
    await page
      .getByRole("button", { name: new RegExp(STAFF_NAME) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/punch\/board$/, { timeout: 10_000 });

    // ---- Step 7: 退勤する → confirm → K04 ----
    const clockOutBtn = page.getByRole("button", { name: "退勤する" });
    await expect(clockOutBtn).toBeEnabled({ timeout: 10_000 });
    await clockOutBtn.click();
    await expect(page.getByRole("dialog", { name: "確認" })).toBeVisible();
    await page.getByRole("button", { name: "はい、記録します" }).click();
    await expect(page).toHaveURL(/\/punch\/done$/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: /記録しました/ })).toBeVisible();

    // wait for auto-logout to land back on K01 before switching contexts
    await page.waitForURL("**/", { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /お疲れさまです/ })).toBeVisible();

    // ---- Step 8: トップ画面から /admin/login ----
    const browser = context.browser();
    if (!browser) {
      throw new Error("browser context is not available");
    }
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await disableAdminOnboarding(adminPage);
    await adminPage.goto("/");
    await adminPage.getByRole("button", { name: "管理者画面へ" }).click();
    await expect(adminPage.getByRole("heading", { name: /雀庵 管理画面/ })).toBeVisible();
    await adminPage.locator('input[name="login_id"]').fill(ADMIN_LOGIN_ID);
    await adminPage.locator('input[name="password"]').fill(ADMIN_PASSWORD);
    await adminPage.getByRole("button", { name: "管理者ログイン" }).click();
    await expect(adminPage).toHaveURL(/\/admin$/, { timeout: 15_000 });

    // ---- Step 9: dashboard KPI visible ----
    // The dashboard renders KPI tiles; assert at least one expected label
    // ("現在勤務中" or similar) is on the page.
    await expect(
      adminPage.getByText(/現在.*勤務中|勤務中.*従業員|本日の打刻/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });

    // ---- Step 10: /admin/exports → 今月をエクスポート → download capture ----
    await adminPage.goto("/admin/exports");
    await expect(adminPage.getByRole("heading", { name: /勤怠を巻き取る/ })).toBeVisible();

    const downloadPromise = adminPage.waitForEvent("download", {
      timeout: 30_000,
    });
    await adminPage.getByRole("button", { name: "今月分の勤怠をxlsxでダウンロード" }).click();
    const download = await downloadPromise;

    const suggested = download.suggestedFilename();
    expect(suggested).toMatch(/\.xlsx$/);

    const savedPath = await download.path();
    expect(savedPath).toBeTruthy();
    if (!savedPath) {
      throw new Error("download path was not resolved");
    }
    const fileStat = await stat(savedPath);
    expect(fileStat.size).toBeGreaterThan(0);

    await adminContext.close();
  });
});
