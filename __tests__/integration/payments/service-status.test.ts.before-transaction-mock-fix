import { describe, it, expect, vi, beforeEach } from "vitest";

const { transactionalPaymentFindUnique, transactionalWalletUpsert, transactionalWalletTransactionCreate } = vi.hoisted(() => ({
  transactionalPaymentFindUnique: vi.fn(),
  transactionalWalletUpsert: vi.fn().mockResolvedValue({ id: "w1" }),
  transactionalWalletTransactionCreate: vi.fn(),
}));

// ─── Mock all external dependencies before importing service ──────────────────

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findMany: vi.fn() },
    userMembership:     { findUnique: vi.fn(), updateMany: vi.fn() },
    booking:            { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    schedule:           { update: vi.fn() },
    wallet:             { upsert: vi.fn().mockResolvedValue({ id: "w1" }), update: vi.fn() },
    walletTransaction:  { create: vi.fn() },
    rewardPoints:       { upsert: vi.fn().mockResolvedValue({ id: "rp1" }) },
    rewardHistory:      { create: vi.fn() },
    notification:       { create: vi.fn().mockResolvedValue({ id: "n1" }) },
    user:               { findUnique: vi.fn() },
    referralUsage:      { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    referral:           { update: vi.fn() },
    partner:            { findUnique: vi.fn() },
    partnerCommission:  { upsert: vi.fn() },
    offer:              { update: vi.fn() },
    product:            { findUnique: vi.fn(), update: vi.fn() },
    inventoryMovement:  { create: vi.fn() },
    order:              { findUnique: vi.fn(), update: vi.fn() },
    privateSessionApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
    nutritionSession:   { updateMany: vi.fn() },
    siteContent:        { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        paymentTransaction: { findUnique: transactionalPaymentFindUnique, update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        wallet:             { upsert: transactionalWalletUpsert, update: vi.fn() },
        walletTransaction:  { create: transactionalWalletTransactionCreate },
        rewardPoints:       { upsert: vi.fn().mockResolvedValue({ id: "rp1" }) },
        rewardHistory:      { create: vi.fn() },
      })
    ),
  },
}));

vi.mock("@/lib/attendance", () => ({
  ensureMembershipAttendancePass: vi.fn().mockResolvedValue(null),
  ensurePrivateAttendancePass:    vi.fn().mockResolvedValue(null),
  buildAttendancePayload:         vi.fn().mockReturnValue("qr"),
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
  getPaymentProvider:       vi.fn().mockReturnValue(null),
  getDefaultPaymentProvider: vi.fn().mockReturnValue({ key: "paymob", enabled: true }),
  listPaymentProviders:     vi.fn().mockReturnValue([]),
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
  return { status: "pending_payment", metadata: null, membershipId: null, orderId: null, userId: "u1", ...overrides };
}

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("updatePaymentTransactionStatus — idempotency (paid → paid)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does NOT call db.update when transaction is already paid", async () => {
    const paidSelect = { status: "paid", metadata: null, membershipId: null, orderId: null, userId: "u1" };
    const paidFull   = { ...BASE_TX, status: "paid", paidAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(paidSelect as never)  // first call (select)
      .mockResolvedValueOnce(paidFull as never);   // second call (full, for return value)

    const result = await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).not.toHaveBeenCalled();
    expect(result.status).toBe("paid");
    expect(result.id).toBe("tx-001");
  });

  it("still processes when transitioning from pending_payment → paid", async () => {
    const updatedTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(updatedTx as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    const result = await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).toHaveBeenCalledOnce();
    expect(result.status).toBe("paid");
  });
});

describe("wallet top-up payment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("credits the wallet once when a paid webhook is repeated", async () => {
    const paidTopup = { ...BASE_TX, purpose: "wallet_topup", status: "paid", amount: 100, paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect({ purpose: "wallet_topup" }) as never)
      .mockResolvedValueOnce(paidTopup as never)
      .mockResolvedValueOnce(paidTopup as never)
      .mockResolvedValueOnce(paidTopup as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTopup as never);
    transactionalPaymentFindUnique.mockResolvedValue(paidTopup);

    await updatePaymentTransactionStatus("tx-001", "paid");
    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(transactionalWalletTransactionCreate).toHaveBeenCalledOnce();
    expect(transactionalWalletUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: { balance: { increment: 100 } } }));
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe("updatePaymentTransactionStatus — status transitions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets paidAt when transitioning to 'paid'", async () => {
    const updatedTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(updatedTx as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "paid", paidAt: expect.any(Date) }),
      }),
    );
  });

  it("sets failedAt when transitioning to 'failed'", async () => {
    const failedTx = { ...BASE_TX, status: "failed", failedAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect() as never)
      .mockResolvedValueOnce(failedTx as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(failedTx as never);
    vi.mocked(db.booking.findMany).mockResolvedValue([]);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(db.paymentTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed", failedAt: expect.any(Date) }),
      }),
    );
  });
});

// ─── Failed path — membership cancellation ────────────────────────────────────

describe("updatePaymentTransactionStatus — 'failed' cancels pending membership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls userMembership.updateMany to expire pending membership on failure", async () => {
    const failedTx = { ...BASE_TX, status: "failed", membershipId: "m1", failedAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect({ membershipId: "m1" }) as never)
      .mockResolvedValueOnce(failedTx as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(failedTx as never);
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.booking.findMany).mockResolvedValue([]);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(db.userMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "pending_payment" },
        data:  { status: "expired" },
      }),
    );
  });

  it("does NOT cancel membership when membershipId is null", async () => {
    const failedTx = { ...BASE_TX, status: "failed", failedAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect() as never)
      .mockResolvedValueOnce(failedTx as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(failedTx as never);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(db.userMembership.updateMany).not.toHaveBeenCalled();
  });

  it("cancels confirmed bookings and restores schedule spots on failure", async () => {
    const failedTx = { ...BASE_TX, status: "failed", membershipId: "m1", failedAt: new Date() };
    const pendingBookings = [{ id: "b1", scheduleId: "s1" }, { id: "b2", scheduleId: "s1" }];

    vi.mocked(db.paymentTransaction.findUnique)
      .mockResolvedValueOnce(pendingSelect({ membershipId: "m1" }) as never)
      .mockResolvedValueOnce(failedTx as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(failedTx as never);
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.booking.findMany).mockResolvedValue(pendingBookings as never);
    vi.mocked(db.booking.updateMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(db.schedule.update).mockResolvedValue({} as never);

    await updatePaymentTransactionStatus("tx-001", "failed");

    expect(db.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "cancelled" } }),
    );
    expect(db.schedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: { availableSpots: { increment: 1 } },
      }),
    );
  });
});
