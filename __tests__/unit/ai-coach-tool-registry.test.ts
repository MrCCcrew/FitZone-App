import { describe, expect, it, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({ enabled: true }));
const mocks = vi.hoisted(() => ({
  knowledge: vi.fn().mockResolvedValue([]), account: vi.fn().mockResolvedValue({ authenticated: false }),
  memberships: vi.fn().mockResolvedValue([]), offers: vi.fn().mockResolvedValue([]), products: vi.fn().mockResolvedValue([]), classes: vi.fn().mockResolvedValue([]), currentMembership: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai-coach/config", () => ({ isCoachToolsEnabled: () => state.enabled }));
vi.mock("@/lib/ai-coach/site-data", () => ({ getCoachKnowledgeEntries: mocks.knowledge, getCoachAccountSummary: mocks.account }));
vi.mock("@/lib/ai-coach/catalog-tools", () => ({ searchAvailableMemberships: mocks.memberships, searchActiveOffers: mocks.offers, searchAvailableProducts: mocks.products, searchClassSchedule: mocks.classes, getAuthenticatedCustomerMembership: mocks.currentMembership }));

import { getCoachToolContext, selectCoachTools } from "@/lib/ai-coach/tool-registry";

describe("AI Coach read-only tool registry", () => {
  beforeEach(() => { state.enabled = true; vi.clearAllMocks(); mocks.knowledge.mockResolvedValue([]); });

  it("selects only the offer tool for offer questions", () => {
    expect(selectCoachTools("offer_lookup", "إيه العروض الحالية؟", false)).toEqual(["searchOffers"]);
  });

  it("does not select site tools for a general fitness question", () => {
    expect(selectCoachTools("unknown", "عايزة تمارين للمبتدئين", false)).toEqual([]);
  });

  it("does not call catalog or private tools when tools are disabled", async () => {
    state.enabled = false;
    const result = await getCoachToolContext({ intent: "offer_lookup", message: "offers", lang: "ar", userId: "forged-user-id" });
    expect(result.toolsEnabled).toBe(false);
    expect(mocks.offers).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
    expect(mocks.currentMembership).not.toHaveBeenCalled();
  });

  it("calls only the selected public tool when tools are enabled", async () => {
    await getCoachToolContext({ intent: "offer_lookup", message: "offers", lang: "ar", userId: null });
    expect(mocks.offers).toHaveBeenCalledOnce();
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.account).not.toHaveBeenCalled();
  });

  it("reports results when the offer tool returns three active offers", async () => {
    mocks.offers.mockResolvedValue([
      { id: "1", title: "A", titleEn: null, expiresAt: new Date() },
      { id: "2", title: "B", titleEn: null, expiresAt: new Date() },
      { id: "3", title: "C", titleEn: null, expiresAt: new Date() },
    ]);
    const result = await getCoachToolContext({ intent: "offer_lookup", message: "offers", lang: "ar", userId: null });
    expect(result.resultCounts.searchOffers).toBe(3);
    expect(result.toolStatuses.searchOffers).toBe("success_with_results");
  });

  it("reports success_empty only for a successful empty offer query", async () => {
    mocks.offers.mockResolvedValue([]);
    const result = await getCoachToolContext({ intent: "offer_lookup", message: "offers", lang: "ar", userId: null });
    expect(result.resultCounts.searchOffers).toBe(0);
    expect(result.toolStatuses.searchOffers).toBe("success_empty");
  });

  it("reports tool_error when the offer query throws", async () => {
    mocks.offers.mockRejectedValue(new Error("database unavailable"));
    const result = await getCoachToolContext({ intent: "offer_lookup", message: "offers", lang: "ar", userId: null });
    expect(result.toolStatuses.searchOffers).toBe("tool_error");
    expect(result.toolFailed).toBe(true);
  });

  it("passes an empty search term for membership list questions", async () => {
    await getCoachToolContext({ intent: "pricing", message: "إيه أسعار الاشتراكات؟", lang: "ar", userId: null });
    expect(mocks.memberships).toHaveBeenCalledWith("");
  });

  it("passes only the product subject to product search", async () => {
    await getCoachToolContext({ intent: "product_help", message: "عندكم منتجات للتخسيس؟", lang: "ar", userId: null });
    expect(mocks.products).toHaveBeenCalledWith("تخسيس", undefined);
  });

  it("passes only the class name to schedule search", async () => {
    await getCoachToolContext({ intent: "schedule_lookup", message: "مواعيد كلاس الكيك بوكس إيه؟", lang: "ar", userId: null });
    expect(mocks.classes).toHaveBeenCalledWith("كيك بوكس");
  });

  it("reports tool_error rather than success_empty when a product query throws", async () => {
    mocks.products.mockRejectedValue(new Error("database unavailable"));
    const result = await getCoachToolContext({ intent: "product_help", message: "إيه الموجود في المتجر؟", lang: "ar", userId: null });
    expect(result.toolStatuses.searchProducts).toBe("tool_error");
    expect(result.toolStatuses.searchProducts).not.toBe("success_empty");
  });

  it("does not select a private membership tool for guests", () => {
    expect(selectCoachTools("account_summary", "اشتراكي", false)).toEqual([]);
  });
});
