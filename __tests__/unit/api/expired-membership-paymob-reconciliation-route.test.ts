import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  requireAdminMasterAccess: vi.fn(),
  count: vi.fn(),
  findManyMembership: vi.fn(),
  findUniqueMembership: vi.fn(),
  findManyPayment: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
  requireAdminMasterAccess: mocks.requireAdminMasterAccess,
}));

vi.mock("@/lib/db", () => ({
  db: {
    userMembership: {
      count: mocks.count,
      findMany: mocks.findManyMembership,
      findUnique: mocks.findUniqueMembership,
    },
    paymentTransaction: {
      findMany: mocks.findManyPayment,
    },
  },
}));

vi.mock("@/lib/payments/expired-membership-paymob-reconciliation", () => ({
  reconcileExpiredPaymobMembership: mocks.reconcile,
}));

import { GET, POST } from "@/app/api/admin/payments/expired-membership-reconciliation/route";

const getReq = () =>
  new Request("https://example.test/api/admin/payments/expired-membership-reconciliation?page=0");

const postReq = (body: unknown) =>
  new Request("https://example.test/api/admin/payments/expired-membership-reconciliation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Expired Paymob financial review queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminFeature.mockResolvedValue({ session: { user: { id: "admin-a" } } });
    mocks.requireAdminMasterAccess.mockResolvedValue({ ok: true });
    mocks.count.mockResolvedValue(1);
    mocks.findManyMembership.mockResolvedValue([{
      id: "member-1",
      userId: "user-1",
      pendingExpiresAt: new Date(Date.now() - 60_000),
      membership: { name: "Gold" },
    }]);
    mocks.findManyPayment.mockResolvedValue([{
      id: "payment-1",
      membershipId: "member-1",
      status: "failed",
      amount: 100,
      currency: "EGP",
      referenceCode: "FZ-0001",
      expiresAt: new Date(Date.now() - 90_000),
      createdAt: new Date(),
    }]);
    mocks.findUniqueMembership.mockResolvedValue({
      status: "pending_payment",
      pendingExpiresAt: new Date(Date.now() - 60_000),
    });
    mocks.reconcile.mockResolvedValue({ kind: "unresolved" });
  });

  it("denies unauthenticated access", async () => {
    mocks.requireAdminFeature.mockResolvedValue({
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });
    expect((await GET(getReq())).status).toBe(401);
    expect(mocks.findManyMembership).not.toHaveBeenCalled();
  });

  it("requires finance master access", async () => {
    mocks.requireAdminMasterAccess.mockResolvedValue({
      error: NextResponse.json({ error: "Master required" }, { status: 423 }),
    });
    expect((await GET(getReq())).status).toBe(423);
    expect(mocks.findManyMembership).not.toHaveBeenCalled();
  });

  it("lists only Paymob-linked expired holds without exposing provider secrets", async () => {
    const response = await GET(getReq());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.items).toHaveLength(1);
    expect(result.items[0].membershipId).toBe("member-1");
    expect(result.items[0].payments[0].amount).toBe(100);
    expect(JSON.stringify(result)).not.toContain("providerPayload");
    expect(JSON.stringify(result)).not.toContain("clientSecret");
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("rejects invalid operations (there is no refund or force-paid endpoint)", async () => {
    const response = await POST(postReq({ membershipId: "member-1", action: "forceCancel" }));
    expect(response.status).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("refuses recheck of a live 60-minute hold", async () => {
    mocks.findUniqueMembership.mockResolvedValue({
      status: "pending_payment",
      pendingExpiresAt: new Date(Date.now() + 20_000),
    });
    expect((await POST(postReq({ membershipId: "member-1", action: "recheck" }))).status)
      .toBe(409);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("rechecks expired Paymob hold without allowing negative inference or cancellation", async () => {
    const response = await POST(postReq({ membershipId: "member-1", action: "recheck" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "unresolved",
      requiresManualFinalityReview: true,
    });
    expect(mocks.reconcile).toHaveBeenCalledWith("member-1");
  });

  it("surfaces a provider-proven paid recovery", async () => {
    mocks.reconcile.mockResolvedValue({ kind: "paid_recovered" });
    const response = await POST(postReq({ membershipId: "member-1", action: "recheck" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      outcome: "paid_recovered",
      requiresManualFinalityReview: false,
    });
  });

  it("fails closed when provider verification throws", async () => {
    mocks.reconcile.mockRejectedValue(new Error("connection failure"));
    const response = await POST(postReq({ membershipId: "member-1", action: "recheck" }));
    expect(response.status).toBe(503);
  });
});
