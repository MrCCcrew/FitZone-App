import { describe, expect, it, vi } from "vitest";
import { executeVerifiedPaymobRecovery } from "@/lib/payments/paymob-auto-recovery-bridge";

const identity = {
  paymentTransactionId: "payment-1",
  paymobTransactionId: "561950293",
  expectedAmount: 343,
  expectedCurrency: "EGP",
  expectedFitZoneReference: "FZ-Offers-0000113",
  expectedIntentionId: "pi_live_example",
};

describe("Paymob verified recovery bridge", () => {
  it("passes complete identity to the verified recovery dependency", async () => {
    const recoverVerified = vi.fn().mockResolvedValue({ status: "paid" });

    expect(await executeVerifiedPaymobRecovery(
      identity, { recoverVerified },
    )).toBe("paid_recovered");

    expect(recoverVerified).toHaveBeenCalledExactlyOnceWith(identity);
  });

  it("rejects missing Paymob transaction ID without calling recovery", async () => {
    const recoverVerified = vi.fn();

    expect(await executeVerifiedPaymobRecovery(
      { ...identity, paymobTransactionId: "" },
      { recoverVerified },
    )).toBe("unresolved");

    expect(recoverVerified).not.toHaveBeenCalled();
  });

  it("rejects invalid monetary amount", async () => {
    const recoverVerified = vi.fn();

    expect(await executeVerifiedPaymobRecovery(
      { ...identity, expectedAmount: Number.NaN },
      { recoverVerified },
    )).toBe("unresolved");

    expect(recoverVerified).not.toHaveBeenCalled();
  });

  it("rejects missing intention linkage", async () => {
    const recoverVerified = vi.fn();

    expect(await executeVerifiedPaymobRecovery(
      { ...identity, expectedIntentionId: "" },
      { recoverVerified },
    )).toBe("unresolved");

    expect(recoverVerified).not.toHaveBeenCalled();
  });

  it("does not report recovered without paid result", async () => {
    const recoverVerified = vi.fn().mockResolvedValue({ status: "pending" });

    expect(await executeVerifiedPaymobRecovery(
      identity, { recoverVerified },
    )).toBe("unresolved");
  });
});
