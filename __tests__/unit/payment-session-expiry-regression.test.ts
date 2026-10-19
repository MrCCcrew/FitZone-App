import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET } from "@/app/api/payments/session/[transactionId]/route";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: vi.fn(),
    },
    offerBoxPurchase: {
      findUnique: vi.fn(),
    },
  },
}));

const CHECKOUT_URL = "https://example.test/paymob-checkout";

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-own",
    referenceCode: "TEST-001",
    userId: "user-1",
    provider: "paymob",
    status: "pending",
    amount: 100,
    currency: "EGP",
    purpose: "offer_box",
    checkoutUrl: CHECKOUT_URL,
    iframeUrl: null,
    expiresAt: new Date(Date.now() + 300_000),
    providerPayload: JSON.stringify({
      publicKey: "test-public-key",
      clientSecret: "test-client-secret",
      checkoutUrl: CHECKOUT_URL,
    }),
    ...overrides,
  };
}

function requestSession(transactionId = "tx-own") {
  return GET(
    new Request(`http://localhost/api/payments/session/${transactionId}`),
    { params: Promise.resolve({ transactionId }) },
  );
}

describe("Paymob session expiry and ownership regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCurrentAppUser as Mock).mockResolvedValue({ id: "user-1" });
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(transaction());
    (db.offerBoxPurchase.findUnique as Mock).mockResolvedValue({
      id: "purchase-1",
      userId: "user-1",
      paymentTransactionId: "tx-own",
      status: "pending_payment",
      holdExpiresAt: new Date(Date.now() + 300_000),
      offerSnapshot: JSON.stringify({
        ageEligibility: {
          requiresBirthDate: false,
          verificationMethod: "account_birth_date",
          minAgeYears: null,
          maxAgeYears: null,
          ageYearsAtPurchase: null,
          validatedAt: new Date().toISOString(),
        },
      }),
    });
  });

  it("rejects unauthenticated requests without looking up the transaction", async () => {
    (getCurrentAppUser as Mock).mockResolvedValue(null);

    const response = await requestSession();

    expect(response.status).toBe(401);
    expect(db.paymentTransaction.findUnique).not.toHaveBeenCalled();
  });

  it("does not reveal another customer's payment session", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      transaction({ userId: "another-user" }),
    );

    const response = await requestSession();

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain(CHECKOUT_URL);
  });

  it.each(["pending", "requires_action"])(
    "allows an unexpired %s checkout",
    async (status) => {
      (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
        transaction({ status }),
      );

      const response = await requestSession();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.transaction.status).toBe(status);
      expect(body.session.checkoutUrl).toBe(CHECKOUT_URL);
    },
  );

  it("keeps paid verification available without exposing an old checkout link", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      transaction({ status: "paid" }),
    );

    const response = await requestSession();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.transaction.status).toBe("paid");
    expect(body.transaction.checkoutUrl).toBeNull();
    expect(body.session.checkoutUrl).toBeNull();
  });

  it("rejects a pending checkout after its expiry time", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      transaction({
        status: "pending",
        expiresAt: new Date(Date.now() - 60_000),
      }),
    );

    const response = await requestSession();

    expect(response.status).toBe(410);
    expect(JSON.stringify(await response.json())).not.toContain(CHECKOUT_URL);
  });

  it.each(["failed", "cancelled"])(
    "does not reopen a %s payment attempt",
    async (status) => {
      (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
        transaction({ status }),
      );

      const response = await requestSession();

      expect(response.status).toBe(409);
      expect(JSON.stringify(await response.json())).not.toContain(CHECKOUT_URL);
    },
  );

  it("rejects an explicitly expired payment attempt", async () => {
    (db.paymentTransaction.findUnique as Mock).mockResolvedValue(
      transaction({ status: "expired" }),
    );

    const response = await requestSession();

    expect(response.status).toBe(410);
    expect(JSON.stringify(await response.json())).not.toContain(CHECKOUT_URL);
  });
});