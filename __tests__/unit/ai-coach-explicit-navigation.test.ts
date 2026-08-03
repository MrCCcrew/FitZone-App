import { describe, expect, it, vi } from "vitest";
import { detectExplicitNavigationTarget } from "@/lib/ai-coach/intents";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";
import { COACH_PAGES, pageAction } from "@/lib/ai-coach/page-registry";
import { createRealtimeToolOutputEvents, isClientVoiceDebugEnabled, logClientVoiceDebug } from "@/components/LiveChatWidget";

describe("AI Coach explicit Arabic navigation", () => {
  const cases = [
    ["افتح الجدول", "classes"], ["وديني للمواعيد", "classes"], ["افتح الحصص", "classes"], ["افتح الكلاسات", "classes"],
    ["افتح المدونة", "blog"], ["افتح المقالات", "blog"], ["افتح المقال", "blog"],
    ["افتح المتجر", "store"], ["افتح التسوق", "store"], ["افتح المنتجات", "store"], ["اشتري", "store"],
    ["افتح العروض", "offers"], ["افتح الخصومات", "offers"],
    ["افتح الاشتراكات", "memberships"], ["افتح الباقات", "memberships"], ["افتح العضويات", "memberships"],
    ["افتح الدكتورة", "nutritionist"], ["افتح دكتورة التغذية", "nutritionist"], ["افتح التغذية", "nutritionist"], ["افتح أخصائية التغذية", "nutritionist"],
    ["افتح الشركاء", "partners"], ["افتح شركاؤنا", "partners"], ["افتح الشريك", "partners"],
  ] as const;

  it.each(cases)("routes %s only to %s", async (message, pageId) => {
    expect(detectExplicitNavigationTarget(message)).toBe(pageId);
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent: "site_navigation", requestedAction: "navigate", extractedEntities: { pageId } });
  });

  it("keeps membership prices as search, not navigation", async () => {
    await expect(understandCoachMessage("أسعار الباقات", "ar")).resolves.toMatchObject({ intent: "membership_lookup", domain: "packages", requestedAction: "answer" });
  });

  it("keeps explicit schedule destinations separate from availability questions", async () => {
    await expect(understandCoachMessage("وديني للمواعيد", "ar")).resolves.toMatchObject({ intent: "site_navigation", extractedEntities: { pageId: "classes" }, requiresModel: false });
    await expect(understandCoachMessage("افتحي المواعيد", "ar")).resolves.toMatchObject({ intent: "site_navigation", extractedEntities: { pageId: "classes" }, requiresModel: false });
    await expect(understandCoachMessage("إيه المواعيد المتاحة اليوم", "ar")).resolves.toMatchObject({ intent: "class_schedule", temporalFilter: { date: "today" } });
    await expect(understandCoachMessage("قوليلي حصص النهاردة", "ar")).resolves.toMatchObject({ intent: "class_schedule", temporalFilter: { date: "today" } });
  });

  it.each([
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u062c\u062f\u0648\u0644", "classes", "/#classes"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u0648\u0627\u0639\u064a\u062f", "classes", "/#classes"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u062f\u0648\u0646\u0629", "blog", "/#blog"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u062a\u062c\u0631", "store", "/store"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0639\u0631\u0648\u0636", "offers", "/#offers"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643\u0627\u062a", "memberships", "/#memberships"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0628\u0627\u0642\u0627\u062a", "memberships", "/#memberships"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u062f\u0643\u062a\u0648\u0631\u0629", "nutritionist", "/#nutrition"],
    ["\u0627\u0641\u062a\u062d \u062f\u0643\u062a\u0648\u0631\u0629 \u0627\u0644\u062a\u063a\u0630\u064a\u0629", "nutritionist", "/#nutrition"],
    ["\u0627\u0641\u062a\u062d \u0627\u0644\u0634\u0631\u0643\u0627\u0621", "partners", "/#partners"],
  ] as const)("keeps text, realtime action, and page registry aligned for %s", async (message, pageId, url) => {
    await expect(understandCoachMessage(message, "ar")).resolves.toMatchObject({ intent: "site_navigation", extractedEntities: { pageId } });
    const page = COACH_PAGES.find((entry) => entry.id === pageId);
    expect(pageAction(page!, "ar").url).toBe(url);
    expect(createRealtimeToolOutputEvents("call", { actions: [pageAction(page!, "ar")] })).toEqual(expect.arrayContaining([
      expect.objectContaining({ item: expect.objectContaining({ output: JSON.stringify({ actions: [pageAction(page!, "ar")] }) }) }),
    ]));
  });

  it("keeps an unknown command as clarification without membership or offer actions", async () => {
    const understanding = await understandCoachMessage("\u0623\u0645\u0631 \u063a\u064a\u0631 \u0645\u0639\u0631\u0648\u0641", "ar");
    expect(understanding).toMatchObject({ intent: "clarification_required", requestedAction: "answer" });
    expect(understanding.extractedEntities.pageId).toBeUndefined();
    expect(understanding.allowedTools).not.toContain("searchMemberships");
    expect(understanding.allowedTools).not.toContain("searchOffers");
  });

  it("keeps client voice diagnostics off unless explicitly enabled", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isClientVoiceDebugEnabled()).toBe(false);
    logClientVoiceDebug(false, "info", "[AI_COACH_VOICE]", { safe: true });
    expect(info).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(isClientVoiceDebugEnabled("true")).toBe(true);
    logClientVoiceDebug(true, "info", "[AI_COACH_VOICE]", { safe: true });
    expect(info).toHaveBeenCalledOnce();
    info.mockRestore();
    error.mockRestore();
  });
});
