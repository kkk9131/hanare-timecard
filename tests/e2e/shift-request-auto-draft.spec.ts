import { expect, test } from "@playwright/test";
import { ADMIN, adminLogin, STAFF_NAME } from "./helpers";

const STORE_ID = 1;
const TARGET_FROM = "2026-05-01";
const TARGET_TO = "2026-05-02";
const SLOT_START = "10:00";
const SLOT_END = "18:00";

test.describe("shift requests to admin auto-draft", () => {
  test("staff request replacement, auto-draft, and duplicate shift handling", async ({
    browser,
  }) => {
    test.setTimeout(120_000);

    const adminContext = await browser.newContext();
    await adminContext.addInitScript(() => {
      window.localStorage.setItem("hanare:onboarding:2026-04-admin-v1:admin", "true");
    });
    const adminPage = await adminContext.newPage();
    await adminLogin(adminPage, ADMIN);

    const employeesResponse = await adminPage.request.get(`/api/employees?store_id=${STORE_ID}`);
    expect(employeesResponse.ok()).toBeTruthy();
    const employeesBody = (await employeesResponse.json()) as {
      employees: Array<{ id: number; name: string }>;
    };
    const staff = employeesBody.employees.find((employee) => employee.name === STAFF_NAME);
    expect(staff, `${STAFF_NAME} が seed に存在すること`).toBeTruthy();
    if (!staff) throw new Error(`${STAFF_NAME} not found`);

    const periodResponse = await adminPage.request.post("/api/shift-periods", {
      data: {
        store_id: STORE_ID,
        name: "E2E 希望反映",
        target_from: TARGET_FROM,
        target_to: TARGET_TO,
        submission_from: "2026-01-01",
        submission_to: "2026-12-31",
        rules: [
          {
            slot_name: "E2E枠",
            start_time: SLOT_START,
            end_time: SLOT_END,
            required_count: 1,
            weekdays: [5],
          },
          {
            slot_name: "E2E枠",
            start_time: SLOT_START,
            end_time: SLOT_END,
            required_count: 2,
            weekdays: [6],
          },
        ],
      },
    });
    expect(periodResponse.ok()).toBeTruthy();
    const periodBody = (await periodResponse.json()) as { period: { id: number } };

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto("/");
    await expect(staffPage.getByRole("heading", { name: /お疲れさまです/ })).toBeVisible();
    await staffPage
      .locator(".wa-kiosk-top__employee-card")
      .filter({ hasText: STAFF_NAME })
      .getByRole("button", { name: "シフト希望提出" })
      .click();
    await expect(staffPage).toHaveURL(/\/me\/shift-requests$/, { timeout: 10_000 });
    await expect(staffPage.getByRole("heading", { name: "シフト希望" })).toBeVisible();
    await expect(staffPage.getByRole("heading", { name: "E2E 希望反映" })).toBeVisible();

    await staffPage.getByLabel("備考").fill("first duplicate candidate");
    await staffPage.getByRole("button", { name: "希望を提出" }).click();
    await expect(staffPage.getByText("希望を提出しました")).toBeVisible();
    await expect(staffPage.locator("tbody tr")).toHaveCount(1);
    await expect(staffPage.getByText("first duplicate candidate")).toBeVisible();

    await staffPage.getByLabel("希望種別").selectOption("available");
    await staffPage.getByLabel("備考").fill("second replacement wins");
    await staffPage.getByRole("button", { name: "希望を提出" }).click();
    await expect(staffPage.getByText("希望を提出しました")).toBeVisible();
    await expect(staffPage.locator("tbody tr")).toHaveCount(1);
    await expect(staffPage.getByText("first duplicate candidate")).toHaveCount(0);
    await expect(staffPage.getByText("second replacement wins")).toBeVisible();
    await expect(staffPage.getByRole("button", { name: "5/1 (金) 可" })).toBeVisible();

    await staffPage.getByRole("button", { name: "5/2 (土) 未提出" }).click();
    await expect(staffPage.getByLabel("対象日")).toHaveValue(TARGET_TO);
    await staffPage.getByLabel("希望種別").selectOption("preferred");
    await staffPage.getByLabel("備考").fill("conflict candidate");
    await staffPage.getByRole("button", { name: "希望を提出" }).click();
    await expect(staffPage.getByText("希望を提出しました")).toBeVisible();
    await expect(staffPage.locator("tbody tr")).toHaveCount(2);
    await expect(staffPage.getByRole("button", { name: "5/2 (土) 希望" })).toBeVisible();

    const duplicateRequestRows = await staffPage.request
      .get(`/api/shift-requests/me?period_id=${periodBody.period.id}`)
      .then((response) => response.json() as Promise<{ requests: Array<{ date: string }> }>);
    expect(
      duplicateRequestRows.requests.filter((request) => request.date === TARGET_FROM),
    ).toHaveLength(1);

    const conflictSeedResponse = await adminPage.request.post("/api/shifts", {
      data: {
        employee_id: staff.id,
        store_id: STORE_ID,
        date: TARGET_TO,
        start_time: SLOT_START,
        end_time: SLOT_END,
      },
    });
    expect(conflictSeedResponse.ok()).toBeTruthy();

    const duplicateShiftResponse = await adminPage.request.post("/api/shifts", {
      data: {
        employee_id: staff.id,
        store_id: STORE_ID,
        date: TARGET_TO,
        start_time: SLOT_START,
        end_time: SLOT_END,
      },
    });
    expect(duplicateShiftResponse.status()).toBe(409);
    await expect(duplicateShiftResponse.json()).resolves.toMatchObject({
      error: "conflict",
      message: "同じ従業員の時間帯が重複しています",
    });

    await adminPage.goto("/admin/shifts");
    await expect(adminPage.getByRole("heading", { name: "シフト編成" })).toBeVisible();
    await adminPage.locator(".wa-shifts__summary-trigger").click();
    await expect(adminPage.getByText("E2E 希望反映 ／ 未提出")).toBeVisible();
    await adminPage.getByRole("button", { name: "希望から下書き作成" }).click();
    await expect(
      adminPage.getByText("下書き 1 件を作成しました。未達成の枠は 1 件です。"),
    ).toBeVisible();

    const shiftsAfterDraft = await adminPage.request
      .get(`/api/shifts?store_id=${STORE_ID}&from=${TARGET_FROM}&to=${TARGET_TO}`)
      .then(
        (response) =>
          response.json() as Promise<{
            shifts: Array<{
              employee_id: number;
              date: string;
              start_time: string;
              end_time: string;
              status: string;
            }>;
          }>,
      );
    const staffShifts = shiftsAfterDraft.shifts.filter((shift) => shift.employee_id === staff.id);
    expect(staffShifts.filter((shift) => shift.date === TARGET_FROM)).toHaveLength(1);
    expect(staffShifts.filter((shift) => shift.date === TARGET_TO)).toHaveLength(1);
    expect(staffShifts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: TARGET_FROM,
          start_time: SLOT_START,
          end_time: SLOT_END,
          status: "draft",
        }),
        expect.objectContaining({
          date: TARGET_TO,
          start_time: SLOT_START,
          end_time: SLOT_END,
          status: "draft",
        }),
      ]),
    );

    await adminPage.getByRole("button", { name: "希望から下書き作成" }).click();
    await expect(
      adminPage.getByText("下書き 0 件を作成しました。未達成の枠は 1 件です。"),
    ).toBeVisible();
    const shiftsAfterSecondDraft = await adminPage.request
      .get(`/api/shifts?store_id=${STORE_ID}&from=${TARGET_FROM}&to=${TARGET_TO}`)
      .then(
        (response) =>
          response.json() as Promise<{
            shifts: Array<{ employee_id: number; date: string }>;
          }>,
      );
    const staffShiftsAfterSecondDraft = shiftsAfterSecondDraft.shifts.filter(
      (shift) => shift.employee_id === staff.id,
    );
    expect(staffShiftsAfterSecondDraft.filter((shift) => shift.date === TARGET_FROM)).toHaveLength(
      1,
    );
    expect(staffShiftsAfterSecondDraft.filter((shift) => shift.date === TARGET_TO)).toHaveLength(1);

    await staffContext.close();
    await adminContext.close();
  });
});
