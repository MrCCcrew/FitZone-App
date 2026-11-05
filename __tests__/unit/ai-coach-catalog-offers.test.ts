import { describe, expect, it, vi } from "vitest";

const offers = vi.hoisted(() => vi.fn());
const customPlans = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/db", () => ({ db: { offer: { findMany: offers }, membership: { findMany: customPlans } } }));

import { searchActiveOffers } from "@/lib/ai-coach/catalog-tools";

describe("AI Coach offer catalog", () => {
  it("returns three active offers for a generic current-offers question", async () => {
    offers.mockResolvedValue([1, 2, 3].map((id) => ({
      id: String(id), title: `Offer ${id}`, titleEn: null, description: null, priceBefore: null,
      membership: null, specialPrice: null, discount: 0, expiresAt: new Date(), durationDays: null,
      sessionsCount: null, allowedClassTypes: [], features: null,
    })));

    const result = await searchActiveOffers("إيه العروض المتاحة حاليًا؟");

    expect(result).toHaveLength(3);
    expect(offers).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true, expiresAt: expect.any(Object) }) }));
  });

  it("does not convert a database error to an empty result", async () => {
    offers.mockRejectedValue(new Error("database unavailable"));
    await expect(searchActiveOffers("offers")).rejects.toThrow("database unavailable");
  });

  it("returns an empty result when only expired offers are excluded by the date filter", async () => {
    offers.mockResolvedValue([]);
    await expect(searchActiveOffers("offers")).resolves.toEqual([]);
    expect(offers).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ expiresAt: expect.objectContaining({ gt: expect.any(Date) }) }) }));
  });
});
