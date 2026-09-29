﻿import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  transactionalPaymentFindUnique,
  transactionalPaymentFindFirst,
  transactionalPaymentUpdate,
  transactionalPaymentUpdateMany,
  transactionalUserMembershipUpdateMany,
  transactionalBookingFindMany,
  transactionalBookingUpdateMany,
  transactionalScheduleUpdate,
  transactionalOrderFindUnique,
  transactionalOrderUpdate,
  transactionalOrderInventoryAllocationCount,
  releaseOrderInventoryAllocationsMock,
  releaseOrderReservationMock,
  transactionalWalletUpsert,
  transactionalWalletTransactionCreate,
  transactionalPrivateSessionFindUnique,
  transactionalPrivateSessionUpdateMany,
  accruePrivateSessionEarningTxMock,
} = vi.hoisted(() => ({
  transactionalPaymentFindUnique: vi.fn(),
  transactionalPaymentFindFirst: vi.fn(),
  transactionalPaymentUpdate: vi.fn(),
  transactionalPaymentUpdateMany: vi.fn().mockResolvedValue({ count: 1 }),
  transactionalUserMembershipUpdateMany: vi
    .fn()
    .mockResolvedValue({ count: 1 }),
  transactionalBookingFindMany: vi.fn().mockResolvedValue([]),
  transactionalBookingUpdateMany: vi.fn(),
  transactionalScheduleUpdate: vi.fn(),
  transactionalOrderFindUnique: vi.fn(),
  transactionalOrderUpdate: vi.fn(),
  transactionalOrderInventoryAllocationCount: vi.fn(),
  releaseOrderInventoryAllocationsMock: vi.fn(),
  releaseOrderReservationMock: vi.fn(),
  transactionalWalletUpsert: vi.fn().mockResolvedValue({ id: "w1" }),
  transactionalWalletTransactionCreate: vi.fn(),
  transactionalPrivateSessionFindUnique: vi.fn(),
  transactionalPrivateSessionUpdateMany: vi.fn(),
  accruePrivateSessionEarningTxMock: vi.fn().mockResolvedValue({
    id: "earning-1",
    status: "calculated",
  }),
}));

// ─── Mock all external dependencies before importing service ──────────────────

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    paymentTransaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn(),
    },
    userMembership: { findUnique: vi.fn(), updateMany: vi.fn() },
    booking: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    schedule: { update: vi.fn() },
    wallet: {
      upsert: vi.fn().mockResolvedValue({ id: "w1" }),
      update: vi.fn(),
    },
    walletTransaction: { create: vi.fn() },
    rewardPoints: { upsert: vi.fn().mockResolvedValue({ id: "rp1" }) },
    rewardHistory: { create: vi.fn() },
    notification: { create: vi.fn().mockResolvedValue({ id: "n1" }) },
    user: { findUnique: vi.fn() },
    referralUsage: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    referral: { update: vi.fn() },
    partner: { findUnique: vi.fn() },
    partnerCommission: { upsert: vi.fn() },
    offer: { update: vi.fn() },
    product: { findUnique: vi.fn(), update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    order: { findUnique: vi.fn(), update: vi.fn() },
    privateSessionApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
    nutritionSession: { updateMany: vi.fn() },
    siteContent: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => unknown) =>
        cb({
          paymentTransaction: {
            findUnique: transactionalPaymentFindUnique,
            findFirst: transactionalPaymentFindFirst,
            update: transactionalPaymentUpdate,
            updateMany: transactionalPaymentUpdateMany,
          },
          userMembership: {
            updateMany: transactionalUserMembershipUpdateMany,
          },
          booking: {
            findMany: transactionalBookingFindMany,
            updateMany: transactionalBookingUpdateMany,
          },
          schedule: {
            update: transactionalScheduleUpdate,
          },
          order: {
            findUnique: transactionalOrderFindUnique,
            update: transactionalOrderUpdate,
          },
          orderInventoryAllocation: {
            count: transactionalOrderInventoryAllocationCount,
          },
          wallet: { upsert: transactionalWalletUpsert, update: vi.fn() },
          walletTransaction: { create: transactionalWalletTransactionCreate },
          privateSessionApplication: {
            findUnique: transactionalPrivateSessionFindUnique,
            updateMany: transactionalPrivateSessionUpdateMany,
          },
          rewardPoints: { upsert: vi.fn().mockResolvedValue({ id: "rp1" }) },
          rewardHistory: { create: vi.fn() },
        }),
      ),
  },
}));

vi.mock("@/lib/employees/private-session-earning-service", () => ({
  accruePrivateSessionEarningTx: accruePrivateSessionEarningTxMock,
}));

vi.mock("@/lib/accounting-service", () => ({
  postWalletTopupJournal: vi.fn().mockResolvedValue(null),
  postPromotionalWalletCreditJournal: vi.fn().mockResolvedValue(null),
  postPromotionalPointsGrantJournal: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/attendance", () => ({
  ensureMembershipAttendancePass: vi.fn().mockResolvedValue(null),
  ensurePrivateAttendancePass: vi.fn().mockResolvedValue(null),
  buildAttendancePayload: vi.fn().mockReturnValue("qr"),
}));

vi.mock("@/lib/email", () => ({
  sendSubscriptionEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/membership-card", () => ({
  generateMembershipQrCard: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/membership-invoice", () => ({
  generateMembershipInvoicePdf: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider: vi.fn().mockReturnValue(null),
  getDefaultPaymentProvider: vi
    .fn()
    .mockReturnValue({ key: "paymob", enabled: true }),
  listPaymentProviders: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/order-inventory-allocation-service", () => ({
  releaseOrderInventoryAllocations:
    releaseOrderInventoryAllocationsMock,
}));

vi.mock("@/lib/inventory-service", () => ({
  releaseOrderReservation: releaseOrderReservationMock,
}));
import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BASE_TX = {
  id: "tx-001",
  referenceCode: "FZ-Sub-0000001",
  provider: "paymob",
  purpose: "subscription",
  amount: 1000,
  currency: "EGP",
  status: "pending_payment",
  paymentMethod: "paymob",
  orderId: null,
  membershipId: null,
  offerId: null,
  checkoutUrl: null,
  iframeUrl: null,
  providerReference: null,
  externalReference: null,
  returnUrl: null,
  cancelUrl: null,
  providerPayload: null,
  metadata: null,
  expiresAt: null,
  paidAt: null,
  failedAt: null,
  userId: "u1",
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
};

// Minimal select-shape returned by the first findUnique (with select clause)
function pendingSelect(overrides: Record<string, unknown> = {}) {
  return {
    status: "pending_payment",
    metadata: null,
    membershipId: null,
    orderId: null,
    userId: "u1",
    ...overrides,
  };
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("updatePaymentTransactionStatus — idempotency (paid → paid)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT call db.update when transaction is already paid", async () => {
    const paidSelect = {
      status: "paid",
      metadata: null,
      membershipId: null,
      orderId: null,
      userId: "u1",
    };
    const paidFull = { ...BASE_TX, status: "paid", paidAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(paidSelect as never) // first call (select)
      .mockResolvedValueOnce(paidFull as never); // second call (full, for return value)

    const result = await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).not.toHaveBeenCalled();
    expect(result.status).toBe("paid");
    expect(result.id).toBe("tx-001");
  });

  it("repairs missing private-session earning on paid retry", async () => {
    const paidAt = new Date("2026-09-09T12:00:00.000Z");

    const paidSelect = {
      status: "paid",
      metadata: JSON.stringify({
        privateSessionApplicationId: "private-app-1",
      }),
      membershipId: null,
      orderId: null,
      userId: "u1",
      purpose: "private_session",
    };

    const paidFull = {
      ...BASE_TX,
      status: "paid",
      purpose: "private_session",
      paidAt,
      metadata: JSON.stringify({
        privateSessionApplicationId: "private-app-1",
      }),
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(paidSelect as never)
      .mockResolvedValueOnce(paidFull as never);

    transactionalPrivateSessionFindUnique.mockResolvedValue({
      status: "paid",
      paymentTransactionId: "tx-001",
      durationDays: 30,
    });

    accruePrivateSessionEarningTxMock.mockResolvedValue({
      id: "earning-1",
      status: "calculated",
    });

    const result = await updatePaymentTransactionStatus("tx-001", "paid");

    expect(result.status).toBe("paid");

    expect(transactionalPrivateSessionFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "private-app-1",
        },
      }),
    );

    expect(transactionalPrivateSessionUpdateMany).not.toHaveBeenCalled();

    expect(accruePrivateSessionEarningTxMock).toHaveBeenCalledOnce();

    expect(accruePrivateSessionEarningTxMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        privateSessionApplicationId: "private-app-1",
      },
    );
  });

  it("still processes when transitioning from pending_payment → paid", async () => {
    const updatedTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(
      pendingSelect() as never,
    );

    vi.mocked(db.paymentTransaction.update).mockResolvedValue(
      updatedTx as never,
    );

    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    const result = await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "tx-001",
        },
        data: expect.objectContaining({
          status: "paid",
          paidAt: expect.any(Date),
        }),
      }),
    );

    expect(result.status).toBe("paid");
  });
});

describe("wallet top-up payment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("credits the wallet once when a paid webhook is repeated", async () => {
    const paidTopup = {
      ...BASE_TX,
      purpose: "wallet_topup",
      status: "paid",
      amount: 100,
      paidAt: new Date(),
    };
    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(
        pendingSelect({ purpose: "wallet_topup" }) as never,
      )
      .mockResolvedValueOnce(paidTopup as never)
      .mockResolvedValueOnce(paidTopup as never)
      .mockResolvedValueOnce(paidTopup as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(
      paidTopup as never,
    );
    transactionalPaymentFindUnique.mockResolvedValue(paidTopup);

    await updatePaymentTransactionStatus("tx-001", "paid");
    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(transactionalWalletTransactionCreate).toHaveBeenCalledOnce();
    expect(transactionalWalletUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { balance: { increment: 100 } } }),
    );
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe("updatePaymentTransactionStatus — status transitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets paidAt when transitioning to 'paid'", async () => {
    const updatedTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(
      pendingSelect() as never,
    );

    vi.mocked(db.paymentTransaction.update).mockResolvedValue(
      updatedTx as never,
    );

    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "tx-001",
        },
        data: expect.objectContaining({
          status: "paid",
          paidAt: expect.any(Date),
        }),
      }),
    );
  });

  it("sets failedAt when transitioning to 'failed'", async () => {
    const failedTx = { ...BASE_TX, status: "failed", failedAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect() as never)
      .mockResolvedValueOnce(failedTx as never);
    transactionalPaymentFindUnique.mockResolvedValue({
      ...BASE_TX,
      status: "pending_payment",
    });
    transactionalPaymentUpdate.mockResolvedValue(failedTx);
    transactionalBookingFindMany.mockResolvedValue([]);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(transactionalPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          failedAt: expect.any(Date),
        }),
      }),
    );
  });
});

// ─── Failed path — membership cancellation ────────────────────────────────────

describe("updatePaymentTransactionStatus — 'failed' cancels pending membership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cancels pending membership on payment failure and clears pending expiry", async () => {
    const failedTx = {
      ...BASE_TX,
      status: "failed",
      membershipId: "m1",
      failedAt: new Date(),
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect({ membershipId: "m1" }) as never)
      .mockResolvedValueOnce(failedTx as never);
    transactionalPaymentFindUnique.mockResolvedValue({
      ...BASE_TX,
      status: "pending_payment",
      membershipId: "m1",
    });
    transactionalPaymentUpdate.mockResolvedValue(failedTx);
    transactionalUserMembershipUpdateMany.mockResolvedValue({ count: 1 });
    transactionalBookingFindMany.mockResolvedValue([]);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(transactionalUserMembershipUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "pending_payment" },
        data: { status: "cancelled", pendingExpiresAt: null },
      }),
    );
  });

  it("does NOT cancel membership when membershipId is null", async () => {
    const failedTx = { ...BASE_TX, status: "failed", failedAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect() as never)
      .mockResolvedValueOnce(failedTx as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(
      failedTx as never,
    );

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(db.userMembership.updateMany).not.toHaveBeenCalled();
  });

  it("cancels confirmed bookings and restores schedule spots on failure", async () => {
    const failedTx = {
      ...BASE_TX,
      status: "failed",
      membershipId: "m1",
      failedAt: new Date(),
    };
    const pendingBookings = [
      { id: "b1", scheduleId: "s1" },
      { id: "b2", scheduleId: "s1" },
    ];

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect({ membershipId: "m1" }) as never)
      .mockResolvedValueOnce(failedTx as never);
    transactionalPaymentFindUnique.mockResolvedValue({
      ...BASE_TX,
      status: "pending_payment",
      membershipId: "m1",
    });
    transactionalPaymentUpdate.mockResolvedValue(failedTx);
    transactionalUserMembershipUpdateMany.mockResolvedValue({ count: 1 });
    transactionalBookingFindMany.mockResolvedValue(pendingBookings);
    transactionalBookingUpdateMany.mockResolvedValue({ count: 2 });
    transactionalScheduleUpdate.mockResolvedValue({});

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(transactionalBookingUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled" } }),
    );
    expect(transactionalScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: { availableSpots: { increment: 2 } },
      }),
    );
  });
});

describe("store order terminal payment inventory release", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    transactionalPaymentFindFirst.mockResolvedValue(null);

    transactionalOrderFindUnique.mockResolvedValue({
      id: "order-1",
      status: "pending",
      inventoryDeducted: false,
      items: [
        {
          productId: "product-1",
          quantity: 1,
        },
      ],
    });

    transactionalOrderUpdate.mockResolvedValue({
      id: "order-1",
      status: "cancelled",
    });

    releaseOrderInventoryAllocationsMock.mockResolvedValue(undefined);
    releaseOrderReservationMock.mockResolvedValue([]);
  });

  it("does not overwrite or clean up a Store payment that wins the race to paid", async () => {
    const paidTx = {
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      status: "paid",
      paidAt: new Date(),
      metadata: null,
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(
        pendingSelect({
          purpose: "order",
          orderId: "order-1",
          membershipId: null,
          metadata: null,
        }) as never,
      )
      .mockResolvedValueOnce(paidTx as never);

    /*
     * The terminal path reads the transaction while it is still open.
     * Before its conditional UPDATE can commit, the paid webhook wins.
     */
    transactionalPaymentFindUnique.mockResolvedValueOnce({
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      status: "pending",
      metadata: null,
    });

    transactionalPaymentUpdate.mockRejectedValueOnce(
      new Error("TERMINAL_PAYMENT_CLAIM_LOST"),
    );

    const result = await updatePaymentTransactionStatus(
      "tx-001",
      "expired",
    );

    expect(result.status).toBe("paid");

    expect(transactionalPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "tx-001",
          status: {
            in: [
              "pending",
              "pending_payment",
              "processing",
              "requires_action",
            ],
          },
        },
        data: expect.objectContaining({
          status: "expired",
        }),
      }),
    );

    // The stale timeout must not touch membership state.
    expect(
      transactionalUserMembershipUpdateMany,
    ).not.toHaveBeenCalled();

    // It must not release any Store inventory.
    expect(
      transactionalOrderInventoryAllocationCount,
    ).not.toHaveBeenCalled();

    expect(
      releaseOrderInventoryAllocationsMock,
    ).not.toHaveBeenCalled();

    expect(
      releaseOrderReservationMock,
    ).not.toHaveBeenCalled();

    // And it must never cancel the paid order.
    expect(
      transactionalOrderUpdate,
    ).not.toHaveBeenCalled();
  });

  it("does not promote a Store payment to paid after terminal state wins", async () => {
    const expiredTx = {
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      status: "expired",
      paidAt: null,
      metadata: null,
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(
        pendingSelect({
          purpose: "order",
          orderId: "order-1",
          membershipId: null,
          metadata: null,
        }) as never,
      )
      .mockResolvedValueOnce(expiredTx as never);

    vi.mocked(
      db.paymentTransaction.updateMany,
    ).mockResolvedValueOnce({
      count: 0,
    } as never);

    const result =
      await updatePaymentTransactionStatus(
        "tx-001",
        "paid",
      );

    expect(
      db.paymentTransaction.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "tx-001",
          status: {
            in: [
              "pending",
              "pending_payment",
              "processing",
              "requires_action",
            ],
          },
        },
        data: expect.objectContaining({
          status: "paid",
          paidAt: expect.any(Date),
        }),
      }),
    );

    expect(
      db.paymentTransaction.update,
    ).not.toHaveBeenCalled();

    expect(
      db.order.findUnique,
    ).not.toHaveBeenCalled();

    expect(result.status).toBe("expired");
  });

  for (const terminalStatus of [
    "failed",
    "cancelled",
    "expired",
  ] as const) {
    it(`releases modern order allocations on terminal payment failure: ${terminalStatus}`, async () => {
      const terminalTx = {
        ...BASE_TX,
        purpose: "order",
        orderId: "order-1",
        status: terminalStatus,
        failedAt:
          terminalStatus === "failed"
            ? new Date()
            : null,
      };

      vi.mocked(db.paymentTransaction.findUnique)
        .mockResolvedValueOnce(
          pendingSelect({
            purpose: "order",
            orderId: "order-1",
          }) as never,
        )
        .mockResolvedValueOnce(terminalTx as never);

      transactionalPaymentFindUnique.mockResolvedValue({
        ...BASE_TX,
        purpose: "order",
        orderId: "order-1",
        status: "pending_payment",
        metadata: null,
      });

      transactionalPaymentUpdate.mockResolvedValue(
        terminalTx,
      );

      transactionalOrderInventoryAllocationCount
        .mockResolvedValue(1);

      await updatePaymentTransactionStatus(
        "tx-001",
        terminalStatus,
      );

      expect(
        transactionalOrderInventoryAllocationCount,
      ).toHaveBeenCalledWith({
        where: {
          orderId: "order-1",
        },
      });

      expect(
        releaseOrderInventoryAllocationsMock,
      ).toHaveBeenCalledOnce();

      expect(
        releaseOrderInventoryAllocationsMock,
      ).toHaveBeenCalledWith(
        expect.anything(),
        "order-1",
      );

      expect(
        releaseOrderReservationMock,
      ).not.toHaveBeenCalled();

      expect(
        transactionalOrderUpdate,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "order-1",
          },
          data: expect.objectContaining({
            status: "cancelled",
            cancelledAt: expect.any(Date),
          }),
        }),
      );
    });
  }

  it("does not restore adjustments or release inventory for a superseded store payment", async () => {
    const supersededMetadata = JSON.stringify({
      storeRetryClaimedAt: "2026-09-28T00:00:00.000Z",
      storeRetrySupersededByPaymentTransactionId: "tx-replacement",
      paymentAdjustments: {
        walletAmount: 25,
        pointsCount: 10,
      },
    });

    const expiredTx = {
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      membershipId: null,
      status: "expired",
      metadata: supersededMetadata,
      failedAt: null,
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(
        pendingSelect({
          purpose: "order",
          orderId: "order-1",
          membershipId: null,
          metadata: supersededMetadata,
        }) as never,
      )
      .mockResolvedValueOnce(expiredTx as never);

    transactionalPaymentFindUnique.mockResolvedValue({
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      membershipId: null,
      status: "pending",
      metadata: supersededMetadata,
    });

    transactionalPaymentUpdate.mockResolvedValue(
      expiredTx,
    );

    await updatePaymentTransactionStatus(
      "tx-001",
      "expired",
    );

    /*
     * The old payment may become terminal, but it no longer owns the
     * order reservation or frozen financial adjustments after retry
     * hand-off to the replacement transaction.
     */
    expect(
      transactionalPaymentUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "tx-001",
          status: {
            in: [
              "pending",
              "pending_payment",
              "processing",
              "requires_action",
            ],
          },
        }),
        data: expect.objectContaining({
          status: "expired",
        }),
      }),
    );

    // No wallet/financial adjustment restoration.
    expect(
      transactionalWalletUpsert,
    ).not.toHaveBeenCalled();

    expect(
      transactionalWalletTransactionCreate,
    ).not.toHaveBeenCalled();

    // No inventory release and no order cancellation.
    expect(
      transactionalOrderInventoryAllocationCount,
    ).not.toHaveBeenCalled();

    expect(
      releaseOrderInventoryAllocationsMock,
    ).not.toHaveBeenCalled();

    expect(
      releaseOrderReservationMock,
    ).not.toHaveBeenCalled();

    expect(
      transactionalOrderFindUnique,
    ).not.toHaveBeenCalled();

    expect(
      transactionalOrderUpdate,
    ).not.toHaveBeenCalled();

    // Membership lifecycle must remain completely untouched.
    expect(
      transactionalUserMembershipUpdateMany,
    ).not.toHaveBeenCalled();
  });
  it("uses legacy reservation release only when the historical order has no allocation records", async () => {
    const failedTx = {
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      status: "failed",
      failedAt: new Date(),
    };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(
        pendingSelect({
          purpose: "order",
          orderId: "order-1",
        }) as never,
      )
      .mockResolvedValueOnce(failedTx as never);

    transactionalPaymentFindUnique.mockResolvedValue({
      ...BASE_TX,
      purpose: "order",
      orderId: "order-1",
      status: "pending_payment",
      metadata: null,
    });

    transactionalPaymentUpdate.mockResolvedValue(
      failedTx,
    );

    transactionalOrderInventoryAllocationCount
      .mockResolvedValue(0);

    await updatePaymentTransactionStatus(
      "tx-001",
      "failed",
    );

    expect(
      releaseOrderInventoryAllocationsMock,
    ).not.toHaveBeenCalled();

    expect(
      releaseOrderReservationMock,
    ).toHaveBeenCalledOnce();

    expect(
      releaseOrderReservationMock,
    ).toHaveBeenCalledWith(
      expect.anything(),
      [
        {
          productId: "product-1",
          quantity: 1,
        },
      ],
      "order-1",
    );
  });
});