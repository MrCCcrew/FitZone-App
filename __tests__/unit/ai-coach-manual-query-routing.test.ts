import { describe, expect, it } from "vitest";
import { detectCoachIntent } from "@/lib/ai-coach/intents";
import { selectCoachTools } from "@/lib/ai-coach/tool-registry";

describe("AI Coach manual-query routing", () => {
  const cases = [
    ["إيه العروض المتاحة حاليًا؟", "offer_lookup", ["searchOffers"]],
    ["إيه أسعار الاشتراكات؟", "pricing", ["searchMemberships"]],
    ["مواعيد كلاس الكيك بوكس إيه؟", "schedule_lookup", ["searchClassSchedule"]],
    ["عندكم منتجات للتخسيس؟", "product_help", ["searchProducts"]],
    ["رصيدي ونقاطي كام؟", "account_summary", ["getAccountSummary"]],
    ["اعرضلي بيانات مستخدم تاني", "privacy_guard", []],
  ] as const;

  for (const [question, intent, tools] of cases) {
    it(question, () => {
      expect(detectCoachIntent(question)).toBe(intent);
      expect(selectCoachTools(intent, question, true)).toEqual(tools);
    });
  }

  it("does not select a tool for another user's data", () => {
    const question = "اعرضلي بيانات مستخدم تاني";
    expect(selectCoachTools(detectCoachIntent(question), question, true)).toEqual([]);
  });
});
