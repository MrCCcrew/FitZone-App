import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const {
  requireAdminFeature,
  userCount,
  membershipCount,
  orderCount,
  classCount,
  productCount,
  complaintCount,
  orderAggregate,
  membershipAggregate,
  bookingAggregate,
  orderFindMany,
  userFindMany,
  complaintFindMany,
  membershipFindMany,
} = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  userCount: vi.fn(),
  membershipCount: vi.fn(),
  orderCount: vi.fn(),
  classCount: vi.fn(),
  productCount: vi.fn(),
  complaintCount: vi.fn(),
  orderAggregate: vi.fn(),
  membershipAggregate: vi.fn(),
  bookingAggregate: vi.fn(),
  orderFindMany: vi.fn(),
  userFindMany: vi.fn(),
  complaintFindMany: vi.fn(),
  membershipFindMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature,
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      count: userCount,
      findMany: userFindMany,
    },
    userMembership: {
      count: membershipCount,
      aggregate: membershipAggregate,
    },
    order: {
      count: orderCount,
      aggregate: orderAggregate,
      findMany: orderFindMany,
    },
    booking: {
      aggregate: bookingAggregate,
    },
    class: {
      count: classCount,
    },
    product: {
      count: productCount,
    },
    complaint: {
      count: complaintCount,
      findMany: complaintFindMany,
    },
    membership: {
      findMany: membershipFindMany,
    },
  },
}));

import { GET } from "@/app/api/admin/overview/route";

describe("admin overview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAdminFeature.mockResolvedValue({
      role: "admin",
      permissions: ["overview"],
    });

    userCount.mockResolvedValue(10);

    membershipCount.mockImplementation(
      async (args: {
        where?: { membershipId?: string };
      }) => {
        if (args?.where?.membershipId === "plan-1") return 2;
        if (args?.where?.membershipId === "plan-2") return 1;
        return 3;
      },
    );

    orderCount.mockResolvedValue(4);
    classCount.mockResolvedValue(6);
    productCount.mockResolvedValue(7);
    complaintCount.mockResolvedValue(2);

    orderFindMany.mockResolvedValue([]);
    userFindMany.mockResolvedValue([]);
    complaintFindMany.mockResolvedValue([]);

    membershipFindMany.mockResolvedValue([
      { id: "plan-1", name: "Fitness" },
      { id: "plan-2", name: "Karate" },
    ]);

    /*
     * getOperationalRevenue() calls:
     * 1) order.aggregate -> gross store sales
     * 2) order.aggregate -> returns
     * 3) membership.aggregate
     * 4) booking.aggregate
     *
     * It runs once for current month + six chart months.
     */
    orderAggregate
      .mockResolvedValueOnce({ _sum: { total: 1000 } })
      .mockResolvedValueOnce({ _sum: { total: 100 } });

    membershipAggregate.mockResolvedValueOnce({
      _sum: { paymentAmount: 500 },
    });

    bookingAggregate.mockResolvedValueOnce({
      _sum: { paidAmount: 200 },
    });

    // Six monthly chart periods.
    for (let i = 0; i < 6; i += 1) {
      orderAggregate
        .mockResolvedValueOnce({
          _sum: { total: 100 + i * 10 },
        })
        .mockResolvedValueOnce({
          _sum: { total: 10 },
        });

      membershipAggregate.mockResolvedValueOnce({
        _sum: { paymentAmount: 50 },
      });

      bookingAggregate.mockResolvedValueOnce({
        _sum: { paidAmount: 20 },
      });
    }
  });

  it("returns the server-side guard response", async () => {
    requireAdminFeature.mockResolvedValueOnce({
      error: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(orderAggregate).not.toHaveBeenCalled();
  });

  it("returns operational revenue split into club and store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();

    /*
     * Store = 1000 - 100 = 900
     * Club = 500 + 200 = 700
     * Total = 1600
     */
    expect(payload.monthlyRevenue).toBe(1600);

    expect(payload.revenueBreakdown).toEqual({
      storeRevenue: 900,
      membershipRevenue: 500,
      bookingRevenue: 200,
      clubRevenue: 700,
    });

    expect(payload.totalMembers).toBe(10);
    expect(payload.activeMembers).toBe(3);
    expect(payload.pendingOrders).toBe(4);
  });

  it("uses the same active-membership definition for plan distribution", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(payload.planDistribution).toEqual([
      { name: "Fitness", count: 2 },
      { name: "Karate", count: 1 },
    ]);

    const planCalls = membershipCount.mock.calls.filter(
      ([args]) => args?.where?.membershipId,
    );

    expect(planCalls).toHaveLength(2);

    for (const [args] of planCalls) {
      expect(args.where.status).toBe("active");
      expect(args.where.endDate?.gt).toBeInstanceOf(Date);
    }
  });

  it("uses exclusive month boundaries for all operational revenue queries", async () => {
    await GET();

    const storeRevenueCalls = orderAggregate.mock.calls.filter(
      ([args]) =>
        args?.where?.businessUnit === "store" &&
        args?.where?.confirmedAt,
    );

    expect(storeRevenueCalls).toHaveLength(7);

    for (const [args] of storeRevenueCalls) {
      expect(args.where.confirmedAt.gte).toBeInstanceOf(Date);
      expect(args.where.confirmedAt.lt).toBeInstanceOf(Date);
      expect(args.where.confirmedAt.lte).toBeUndefined();

      expect(
        args.where.confirmedAt.lt.getTime(),
      ).toBeGreaterThan(
        args.where.confirmedAt.gte.getTime(),
      );
    }
  });

  it("uses Cairo-local month boundaries converted to UTC", async () => {
    await GET();

    const currentStoreCall = orderAggregate.mock.calls.find(
      ([args]) =>
        args?.where?.businessUnit === "store" &&
        args?.where?.confirmedAt,
    );

    expect(currentStoreCall).toBeTruthy();

    const range = currentStoreCall![0].where.confirmedAt;

    /*
     * The exact current month depends on the test execution date,
     * but Cairo-local midnight must not be derived from process-local
     * new Date(year, month, 1). The boundary helper returns UTC instants.
     */
    expect(range.gte).toBeInstanceOf(Date);
    expect(range.lt).toBeInstanceOf(Date);

    expect(
      range.lt.getTime() - range.gte.getTime(),
    ).toBeGreaterThan(
      27 * 24 * 60 * 60 * 1000,
    );
  });
});
