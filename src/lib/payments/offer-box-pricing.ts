/**
 * Canonical Offer Box checkout price, computed before snapshots/Paymob.
 * Membership.priceAfter is the base membership price; the Offer's own
 * percentage/fixed discount is applied once on top of that base.
 * Explicit specialPrice overrides discount types for backward compatibility.
 */
export function calculateOfferBoxFinalPrice(input: {
  offerType: string;
  discount: number;
  specialPrice: number | null;
  membershipPriceAfter: number | null;
  basePrice: number;
}): number {
  const startingPrice =
    input.membershipPriceAfter != null && input.membershipPriceAfter > 0
      ? input.membershipPriceAfter
      : input.basePrice;

  if (
    !Number.isFinite(startingPrice) ||
    startingPrice <= 0 ||
    !Number.isFinite(input.discount) ||
    input.discount < 0 ||
    (input.offerType === "percentage" && input.discount > 100)
  ) {
    throw new Error("OFFER_BOX_INVALID_DISCOUNT");
  }

  if (input.specialPrice != null) {
    return input.specialPrice;
  }

  if (input.offerType === "percentage") {
    return Math.round(startingPrice * (100 - input.discount)) / 100;
  }

  if (input.offerType === "fixed") {
    return Math.round(Math.max(0, startingPrice - input.discount) * 100) / 100;
  }

  return startingPrice;
}
