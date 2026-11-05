import { describe, expect, it, vi } from "vitest";
import { discoverAndRecoverPaymobPayment } from "@/lib/payments/paymob-auto-recovery-discovery";

const identity = {
  paymentTransactionId: "payment-1",
  expectedAmount: 343,
  expectedCurrency: "EGP",
  expectedFitZoneReference: "FZ-Offers-0000113",
  expectedIntentionId: "pi_live_example",
};

const proof = {
  found: true,
  status: "paid" as const,
  paymobTransactionId: "561950293",
  merchantOrderId: "payment-1",
  amountCents: 34300,
  currency: "EGP",
  pending: false,
  success: true,
};

describe("Paymob discovery to verified recovery", () => {
  it("passes complete matching proof to verified recovery", async () => {
    const inquire = vi.fn().mockResolvedValue(proof);
    const recoverVerified = vi.fn().mockResolvedValue({ status: "paid" });

    expect(await discoverAndRecoverPaymobPayment(
      identity, { inquire, recoverVerified },
    )).toBe("paid_recovered");

    expect(inquire).toHaveBeenCalledExactlyOnceWith("payment-1");
    expect(recoverVerified).toHaveBeenCalledExactlyOnceWith({
      ...identity,
      paymobTransactionId: "561950293",
    });
  });

  it.each([
    [{ ...proof, found: false }],
    [{ ...proof, success: false }],
    [{ ...proof, pending: true }],
    [{ ...proof, merchantOrderId: "another-payment" }],
    [{ ...proof, amountCents: 1 }],
    [{ ...proof, currency: "USD" }],
    [{ ...proof, paymobTransactionId: null }],
  ])("never activates from incomplete or mismatched inquiry", async (response) => {
    const recoverVerified = vi.fn();

    expect(await discoverAndRecoverPaymobPayment(
      identity,
      {
        inquire: vi.fn().mockResolvedValue(response),
        recoverVerified,
      },
    )).toBe("unresolved");

    expect(recoverVerified).not.toHaveBeenCalled();
  });
});
