import { describe, expect, it, vi } from "vitest";
import {
  executePaymobRecoveryJob,
} from "@/lib/payments/paymob-auto-recovery-orchestrator";

const base = {
  purpose: "membership",
  provider: "paymob",
  membershipId: "membership-1",
  reconciliationCompleted: false,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    readCurrent: vi.fn().mockResolvedValue({
      ...base,
      paymentStatus: "pending",
      membershipStatus: "pending_payment",
    }),
    discoverVerified: vi.fn().mockResolvedValue("unresolved"),
    repairPaid: vi.fn().mockResolvedValue(false),
    isFullyReconciled: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
}

describe("Paymob recovery orchestrator", () => {
  it("does not activate a payment with unresolved provider proof", async () => {
    const deps = dependencies();

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("retry");

    expect(deps.repairPaid).not.toHaveBeenCalled();
    expect(deps.isFullyReconciled).not.toHaveBeenCalled();
  });

  it("completes only after independently confirming reconciliation", async () => {
    const deps = dependencies({
      discoverVerified: vi.fn().mockResolvedValue("paid_recovered"),
      isFullyReconciled: vi.fn().mockResolvedValue(true),
    });

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("completed");

    expect(deps.isFullyReconciled).toHaveBeenCalledWith("payment-1");
  });

  it("does not complete when financial reconciliation is incomplete", async () => {
    const deps = dependencies({
      discoverVerified: vi.fn().mockResolvedValue("paid_recovered"),
    });

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("retry");
  });

  it("uses paid repair only for an already-paid eligible membership", async () => {
    const deps = dependencies({
      readCurrent: vi.fn().mockResolvedValue({
        ...base,
        paymentStatus: "paid",
        membershipStatus: "pending_payment",
      }),
      repairPaid: vi.fn().mockResolvedValue(true),
      isFullyReconciled: vi.fn().mockResolvedValue(true),
    });

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("completed");

    expect(deps.repairPaid).toHaveBeenCalledWith("payment-1");
    expect(deps.discoverVerified).not.toHaveBeenCalled();
  });

  it("does not reactivate a cancelled paid membership", async () => {
    const deps = dependencies({
      readCurrent: vi.fn().mockResolvedValue({
        ...base,
        paymentStatus: "paid",
        membershipStatus: "cancelled",
      }),
    });

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("manual_review");

    expect(deps.repairPaid).not.toHaveBeenCalled();
    expect(deps.discoverVerified).not.toHaveBeenCalled();
  });

  it("routes missing payment records to manual review", async () => {
    const deps = dependencies({
      readCurrent: vi.fn().mockResolvedValue(null),
    });

    expect(await executePaymobRecoveryJob("payment-1", deps))
      .toBe("manual_review");

    expect(deps.discoverVerified).not.toHaveBeenCalled();
  });
});
