import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  findPayment: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  remoteVerify: vi.fn(),
  verifyPayment: vi.fn(),
  friendOffer: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.findPayment,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
    userMembership: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/payments/registry", () => ({
  getPaymentProvider: () => ({
    handleWebhook: mocks.webhook,
    verifyTransaction: mocks.remoteVerify,
  }),
}));

vi.mock("@/lib/payments/service", () => ({
  verifyPaymentTransaction: mocks.verifyPayment,
  recoverPaidMembershipActivation: vi.fn(),
  recoverVerifiedPaymobPayment: vi.fn(),
  updatePaymentTransactionStatus: vi.fn(),
}));

vi.mock("@/lib/payments/friend-offer-finalization", () => ({
  maybeFinalizeFriendOfferPayment: mocks.friendOffer,
}));

import { POST } from "@/app/api/payments/webhook/[provider]/route";

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

describe("R19 paid webhook finalization retry", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.webhook.mockResolvedValue({
      ok: true,
      transactionId: "payment-a",
      providerReference: "intention-a",
      externalReference: "987654",
      payload: { success: true },
      status: "paid",
    });

    mocks.findPayment.mockResolvedValue({
      provider: "paymob",
      status: "paid",
      purpose: "order",
      membershipId: null,
      amount: 100,
      currency: "EGP",
      metadata: null,
      providerPayload: null,
      providerReference: "intention-a",
      externalReference: "987654",
    });

    mocks.verifyPayment.mockResolvedValue({ status: "paid" });
    mocks.friendOffer.mockResolvedValue({ kind: "none" });
  });

  it("returns 503 when paid finalization fails, then acknowledges recovery", async () => {
    mocks.verifyPayment
      .mockRejectedValueOnce(new Error("SIMULATED_FINALIZATION_FAILURE"))
      .mockResolvedValueOnce({ status: "paid" });

    const first = await deliver();
    expect(first.status).toBe(503);
    expect(await first.json()).toMatchObject({ received: false });

    const retry = await deliver();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ received: true });

    expect(mocks.verifyPayment).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns 503 if friend-offer paid finalization fails", async () => {
    mocks.friendOffer.mockRejectedValue(
      new Error("SIMULATED_FRIEND_FINALIZATION_FAILURE"),
    );

    const response = await deliver();

    expect(response.status).toBe(503);
    expect(mocks.verifyPayment).toHaveBeenCalledOnce();
    expect(mocks.friendOffer).toHaveBeenCalledOnce();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});