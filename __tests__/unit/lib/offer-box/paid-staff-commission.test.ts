import { describe, expect, it } from "vitest";
import { preparePaidOfferBoxStaffCommission } from
  "@/lib/offer-box/paid-staff-commission";

const paidAt = new Date("2026-11-07T17:00:00.000Z");

const terms = {
  type: "percentage" as const,
  rate: 10,
  baseAmount: 500,
};

const policy = {
  classification: "new_customer" as const,
  previousMembershipId: null,
  previousMembershipEndDate: null,
  gapDays: null,
  policyId: "policy-1",
  positionId: "position-1",
  positionCode: "STAFF",
  rateBps: 1000,
};

function paidInput(options: {
  withStaff?: boolean;
  withPolicy?: boolean;
  rate?: number;
  amount?: number;
} = {}) {
  const withStaff = options.withStaff ?? true;
  const commissionSnapshot = {
    version: 1,
    capturedAt: "2026-11-01T10:00:00.000Z",
    ...(withStaff
      ? {
          staff: {
            staffUserId: "staff-1",
            referralLinkId: "link-1",
            referralToken: "STAFF1",
            terms: { ...terms, rate: options.rate ?? 10 },
            ...(options.withPolicy === false ? {} : { policy }),
          },
        }
      : {}),
  };

  return {
    purchaseId: "purchase-1",
    offerSnapshot: JSON.stringify({
      version: 1,
      commercial: { currency: "EGP", finalPrice: 500 },
      economics: {
        commissionSnapshot: JSON.stringify(commissionSnapshot),
      },
    }),
    paidAmount: options.amount ?? 500,
    paidCurrency: "EGP",
    paidAt,
  };
}

describe("Offer Box paid staff commission contract", () => {
  it("calculates earned commission from frozen terms", () => {
    const result = preparePaidOfferBoxStaffCommission(paidInput());
    expect(result).toMatchObject({
      offerBoxPurchaseId: "purchase-1",
      staffUserId: "staff-1",
      staffReferralLinkId: "link-1",
      userMembershipId: null,
      amount: 50,
      status: "earned",
      customerClassificationSnapshot: "new_customer",
      commissionRateBpsSnapshot: 1000,
      commissionBaseMinorSnapshot: 50000,
      commissionAmountMinorSnapshot: 5000,
    });
    expect(result?.earnedAt.toISOString()).toBe(paidAt.toISOString());
  });

  it("does not depend on product activation date", () => {
    const result = preparePaidOfferBoxStaffCommission(paidInput());
    expect(result).not.toHaveProperty("activatedAt");
    expect(result).not.toHaveProperty("startDate");
    expect(result?.earnedAt.getTime()).toBe(paidAt.getTime());
  });

  it("does not create a commission without staff attribution", () => {
    expect(preparePaidOfferBoxStaffCommission(
      paidInput({ withStaff: false }),
    )).toBeNull();
  });

  it("records modern zero-rate referrals as ineligible", () => {
    const result = preparePaidOfferBoxStaffCommission(
      paidInput({ rate: 0 }),
    );
    expect(result?.amount).toBe(0);
    expect(result?.status).toBe("ineligible");
  });

  it("skips legacy zero-value referrals", () => {
    expect(preparePaidOfferBoxStaffCommission(
      paidInput({ rate: 0, withPolicy: false }),
    )).toBeNull();
  });

  it("rejects a mismatching paid amount", () => {
    expect(() => preparePaidOfferBoxStaffCommission(
      paidInput({ amount: 499 }),
    )).toThrow("OFFER_BOX_COMMISSION_PAYMENT_AMOUNT_MISMATCH");
  });

  it("rejects an incorrect paid currency", () => {
    expect(() => preparePaidOfferBoxStaffCommission({
      ...paidInput(),
      paidCurrency: "USD",
    })).toThrow("OFFER_BOX_COMMISSION_CURRENCY_MISMATCH");
  });

  it("rejects missing or invalid payment dates", () => {
    expect(() => preparePaidOfferBoxStaffCommission({
      ...paidInput(),
      paidAt: new Date(NaN),
    })).toThrow("OFFER_BOX_COMMISSION_INVALID_PAID_AT");
  });

  it("rejects a missing frozen commission snapshot", () => {
    const input = paidInput();
    const snapshot = JSON.parse(input.offerSnapshot);
    delete snapshot.economics.commissionSnapshot;

    expect(() => preparePaidOfferBoxStaffCommission({
      ...input,
      offerSnapshot: JSON.stringify(snapshot),
    })).toThrow("OFFER_BOX_COMMISSION_SNAPSHOT_MISSING");
  });
});
