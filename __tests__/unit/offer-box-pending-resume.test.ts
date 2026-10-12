import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/offer-box/pending/route";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    offerBoxPurchase: {
      findFirst: vi.fn(),
    },
    paymentTransaction: {
      findUnique: vi.fn(),
    },
  },
}));

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: "purchase-1",
    userId: "user-1",
    offerId: "offer-1",
    status: "pending_payment",
    paymentTransactionId: "tx-1",
    holdExpiresAt: new Date(Date.now() + 3_600_000),
    ...overrides,
  };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    userId: "user-1",
    purpose: "offer_box",
    provider: "paymob",
    status: "pending",
    expiresAt: new Date(Date.now() + 600_000),
    checkoutUrl: "https://accept.paymob.com/test-checkout",
    providerPayload: JSON.stringify({
      checkoutUrl: "https://accept.paymob.com/test-checkout",
    }),
    ...overrides,
  };
}

function requestPending(offerId = "offer-1") {
  return GET(
    new Request(
      `http://localhost/api/offer-box/pending?offerId=${encodeURIComponent(offerId)}`,
    ),
  );
}

describe("Offer Box pending checkout safe resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (getCurrentAppUser as Mock).mockResolvedValue({ id: "user-1" });
    (db.offerBoxPurchase.findFirst as Mock).mockResolvedValue(purchase());
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(payment());
  });

  it("requires authentication before any database lookup", async () => {
    (getCurrentAppUser as Mock).mockResolvedValue(null);

    const response = await requestPending();

    expect(response.status).toBe(401);
    expect(db.offerBoxPurchase.findFirst).not.toHaveBeenCalled();
    expect(db.paymentTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an empty offer ID", async () => {
    const response = await requestPending("");

    expect(response.status).toBe(400);
    expect(db.offerBoxPurchase.findFirst).not.toHaveBeenCalled();
  });

  it("does not expose pending purchases belonging to another user", async () => {
    (db.offerBoxPurchase.findFirst as Mock).mockResolvedValue(
      purchase({ userId: "another-user" }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("tx-1");
    expect(JSON.stringify(body)).not.toContain("purchase-1");
  });

  it("reports no pending checkout when there is no purchase", async () => {
    (db.offerBoxPurchase.findFirst as Mock).mockResolvedValue(null);

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("none");
    expect(body.transactionId).toBeNull();
    expect(db.paymentTransaction.findUnique).not.toHaveBeenCalled();
  });

  it.each(["pending", "requires_action"])(
    "returns only the transaction ID for a valid %s checkout",
    async (status) => {
      (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
        payment({ status }),
      );

      const response = await requestPending();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("payable");
      expect(body.purchaseId).toBe("purchase-1");
      expect(body.transactionId).toBe("tx-1");
      expect(JSON.stringify(body)).not.toContain("checkoutUrl");
      expect(JSON.stringify(body)).not.toContain("clientSecret");
    },
  );

  it("does not expose a checkout before Paymob details are persisted", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({ providerPayload: null, checkoutUrl: null }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });

  it("does not resume a pending payment with no checkout URL", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({
        checkoutUrl: null,
        providerPayload: JSON.stringify({}),
      }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });

  it("fails closed when Paymob payload is malformed", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({ providerPayload: "{invalid-json" }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });

  it("accepts a valid checkout URL persisted only in provider payload", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({
        checkoutUrl: null,
        providerPayload: JSON.stringify({
          checkoutUrl: "https://accept.paymob.com/test-checkout",
        }),
      }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("payable");
    expect(body.transactionId).toBe("tx-1");
  });

  it("does not resume an insecure checkout URL", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({
        checkoutUrl: "http://example.com/checkout",
        providerPayload: JSON.stringify({
          checkoutUrl: "http://example.com/checkout",
        }),
      }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });
  it("does not reuse a checkout after its payment expiry", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({ expiresAt: new Date(Date.now() - 60_000) }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("not_payable");
    expect(body.transactionId).toBeNull();
  });

  it("does not reuse an expired Offer Box hold", async () => {
    (db.offerBoxPurchase.findFirst as Mock).mockResolvedValue(
      purchase({ holdExpiresAt: new Date(Date.now() - 60_000) }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("not_payable");
    expect(body.transactionId).toBeNull();
  });

  it.each(["failed", "cancelled", "expired"])(
    "does not reopen a %s payment",
    async (status) => {
      (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
        payment({ status }),
      );

      const response = await requestPending();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("not_payable");
      expect(body.transactionId).toBeNull();
    },
  );

  it("never redirects to payment when paid reconciliation is pending", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({ status: "paid" }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });

  it("fails closed when checkout creation was interrupted before linking payment", async () => {
    (db.offerBoxPurchase.findFirst as Mock).mockResolvedValue(
      purchase({ paymentTransactionId: null }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("awaiting_confirmation");
    expect(body.transactionId).toBeNull();
  });

  it("rejects a mismatched payment owner", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      payment({ userId: "another-user" }),
    );

    const response = await requestPending();
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(JSON.stringify(body)).not.toContain("tx-1");
  });
});