import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  providerVerify: vi.fn(),
  paidStatus: vi.fn(),
  recoverActivation: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  paymobPaymentProvider: {
    verifyTransaction: mocks.providerVerify,
  },
}));

vi.mock("@/lib/payments/service", () => ({
  updatePaymentTransactionStatus: mocks.paidStatus,
  recoverPaidMembershipActivation: mocks.recoverActivation,
}));

import { reconcileExpiredPaymobMembership } from "@/lib/payments/expired-membership-paymob-reconciliation";

const original = {
  id: "tx-1",
  status: "failed",
  providerReference: "pi-1",
  externalReference: null as string | null,
  providerPayload: JSON.stringify({ intentionOrderId: "112233" }),
  metadata: "{}",
  amount: 90,
  currency: "EGP",
};

describe("Expired membership Paymob positive-only reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findMany.mockResolvedValue([{ ...original }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.providerVerify.mockResolvedValue({
      status: "paid",
      externalReference: "987654",
      providerReference: "pi-1",
      payload: { intentionOrderId: "112233", paymobTransactionId: "987654" },
    });
    mocks.paidStatus.mockResolvedValue({ status: "paid" });
    mocks.recoverActivation.mockResolvedValue({ status: "paid" });
  });

  it("does nothing if no Paymob membership payment exists", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "not_paymob",
    });
    expect(mocks.providerVerify).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to guess which payment owner to settle", async () => {
    mocks.findMany.mockResolvedValue([{ ...original }, { ...original, id: "tx-2" }]);
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "unresolved",
    });
    expect(mocks.providerVerify).not.toHaveBeenCalled();
  });

  it.each(["failed", "pending", "cancelled", "expired"])(
    "does not cancel, refund or activate on a %s provider inquiry",
    async (status) => {
      mocks.providerVerify.mockResolvedValue({ status });
      expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
        kind: "unresolved",
      });
      expect(mocks.updateMany).not.toHaveBeenCalled();
      expect(mocks.paidStatus).not.toHaveBeenCalled();
    },
  );

  it("promotes a provider-proven paid transaction exactly through CAS", async () => {
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "paid_recovered",
    });
    expect(mocks.providerVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "tx-1",
        amount: 90,
        currency: "EGP",
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tx-1",
          status: "failed",
          providerPayload: original.providerPayload,
          externalReference: null,
        }),
        data: expect.objectContaining({ externalReference: "987654" }),
      }),
    );
    expect(mocks.paidStatus).toHaveBeenCalledWith("tx-1", "paid");
  });

  it("blocks an existing different acceptance transaction", async () => {
    mocks.findMany.mockResolvedValue([{ ...original, externalReference: "123456" }]);
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "unresolved",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not activate if a concurrent webhook won the CAS", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "unresolved",
    });
    expect(mocks.paidStatus).not.toHaveBeenCalled();
  });

  it("repairs an already-paid payment's missing activation", async () => {
    mocks.findMany.mockResolvedValue([{ ...original, status: "paid" }]);
    expect(await reconcileExpiredPaymobMembership("mem-a")).toEqual({
      kind: "paid_recovered",
    });
    expect(mocks.recoverActivation).toHaveBeenCalledWith("tx-1");
    expect(mocks.providerVerify).not.toHaveBeenCalled();
  });
});
