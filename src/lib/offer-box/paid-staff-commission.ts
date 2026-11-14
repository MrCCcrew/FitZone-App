function hasInternalCommercialConsideration(snapshot: string): boolean {
  try { return readDirectCommercialConsideration(snapshot, 0) !== null; }
  catch { return false; }
}
import { readDirectCommercialConsideration } from "@/lib/offer-box/direct-commercial-consideration";
import {
  calculateCommission,
  parseMembershipCommissionSnapshot,
} from "@/lib/commissions/membership-commission-contract";

/**
 * Builds immutable commission earning data from a PAID purchase snapshot.
 *
 * This pure function never asserts that Paymob was paid. Its caller must
 * first verify the provider Order, successful transaction identity, amount,
 * currency and ownership. The commission and purchase state must then be
 * committed atomically under the purchase row lock.
 */
export function preparePaidOfferBoxStaffCommission(input: {
  purchaseId: string;
  offerSnapshot: string;
  paidAmount: number;
  paidCurrency: string;
  paidAt: Date;
}) {
  if (!input.purchaseId?.trim()) {
    throw new Error("OFFER_BOX_COMMISSION_PURCHASE_REQUIRED");
  }

  if (
    !(input.paidAt instanceof Date) ||
    !Number.isFinite(input.paidAt.getTime())
  ) {
    throw new Error("OFFER_BOX_COMMISSION_INVALID_PAID_AT");
  }

  if (
    !Number.isFinite(input.paidAmount) ||
    input.paidAmount < 0 ||
    (input.paidAmount === 0 && !hasInternalCommercialConsideration(input.offerSnapshot))
  ) {
    throw new Error("OFFER_BOX_COMMISSION_INVALID_PAYMENT_AMOUNT");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(input.offerSnapshot);
  } catch {
    throw new Error("OFFER_BOX_COMMISSION_INVALID_PURCHASE_SNAPSHOT");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error("OFFER_BOX_COMMISSION_INVALID_PURCHASE_SNAPSHOT");
  }

  const snapshot = parsed as {
    version?: unknown;
    commercial?: {
      currency?: unknown;
      finalPrice?: unknown;
    };
    economics?: {
      commissionSnapshot?: unknown;
    };
  };

  if (snapshot.version !== 1) {
    throw new Error("OFFER_BOX_COMMISSION_SNAPSHOT_VERSION_MISMATCH");
  }

  const expectedCurrency = snapshot.commercial?.currency;
  const expectedAmount = snapshot.commercial?.finalPrice;

  if (
    expectedCurrency !== "EGP" ||
    input.paidCurrency !== expectedCurrency
  ) {
    throw new Error("OFFER_BOX_COMMISSION_CURRENCY_MISMATCH");
  }

  if (
    typeof expectedAmount !== "number" ||
    !Number.isFinite(expectedAmount) ||
    Math.round(expectedAmount * 100) !==
      Math.round(input.paidAmount * 100)
  ) {
    throw new Error("OFFER_BOX_COMMISSION_PAYMENT_AMOUNT_MISMATCH");
  }

  const frozenCommission = snapshot.economics?.commissionSnapshot;

  if (typeof frozenCommission !== "string" || !frozenCommission.trim()) {
    throw new Error("OFFER_BOX_COMMISSION_SNAPSHOT_MISSING");
  }

  const commission = parseMembershipCommissionSnapshot(frozenCommission);
  const staff = commission.staff;

  if (!staff) {
    return null;
  }

  if (
    !staff.staffUserId?.trim() ||
    !staff.referralLinkId?.trim()
  ) {
    throw new Error("OFFER_BOX_COMMISSION_INVALID_STAFF_IDENTITY");
  }

  const amount = calculateCommission(staff.terms);
  const policy = staff.policy;

  // Legacy zero-value commissions were not materialized.
  // Modern policy zero-rate decisions remain auditable as ineligible.
  if (amount <= 0 && !policy) {
    return null;
  }

  const paidAt = new Date(input.paidAt.getTime());
  const baseMinor = Math.round(staff.terms.baseAmount * 100);
  const amountMinor = Math.round(amount * 100);

  return {
    offerBoxPurchaseId: input.purchaseId,
    staffUserId: staff.staffUserId,
    staffReferralLinkId: staff.referralLinkId,
    userMembershipId: null,
    amount,
    earnedAt: paidAt,
    status: policy && amount <= 0 ? "ineligible" : "earned",
    ...(policy
      ? {
          customerClassificationSnapshot: policy.classification,
          previousMembershipIdSnapshot: policy.previousMembershipId,
          previousMembershipEndDateSnapshot:
            policy.previousMembershipEndDate
              ? new Date(policy.previousMembershipEndDate)
              : null,
          gapDaysSnapshot: policy.gapDays,
          referralPolicyIdSnapshot: policy.policyId,
          positionIdSnapshot: policy.positionId,
          positionCodeSnapshot: policy.positionCode,
          commissionRateBpsSnapshot: policy.rateBps,
          commissionBaseMinorSnapshot: baseMinor,
          commissionAmountMinorSnapshot: amountMinor,
        }
      : {}),
  };
}
