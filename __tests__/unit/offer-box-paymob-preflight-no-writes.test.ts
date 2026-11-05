import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  ready: vi.fn(),
  transaction: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.currentUser,
}));
vi.mock("@/lib/payments/offer-box-checkout-readiness", () => ({
  isOfferBoxPaymobCheckoutReady: mocks.ready,
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
  asDbTransactionClient: vi.fn(),
}));
vi.mock("@/lib/payments/service", () => ({
  createPaymentTransaction: mocks.createPayment,
  updatePaymentTransactionStatus: mocks.updatePayment,
}));

import { POST } from "@/app/api/offer-box/checkout/route";

function checkout(offerId?: string) {
  return POST(new Request("http://localhost/api/offer-box/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offerId }),
  }));
}

describe("Offer Box fail-before-reservation on known provider misconfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({
      id: "synthetic-preview-test-user",
      role: "member",
    });
    mocks.ready.mockResolvedValue(false);
  });

  it("returns actionable 503 without creating a purchase or payment", async () => {
    const result = await checkout("synthetic-offer");
    const body = await result.json();

    expect(result.status).toBe(503);
    expect(body.code).toBe("OFFER_BOX_PAYMENT_PROVIDER_NOT_READY");
    expect(JSON.stringify(body)).not.toMatch(/(secret|publicKey|apiKey)/i);
    expect(mocks.ready).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.updatePayment).not.toHaveBeenCalled();
  });

  it("does not execute preflight without authentication", async () => {
    mocks.currentUser.mockResolvedValue(null);
    const result = await checkout("synthetic-offer");

    expect(result.status).toBe(401);
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing offer before payment readiness is queried", async () => {
    const result = await checkout();
    expect(result.status).toBe(400);
    expect(mocks.ready).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
