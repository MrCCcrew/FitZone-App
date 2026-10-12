import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  requireAdminMasterAccess: vi.fn(),
  membershipFind: vi.fn(),
  paymentFind: vi.fn(),
  paymentCas: vi.fn(),
  reconcile: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
  requireAdminMasterAccess: mocks.requireAdminMasterAccess,
}));

vi.mock("@/lib/db", () => ({
  db: {
    userMembership: {
      findUnique: mocks.membershipFind,
    },
    paymentTransaction: {
      findMany: mocks.paymentFind,
      updateMany: mocks.paymentCas,
    },
  },
}));

vi.mock("@/lib/payments/expired-membership-paymob-reconciliation", () => ({
  reconcileExpiredPaymobMembership: mocks.reconcile,
}));

vi.mock("@/lib/payments/pending-membership-cleanup", () => ({
  cleanupExpiredPendingMembership: mocks.cleanup,
}));

import { POST } from "@/app/api/admin/payments/expired-membership-reconciliation/route";

const payload = {
  action: "approve-no-charge",
  membershipId: "member-123",
  attestation: "I_CHECKED_ALL_PAYMOB_ATTEMPTS_UNPAID",
  reportReference: "PAYMOB-REPORT-123",
  reviewNote: "I checked every attempt in the complete Paymob merchant transactions report.",
};

const request = (overrides: Record<string, unknown> = {}) =>
  new Request("https://example.test/api/admin/payments/expired-membership-reconciliation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, ...overrides }),
  });

let reviewerId = "finance-1";
let currentMetadata: Record<string, unknown>;

describe("Two independent no-charge Paymob financial approvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewerId = "finance-1";
    currentMetadata = {};
    mocks.requireAdminFeature.mockImplementation(async () => ({
      session: { user: { id: reviewerId } },
    }));
    mocks.requireAdminMasterAccess.mockResolvedValue({ ok: true });
    mocks.membershipFind.mockResolvedValue({
      status: "pending_payment",
      pendingExpiresAt: new Date(Date.now() - 25 * 60_000),
    });
    mocks.paymentFind.mockImplementation(async () => [{
      id: "payment-123",
      status: "failed",
      metadata: JSON.stringify(currentMetadata),
      providerPayload: "{}",
      externalReference: null,
    }]);
    mocks.reconcile.mockResolvedValue({ kind: "unresolved" });
    mocks.paymentCas.mockImplementation(async ({ data }) => {
      currentMetadata = JSON.parse(data.metadata) as Record<string, unknown>;
      return { count: 1 };
    });
    mocks.cleanup.mockResolvedValue({ cleaned: true, membershipId: "member-123" });
  });

  it("first finance reviewer records attestation without releasing bookings", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "awaiting_independent_second_review",
      approvalsCount: 1,
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect((currentMetadata.paymobNoChargeReview as any).approvals[0].reviewerId)
      .toBe("finance-1");
  });

  it("requires a separate second reviewer before atomic cleanup", async () => {
    await POST(request());
    reviewerId = "finance-2";
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "released_after_two_finance_reviews",
      released: true,
      approvalsCount: 2,
    });
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.cleanup).toHaveBeenCalledWith("member-123");
  });

  it("refuses a second approval by the same finance reviewer", async () => {
    await POST(request());
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("refuses inconsistent reports for the second approval", async () => {
    await POST(request());
    reviewerId = "finance-2";
    const response = await POST(request({ reportReference: "DIFFERENT-REPORT-ID" }));
    expect(response.status).toBe(409);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("never permits manual approval if Paymob confirms payment", async () => {
    mocks.reconcile.mockResolvedValue({ kind: "paid_recovered" });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.paymentCas).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("refuses an active retry claim or pending provider settlement", async () => {
    mocks.paymentFind.mockResolvedValue([{
      id: "payment-123",
      status: "retrying",
      metadata: "{}",
      providerPayload: "{}",
      externalReference: null,
    }]);
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("refuses settlement during the 20-minute grace interval", async () => {
    mocks.membershipFind.mockResolvedValue({
      status: "pending_payment",
      pendingExpiresAt: new Date(Date.now() - 10 * 60_000),
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(mocks.paymentCas).not.toHaveBeenCalled();
  });

  it("refuses release if optimistic approval write loses a race", async () => {
    mocks.paymentCas.mockResolvedValue({ count: 0 });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("does not claim success when the atomic cleanup declines release", async () => {
    await POST(request());
    reviewerId = "finance-2";
    mocks.cleanup.mockResolvedValue({
      cleaned: false,
      membershipId: "member-123",
      reason: "lost_race",
    });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      released: false,
      outcome: "not_released",
      reason: "lost_race",
    });
  });
});
