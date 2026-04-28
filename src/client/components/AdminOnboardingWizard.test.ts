import { describe, expect, it } from "vitest";
import { ADMIN_ONBOARDING_STEPS, getAdminOnboardingSteps } from "./AdminOnboardingWizard";

describe("getAdminOnboardingSteps", () => {
  it("keeps admin-only setup and month-end guidance for admins", () => {
    const steps = getAdminOnboardingSteps("admin");

    expect(steps).toHaveLength(ADMIN_ONBOARDING_STEPS.length);
    expect(steps.map((step) => step.id)).toContain("masters");
    expect(steps.map((step) => step.id)).toContain("month-end");
    expect(steps.map((step) => step.id)).toContain("backup");
  });

  it("shows managers only the pages they can operate", () => {
    const steps = getAdminOnboardingSteps("manager");

    expect(steps.map((step) => step.id)).toEqual(["whole-flow", "daily-check", "weekly-shifts"]);
    expect(steps.every((step) => !step.adminOnly)).toBe(true);
  });
});
