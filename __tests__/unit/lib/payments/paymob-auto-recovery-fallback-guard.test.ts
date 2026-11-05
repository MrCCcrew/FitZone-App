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

describe("Paymob fallback financial guard", () => {
  it.each([
    ["failed attempt", {
      ...paid,
      status: "failed" as const,
      success: false,
      paymobTransactionId: "111111111",
    }],
    ["pending attempt", {
      ...paid,
      status: "pending" as const,
      pending: true,
      success: false,
      paymobTransactionId: "111111111",
    }],
  ])("can inspect Order after %s", async (_name, inquiry) => {
    const inquireOrderAttempts = vi.fn().mockResolvedValue(paid);
    const recoverVerified = vi.fn().mockResolvedValue({
      status: "paid",
    });

    expect(await discoverAndRecoverPaymobPayment(identity, {
      inquire: vi.fn().mockResolvedValue(inquiry),
      inquireOrderAttempts,
      recoverVerified,
    })).toBe("paid_recovered");

    expect(inquireOrderAttempts).toHaveBeenCalledOnce();
    expect(recoverVerified).toHaveBeenCalledOnce();
  });

  it("never bypasses a mismatched merchant identity", async () => {
    const inquireOrderAttempts = vi.fn().mockResolvedValue(paid);
    const recoverVerified = vi.fn();

    const result = await discoverAndRecoverPaymobPayment(identity, {
      inquire: vi.fn().mockResolvedValue({
        ...paid,
        merchantOrderId: "another-payment",
      }),
      inquireOrderAttempts,
      recoverVerified,
    });

    expect(result).toBe("unresolved");
    expect(inquireOrderAttempts).not.toHaveBeenCalled();
    expect(recoverVerified).not.toHaveBeenCalled();
  });
});
