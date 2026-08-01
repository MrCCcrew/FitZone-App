import { describe, expect, it } from "vitest";
import { matchKnowledge } from "@/lib/ai-coach/fallback";

const entry = (overrides: Partial<Parameters<typeof matchKnowledge>[1][number]> = {}) => ({ id: "k1", title: "سياسة تجميد الاشتراك", category: "memberships", answer: "يمكن تجميد الاشتراك وفق السياسة المنشورة.", priority: 1, keywords: ["تجميد", "إيقاف الاشتراك"], ...overrides });

describe("AI Coach hybrid text knowledge retrieval", () => {
  it("uses a strong title or keyword match", () => {
    expect(matchKnowledge("هل أقدر أعمل تجميد للاشتراك؟", [entry()])?.id).toBe("k1");
  });

  it("does not force an unrelated answer from a single weak word", () => {
    expect(matchKnowledge("عايزة جدول تمرين للمبتدئين", [entry({ priority: 3 })])).toBeNull();
  });

  it("normalizes Arabic diacritics for matching", () => {
    expect(matchKnowledge("هَل يُمْكِن تَجْمِيد الإشتراك", [entry()])?.id).toBe("k1");
  });
});
