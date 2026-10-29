import { describe, expect, it, vi } from "vitest";
import {
  discoverAndRecoverPaymobPayment,
} from "@/lib/payments/paymob-auto-recovery-discovery";

const identity = {
  paymentTransactionId: "payment-1",
  expectedAmount: 343,
  expectedCurrency: "EGP",
  expectedFitZoneReference: "FZ-Membership-001",
  expectedIntentionId: "pi_live_example",
};

const paid = {
  found: true,
  status: "paid" as const,
  paymobTransactionId: "222222222",
  merchantOrderId: "payment-1",
  amountCents: 34300,
  currency: "EGP",
  pending: false,
  success: true,
};

describe("Paymob retained-payment fallback guard", () => {
  it.each([
    ["refunded", "refunded"],
    ["voided", "voided"],
    ["partially_refunded", "partially_refunded"],
    ["duplicate_charge", "duplicate_charge"],
  ])("does not bypass explicit %s evidence", async (_name, reason) => {
    const inquireOrderAttempts = vi.fn().mockResolvedValue(paid);
    const recoverVerified = vi.fn();

    const inquiry = {
      ...paid,
      status: "pending" as const,
      success: true,
      retainedPaymentFailure: reason,
    };

    const result = await discoverAndRecoverPaymobPayment(identity, {
      inquire: vi.fn().mockResolvedValue(inquiry),
      inquireOrderAttempts,
      recoverVerified,
    });

    expect(result).toBe("unresolved");
    expect(inquireOrderAttempts).not.toHaveBeenCalled();
    expect(recoverVerified).not.toHaveBeenCalled();
  });
});
