import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({
  memberships: [] as Array<Record<string, unknown>>,
  paymentTransactions: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    user: {
      id: "accounting-test-admin",
    },
  })),
}));

vi.mock("@/lib/accounting-report-service", () => ({
  parseDateStart: vi.fn(() => null),
  parseDateEnd: vi.fn(() => null),
  createDateRangeFilter: vi.fn(() => ({})),
  calculateStoreAccounting: vi.fn(async () => ({
    grossSales: 0,
    returnsTotal: 0,
    cogs: 0,
    salesCount: 0,
    returnsCount: 0,
    purchaseInvoiceCount: 0,
    historicalNullConfirmedAtCount: 0,
  })),
}));

vi.mock("@/lib/db", () => {
  const emptyModel = new Proxy(
    {},
    {
      get: (_target, operation) => {
        if (operation === "findMany") {
          return vi.fn(async () => []);
        }

        if (
          operation === "findUnique" ||
          operation === "findFirst"
        ) {
          return vi.fn(async () => null);
        }

        if (operation === "count") {
          return vi.fn(async () => 0);
        }

        return vi.fn(async () => []);
      },
    },
  );

  const db = new Proxy(
    {},
    {
      get: (_target, model) => {
        if (model === "userMembership") {
          return {
            findMany: vi.fn(async () => state.memberships),
          };
        }

        if (model === "paymentTransaction") {
          return {
            findMany: vi.fn(async () => state.paymentTransactions),
          };
        }

        if (model === "siteContent") {
          return {
            findUnique: vi.fn(async () => null),
          };
        }

        return emptyModel;
      },
    },
  );

  return {
    db,
  };
});

import { GET } from "@/app/api/admin/accounting/route";

function makeMembership(input: {
  id: string;
  status?: string;
  paymentAmount: number;
  paymentMethod: string | null;
  paid?: boolean;
  paidPurpose?: string;
  paidAmount?: number;
}) {
  const paidTransactions = input.paid
    ? [
        {
          id: `tx-${input.id}`,
          membershipId: input.id,
          status: "paid",
          purpose: input.paidPurpose ?? "membership",
          provider: "paymob",
          paymentMethod: "paymob",
          amount: input.paidAmount ?? input.paymentAmount,
        },
      ]
    : [];

  return {
    membership: {
      id: input.id,
      userId: `user-${input.id}`,
      status: input.status ?? "active",
      paymentAmount: input.paymentAmount,
      paymentMethod: input.paymentMethod,
      activatedAt: null,
      startDate: new Date("2026-09-01T00:00:00.000Z"),
      offerTitle:
        input.paymentMethod === "offer"
          ? "Test Offer"
          : null,
      user: {
        name: "Accounting Test Customer",
      },
      membership: {
        name: "Accounting Test Plan",
        walletBonus: 0,
        price: input.paymentAmount,
        priceAfter: null,
      },
      paymentTransactions: paidTransactions,
    },
    paidTransactions,
  };
}

async function loadClubAccounting() {
  const response = await GET(
    new Request("http://localhost/api/admin/accounting"),
  );

  if (!response) {
    throw new Error("Expected accounting GET to return a response");
  }

  expect(response.status).toBe(200);

  const body = await response.json();

  return body.club;
}

describe("membership accounting financial truth", () => {
  beforeEach(() => {
    state.memberships = [];
    state.paymentTransactions = [];
  });

  it("excludes positive Paymob membership without linked paid evidence", async () => {
    const scenario = makeMembership({
      id: "paymob-failed",
      status: "expired",
      paymentAmount: 565,
      paymentMethod: "paymob",
      paid: false,
    });

    state.memberships = [scenario.membership];

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(0);
    expect(club.memberships).toHaveLength(0);
  });

  it("includes positive Paymob membership with linked paid evidence", async () => {
    const scenario = makeMembership({
      id: "paymob-paid",
      paymentAmount: 565,
      paymentMethod: "paymob",
      paid: true,
    });

    state.memberships = [scenario.membership];
    state.paymentTransactions = scenario.paidTransactions;

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(565);
    expect(club.summary.membershipCount).toBe(1);
    expect(club.memberships).toHaveLength(1);
  });

  it("excludes positive offer membership without linked paid evidence", async () => {
    const scenario = makeMembership({
      id: "offer-unpaid",
      paymentAmount: 300,
      paymentMethod: "offer",
      paid: false,
    });

    state.memberships = [scenario.membership];

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(0);
    expect(club.memberships).toHaveLength(0);
  });

  it("includes positive offer membership with linked paid evidence", async () => {
    const scenario = makeMembership({
      id: "offer-paid",
      paymentAmount: 300,
      paymentMethod: "offer",
      paid: true,
    });

    state.memberships = [scenario.membership];
    state.paymentTransactions = scenario.paidTransactions;

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(300);
    expect(club.summary.membershipCount).toBe(1);
  });

  it("excludes paid Paymob evidence with non-membership purpose", async () => {
    const scenario = makeMembership({
      id: "paymob-wrong-purpose",
      paymentAmount: 565,
      paymentMethod: "paymob",
      paid: true,
      paidPurpose: "wallet_topup",
    });

    state.memberships = [scenario.membership];
    state.paymentTransactions = scenario.paidTransactions;

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(0);
    expect(club.memberships).toHaveLength(0);
  });

  it("excludes paid offer evidence when transaction amount mismatches membership", async () => {
    const scenario = makeMembership({
      id: "offer-amount-mismatch",
      paymentAmount: 300,
      paymentMethod: "offer",
      paid: true,
      paidAmount: 299,
    });

    state.memberships = [scenario.membership];
    state.paymentTransactions = scenario.paidTransactions;

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(0);
    expect(club.memberships).toHaveLength(0);
  });

  it("does not require paid evidence for zero-value Paymob membership", async () => {
    const scenario = makeMembership({
      id: "zero-paymob",
      paymentAmount: 0,
      paymentMethod: "paymob",
      paid: false,
    });

    state.memberships = [scenario.membership];

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(1);
  });

  it("preserves zero-value gift membership without paid transaction", async () => {
    const scenario = makeMembership({
      id: "gift-zero",
      paymentAmount: 0,
      paymentMethod: "gift",
      paid: false,
    });

    state.memberships = [scenario.membership];

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(1);
  });

  it("preserves zero-value legacy membership without payment evidence", async () => {
    const scenario = makeMembership({
      id: "legacy-zero",
      paymentAmount: 0,
      paymentMethod: null,
      paid: false,
    });

    state.memberships = [scenario.membership];

    const club = await loadClubAccounting();

    expect(club.summary.membershipRevenue).toBe(0);
    expect(club.summary.membershipCount).toBe(1);
  });
});