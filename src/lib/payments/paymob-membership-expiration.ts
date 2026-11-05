/**
 * Paymob Unified Checkout expiry policy.
 *
 * Ordinary payments preserve the existing 30-minute setting.
 * Membership checkouts use the remaining ORIGINAL membership
 * hold, with a 30-second provider/network safety margin.
 */
const DEFAULT_CHECKOUT_SECONDS = 30 * 60;
const MAX_MEMBERSHIP_SECONDS = 60 * 60;
const SAFETY_SECONDS = 30;
const MIN_CHECKOUT_SECONDS = 15;

export function resolvePaymobIntentionExpiration(input: {
  membershipHoldExpiresAt?: Date | null;
  now?: Date;
}): number {
  if (input.membershipHoldExpiresAt == null) {
    return DEFAULT_CHECKOUT_SECONDS;
  }

  const now = (input.now ?? new Date()).getTime();
  const hold = input.membershipHoldExpiresAt.getTime();

  if (!Number.isFinite(now) || !Number.isFinite(hold)) {
    throw new Error("PAYMOB_CHECKOUT_INVALID_EXPIRY");
  }

  const seconds = Math.floor((hold - now) / 1000) - SAFETY_SECONDS;

  if (seconds < MIN_CHECKOUT_SECONDS) {
    throw new Error("PAYMOB_CHECKOUT_HOLD_TOO_CLOSE_TO_EXPIRY");
  }

  return Math.min(MAX_MEMBERSHIP_SECONDS, seconds);
}