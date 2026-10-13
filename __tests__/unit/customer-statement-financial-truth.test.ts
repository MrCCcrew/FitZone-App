import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [] as Array<Record<string, unknown>>,
  payments: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({ user: { id: "finance-review-admin" } })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: vi.fn(async () => state.users) },
    discountCodeUsage: { findMany: vi.fn(async () => []) },
    trainerDiscountCode: { findMany: vi.fn(async () => []) },
    staffDiscountCode: { findMany: vi.fn(async () => []) },
    paymentTransaction: {
      findMany: vi.fn(async (args: {
        where: { membershipId: { in: string[] }; status: string; purpose: string };
      }) => state.payments.filter((p) =>
        args.where.membershipId.in.includes(String(p.membershipId)) &&
        p.status === args.where.status &&
        p.purpose === args.where.purpose,
      )),
    },
  },
}));

import { GET as routeGet } from "@/app/api/admin/accounting/customers-report/route";
async function GET(req: Request): Promise<Response> {
  const response = await routeGet(req);
  if (!response) throw new Error("ACCOUNTING_GET_RETURNED_UNDEFINED");
  return response;
}

function makeMembership(userId: string, name: string, status: string, amount = 343) {
  return {
    id: `${userId}-${name}`,
    startDate: new Date("2026-10-10T12:00:00.000Z"),
    endDate: new Date("2026-11-10T12:00:00.000Z"),
    status,
    paymentAmount: amount,
    paymentMethod: "offer",
    offerTitle: "اختبار",
    totalSessions: 12,
    membership: { name: "باقة اختبار", kind: "subscription", sessionsCount: 12, duration: 30 },
    bookings: [],
    attendanceCheckIns: [],
  };
}
function makeUser(id: string, memberships: ReturnType<typeof makeMembership>[]) {
  return {
    id, name: "Test Customer", email: `${id}@example.invalid`,
    phone: null, isActive: true,
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    wallet: { balance: 0 }, rewardPoints: { points: 0, tier: "bronze" },
    memberships, bookings: [],
  };
}
function payment(userId: string, membershipId: string, amount = 343) {
  return {
    userId, membershipId, amount,
    status: "paid", purpose: "membership",
  };
}
async function runReport() {
  const result = await GET(new Request(
    "http://localhost/api/admin/accounting/customers-report?limit=100",
  ));
  expect(result.status).toBe(200);
  return (await result.json()) as {
    rows: Array<{
      id: string;
      totalPaid: number;
      totalMembershipPaid: number;
      membershipsCount: number;
      unverifiedMembershipCount: number;
      memberships: Array<{
        status: string;
        paymentAmount: number;
        confirmedPaidAmount: number;
        paymentEvidence: string;
        needsFinancialReview: boolean;
      }>;
    }>;
  };
}

describe("customer statement payment truth: never sum checkout attempts", () => {
  beforeEach(() => {
    state.users = [];
    state.payments = [];
  });

  it("matches a cancelled failed attempt plus one active paid membership: 343, not 686", async () => {
    const bad = makeMembership("u1", "failed", "cancelled");
    const good = makeMembership("u1", "paid", "active");
    state.users = [makeUser("u1", [bad, good])];
    state.payments = [payment("u1", good.id)];
    const { rows } = await runReport();
    expect(rows[0]).toMatchObject({
      totalPaid: 343,
      totalMembershipPaid: 343,
      membershipsCount: 2,
    });
    expect(rows[0].memberships.find(x => x.status === "cancelled"))
      .toMatchObject({ paymentAmount: 343, confirmedPaidAmount: 0, paymentEvidence: "unverified" });
    expect(rows[0].memberships.find(x => x.status === "active"))
      .toMatchObject({ confirmedPaidAmount: 343, paymentEvidence: "paid_transaction" });
  });

  it("protects all 31 affected customers, each with multiple failed attempts", async () => {
    state.users = Array.from({ length: 31 }, (_, i) => {
      const id = `review-customer-${i}`;
      const bad1 = makeMembership(id, "abandoned", "cancelled");
      const bad2 = makeMembership(id, "retry-failed", "cancelled");
      const good = makeMembership(id, "successful", "active");
      state.payments.push(payment(id, good.id));
      return makeUser(id, [bad1, bad2, good]);
    });
    const result = await runReport();
    expect(result.rows).toHaveLength(31);
    expect(result.rows.every(r => r.totalMembershipPaid === 343 && r.membershipsCount === 3))
      .toBe(true);
    expect(result.rows.reduce((sum, r) => sum + r.totalMembershipPaid, 0))
      .toBe(31 * 343);
  });

  it("never counts pending, cancelled, expired unpaid or amount mismatches as cash", async () => {
    const pending = makeMembership("u2", "pending", "pending_payment");
    const cancelled = makeMembership("u2", "cancelled", "cancelled");
    const expired = makeMembership("u2", "expired", "expired");
    const mismatch = makeMembership("u2", "mismatch", "active");
    state.users = [makeUser("u2", [pending, cancelled, expired, mismatch])];
    state.payments = [payment("u2", mismatch.id, 342.99)];
    const { rows } = await runReport();
    expect(rows[0].totalMembershipPaid).toBe(0);
    expect(rows[0].memberships.find(x => x.status === "active")?.needsFinancialReview).toBe(true);
  });

  it("keeps a cancelled-but-paid charge visible and marked for manual finance review", async () => {
    const cancelled = makeMembership("u3", "captured-after-cancel", "cancelled");
    state.users = [makeUser("u3", [cancelled])];
    state.payments = [payment("u3", cancelled.id)];
    const { rows } = await runReport();
    expect(rows[0].totalMembershipPaid).toBe(343);
    expect(rows[0].memberships[0]).toMatchObject({
      confirmedPaidAmount: 343,
      needsFinancialReview: true,
    });
  });

  it("counts a duplicated paid payment only once and flags it", async () => {
    const active = makeMembership("u4", "duplicate", "active");
    state.users = [makeUser("u4", [active])];
    state.payments = [payment("u4", active.id), payment("u4", active.id)];
    const { rows } = await runReport();
    expect(rows[0].totalMembershipPaid).toBe(343);
    expect(rows[0].memberships[0].needsFinancialReview).toBe(true);
  });

  it("rejects cross-customer payment evidence even with a colliding membership ID", async () => {
    const active = makeMembership("u5", "wrong-user", "active");
    state.users = [makeUser("u5", [active])];
    state.payments = [payment("unrelated", active.id)];
    const { rows } = await runReport();
    expect(rows[0].totalMembershipPaid).toBe(0);
  });
});
