import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: { findUnique: vi.fn(), update: vi.fn() },
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
    partner:            { findUnique: vi.fn().mockResolvedValue(null) },
    partnerCommission:  { upsert: vi.fn() },
    offer:              { update: vi.fn() },
    product:            { findUnique: vi.fn(), update: vi.fn() },
    inventoryMovement:  { create: vi.fn() },
    order:              { findUnique: vi.fn() },
    privateSessionApplication: { findUnique: vi.fn(), updateMany: vi.fn() },
    nutritionSession:   { updateMany: vi.fn() },
    siteContent:        { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        paymentTransaction: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
        wallet:             { upsert: vi.fn().mockResolvedValue({ id: "w1" }), update: vi.fn() },
        walletTransaction:  { create: vi.fn() },
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
vi.mock("@/lib/email",            () => ({ sendSubscriptionEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/membership-card",  () => ({ generateMembershipQrCard: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/membership-invoice", () => ({ generateMembershipInvoicePdf: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider:        vi.fn().mockReturnValue(null),
  getDefaultPaymentProvider: vi.fn().mockReturnValue({ key: "paymob", enabled: true }),
  listPaymentProviders:      vi.fn().mockReturnValue([]),
}));

import { db } from "@/lib/db";
import { updatePaymentTransactionStatus } from "@/lib/payments/service";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_TX = {
  id: "tx-001", referenceCode: "FZ-Sub-0000001", provider: "paymob",
  purpose: "subscription", amount: 1000, currency: "EGP", status: "pending_payment",
  paymentMethod: "paymob", orderId: null, membershipId: "m1", offerId: null,
  checkoutUrl: null, iframeUrl: null, providerReference: null, externalReference: null,
  returnUrl: null, cancelUrl: null, providerPayload: null, metadata: null,
  expiresAt: null, paidAt: null, failedAt: null,
  userId: "u1", createdAt: new Date("2024-01-01"), updatedAt: new Date("2024-01-01"),
};

// Membership fixture — status pending_payment, 30-day duration, no partner/bonus/offer
const PENDING_MEM = {
  status: "pending_payment",
  offerId: null,
  membership: { name: "Basic", nameEn: "Basic", duration: 30, walletBonus: 0, productRewards: null },
  offer: null,
};

// Second findUnique call inside partner-check block — no partner
const NO_PARTNER = { partnerId: null, partnerCodeId: null, affiliateLinkId: null, paymentAmount: 1000 };

function pendingSelect(membershipId = "m1") {
  return { status: "pending_payment", metadata: null, membershipId, orderId: null, userId: "u1" };
}

// ─── Activation happy path ────────────────────────────────────────────────────

describe("membership activation — happy path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls userMembership.updateMany with status:'active'", async () => {
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique)
      .mockResolvedValueOnce(PENDING_MEM as never)   // activation check
      .mockResolvedValueOnce(NO_PARTNER as never);    // partner commission check
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.userMembership.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "m1", status: "pending_payment" },
        data:  expect.objectContaining({ status: "active" }),
      }),
    );
  });

  it("includes startDate and endDate in the updateMany data", async () => {
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique)
      .mockResolvedValueOnce(PENDING_MEM as never)
      .mockResolvedValueOnce(NO_PARTNER as never);
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    const call = vi.mocked(db.userMembership.updateMany).mock.calls[0][0];
    expect(call.data.startDate).toBeInstanceOf(Date);
    expect(call.data.endDate).toBeInstanceOf(Date);
    expect(call.data.endDate.getTime()).toBeGreaterThan(call.data.startDate.getTime());
  });
});

// ─── End-date calculation ─────────────────────────────────────────────────────

describe("membership activation — end-date calculation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("end date is startDate + 30 days for a 30-day membership", async () => {
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    const before = Date.now();

    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique)
      .mockResolvedValueOnce(PENDING_MEM as never)
      .mockResolvedValueOnce(NO_PARTNER as never);
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    const after = Date.now();
    const call = vi.mocked(db.userMembership.updateMany).mock.calls[0][0];
    const startMs = (call.data.startDate as Date).getTime();
    const endMs   = (call.data.endDate   as Date).getTime();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    // end = start + 30 days (allow 2 s test jitter)
    expect(endMs - startMs).toBeCloseTo(thirtyDays, -4);
    expect(startMs).toBeGreaterThanOrEqual(before);
    expect(startMs).toBeLessThanOrEqual(after);
  });

  it("end date is startDate + 90 days for a 90-day membership", async () => {
    const mem90 = { ...PENDING_MEM, membership: { ...PENDING_MEM.membership, duration: 90 } };
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };

    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique)
      .mockResolvedValueOnce(mem90 as never)
      .mockResolvedValueOnce(NO_PARTNER as never);
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await updatePaymentTransactionStatus("tx-001", "paid");

    const call = vi.mocked(db.userMembership.updateMany).mock.calls[0][0];
    const diff = (call.data.endDate as Date).getTime() - (call.data.startDate as Date).getTime();
    expect(diff).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -4);
  });
});

// ─── Idempotency ──────────────────────────────────────────────────────────────

describe("membership activation — idempotency guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips side-effects when updateMany returns count=0 (already activated)", async () => {
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique).mockResolvedValueOnce(PENDING_MEM as never);
    // Concurrent webhook already activated — count = 0
    vi.mocked(db.userMembership.updateMany).mockResolvedValue({ count: 0 } as never);

    await updatePaymentTransactionStatus("tx-001", "paid");

    // Notification and email must NOT fire when activation was a no-op
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("skips activation entirely when membership is already active", async () => {
    const activeMem = { ...PENDING_MEM, status: "active" };
    const paidTx = { ...BASE_TX, status: "paid", paidAt: new Date() };
    vi.mocked(db.paymentTransaction.findUnique).mockResolvedValueOnce(pendingSelect() as never);
    vi.mocked(db.paymentTransaction.update).mockResolvedValue(paidTx as never);
    vi.mocked(db.userMembership.findUnique).mockResolvedValueOnce(activeMem as never);

    await updatePaymentTransactionStatus("tx-001", "paid");

    expect(db.userMembership.updateMany).not.toHaveBeenCalled();
  });
});
