import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentAppUser: vi.fn(),
  purchaseFindFirst: vi.fn(),
  paymentFindUnique: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.getCurrentAppUser,
}));

vi.mock("@/lib/db", () => ({
  db: {
    offerBoxPurchase: {
      findFirst: mocks.purchaseFindFirst,
    },
    paymentTransaction: {
      findUnique: mocks.paymentFindUnique,
    },
  },
}));

import { GET } from "@/app/api/offer-box/purchases/[purchaseId]/receipt/route";

const paidAt = new Date("2026-11-10T10:00:00Z");

const purchase = {
  id: "purchase-1",
  userId: "customer-1",
  offerId: "offer-1",
  status: "available",
  priceSnapshot: 500,
  currency: "EGP",
  offerSnapshot: JSON.stringify({
    offer: { title: "Frozen Offer <script>alert(1)</script>" },
  }),
  paymentTransactionId: "payment-1",
  redeemedUserMembershipId: null,
  paidAt,
  createdAt: paidAt,
  user: {
    name: "Customer <test>",
    email: "customer@example.test",
  },
};

const payment = {
  id: "payment-1",
  userId: "customer-1",
  offerId: "offer-1",
  purpose: "offer_box",
  provider: "paymob",
  status: "paid",
  amount: 500,
  currency: "EGP",
  paidAt,
  membershipId: null,
  metadata: JSON.stringify({
    offerBoxPurchaseId: "purchase-1",
  }),
};

const request = () =>
  new Request(
    "https://fitzone.test/api/offer-box/purchases/purchase-1/receipt",
  );

const context = () => ({
  params: Promise.resolve({
    purchaseId: "purchase-1",
  }),
});

describe("Offer Box payment receipt", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.getCurrentAppUser.mockResolvedValue({
      id: "customer-1",
    });

    mocks.purchaseFindFirst.mockImplementation(
      async ({ where }) => {
        if (
          where.id !== purchase.id ||
          where.userId !== purchase.userId ||
          where.redeemedUserMembershipId !== null
        ) {
          return null;
        }

        return purchase;
      },
    );

    mocks.paymentFindUnique.mockResolvedValue(payment);
  });

  it("rejects unauthenticated requests before database access", async () => {
    mocks.getCurrentAppUser.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.purchaseFindFirst).not.toHaveBeenCalled();
    expect(mocks.paymentFindUnique).not.toHaveBeenCalled();
  });

  it("shows the verified payment before redemption", async () => {
    const response = await GET(request(), context());

    expect(response.status).toBe(200);

    expect(response.headers.get("content-type")).toContain(
      "text/html",
    );

    const html = await response.text();

    expect(html).toContain("500.00");
    expect(html).toContain("OB-purchase-1");
    expect(html).toContain("payment-1");
    expect(html).toContain("Frozen Offer");

    expect(mocks.purchaseFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "purchase-1",
          userId: "customer-1",
          redeemedUserMembershipId: null,
        },
      }),
    );
  });

  it("preserves receipt amount after redemption", async () => {
    mocks.purchaseFindFirst.mockResolvedValue({
      ...purchase,
      status: "redeemed",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("500.00");
  });

  it("cannot be opened by another customer", async () => {
    mocks.getCurrentAppUser.mockResolvedValue({
      id: "another-customer",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(404);
    expect(mocks.paymentFindUnique).not.toHaveBeenCalled();
  });

  it("rejects pending purchases", async () => {
    mocks.purchaseFindFirst.mockResolvedValue({
      ...purchase,
      status: "pending_payment",
      paidAt: null,
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });

  it("rejects mismatched payment amount", async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      amount: 400,
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });

  it("rejects failed payment", async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      status: "failed",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });

  it("rejects payment belonging to another customer", async () => {
    mocks.paymentFindUnique.mockResolvedValue({
      ...payment,
      userId: "another-customer",
    });

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });

  it("rejects missing payment evidence", async () => {
    mocks.paymentFindUnique.mockResolvedValue(null);

    const response = await GET(request(), context());

    expect(response.status).toBe(409);
  });

  it("escapes customer and offer data and disables caching", async () => {
    const response = await GET(request(), context());

    const html = await response.text();

    expect(response.status).toBe(200);

    expect(html).toContain("Customer &lt;test&gt;");

    expect(html).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );

    expect(html).not.toContain("<script>alert(1)</script>");

    expect(
      response.headers.get("cache-control"),
    ).toContain("no-store");

    expect(
      response.headers.get("content-security-policy"),
    ).toContain("frame-ancestors 'none'");
  });
});