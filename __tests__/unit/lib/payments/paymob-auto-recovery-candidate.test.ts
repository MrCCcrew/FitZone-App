import { describe, expect, it } from "vitest";
import {
  classifyPaymobRecoveryCandidate,
  type PaymobRecoveryCandidateInput,
} from "@/lib/payments/paymob-auto-recovery-candidate";

const base: PaymobRecoveryCandidateInput = {
  purpose: "membership",
  provider: "paymob",
  paymentStatus: "pending",
  membershipStatus: "pending_payment",
  membershipId: "membership-1",
  reconciliationCompleted: false,
};

describe("Paymob auto-recovery candidate classification", () => {
  it.each([
    ["pending", "pending_payment"],
    ["requires_action", "pending_payment"],
    ["processing", "pending_payment"],
    ["pending", "cancelled"],
    ["failed", "cancelled"],
    ["expired", "cancelled"],
    ["cancelled", "cancelled"],
  ])("requests provider verification for %s / %s", (paymentStatus, membershipStatus) => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus,
      membershipStatus,
    })).toBe("verify_provider");
  });

  it("repairs a paid payment with pending membership", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
    })).toBe("repair_paid_activation");
  });

  it("repairs incomplete financial reconciliation", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "active",
    })).toBe("repair_paid_activation");
  });

  it("skips completed payments", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "active",
      reconciliationCompleted: true,
    })).toBe("skip");
  });

  it.each(["order", "offer_box", "wallet_topup", "package"])(
    "does not touch purpose %s",
    (purpose) => {
      expect(classifyPaymobRecoveryCandidate({
        ...base,
        purpose,
      })).toBe("skip");
    },
  );

  it("does not touch unrelated providers", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      provider: "manual",
    })).toBe("skip");
  });

  it("rejects missing membership linkage", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      membershipId: null,
    })).toBe("skip");
  });

  it("does not treat unknown membership status as eligible", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      membershipStatus: "expired",
    })).toBe("skip");
  });
});


describe("Paymob recovery safety boundaries", () => {
  it("never treats a cancelled membership as automatically active", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "cancelled",
    })).toBe("skip");
  });

  it("never repairs a fully reconciled active membership twice", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "active",
      reconciliationCompleted: true,
    })).toBe("skip");
  });

  it("does not activate an expired membership based only on local paid status", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "paid",
      membershipStatus: "expired",
    })).toBe("skip");
  });

  it("keeps failed payments in verification-only mode", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "failed",
      membershipStatus: "cancelled",
    })).toBe("verify_provider");
  });

  it("keeps cancelled payments in verification-only mode", () => {
    expect(classifyPaymobRecoveryCandidate({
      ...base,
      paymentStatus: "cancelled",
      membershipStatus: "cancelled",
    })).toBe("verify_provider");
  });
});
