import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  webhook: vi.fn(),
  remoteVerify: vi.fn(),
  findPayment: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  finalize: vi.fn(),
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
  verifyPaymentTransaction: mocks.finalize,
  recoverPaidMembershipActivation: vi.fn(),
  recoverVerifiedPaymobPayment: vi.fn(),
  updatePaymentTransactionStatus: vi.fn(),
}));

vi.mock("@/lib/payments/friend-offer-finalization", () => ({
  maybeFinalizeFriendOfferPayment: mocks.friendOffer,
}));

import { POST } from "@/app/api/payments/webhook/[provider]/route";

type Pay = {
  id: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  metadata: string | null;
  providerReference: string | null;
  externalReference: string | null;
  providerPayload: string | null;
  purpose: string;
  membershipId: string | null;
};

let payment: Pay;

async function deliver(status: "paid" | "failed" = "paid") {
  mocks.webhook.mockResolvedValue({
    ok: true,
    transactionId: "payment-a",
    externalReference: "987654",
    providerReference: null,
    payload: { webhookType: "TRANSACTION", success: status === "paid" },
    status,
  });

  return POST(
    new Request("https://example.test/api/payments/webhook/paymob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    { params: Promise.resolve({ provider: "paymob" }) },
  );
}

describe("Paymob webhook evidence CAS and paid ownership proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    payment = {
      id: "payment-a",
      provider: "paymob",
      status: "pending",
      amount: 100,
      currency: "EGP",
      metadata: null,
      providerReference: "intention-a",
      externalReference: null,
      providerPayload: JSON.stringify({
        providerMode: "paymob_unified_checkout",
        intentionOrderId: "112233",
      }),
      purpose: "order",
      membershipId: null,
    };

    mocks.findPayment.mockImplementation(async () => ({ ...payment }));
    mocks.remoteVerify.mockResolvedValue({
      status: "paid",
      externalReference: "987654",
    });
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      if (
        where.status !== payment.status ||
        (where.externalReference !== undefined && where.externalReference !== payment.externalReference) ||
        (where.metadata !== undefined && where.metadata !== payment.metadata) ||
        (where.providerPayload !== undefined && where.providerPayload !== payment.providerPayload) ||
        (where.providerReference !== undefined && where.providerReference !== payment.providerReference)
      ) {
        return { count: 0 };
      }
      Object.assign(payment, data);
      return { count: 1 };
    });
    mocks.finalize.mockResolvedValue({ status: "paid" });
    mocks.friendOffer.mockResolvedValue({ kind: "none" });
  });

  it("persists a paid callback only after matching Paymob proof", async () => {
    const response = await deliver("paid");

    expect(response.status).toBe(200);
    expect(mocks.remoteVerify).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "payment-a",
        amount: 100,
        currency: "EGP",
        externalReference: "987654",
      }),
    );
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(payment.externalReference).toBe("987654");
    expect(mocks.finalize).toHaveBeenCalledWith("payment-a");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not mutate any evidence when provider proof is inconclusive", async () => {
    mocks.remoteVerify.mockResolvedValue({
      status: "pending",
      externalReference: "987654",
    });

    const response = await deliver("paid");

    expect(response.status).toBe(503);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
    expect(payment.externalReference).toBeNull();
  });

  it("never downgrades paid evidence from a late failed callback", async () => {
    payment.status = "paid";
    payment.externalReference = "987654";

    const response = await deliver("failed");

    expect(response.status).toBe(200);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(payment.status).toBe("paid");
  });

  it("cannot overwrite evidence when a concurrent writer won", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await deliver("paid");

    expect(response.status).toBe(503);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it("quarantines a verified late charge after two-review no-charge release", async () => {
    // This recovery path is membership-specific. The shared default fixture
    // represents a Store order and must not be used for this scenario.
    payment.purpose = "membership";
    payment.membershipId = "membership-a";
    payment.status = "cancelled";
    payment.metadata = JSON.stringify({
      paymobNoChargeReview: {
        reportReference: "PAYMOB-REPORT-123",
        approvals: [{ reviewerId: "a" }, { reviewerId: "b" }],
        settledAt: new Date().toISOString(),
      },
    });

    const response = await deliver("paid");
    expect(response.status).toBe(503);
    expect(payment.status).toBe("cancelled");
    expect(mocks.finalize).not.toHaveBeenCalled();

    const metadata = JSON.parse(payment.metadata || "{}") as Record<string, unknown>;
    expect(typeof metadata.paymobManualNoChargeLatePaidAt).toBe("string");
    expect(metadata.paymobManualNoChargeLatePaidReference).toBe("987654");
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "cancelled",
          metadata: expect.any(String),
        }),
        data: expect.objectContaining({
          metadata: expect.stringContaining("paymobManualNoChargeLatePaidAt"),
        }),
      }),
    );
  });


  it("quarantines a late charge after automated unpaid order release", async () => {
    payment.purpose = "membership";
    payment.membershipId = "membership-a";
    payment.status = "cancelled";
    payment.metadata = JSON.stringify({
      paymobNoChargeReview: {
        source: "paymob_order_unpaid_automated",
        orderId: "112233",
        paidAmountCents: 0,
        settledAt: new Date().toISOString(),
      },
    });

    const response = await deliver("paid");

    expect(response.status).toBe(503);
    expect(payment.status).toBe("cancelled");
    expect(mocks.finalize).not.toHaveBeenCalled();

    const metadata = JSON.parse(payment.metadata || "{}");
    expect(typeof metadata.paymobManualNoChargeLatePaidAt).toBe("string");
    expect(metadata.paymobManualNoChargeLatePaidReference).toBe("987654");
  });

  it("keeps an in-progress renewal claim intact on a late failed attempt", async () => {
    payment.status = "retrying";

    const response = await deliver("failed");

    expect(response.status).toBe(200);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
