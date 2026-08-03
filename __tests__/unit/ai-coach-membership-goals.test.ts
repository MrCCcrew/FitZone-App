import { describe, expect, it } from "vitest";
import { extractMembershipGoal, goalSearchTerms } from "@/lib/ai-coach/membership-goals";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";

describe("membership recommendations by goal", () => {
  it.each([["اعرضي اشتراك خاص بالتخسيس", "weight_loss"], ["اشتراك لزيادة اللياقة", "fitness"], ["باقة لبناء العضلات", "muscle_strength"], ["اشتراك للمبتدئات", "beginners"], ["اشتراك للأطفال", "kids"], ["اشتراك للكاراتيه", "karate"]] as const)("extracts %s", async (message, goal) => {
    expect(extractMembershipGoal(message)).toBe(goal);
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent: "membership_lookup", extractedEntities: { goal, searchTerm: goalSearchTerms(goal) }, allowedTools: ["searchMemberships"] });
  });

  it("continues a clarification with the stored recommendation context", async () => {
    await expect(understandCoachMessage("التخسيس", "ar", { lastIntent: "membership_recommendation" })).resolves.toMatchObject({ intent: "membership_lookup", extractedEntities: { goal: "weight_loss" } });
  });
});
