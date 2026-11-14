import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rewardSettings: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {},
  asDbTransactionClient: (tx: unknown) => tx,
}));

vi.mock("@/lib/reward-settings", () => ({
  getRewardSettings: mocks.rewardSettings,
  calcTier: () => "bronze",
}));

import {
  settleIndependentOfferBoxActivationTx,
} from "@/lib/offer-box/redemption-settlement";

const now = new Date("2026-11-10T10:00:00.000Z");

const input = {
  purchaseId: "test-purchase",
  entitlementId: "test-entitlement",
  userId: "test-user",

  verifiedPayment: {
    verified: true,
    id: "test-payment",
    providerReference: "pi_test_offer",
    externalReference: "test-paymob-tx",
    providerPayload: "{}",
    amount: 500,
    currency: "EGP",
  },
};

function makeTx(
  options: {
    purchase?: Record<string, unknown>;
    payment?: Record<string, unknown>;
  } = {},
) {
  return {
    $queryRaw: vi.fn().mockResolvedValue([]),

    offerBoxPurchase: {
      findUnique: vi.fn().mockResolvedValue({
        id: input.purchaseId,
        userId: input.userId,
        offerId: "test-offer",
        status: "available",
        redeemedUserMembershipId: null,
        paymentTransactionId: input.verifiedPayment.id,
        paidAt: now,
        priceSnapshot: 500,
        currency: "EGP",
        snapshotVersion: 1,

        offerSnapshot: JSON.stringify({
          version: 1,
          membershipTemplate: {
            name: "Independent offer",
            walletBonus: 25,
            productRewards: JSON.stringify([
              { productId: "product-1", quantity: 2 },
            ]),
          },
          commercial: {
            currency: "EGP",
            finalPrice: 500,
          },
        }),

        ...options.purchase,
      }),
    },

    offerBoxEntitlement: {
      findUnique: vi.fn().mockResolvedValue({
        id: input.entitlementId,
        purchaseId: input.purchaseId,
        userId: input.userId,
        status: "active",
      }),
    },

    paymentTransaction: {
      findUnique: vi.fn().mockResolvedValue({
        ...input.verifiedPayment,
        userId: input.userId,
        purpose: "offer_box",
        provider: "paymob",
        status: "paid",
        paidAt: now,
        membershipId: null,
        offerId: "test-offer",
        metadata: JSON.stringify({
          offerBoxPurchaseId: input.purchaseId,
        }),
        ...options.payment,
      }),

      update: vi.fn().mockResolvedValue({}),
    },

    journal: {
      findUnique: vi.fn().mockResolvedValue(null),

      create: vi.fn().mockImplementation(
        async ({ data }) => ({
          id: `${data.referenceType}:${data.referenceId}`,
        }),
      ),
    },

    gLAccount: {
      findUnique: vi.fn().mockImplementation(
        async ({ where }) => ({
          id: where.code,
        }),
      ),
    },

    journalEntry: {
      create: vi.fn().mockResolvedValue({}),
    },

    wallet: {
      upsert: vi.fn().mockResolvedValue({
        id: "test-wallet",
      }),
    },

    walletTransaction: {
      create: vi.fn().mockResolvedValue({
        id: "test-wallet-credit",
      }),
    },

    rewardPoints: {
      findUnique: vi.fn().mockResolvedValue({
        id: "test-reward",
      }),

      update: vi.fn().mockResolvedValue({
        points: 100,
      }),
    },

    rewardHistory: {
      create: vi.fn().mockResolvedValue({
        id: "test-reward-history",
      }),
    },

    product: {
      findUnique: vi.fn()
        .mockResolvedValueOnce({
          id: "product-1",
          stock: 10,
          trackInventory: true,
          averageCost: 12,
        })
        .mockResolvedValueOnce({
          stock: 8,
        }),

      updateMany: vi.fn().mockResolvedValue({
        count: 1,
      }),
    },

    inventoryMovement: {
      create: vi.fn().mockResolvedValue({}),
    },

    notification: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("Independent Offer Box financial settlement", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.rewardSettings.mockResolvedValue({
      pointsPerSubscription: 100,
      pointValueEGP: 0.1,
      tierThresholds: {
        silver: 500,
        gold: 1500,
        platinum: 5000,
      },
    });
  });

  it("requires verified Paymob Order authority before any DB operation", async () => {
    const tx = makeTx();

    await expect(
      settleIndependentOfferBoxActivationTx(
        tx as never,
        {
          ...input,
          verifiedPayment: {
            ...input.verifiedPayment,
            verified: false,
          },
        },
      ),
    ).rejects.toThrow(
      "OFFER_BOX_ACTIVATION_PAID_PROOF_REQUIRED",
    );

    expect(
      tx.offerBoxPurchase.findUnique,
    ).not.toHaveBeenCalled();
  });

  it("rejects payment identity or amount drift before financial posting", async () => {
    const tx = makeTx({
      payment: { amount: 600 },
    });

    await expect(
      settleIndependentOfferBoxActivationTx(
        tx as never,
        input,
      ),
    ).rejects.toThrow(
      "OFFER_BOX_SETTLEMENT_PAYMENT_MISMATCH",
    );

    expect(tx.journal.create).not.toHaveBeenCalled();
  });

  it("posts independent revenue and preserves frozen rewards without membership operations", async () => {
    const tx = makeTx();

    const result =
      await settleIndependentOfferBoxActivationTx(
        tx as never,
        input,
      );

    expect(result).toEqual({
      alreadyCompleted: false,
      journalId: "OfferBoxPurchase:test-purchase",
    });

    expect(tx.journal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        referenceType: "OfferBoxPurchase",
        referenceId: input.purchaseId,
        status: "posted",
      }),
    });

    const revenueEntries =
      tx.journalEntry.create.mock.calls
        .map(([arg]) => arg.data)
        .filter((row) =>
          row.journalId === "OfferBoxPurchase:test-purchase",
        );

    expect(revenueEntries).toHaveLength(2);

    expect(revenueEntries.map((row) => ({
      account: row.accountId,
      debit: Number(row.debit),
      credit: Number(row.credit),
    }))).toEqual([
      { account: "1030", debit: 500, credit: 0 },
      { account: "4020", debit: 0, credit: 500 },
    ]);

    expect(tx.walletTransaction.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: "offer_box_bonus",
          amount: 25,
        }),
      });

    expect(tx.rewardHistory.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: "offer_box_purchase",
          points: 100,
        }),
      });

    expect(tx.inventoryMovement.create)
      .toHaveBeenCalledWith({
        data: expect.objectContaining({
          referenceType: "OfferBoxPurchase",
          referenceId: input.purchaseId,
          quantityChange: -2,
          quantityBefore: 10,
          quantityAfter: 8,
        }),
      });

    const metadata = JSON.parse(
      tx.paymentTransaction.update.mock.calls[0][0].data.metadata,
    );

    expect(
      metadata.offerBoxActivationReconciliation,
    ).toEqual(expect.objectContaining({
      completed: true,
      purchaseId: input.purchaseId,
      entitlementId: input.entitlementId,
      journalId: "OfferBoxPurchase:test-purchase",
    }));

    expect(metadata.postActivationReconciliation)
      .toBeUndefined();
  });

  it("returns the existing exact-once settlement without repeating rewards", async () => {
    const tx = makeTx({
      purchase: { status: "redeemed" },

      payment: {
        metadata: JSON.stringify({
          offerBoxPurchaseId: input.purchaseId,

          offerBoxActivationReconciliation: {
            version: 1,
            completed: true,
            purchaseId: input.purchaseId,
            entitlementId: input.entitlementId,
            journalId: "existing-journal",
          },
        }),
      },
    });

    tx.journal.findUnique.mockResolvedValue({
      id: "existing-journal",
      status: "posted",
    });

    await expect(
      settleIndependentOfferBoxActivationTx(
        tx as never,
        input,
      ),
    ).resolves.toEqual({
      alreadyCompleted: true,
      journalId: "existing-journal",
    });

    expect(tx.journal.create).not.toHaveBeenCalled();
    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.rewardHistory.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.paymentTransaction.update).not.toHaveBeenCalled();
  });

  it("never independently settles a historical membership redemption", async () => {
    const tx = makeTx({
      purchase: {
        redeemedUserMembershipId: "legacy-membership",
      },
    });

    await expect(
      settleIndependentOfferBoxActivationTx(
        tx as never,
        input,
      ),
    ).rejects.toThrow(
      "OFFER_BOX_SETTLEMENT_PURCHASE_MISMATCH",
    );

    expect(tx.journal.create).not.toHaveBeenCalled();
  });

  it("fails closed on an existing revenue journal without a settlement marker", async () => {
    const tx = makeTx();

    tx.journal.findUnique.mockResolvedValue({
      id: "orphan-journal",
    });

    await expect(
      settleIndependentOfferBoxActivationTx(
        tx as never,
        input,
      ),
    ).rejects.toThrow(
      "OFFER_BOX_UNMARKED_JOURNAL_REVIEW_REQUIRED",
    );

    expect(tx.wallet.upsert).not.toHaveBeenCalled();
    expect(tx.rewardHistory.create).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});