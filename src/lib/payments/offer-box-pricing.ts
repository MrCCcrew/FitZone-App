/**
 * Offer Box price locked into the purchase/payment snapshot.
 * An already-discounted membership price is preserved by default.
 * Only an explicit admin opt-in applies the offer's extra percentage/fixed
 * discount once on top of that price. Special offers retain specialPrice.
 */
export function calculateOfferBoxFinalPrice(input: {
  offerType: string;
  discount: number;
  specialPrice: number | null;
  membershipPriceAfter: number | null;
  basePrice: number;
  applyOfferDiscount: boolean;
}): number {
  const startingPrice =
    input.membershipPriceAfter != null && input.membershipPriceAfter > 0
      ? input.membershipPriceAfter
      : input.basePrice;
  if (!Number.isFinite(startingPrice) || startingPrice <= 0) {
    throw new Error("OFFER_BOX_INVALID_PRICE");
  }

  if (input.offerType === "special") {
    return input.specialPrice ?? startingPrice;
  }
  if (!input.applyOfferDiscount) return startingPrice;

  const discount = input.discount;
  if (!Number.isFinite(discount) || discount <= 0 ||
      (input.offerType === "percentage" && discount >= 100)) {
    throw new Error("OFFER_BOX_INVALID_DISCOUNT");
  }
  if (input.offerType === "percentage") {
    return Math.round(startingPrice * (100 - discount)) / 100;
  }
  if (input.offerType === "fixed") {
    return Math.round(Math.max(0, startingPrice - discount) * 100) / 100;
  }
  throw new Error("OFFER_BOX_UNSUPPORTED_DISCOUNT_TYPE");
}
