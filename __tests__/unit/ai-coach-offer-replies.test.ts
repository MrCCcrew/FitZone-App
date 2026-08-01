import { describe, expect, it } from "vitest";
import { buildOfferLookupReply } from "@/lib/ai-coach/fallback";

describe("AI Coach offer lookup replies", () => {
  it("uses the visible-empty reply after a successful empty query", () => {
    expect(buildOfferLookupReply("ar", [])).toBe("مفيش عروض نشطة ظاهرة حاليًا.");
  });

  it("uses an error reply when the offer tool fails", () => {
    expect(buildOfferLookupReply("ar", [], true)).toBe("تعذر تحميل العروض الآن، جرّب مرة أخرى بعد قليل.");
  });
});
