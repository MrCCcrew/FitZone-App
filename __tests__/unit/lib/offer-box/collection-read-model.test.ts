import { describe, expect, it } from "vitest";
import {
  readOfferBoxCollection,
  type OfferBoxCollectionPurchase,
  type OfferBoxCollectionPayment,
} from "@/lib/offer-box/collection-read-model";

const paidAt = new Date("2026-11-10T10:00:00Z");

const purchase: OfferBoxCollectionPurchase = {
  id: "purchase-1",
  userId: "customer-1",
  offerId: "offer-1",
  status: "available",
  priceSnapshot: 500,
  currency: "EGP",
  offerSnapshot: JSON.stringify({
    offer: { title: "Frozen Offer" },
  }),
  paymentTransactionId: "payment-1",
  redeemedUserMembershipId: null,
  paidAt,
  createdAt: paidAt,
};

const payment: OfferBoxCollectionPayment = {
  id: "payment-1",
  userId: "customer-1",
  offerId: "offer-1",
  purpose: "offer_box",
  provider: "paymob",
  status: "paid",
  amount: 500,
  currency: "EGP",
  paidAt,
  membershipId: null,
  metadata: JSON.stringify({
    offerBoxPurchaseId: "purchase-1",
  }),
};

describe("independent Offer Box collection", () => {
  it("counts reconciled paid purchases before redemption", () => {
    const result = readOfferBoxCollection(purchase, payment);

    expect(result.confirmedPaidAmount).toBe(500);
    expect(result.offerTitle).toBe("Frozen Offer");
    expect(result.needsFinancialReview).toBe(false);
  });

  it("preserves the same collection after redemption", () => {
    expect(
      readOfferBoxCollection(
        { ...purchase, status: "redeemed" },
        payment,
      ).confirmedPaidAmount,
    ).toBe(500);
  });

  it("does not count a pending purchase", () => {
    expect(
      readOfferBoxCollection(
        { ...purchase, status: "pending_payment", paidAt: null },
        payment,
      ).confirmedPaidAmount,
    ).toBe(0);
  });

  it("does not count a paid local transaction without purchase reconciliation", () => {
    const result = readOfferBoxCollection(
      { ...purchase, paidAt: null },
      payment,
    );

    expect(result.confirmedPaidAmount).toBe(0);
    expect(result.needsFinancialReview).toBe(true);
  });

  it("does not duplicate historical membership redemption", () => {
    expect(
      readOfferBoxCollection(
        {
          ...purchase,
          status: "redeemed",
          redeemedUserMembershipId: "old-membership",
        },
        { ...payment, membershipId: "old-membership" },
      ).confirmedPaidAmount,
    ).toBe(0);
  });

  it.each([
    { userId: "another-user" },
    { id: "another-payment" },
    { offerId: "another-offer" },
    { amount: 400 },
    { currency: "USD" },
    { purpose: "membership" },
    { status: "failed" },
    { membershipId: "unexpected-membership" },
    { metadata: '{"offerBoxPurchaseId":"another-purchase"}' },
    { metadata: "invalid-json" },
    { paidAt: null },
  ])("rejects mismatched payment evidence: %j", (change) => {
    const result = readOfferBoxCollection(
      purchase,
      { ...payment, ...change },
    );

    expect(result.confirmedPaidAmount).toBe(0);
    expect(result.needsFinancialReview).toBe(true);
  });

  it("rejects missing payment evidence", () => {
    expect(
      readOfferBoxCollection(purchase, null).confirmedPaidAmount,
    ).toBe(0);
  });
});