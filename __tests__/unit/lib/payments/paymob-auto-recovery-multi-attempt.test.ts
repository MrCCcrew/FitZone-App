import { describe, expect, it, vi } from "vitest";
import {
  discoverAndRecoverPaymobPayment,
} from "@/lib/payments/paymob-auto-recovery-discovery";

const identity = {
  paymentTransactionId: "payment-1",
  expectedAmount: 343,
  expectedCurrency: "EGP",
  expectedFitZoneReference: "FZ-Offers-0000113",
  expectedIntentionId: "pi_live_example",
};

describe("Paymob recovery across multiple payment attempts", () => {
  it("discovers a successful attempt after an unsuccessful inquiry", async () => {
    const recoverVerified = vi.fn().mockResolvedValue({
      status: "paid",
    });

    const inquire = vi.fn().mockResolvedValue({
      found: true,
      status: "failed",
      paymobTransactionId: "111111111",
      merchantOrderId: "payment-1",
      amountCents: 34300,
      currency: "EGP",
      pending: false,
      success: false,
    });

    const inquireOrderAttempts = vi.fn().mockResolvedValue({
      found: true,
      status: "paid",
      paymobTransactionId: "222222222",
      merchantOrderId: "payment-1",
      amountCents: 34300,
      currency: "EGP",
      pending: false,
      success: true,
    });

    const result = await discoverAndRecoverPaymobPayment(
      identity,
      {
        inquire,
        inquireOrderAttempts,
        recoverVerified,
      },
    );

    expect(result).toBe("paid_recovered");
    expect(inquireOrderAttempts).toHaveBeenCalledOnce();

    expect(recoverVerified).toHaveBeenCalledExactlyOnceWith({
      ...identity,
      paymobTransactionId: "222222222",
    });
  });
});
