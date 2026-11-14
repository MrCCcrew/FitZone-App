import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  prepare: vi.fn(),
  accrue: vi.fn(),
  outerPurchase: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    offerBoxPurchase: {
      findUniqueOrThrow: mocks.outerPurchase,
    },
  },
  asDbTransactionClient: (tx: unknown) => tx,
}));

vi.mock("@/lib/offer-box/paid-staff-commission", () => ({
  preparePaidOfferBoxStaffCommission: mocks.prepare,
}));

vi.mock("@/lib/offer-box/paid-staff-commission-tx", () => ({
  accruePreparedOfferBoxStaffCommissionTx: mocks.accrue,
}));

import {
  reconcilePaidOfferBoxPurchase,
} from "@/lib/payments/offer-box-payment";

const now = new Date("2026-11-10T10:00:00.000Z");

const input = {
  transactionId: "test-payment",
  purchaseId: "test-purchase",
  paidAt: now,
  paymobOrderPaidVerified: true,
};

function makeTx(legacy: boolean, dualCommission = false) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([{
      id: input.purchaseId,
      userId: "test-user",
      offerId: "test-offer",
      status: legacy ? "redeemed" : "available",
      paymentTransactionId: input.transactionId,
      redeemedUserMembershipId: legacy
        ? "legacy-membership"
        : null,
    }]),

    $executeRaw: vi.fn(),

    paymentTransaction: {
      findUnique: vi.fn().mockResolvedValue({
        id: input.transactionId,
        userId: "test-user",
        purpose: "offer_box",
        provider: "paymob",
        status: "paid",
        paidAt: now,
        membershipId: legacy
          ? "legacy-membership"
          : null,
        amount: 500,
        currency: "EGP",
      }),
    },

    offerBoxPurchase: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        commercialKind: "offer_box",
      }),
      findUnique: vi.fn().mockResolvedValue({
        offerSnapshot: "{}",
        priceSnapshot: 500,
        currency: "EGP",
      }),
    },

    userMembership: {
      findUnique: vi.fn().mockResolvedValue({
        id: "legacy-membership",
        userId: "test-user",
      }),
    },

    staffCommission: {
      findUnique: vi.fn().mockResolvedValue(
        dualCommission
          ? { id: "unexpected-independent-commission" }
          : null,
      ),
    },
  };
}

describe("Offer Box historical HR commission safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.outerPurchase.mockResolvedValue({
      id: input.purchaseId,
      userId: "test-user",
      commercialKind: "offer_box",
    });

    mocks.prepare.mockReturnValue(null);

    mocks.accrue.mockResolvedValue({
      created: false,
      commissionId: null,
    });
  });

  it("never creates independent commission on legacy redeemed purchase replay", async () => {
    const tx = makeTx(true);

    mocks.transaction.mockImplementation(
      async (callback) => callback(tx),
    );

    await expect(
      reconcilePaidOfferBoxPurchase(input),
    ).resolves.toEqual({
      alreadyReconciled: true,
      status: "redeemed",
    });

    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.accrue).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("fails closed if a historical redemption already has a second commission identity", async () => {
    const tx = makeTx(true, true);

    mocks.transaction.mockImplementation(
      async (callback) => callback(tx),
    );

    await expect(
      reconcilePaidOfferBoxPurchase(input),
    ).rejects.toThrow(
      "OFFER_BOX_LEGACY_DUAL_COMMISSION_REVIEW_REQUIRED",
    );

    expect(mocks.accrue).not.toHaveBeenCalled();
  });

  it("keeps independent paid commission accrual for new Offer Box purchases", async () => {
    const tx = makeTx(false);

    mocks.transaction.mockImplementation(
      async (callback) => callback(tx),
    );

    await expect(
      reconcilePaidOfferBoxPurchase(input),
    ).resolves.toEqual({
      alreadyReconciled: true,
      status: "available",
    });

    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    expect(mocks.accrue).toHaveBeenCalledTimes(1);
    expect(tx.userMembership.findUnique).not.toHaveBeenCalled();
  });
});