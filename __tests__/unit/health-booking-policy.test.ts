import { describe, expect, it } from "vitest";
import { isClassBlockedByHealthRestrictions } from "@/lib/booking/health-booking-policy";

describe("health booking restrictions", () => {
  it("blocks a matching restricted class type for an active yes response", () => {
    expect(isClassBlockedByHealthRestrictions({
      classType: "HIIT",
      yesResponses: [{ question: { isActive: true, restrictions: [{ classType: "hiit" }] } }],
    })).toBe(true);
  });

  it("does not block unrelated class types", () => {
    expect(isClassBlockedByHealthRestrictions({
      classType: "yoga",
      yesResponses: [{ question: { isActive: true, restrictions: [{ classType: "hiit" }] } }],
    })).toBe(false);
  });

  it("ignores inactive health questions", () => {
    expect(isClassBlockedByHealthRestrictions({
      classType: "hiit",
      yesResponses: [{ question: { isActive: false, restrictions: [{ classType: "hiit" }] } }],
    })).toBe(false);
  });
});
