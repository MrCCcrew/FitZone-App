import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleWebhook: vi.fn(),
  verifyRemote: vi.fn(),
  findPayment: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  verifyPayment: vi.fn(),
  friendOffer: vi.fn(),
  membershipRecovery: vi.fn(),
  lateRecovery: vi.fn(),
  updateStatus: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.findPayment,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    userMembership: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider: () => ({
    handleWebhook: mocks.handleWebhook,
    verifyTransaction: mocks.verifyRemote,
  }),
}));

vi.mock("@/lib/payments/service", () => ({
  verifyPaymentTransaction: mocks.verifyPayment,
  recoverPaidMembershipActivation: mocks.membershipRecovery,
  recoverVerifiedPaymobPayment: mocks.lateRecovery,
  updatePaymentTransactionStatus: mocks.updateStatus,
}));

vi.mock("@/lib/payments/friend-offer-finalization", () => ({
  maybeFinalizeFriendOfferPayment: mocks.friendOffer,
}));

import { POST } from "@/app/api/payments/webhook/[provider]/route";

const payment = {
  provider: "paymob",
  status: "paid",
  purpose: "order",
  membershipId: null,
  amount: 100,
  currency: "EGP",
  metadata: null,
  providerPayload: null,
  providerReference: "intention-1",
  externalReference: "987654",
};

async function deliver() {
  return POST(
    new Request("https://example.test/api/payments/webhook/paymob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { params: Promise.resolve({ provider: "paymob" }) },
  );
}

describe("R19 Paymob webhook unexpected failure response", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.handleWebhook.mockResolvedValue({
      ok: true,
      transactionId: "payment-1",
      providerReference: "intention-1",
      externalReference: "987654",
      payload: { success: true },
      status: "paid",
    });

    mocks.findPayment.mockResolvedValue({ ...payment });
    mocks.verifyPayment.mockResolvedValue({ status: "paid" });
    mocks.friendOffer.mockResolvedValue({ kind: "none" });
  });

  it("returns 503 if the provider handler throws", async () => {
    mocks.handleWebhook.mockRejectedValue(
      new Error("SIMULATED_PROVIDER_HANDLER_FAILURE"),
    );

    const response = await deliver();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      received: false,
    });
    expect(mocks.findPayment).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
  });

  it("returns 503 if payment evidence cannot be read", async () => {
    mocks.findPayment.mockRejectedValue(
      new Error("SIMULATED_DATABASE_FAILURE"),
    );

    const response = await deliver();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      received: false,
    });
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("acknowledges an ignored webhook without payment changes", async () => {
    mocks.handleWebhook.mockResolvedValue({
      ok: false,
      transactionId: null,
      message: "Invalid webhook",
    });

    const response = await deliver();

    expect(response.status).toBe(200);
    expect(mocks.findPayment).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("acknowledges an already-paid duplicate without rewriting evidence", async () => {
    const response = await deliver();

    expect(response.status).toBe(200);
    expect(mocks.verifyPayment).toHaveBeenCalledWith("payment-1");
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});