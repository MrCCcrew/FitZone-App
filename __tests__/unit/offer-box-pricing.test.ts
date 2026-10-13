import { describe, expect, it } from "vitest";
import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing";

const price = (overrides: Partial<Parameters<typeof calculateOfferBoxFinalPrice>[0]> = {}) =>
  calculateOfferBoxFinalPrice({
    offerType: "percentage", discount: 20, specialPrice: null,
    membershipPriceAfter: 90, basePrice: 100,
    applyOfferDiscount: false,
    ...overrides,
  });

describe("Offer Box opt-in pricing", () => {
  it("defaults to 90 without an extra discount", () => {
    expect(price()).toBe(90);
    expect(price({ discount: 99 })).toBe(90);
    expect(price({ discount: Number.NaN, applyOfferDiscount: false })).toBe(90);
  });
  it("charges 72 for a 20% discount only when admin enables it", () => {
    expect(price({ applyOfferDiscount: true })).toBe(72);
  });
  it("applies fixed discount only on opt-in", () => {
    expect(price({ offerType: "fixed", discount: 15 })).toBe(90);
    expect(price({ offerType: "fixed", discount: 15, applyOfferDiscount: true })).toBe(75);
  });
  it("uses list price only when no discounted membership price exists", () => {
    expect(price({ membershipPriceAfter: null })).toBe(100);
    expect(price({ membershipPriceAfter: null, applyOfferDiscount: true })).toBe(80);
  });
  it("special offers keep their explicitly set prices", () => {
    expect(price({ offerType: "special", specialPrice: 60 })).toBe(60);
    expect(price({ offerType: "special", specialPrice: 60, applyOfferDiscount: true })).toBe(60);
    expect(price({ offerType: "special", specialPrice: null })).toBe(90);
  });
  it("legacy specialPrice on percentage/fixed offers does not override their pricing", () => {
    expect(price({ specialPrice: 0, applyOfferDiscount: true })).toBe(72);
    expect(price({ specialPrice: 1 })).toBe(90);
  });
  it("rejects invalid enabled discounts and invalid base price", () => {
    expect(() => price({ discount: 100, applyOfferDiscount: true })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
    expect(() => price({ discount: -1, applyOfferDiscount: true })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
    expect(() => price({ discount: Number.NaN, applyOfferDiscount: true })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
    expect(() => price({ basePrice: Number.NaN, membershipPriceAfter: null })).toThrow("OFFER_BOX_INVALID_PRICE");
  });
});
