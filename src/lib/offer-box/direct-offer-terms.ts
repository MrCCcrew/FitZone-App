/**
 * Authoritative commercial terms for an independent individual offer.
 * Never creates, activates, or modifies UserMembership.
 *
 * The caller must enforce transactional capacity reservations,
 * payment verification, frozen entitlement ownership and settlement.
 */
export type DirectOfferSource = {
  id: string;
  isActive: boolean;
  type: string;
  offerBoxEnabled: boolean;
  friendOfferConfig?: { isActive: boolean } | null;
  expiresAt: Date;
  specialPrice: number | null;
  priceBefore: number | null;
  durationDays: number | null;
  sessionsCount: number | null;
  currentSubscribers: number;
  maxSubscribers: number | null;
};

export function resolveIndependentDirectOfferTerms(
  offer: DirectOfferSource,
  now: Date,
) {
  if (
    !(now instanceof Date) ||
    !Number.isFinite(now.getTime()) ||
    !(offer.expiresAt instanceof Date) ||
    !Number.isFinite(offer.expiresAt.getTime())
  ) {
    throw new Error("DIRECT_OFFER_INVALID_DATE");
  }

  if (!offer.id || !offer.isActive || offer.expiresAt <= now) {
    throw new Error("DIRECT_OFFER_UNAVAILABLE");
  }

  if (offer.friendOfferConfig?.isActive === true) {
    throw new Error("DIRECT_OFFER_FRIEND_MODE_BLOCKED");
  }

  if (offer.offerBoxEnabled) {
    throw new Error("DIRECT_OFFER_BOX_MODE_BLOCKED");
  }

  if (offer.type !== "special") {
    throw new Error("DIRECT_OFFER_INVALID_TYPE");
  }

  const price = offer.specialPrice;
  const duration = offer.durationDays;
  const sessions = offer.sessionsCount;

  if (
    price === null ||
    !Number.isFinite(price) ||
    price <= 0 ||
    !Number.isSafeInteger(Math.round(price * 100)) ||
    Math.round(price * 100) !== price * 100
  ) {
    throw new Error("DIRECT_OFFER_INVALID_PRICE");
  }

  if (!Number.isSafeInteger(duration) || (duration ?? 0) <= 0) {
    throw new Error("DIRECT_OFFER_INVALID_DURATION");
  }

  if (!Number.isSafeInteger(sessions) || (sessions ?? 0) <= 0) {
    throw new Error("DIRECT_OFFER_INVALID_SESSIONS");
  }

  if (
    !Number.isSafeInteger(offer.currentSubscribers) ||
    offer.currentSubscribers < 0 ||
    (
      offer.maxSubscribers !== null &&
      (
        !Number.isSafeInteger(offer.maxSubscribers) ||
        offer.maxSubscribers < 0
      )
    )
  ) {
    throw new Error("DIRECT_OFFER_INVALID_CAPACITY");
  }

  if (
    offer.maxSubscribers !== null &&
    offer.maxSubscribers > 0 &&
    offer.currentSubscribers >= offer.maxSubscribers
  ) {
    throw new Error("DIRECT_OFFER_SOLD_OUT");
  }

  const originalPrice =
    offer.priceBefore !== null &&
    Number.isFinite(offer.priceBefore) &&
    offer.priceBefore >= price
      ? offer.priceBefore
      : price;

  return {
    offerId: offer.id,
    kind: "direct_offer" as const,
    currency: "EGP" as const,
    price,
    originalPrice,
    durationDays: duration as number,
    sessionsCount: sessions as number,
    expiresAt: new Date(offer.expiresAt.getTime()),
  };
}