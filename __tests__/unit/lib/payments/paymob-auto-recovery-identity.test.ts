import { describe, expect, it } from "vitest";
import {
  buildPaymobRecoveryIdentity,
} from "@/lib/payments/paymob-auto-recovery-identity";

const payment = {
  id: "payment-1",
  purpose: "membership",
  provider: "paymob",
  membershipId: "membership-1",
  amount: 343,
  currency: "EGP",
  referenceCode: "FZ-Offers-0000115",
  providerReference: "pi_live_5a14cfd9e274473cac19ffda5f3cedbe",
};

describe("Paymob automatic recovery identity", () => {
  it("builds complete identity from a membership payment", () => {
    expect(buildPaymobRecoveryIdentity(payment)).toEqual({
      paymentTransactionId: "payment-1",
      expectedAmount: 343,
      expectedCurrency: "EGP",
      expectedFitZoneReference: "FZ-Offers-0000115",
      expectedIntentionId: payment.providerReference,
    });
  });

  it("rejects missing intention", () => {
    expect(buildPaymobRecoveryIdentity({
      ...payment,
      providerReference: null,
    })).toBeNull();
  });

  it("rejects non-membership payments", () => {
    expect(buildPaymobRecoveryIdentity({
      ...payment,
      purpose: "wallet_topup",
    })).toBeNull();
  });

  it("rejects invalid amounts and references", () => {
    expect(buildPaymobRecoveryIdentity({
      ...payment,
      amount: 0,
    })).toBeNull();

    expect(buildPaymobRecoveryIdentity({
      ...payment,
      referenceCode: null,
    })).toBeNull();
  });
});
