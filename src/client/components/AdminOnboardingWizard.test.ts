import { describe, expect, it } from "vitest";
import {
  ADMIN_ONBOARDING_STEPS,
  getAdminOnboardingSteps,
  getBrowserStorage,
} from "./AdminOnboardingWizard";

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

describe("getBrowserStorage", () => {
  it("returns undefined when storage access itself is blocked", () => {
    const originalWindow = globalThis.window;
    const hadWindow = Object.hasOwn(globalThis, "window");
    const blockedWindow = Object.create(null);
    Object.defineProperty(blockedWindow, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: blockedWindow,
    });

    try {
      expect(getBrowserStorage("localStorage")).toBeUndefined();
    } finally {
      if (hadWindow) {
        Object.defineProperty(globalThis, "window", {
          configurable: true,
          value: originalWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });
});
