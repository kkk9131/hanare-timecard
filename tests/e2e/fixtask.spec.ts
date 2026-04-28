import { expect, test } from "@playwright/test";
import { openAdminShifts, openStaffShiftRequests, STAFF_NAME, toISODate } from "./helpers";

test.describe("fixtask browser-use E2E improvements", () => {
  test("admin can change shift times, delete through modal, and publish through modal", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openAdminShifts(page);

    const today = toISODate(new Date());
    await page.getByRole("button", { name: `${STAFF_NAME} ${today} にシフトを追加` }).click();
    await expect(page.getByRole("dialog", { name: "シフトを追加" })).toBeVisible();
    await page.getByTestId("shift-start-time").fill("10:00");
    await page.getByTestId("shift-end-time").fill("18:00");
    await page.getByRole("button", { name: "追加する" }).click();

    await expect(page.getByRole("button", { name: "下書き 10:00-18:00" })).toBeVisible();

    await page.getByRole("button", { name: "下書き 10:00-18:00" }).click();
    await expect(page.getByRole("dialog", { name: "シフトを編集" })).toBeVisible();
    await page.getByTestId("shift-start-time").fill("11:00");
    await page.getByTestId("shift-end-time").fill("19:00");
    await page.getByRole("button", { name: "更新する" }).click();

    await expect(page.getByRole("button", { name: "下書き 11:00-19:00" })).toBeVisible();

    await page.getByRole("button", { name: "下書き 11:00-19:00" }).click();
    await page.getByRole("button", { name: "削除" }).click();
    await expect(page.getByRole("dialog", { name: "シフトを削除しますか" })).toBeVisible();
    await page.getByRole("button", { name: "シフト削除を確定" }).click();
    await expect(page.getByRole("button", { name: "下書き 11:00-19:00" })).toHaveCount(0);

    await page.getByRole("button", { name: `${STAFF_NAME} ${today} にシフトを追加` }).click();
    await page.getByTestId("shift-start-time").fill("12:00");
    await page.getByTestId("shift-end-time").fill("20:00");
    await page.getByRole("button", { name: "追加する" }).click();
    await expect(page.getByRole("button", { name: "下書き 12:00-20:00" })).toBeVisible();

    await page.getByRole("button", { name: "この週を公開する" }).click();
    await expect(page.getByRole("dialog", { name: "下書きを公開しますか" })).toBeVisible();
    await page.getByRole("button", { name: "シフト公開を確定" }).click();

    await expect(page.getByText(/直近\s+1\s+件公開しました/)).toBeVisible();
    await expect(page.getByRole("button", { name: "公開済み 12:00-20:00" })).toBeVisible();
  });

  test("staff can withdraw a shift request through an app modal", async ({ page }) => {
    test.setTimeout(60_000);

    await openStaffShiftRequests(page);

    await page.getByLabel("備考").fill("fixtask E2E 取り下げ確認");
    await page.getByRole("button", { name: "希望を提出" }).click();
    await expect(page.getByText("希望を提出しました")).toBeVisible();
    await expect(page.getByText("fixtask E2E 取り下げ確認")).toBeVisible();

    await page.getByRole("button", { name: "取り下げ" }).click();
    await expect(page.getByRole("dialog", { name: "希望を取り下げますか" })).toBeVisible();
    await page.getByRole("button", { name: "希望取り下げを確定" }).click();

    await expect(page.getByText("提出済みの希望はありません")).toBeVisible();
  });
});
