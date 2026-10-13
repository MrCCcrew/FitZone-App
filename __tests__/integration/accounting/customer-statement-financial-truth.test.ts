import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";

// Refuse every connection except the dedicated, guarded local test schema.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
const url = new URL(dbUrl);
if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) throw Error("ISOLATED_TEST_DATABASE_GATE_FAILED");

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    user: { id: "isolated-finance-review-admin" },
  })),
}));

const db = new PrismaClient();
const marker = `FINANCE-REPORT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let planId = "";
let cancelledId = "";
let paidId = "";
let topupPaidId = "";
let topupPendingId = "";

beforeAll(async () => {
  const [{ name }] = await db.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  if (name !== "fitzone_test") throw Error("REFUSING_TO_WRITE_NON_TEST_DB");

  const user = await db.user.create({
    data: {
      name: marker,
      email: `${marker.toLowerCase()}@test.local`,
      role: "member",
      isActive: true,
    },
  });
  userId = user.id;
  const plan = await db.membership.create({
    data: {
      name: `${marker}-PLAN`,
      price: 343,
      priceAfter: 343,
      duration: 30,
      features: "[]",
      isActive: true,
      kind: "subscription",
    },
  });
  planId = plan.id;
  const since = new Date("2026-10-12T11:00:00.000Z");
  const until = new Date("2026-11-12T11:00:00.000Z");
  const cancelled = await db.userMembership.create({
    data: {
      userId, membershipId: planId,
      startDate: since, endDate: until,
      status: "cancelled", activatedAt: null,
      paymentMethod: "offer", paymentAmount: 343,
    },
  });
  cancelledId = cancelled.id;
  const active = await db.userMembership.create({
    data: {
      userId, membershipId: planId,
      startDate: since, endDate: until,
      status: "active", activatedAt: since,
      paymentMethod: "offer", paymentAmount: 343,
    },
  });
  paidId = active.id;
  await db.paymentTransaction.create({
    data: {
      userId, membershipId: paidId,
      provider: "paymob", purpose: "membership",
      businessUnit: "club", paymentMethod: "card",
      currency: "EGP", status: "paid", amount: 343,
      paidAt: since,
    },
  });

  const paidTopup = await db.paymentTransaction.create({
    data: {
      userId, provider: "paymob", purpose: "wallet_topup",
      businessUnit: "club", paymentMethod: "card",
      currency: "EGP", status: "paid", amount: 80,
      paidAt: new Date(),
    },
  });
  topupPaidId = paidTopup.id;
  const pendingTopup = await db.paymentTransaction.create({
    data: {
      userId, provider: "paymob", purpose: "wallet_topup",
      businessUnit: "club", paymentMethod: "card",
      currency: "EGP", status: "pending", amount: 50,
    },
  });
  topupPendingId = pendingTopup.id;
});

afterAll(async () => {
  try {
    if (userId) {
      await db.paymentTransaction.deleteMany({ where: { userId } });
      await db.userMembership.deleteMany({ where: { userId } });
      await db.user.deleteMany({ where: { id: userId } });
    }
    if (planId) await db.membership.deleteMany({ where: { id: planId } });
  } finally {
    await db.$disconnect();
  }
});

describe("real MySQL customer financial truth and wallet topup identity", () => {
  it("never adds an unpaid cancelled checkout to a customer paid summary", async () => {
    const { GET } = await import("@/app/api/admin/accounting/customers-report/route");
    const url = new URL("http://localhost/api/admin/accounting/customers-report");
    url.searchParams.set("search", `${marker.toLowerCase()}@test.local`);
    const response = await GET(new Request(url));
    if (!response) throw Error("CUSTOMER_REPORT_MISSING_RESPONSE");
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.id).toBe(userId);
    expect(row.totalMembershipPaid).toBe(343);
    expect(row.totalPaid).toBe(343);
    expect(row.membershipsCount).toBe(2);
    expect(row.memberships.find((x: { id: string }) => x.id === cancelledId))
      .toMatchObject({
        paymentAmount: 343, confirmedPaidAmount: 0,
        status: "cancelled", paymentEvidence: "unverified",
      });
    expect(row.memberships.find((x: { id: string }) => x.id === paidId))
      .toMatchObject({
        paymentAmount: 343, confirmedPaidAmount: 343,
        status: "active", paymentEvidence: "paid_transaction",
      });
  });

  it("attributes real test-DB wallet topup transactions to the exact customer, without claiming credit", async () => {
    const { GET } = await import("@/app/api/admin/accounting/wallet-topups/route");
    const paid = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=paid",
    ));
    if (!paid) throw Error("WALLET_REPORT_MISSING_RESPONSE");
    expect(paid.status).toBe(200);
    const body = await paid.json();
    const row = body.rows.find((x: { id: string }) => x.id === topupPaidId);
    expect(row).toMatchObject({
      customerName: marker,
      amount: 80,
      currency: "EGP",
      status: "paid",
      journalStatus: "missing",
      walletCreditReconciled: false,
    });
    const pending = await GET(new Request(
      "http://localhost/api/admin/accounting/wallet-topups?status=pending",
    ));
    if (!pending) throw Error("WALLET_PENDING_RESPONSE_MISSING");
    const pendingBody = await pending.json();
    expect(pendingBody.rows.some((x: { id: string }) => x.id === topupPendingId)).toBe(true);
  });
});
