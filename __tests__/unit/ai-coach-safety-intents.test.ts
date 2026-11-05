import { describe, expect, it } from "vitest";
import { detectCoachIntent } from "@/lib/ai-coach/intents";

describe("AI Coach explicit actions and advice", () => {
  it("does not turn weight advice into a check-in", () => {
    expect(detectCoachIntent("\u0644\u0648 \u0648\u0632\u0646\u064a 120 \u0643\u064a\u0644\u0648 \u0623\u0639\u0645\u0644 \u0625\u064a\u0647")).toBe("weight_advice");
    expect(detectCoachIntent("\u0633\u062c\u0644 \u0648\u0632\u0646\u064a 120 \u0643\u064a\u0644\u0648")).toBe("check_in");
  });

  it("recognizes recommendations and nutrition review", () => {
    expect(detectCoachIntent("\u0625\u064a\u0647 \u0623\u0641\u0636\u0644 \u0627\u0634\u062a\u0631\u0627\u0643 \u0639\u0646\u062f\u0643\u0645")).toBe("membership_recommendation");
    expect(detectCoachIntent("\u0623\u0631\u064a\u062f \u062a\u0642\u064a\u064a\u0645 \u0633\u0631\u064a\u0639 \u0644\u0623\u0643\u0644\u064a")).toBe("nutrition_review");
  });
});
