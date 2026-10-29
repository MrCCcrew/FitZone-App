import { describe, expect, it, vi } from "vitest";
import { processPaymobAutoRecoveryItem } from "@/lib/payments/paymob-auto-recovery-executor";

const base = {
  paymentId: "payment-1",
  purpose: "membership",
  provider: "paymob",
  paymentStatus: "pending",
  membershipStatus: "pending_payment",
  membershipId: "membership-1",
  reconciliationCompleted: false,
};

describe("Paymob automatic recovery executor safety", () => {
  it("only inquires for pending payments", async () => {
    const inquire = vi.fn().mockResolvedValue("paid");
    const repairPaid = vi.fn();

    const result = await processPaymobAutoRecoveryItem(
      base,
      { inquire, repairPaid },
    );

    expect(result.kind).toBe("unresolved");
    expect(inquire).toHaveBeenCalledOnce();
    expect(repairPaid).not.toHaveBeenCalled();
  });

  it("repairs already-paid pending memberships", async () => {
    const inquire = vi.fn();
    const repairPaid = vi.fn().mockResolvedValue(undefined);

    const result = await processPaymobAutoRecoveryItem(
      { ...base, paymentStatus: "paid" },
      { inquire, repairPaid },
    );

    expect(result.kind).toBe("paid_repaired");
    expect(repairPaid).toHaveBeenCalledOnce();
    expect(inquire).not.toHaveBeenCalled();
  });

  it("never calls providers for unrelated purchases", async () => {
    const inquire = vi.fn();
    const repairPaid = vi.fn();

    const result = await processPaymobAutoRecoveryItem(
      { ...base, purpose: "offer_box" },
      { inquire, repairPaid },
    );

    expect(result.kind).toBe("skipped");
    expect(inquire).not.toHaveBeenCalled();
    expect(repairPaid).not.toHaveBeenCalled();
  });

  it("does not automatically reopen cancelled memberships", async () => {
    const inquire = vi.fn().mockResolvedValue("paid");
    const repairPaid = vi.fn();

    const result = await processPaymobAutoRecoveryItem(
      {
        ...base,
        paymentStatus: "cancelled",
        membershipStatus: "cancelled",
      },
      { inquire, repairPaid },
    );

    expect(result.kind).toBe("unresolved");
    expect(repairPaid).not.toHaveBeenCalled();
  });

  it("isolates provider failures", async () => {
    const inquire = vi.fn().mockRejectedValue(new Error("NETWORK_DOWN"));

    const result = await processPaymobAutoRecoveryItem(
      base,
      { inquire, repairPaid: vi.fn() },
    );

    expect(result).toEqual({
      kind: "error",
      paymentId: "payment-1",
      reason: "Error",
    });
  });
});
