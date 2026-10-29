import { describe, expect, it } from "vitest";
import { decidePaymobRecoveryDispatch } from "@/lib/payments/paymob-auto-recovery-dispatch";
import type { PaymobRecoveryCandidateInput } from "@/lib/payments/paymob-auto-recovery-candidate";

const base: PaymobRecoveryCandidateInput = {
  purpose: "membership",
  provider: "paymob",
  paymentStatus: "pending",
  membershipStatus: "pending_payment",
  membershipId: "membership-1",
  reconciliationCompleted: false,
};

describe("Paymob automatic recovery dispatch safety", () => {
  it.each(["pending", "requires_action", "processing"])(
    "only inquires for unresolved %s payments",
    (paymentStatus) => {
      expect(decidePaymobRecoveryDispatch({
        ...base,
        paymentStatus,
      })).toBe("inquire_only");
    },
  );

  it.each(["failed", "cancelled", "expired"])(
    "never activates terminal %s payments without proof",
    (paymentStatus) => {
      expect(decidePaymobRecoveryDispatch({
        ...base,
        paymentStatus,
        membershipStatus: "cancelled",
      })).toBe("inquire_only");
    },
  );

  it("may repair a locally paid pending membership", () => {
    expect(decidePaymobRecoveryDispatch({
      ...base,
      paymentStatus: "paid",
    })).toBe("repair_paid_membership");
  });

  it("may repair a paid active membership with missing reconciliation", () => {
    expect(decidePaymobRecoveryDispatch({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "active",
    })).toBe("repair_paid_membership");
  });

  it("skips a fully reconciled active membership", () => {
    expect(decidePaymobRecoveryDispatch({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "active",
      reconciliationCompleted: true,
    })).toBe("skip");
  });

  it("never reopens a cancelled membership on local paid status", () => {
    expect(decidePaymobRecoveryDispatch({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "cancelled",
    })).toBe("skip");
  });

  it.each(["order", "wallet_topup", "offer_box", "package"])(
    "excludes unrelated %s transactions",
    (purpose) => {
      expect(decidePaymobRecoveryDispatch({
        ...base,
        purpose,
      })).toBe("skip");
    },
  );

  it("excludes payments without membership linkage", () => {
    expect(decidePaymobRecoveryDispatch({
      ...base,
      membershipId: null,
    })).toBe("skip");
  });
});
