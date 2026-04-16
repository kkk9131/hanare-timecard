import { describe, expect, it } from "vitest";
import { kioskLoginSchema } from "./schemas";

describe("kioskLoginSchema", () => {
  it("accepts a valid kiosk login payload", () => {
    const result = kioskLoginSchema.safeParse({ employee_id: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects a payload missing employee_id", () => {
    const result = kioskLoginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
