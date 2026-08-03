import { describe, expect, it } from "vitest";
import { detectExplicitNavigationTarget, normalizeArabicIntent } from "@/lib/ai-coach/intents";
import { isSiteTourRequest, siteTourCommand, siteTourPages, tourNarration } from "@/lib/ai-coach/site-tour";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";

describe("AI Coach navigation and site tour", () => {
  it.each(["افتحي المدوني", "افتحي المدونة", "وديني المدونة", "وريني المقالات"])("routes %s to blog", async (message) => {
    expect(detectExplicitNavigationTarget(message)).toBe("blog");
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent: "site_navigation", extractedEntities: { pageId: "blog" } });
  });

  it("normalizes Arabic diacritics, tatweel and alef variants only for matching", () => {
    expect(normalizeArabicIntent("  أَفْتَحي المدوّنةــ ")).toBe("افتحي المدونة");
  });

  it.each(["كلميني عن الموقع", "عرفيني على الموقع", "اعمليلي جولة في الموقع"])("starts a tour for %s", async (message) => {
    expect(isSiteTourRequest(message)).toBe(true);
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent: "site_tour" });
  });

  it("uses the page registry, skips account for guests, and recognizes tour controls", () => {
    const guest = siteTourPages(false);
    expect(guest.map((page) => page.id)).not.toContain("account");
    expect(guest[0].id).toBe("home");
    expect(siteTourCommand("التالي")).toBe("next");
    expect(siteTourCommand("السابق")).toBe("previous");
    expect(siteTourCommand("وقفي الجولة")).toBe("stop");
    expect(tourNarration(guest[0], "ar", true)).toContain("جولة");
  });

  it.each(["لو حبيت أخس أعمل إيه", "قيمي أكلي", "أكلت فراخ ورز وسلطة، قيمي الوجبة", "أتمرن إزاي وأنا مبتدئة", "عايزة أزيد لياقتي"])("keeps general fitness questions on an answerable route: %s", async (message) => {
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ requestedAction: "answer", intent: expect.stringMatching(/general_fitness|nutrition_general/) });
  });
});
