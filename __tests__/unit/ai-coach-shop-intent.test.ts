import { describe, expect, it } from "vitest";
import { detectCoachIntent } from "@/lib/ai-coach/intents";

describe("AI Coach shop browsing intent", () => {
  const shopRequests = [
    "\u0627\u0642\u0635\u062f \u0645\u0646\u062a\u062c\u0627\u062a \u0627\u0644\u0645\u062a\u062c\u0631",
    "\u0627\u0641\u062a\u062d\u064a \u0627\u0644\u0645\u062a\u062c\u0631",
    "\u0639\u0627\u064a\u0632 \u0623\u062a\u0635\u0641\u062d \u0627\u0644\u0645\u062a\u062c\u0631",
    "\u0648\u0631\u064a\u0646\u064a \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a",
    "\u0639\u0646\u062f\u0643\u0645 \u0645\u0646\u062a\u062c\u0627\u062a \u0625\u064a\u0647",
    "\u0639\u0627\u064a\u0632 \u0623\u0634\u0648\u0641 \u0627\u0644\u0644\u0628\u0633",
  ];

  it.each(shopRequests)("routes %s to shop_browse", (message) => {
    expect(detectCoachIntent(message)).toBe("shop_browse");
  });

  it("keeps distinct corrections on their intended paths", () => {
    expect(detectCoachIntent("\u0627\u0639\u0631\u0636\u0644\u064a \u0627\u0644\u0645\u062f\u0631\u0628\u0627\u062a")).toBe("trainer_info");
    expect(detectCoachIntent("\u0648\u0631\u064a\u0646\u064a \u0627\u0644\u0639\u0631\u0648\u0636")).toBe("offer_lookup");
    expect(detectCoachIntent("\u0627\u0642\u0635\u062f \u0627\u0644\u0639\u0631\u0648\u0636 \u0645\u0634 \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a")).toBe("offer_lookup");
    expect(detectCoachIntent("\u0627\u0642\u0635\u062f \u0627\u0644\u0645\u0646\u062a\u062c\u0627\u062a \u0645\u0634 \u0627\u0644\u0628\u0627\u0642\u0627\u062a")).toBe("shop_browse");
  });
});
