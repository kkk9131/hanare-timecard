import { describe, expect, it } from "vitest";
import { pinLoginSchema } from "./schemas";

describe("pinLoginSchema", () => {
  it("accepts a valid pin login payload", () => {
    const result = pinLoginSchema.safeParse({ employee_id: 1, pin: "1234" });
    expect(result.success).toBe(true);
  });

  it("rejects a payload with a too-short pin and missing employee_id", () => {
    const result = pinLoginSchema.safeParse({ pin: "12" });
    expect(result.success).toBe(false);
  });
});
