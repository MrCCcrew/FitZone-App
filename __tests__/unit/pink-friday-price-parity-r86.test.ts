import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing";

const source = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("R86 - Pink Friday price parity", () => {
  it("preserves a special Offer Box price", () => {
    expect(calculateOfferBoxFinalPrice({
      offerType: "special",
      discount: 0,
      specialPrice: 280,
      membershipPriceAfter: 350,
      basePrice: 400,
      applyOfferDiscount: false,
    })).toBe(280);
  });

  it("preserves already-discounted membership price by default", () => {
    expect(calculateOfferBoxFinalPrice({
      offerType: "percentage",
      discount: 20,
      specialPrice: null,
      membershipPriceAfter: 350,
      basePrice: 400,
      applyOfferDiscount: false,
    })).toBe(350);
  });

  it("applies the explicit percentage discount once", () => {
    expect(calculateOfferBoxFinalPrice({
      offerType: "percentage",
      discount: 20,
      specialPrice: null,
      membershipPriceAfter: 350,
      basePrice: 400,
      applyOfferDiscount: true,
    })).toBe(280);
  });

  it("applies the explicit fixed discount once", () => {
    expect(calculateOfferBoxFinalPrice({
      offerType: "fixed",
      discount: 50,
      specialPrice: null,
      membershipPriceAfter: null,
      basePrice: 400,
      applyOfferDiscount: true,
    })).toBe(350);
  });

  it("rejects missing price authority", () => {
    expect(() => calculateOfferBoxFinalPrice({
      offerType: "percentage",
      discount: 10,
      specialPrice: null,
      membershipPriceAfter: null,
      basePrice: 0,
      applyOfferDiscount: true,
    })).toThrow("OFFER_BOX_INVALID_PRICE");
  });

  it("wires the existing pricing helper into the public API", () => {
    const api = source("src/app/api/popup/route.ts");

    expect(api).toContain(
      'import { calculateOfferBoxFinalPrice } from "@/lib/payments/offer-box-pricing"'
    );
    expect(api).toContain("offerBoxApplyDiscount: true");
    expect(api).toContain(
      "calculateOfferBoxFinalPrice({"
    );
    expect(api).toContain(
      "finalPrice: offerBoxFinalPrice"
    );
  });

  it("uses the server price only for Offer Box displays", () => {
    const ui = source("src/components/PinkFridayPopup.tsx");

    expect(ui).toContain(
      'o.kind === "offer_box"'
    );
    expect(ui).toContain(
      'x.kind === "offer_box"'
    );
    expect(ui).toContain(
      "o.pricingSource.finalPrice"
    );
    expect(ui).toContain(
      "x.pricingSource.finalPrice"
    );
  });

  it("does not modify the checkout pricing implementation", () => {
    const checkout = source(
      "src/app/api/offer-box/checkout/route.ts"
    );

    expect(checkout).toContain(
      "finalPrice = calculateOfferBoxFinalPrice({"
    );
    expect(checkout).toContain(
      "applyOfferDiscount: isTrue(offer.offerBoxApplyDiscount)"
    );
  });
});