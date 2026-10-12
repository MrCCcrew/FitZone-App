import { describe, expect, it } from "vitest";
import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing";

const price = (overrides: Partial<Parameters<typeof calculateOfferBoxFinalPrice>[0]> = {}) =>
  calculateOfferBoxFinalPrice({
    offerType: "percentage",
    discount: 20,
    specialPrice: null,
    membershipPriceAfter: null,
    basePrice: 100,
    ...overrides,
  });

describe("Offer Box commercial price", () => {
  it("charges the actual percentage offer price, not the list price", () => {
    expect(price()).toBe(80);
    expect(price({ basePrice: 99.99, discount: 15 })).toBe(84.99);
  });
  it("charges the fixed discount once", () => {
    expect(price({ offerType: "fixed", discount: 25 })).toBe(75);
  });
  it("uses the membership's discounted price as the starting price, then the offer discount", () => {
    expect(price({ membershipPriceAfter: 90 })).toBe(72);
  });
  it("preserves explicit special prices rather than discounting twice", () => {
    expect(price({ specialPrice: 60 })).toBe(60);
  });
  it("preserves special offer fallback when an explicit price is absent", () => {
    expect(price({ offerType: "special", discount: 0, membershipPriceAfter: 80 })).toBe(80);
  });
  it("fails closed on impossible percentage, negative or nonfinite prices", () => {
    expect(() => price({ discount: 101 })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
    expect(() => price({ discount: -1 })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
    expect(() => price({ basePrice: Number.NaN })).toThrow("OFFER_BOX_INVALID_DISCOUNT");
  });
});
