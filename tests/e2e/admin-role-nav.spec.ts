import { expect, type Page, test } from "@playwright/test";
import { disableAdminOnboarding } from "./helpers";

const ADMIN = { loginId: "oyakata", password: "hanare2026" };
const MANAGER = { loginId: "suzumean_mgr", password: "suzumean2026" };

async function adminLogin(page: Page, account: { loginId: string; password: string }) {
  await disableAdminOnboarding(page);
  await page.goto("/admin/login");
  await page.locator('input[name="login_id"]').fill(account.loginId);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: "管理者ログイン" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
}

test.describe("task-7006 admin role navigation", () => {
  test("manager sees only manager-permitted admin navigation", async ({ page }) => {
    await adminLogin(page, MANAGER);

    const nav = page.getByRole("navigation", { name: "管理メニュー" });
    await expect(nav.getByRole("link", { name: "ダッシュボード", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "シフト", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "修正申請", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "従業員", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "店舗", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "エクスポート", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "監査ログ", exact: true })).toHaveCount(0);

    await expect(page.getByRole("link", { name: /今すぐエクスポート/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /従業員マスタ/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /監査ログ/ })).toHaveCount(0);
  });

  test("admin sees every admin navigation item", async ({ page }) => {
    await adminLogin(page, ADMIN);

    const nav = page.getByRole("navigation", { name: "管理メニュー" });
    await expect(nav.getByRole("link", { name: "ダッシュボード", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "シフト", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "修正申請", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "従業員", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "店舗", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "エクスポート", exact: true })).toBeVisible();
    await expect(nav.getByRole("link", { name: "監査ログ", exact: true })).toBeVisible();
  });

  test("forbidden admin-only routes show 403 guidance instead of login", async ({ page }) => {
    await adminLogin(page, MANAGER);

    await page.goto("/admin/exports");
    await expect(page).toHaveURL(/\/admin\/exports$/);
    await expect(page.getByRole("heading", { level: 2, name: "権限がありません" })).toBeVisible();
    await expect(page.getByText("この画面を開く権限がありません")).toBeVisible();
    await expect(page.getByRole("link", { name: "管理ダッシュボードへ戻る" })).toBeVisible();
    await expect(page).not.toHaveURL(/\/admin\/login$/);
  });
});
