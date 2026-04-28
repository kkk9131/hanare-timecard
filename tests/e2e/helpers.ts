import { expect, type Page } from "@playwright/test";

export const ADMIN = { loginId: "oyakata", password: "hanare2026" };
export const STAFF_NAME = "山田 太郎";

const ADD_SHIFT_BUTTON_RE = /^(.+) (\d{4}-\d{2}-\d{2}) にシフトを追加$/;

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

export async function findDraftFreeEmptyShiftCell(page: Page) {
  const periodLabel = page.locator(".wa-shifts__week-label");

  for (let weekOffset = 0; weekOffset < 26; weekOffset += 1) {
    await expect(page.locator(".wa-shifts__grid")).toBeVisible({ timeout: 15_000 });

    const draftChips = page.getByRole("button", {
      name: /^下書き \d{2}:\d{2}-\d{2}:\d{2}$/,
    });
    const emptyButtons = page.getByRole("button", { name: /にシフトを追加$/ });

    if ((await draftChips.count()) === 0) {
      const count = await emptyButtons.count();
      for (let i = 0; i < count; i += 1) {
        const addButtonName = await emptyButtons.nth(i).getAttribute("aria-label");
        const match = addButtonName?.match(ADD_SHIFT_BUTTON_RE);
        if (!addButtonName || !match) continue;
        const employeeName = match[1];
        const date = match[2];
        if (!employeeName || !date) continue;

        return {
          addButtonName,
          employeeName,
          date,
        };
      }
    }

    const currentPeriod = (await periodLabel.textContent())?.trim();
    await page.getByRole("button", { name: "次へ" }).click();
    if (currentPeriod) {
      await expect(periodLabel).not.toHaveText(currentPeriod);
    }
  }

  throw new Error("26週先まで確認しましたが、下書きがなく空きセルのある週が見つかりませんでした。");
}

export async function findUnusedShiftTime(page: Page) {
  for (let minute = 0; minute < 60; minute += 1) {
    const suffix = String(minute).padStart(2, "0");
    const start = `12:${suffix}`;
    const end = `20:${suffix}`;
    const range = `${start}-${end}`;
    const draftCount = await page.getByRole("button", { name: `下書き ${range}` }).count();
    const publishedCount = await page.getByRole("button", { name: `公開済み ${range}` }).count();

    if (draftCount === 0 && publishedCount === 0) {
      return { start, end, range };
    }
  }

  throw new Error("12:00-20:59 の範囲で未使用のシフト時刻が見つかりませんでした。");
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
