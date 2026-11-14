import { describe, expect, it, vi } from "vitest";
import {
  readCurrentPaymobRecoveryCandidate,
} from "@/lib/payments/paymob-auto-recovery-reader";

describe("Paymob recovery current payment reader", () => {
  it("re-reads the payment and linked membership", async () => {
    const db = {
      paymentTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "payment-1",
          purpose: "membership",
          provider: "paymob",
          status: "paid",
          membershipId: "membership-1",
          metadata: null,
        }),
      },
      userMembership: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership-1",
          status: "pending_payment",
        }),
      },
    };

    expect(await readCurrentPaymobRecoveryCandidate(
      db,
      "payment-1",
    )).toMatchObject({
      paymentStatus: "paid",
      membershipStatus: "pending_payment",
      reconciliationCompleted: false,
    });

    expect(db.paymentTransaction.findUnique)
      .toHaveBeenCalledOnce();
    expect(db.userMembership.findUnique)
      .toHaveBeenCalledOnce();
  });

  it("does not trust completion metadata on cancelled memberships", async () => {
    const db = {
      paymentTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "payment-2",
          purpose: "membership",
          provider: "paymob",
          status: "paid",
          membershipId: "membership-2",
          metadata: JSON.stringify({
            postActivationReconciliation: {
              completed: true,
              userMembershipId: "membership-2",
            },
          }),
        }),
      },
      userMembership: {
        findUnique: vi.fn().mockResolvedValue({
          id: "membership-2",
          status: "cancelled",
        }),
      },
    };

    expect(await readCurrentPaymobRecoveryCandidate(
      db,
      "payment-2",
    )).toMatchObject({
      reconciliationCompleted: false,
      membershipStatus: "cancelled",
    });
  });

  it("rejects empty payment identifiers without database access", async () => {
    const db = {
      paymentTransaction: { findUnique: vi.fn() },
      userMembership: { findUnique: vi.fn() },
    };

    await expect(readCurrentPaymobRecoveryCandidate(
      db,
      "",
    )).rejects.toThrow("INVALID_RECOVERY_PAYMENT_ID");

    expect(db.paymentTransaction.findUnique).not.toHaveBeenCalled();
  });
});
