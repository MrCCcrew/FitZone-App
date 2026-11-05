import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  payment: vi.fn(),
  membership: vi.fn(),
  participant: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.user,
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: { findUnique: mocks.payment },
    userMembership: { findUnique: mocks.membership },
    friendOfferParticipant: { findFirst: mocks.participant },
  },
}));

vi.mock("@/lib/payments/service", () => ({
  verifyPaymentTransaction: mocks.verify,
  recoverPaidMembershipActivation: vi.fn(),
}));

vi.mock("@/lib/payments/friend-offer-finalization", () => ({
  maybeFinalizeFriendOfferPayment: vi.fn(),
}));

import { GET } from "@/app/api/payments/verify/[transactionId]/route";

const url = "https://checkout.example.test/unifiedcheckout/";

function future(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: "payment-1",
    userId: "user-1",
    purpose: "membership",
    membershipId: "membership-1",
    status: "pending",
    checkoutUrl: url,
    iframeUrl: null,
    expiresAt: future(20),
    metadata: null,
    ...overrides,
  };
}

async function request() {
  const response = await GET(
    new Request("http://localhost/api/payments/verify/payment-1"),
    { params: Promise.resolve({ transactionId: "payment-1" }) },
  );

  return {
    status: response.status,
    body: await response.json(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.user.mockResolvedValue({ id: "user-1" });

  mocks.payment.mockResolvedValue({
    id: "payment-1",
    userId: "user-1",
    status: "pending",
    purpose: "membership",
  });

  mocks.verify.mockImplementation(async () => payload());

  mocks.membership.mockResolvedValue({
    userId: "user-1",
    status: "pending_payment",
    pendingExpiresAt: future(60),
  });
});

describe("Payment verification checkout visibility", () => {
  it("shows an existing valid membership checkout", async () => {
    const result = await request();

    expect(result.status).toBe(200);
    expect(result.body.transaction.checkoutUrl).toBe(url);
  });

  it("hides a locally expired provider checkout", async () => {
    mocks.verify.mockResolvedValue(
      payload({ expiresAt: future(-1) }),
    );

    const result = await request();

    expect(result.status).toBe(200);
    expect(result.body.transaction.checkoutUrl).toBeNull();
    expect(result.body.transaction.status).toBe("pending");
  });

  it("hides a checkout without provider expiry", async () => {
    mocks.verify.mockResolvedValue(
      payload({ expiresAt: null }),
    );

    const result = await request();

    expect(result.body.transaction.checkoutUrl).toBeNull();
  });

  it("does not extend the original membership hold", async () => {
    mocks.membership.mockResolvedValue({
      userId: "user-1",
      status: "pending_payment",
      pendingExpiresAt: future(10),
    });

    const result = await request();

    expect(result.body.transaction.checkoutUrl).toBeNull();
  });

  it("blocks a membership belonging to another user", async () => {
    mocks.membership.mockResolvedValue({
      userId: "another-user",
      status: "pending_payment",
      pendingExpiresAt: future(60),
    });

    const result = await request();

    expect(result.body.transaction.checkoutUrl).toBeNull();
  });

  it("keeps a closed friend-group payment visible but not payable", async () => {
    mocks.verify.mockResolvedValue(
      payload({
        membershipId: null,
        metadata: {
          source: "friend-offer",
          friendGroupId: "group-1",
        },
      }),
    );

    mocks.participant.mockResolvedValue({
      group: {
        status: "expired",
        expiresAt: future(-5),
      },
    });

    const result = await request();

    expect(result.body.transaction.status).toBe("pending");
    expect(result.body.transaction.checkoutUrl).toBeNull();
  });

  it("permits only the customer's open friend-group session", async () => {
    mocks.verify.mockResolvedValue(
      payload({
        membershipId: null,
        metadata: {
          source: "friend-offer",
          friendGroupId: "group-1",
        },
      }),
    );

    mocks.participant.mockResolvedValue({
      group: {
        status: "ready",
        expiresAt: future(60),
      },
    });

    const result = await request();

    expect(result.body.transaction.checkoutUrl).toBe(url);
    expect(mocks.participant).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          groupId: "group-1",
          paymentTransactionId: "payment-1",
        }),
      }),
    );
  });

  it("never returns an old checkout for a terminal payment", async () => {
    mocks.payment.mockResolvedValue({
      id: "payment-1",
      userId: "user-1",
      status: "failed",
      purpose: "membership",
    });

    mocks.verify.mockResolvedValue(
      payload({ status: "failed" }),
    );

    const result = await request();

    expect(result.status).toBe(200);
    expect(result.body.transaction.checkoutUrl).toBeNull();
  });

  it("does not disclose another customer's payment", async () => {
    mocks.payment.mockResolvedValue({
      id: "payment-1",
      userId: "another-user",
      status: "pending",
      purpose: "membership",
    });

    const result = await request();

    expect(result.status).toBe(404);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("payment page does not provide terminal retry links", () => {
    const source = readFileSync(
      "src/app/payment/verify/page.tsx",
      "utf8",
    );

    expect(source).not.toContain("إعادة محاولة الدفع");
    expect(source).toContain("جلسة الدفع الحالية غير متاحة");
    expect(source).toContain("متابعة الاشتراك من حسابي");
  });
});
