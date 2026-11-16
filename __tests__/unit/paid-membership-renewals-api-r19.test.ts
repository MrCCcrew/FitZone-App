import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  memberships: vi.fn(),
  payments: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.guard,
}));

vi.mock("@/lib/db", () => ({
  db: {
    userMembership: { findMany: mocks.memberships },
    paymentTransaction: { findMany: mocks.payments },
  },
}));

import { GET } from "@/app/api/admin/accounting/paid-renewals/route";

const first = {
  id: "m1",
  userId: "u1",
  activatedAt: new Date("2026-09-01T10:00:00Z"),
  status: "expired",
  paymentAmount: 900,
  membership: { name: "Monthly", kind: "subscription" },
  user: {
    name: "Customer One",
    email: "one@example.test",
    phone: "01000000001",
  },
};

const renewal = {
  ...first,
  id: "m2",
  activatedAt: new Date("2026-10-01T10:00:00Z"),
};

const paid = {
  id: "p2",
  userId: "u1",
  membershipId: "m2",
  purpose: "membership",
  status: "paid",
  amount: 900,
  currency: "EGP",
  provider: "paymob",
  paidAt: new Date("2026-10-01T10:05:00Z"),
};

describe("R19 paid renewals admin report", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.guard.mockResolvedValue({ role: "admin" });
    mocks.memberships.mockResolvedValue([first, renewal]);
    mocks.payments.mockResolvedValue([paid]);
  });

  it("requires the existing accounting feature permission", async () => {
    await GET();
    expect(mocks.guard).toHaveBeenCalledWith("accounting");
  });

  it("rejects unauthenticated or unauthorized requests", async () => {
    mocks.guard.mockResolvedValue({
      error: Response.json({ error: "FORBIDDEN" }, { status: 403 }),
    });

    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    expect(response.status).toBe(403);
    expect(mocks.memberships).not.toHaveBeenCalled();
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it("reads activated subscriptions and paid membership evidence", async () => {
    await GET();

    expect(mocks.memberships).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          activatedAt: { not: null },
          membership: { kind: "subscription" },
        },
      }),
    );

    expect(mocks.payments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          membershipId: { in: ["m1", "m2"] },
          purpose: "membership",
          status: "paid",
          paidAt: { not: null },
        },
      }),
    );
  });

  it("returns one renewal with its actual transaction amount", async () => {
    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.rows[0]).toMatchObject({
      customerName: "Customer One",
      membershipId: "m2",
      previousMembershipId: "m1",
      paymentId: "p2",
      amount: 900,
    });
    expect(data.totalsByCurrency.EGP).toEqual({
      count: 1,
      amount: 900,
    });
    expect(data.evidenceLevel).toBe("local_paid_transaction");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("returns empty results without querying payments if none activated", async () => {
    mocks.memberships.mockResolvedValue([]);
    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    const data = await response.json();

    expect(data.count).toBe(0);
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it("rejects an incomplete membership history instead of misclassifying", async () => {
    mocks.memberships.mockResolvedValue(
      Array.from({ length: 20001 }, (_, index) => ({
        ...first,
        id: `m${index}`,
      })),
    );

    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    expect(response.status).toBe(422);
    expect(mocks.payments).not.toHaveBeenCalled();
  });

  it("rejects truncated payment evidence instead of undercounting", async () => {
    mocks.payments.mockResolvedValue(
      Array.from({ length: 20001 }, (_, index) => ({
        ...paid,
        id: `p${index}`,
      })),
    );

    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    expect(response.status).toBe(422);
  });

  it("flags multiple successful transactions for reconciliation", async () => {
    mocks.payments.mockResolvedValue([
      paid,
      { ...paid, id: "p3" },
    ]);

    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    const data = await response.json();

    expect(data.count).toBe(0);
    expect(data.reconciliationRequired).toBe(true);
    expect(data.anomalies[0].paymentIds).toEqual(["p2", "p3"]);
  });

  it("excludes a renewal when paid amount mismatches membership price", async () => {
    mocks.payments.mockResolvedValue([
      { ...paid, amount: 800 },
    ]);

    const response = await GET();
    if (!response) throw new Error("NO_RESPONSE");
    const data = await response.json();

    expect(data.count).toBe(0);
    expect(data.reconciliationRequired).toBe(true);
    expect(data.anomalies).toEqual([
      expect.objectContaining({
        membershipId: "m2",
        reason: "PAYMENT_AMOUNT_MISMATCH",
      }),
    ]);
  });

  it("excludes a cancelled membership even with paid evidence", async () => {
    mocks.memberships.mockResolvedValue([
      first,
      { ...renewal, status: "cancelled" },
    ]);

    const response = await GET();
    if (!response) throw new Error("NO_RESPONSE");
    const data = await response.json();

    expect(data.count).toBe(0);
    expect(data.reconciliationRequired).toBe(true);
    expect(data.anomalies).toEqual([
      expect.objectContaining({
        membershipId: "m2",
        reason: "MEMBERSHIP_STATUS_REVIEW",
      }),
    ]);
  });
  it("does not return payment details from a failed database read", async () => {
    mocks.payments.mockRejectedValue(new Error("internal details"));
    const response = await GET();
    if (!response) throw new Error("PAID_RENEWALS_API_NO_RESPONSE");
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("PAID_RENEWALS_REPORT_FAILED");
    expect(JSON.stringify(data)).not.toContain("internal details");
  });
});