import { expect, type Page } from "@playwright/test";

export const ADMIN = { loginId: "oyakata", password: "hanare2026" };
export const STAFF_NAME = "山田 太郎";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export async function adminLogin(page: Page, account = ADMIN) {
  await page.goto("/admin/login");
  await page.locator('input[name="login_id"]').fill(account.loginId);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole("button", { name: "管理者ログイン" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 15_000 });
}

export async function openAdminShifts(page: Page) {
  await adminLogin(page);
  await page.goto("/admin/shifts");
  await expect(page.getByRole("heading", { name: /シフト編成/ })).toBeVisible();
}

export async function staffLoginFromKiosk(page: Page, name = STAFF_NAME) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page).toHaveURL(/\/punch\/board$/, { timeout: 10_000 });
}

export async function openStaffShiftRequests(page: Page) {
  await staffLoginFromKiosk(page);
  await page.goto("/me/shift-requests");
  await expect(page.getByRole("heading", { name: "シフト希望" })).toBeVisible();
}
