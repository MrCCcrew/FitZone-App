import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  payments: vi.fn(),
  updatePayment: vi.fn(),
  membershipOne: vi.fn(),
  renew: vi.fn(),
  verify: vi.fn(),
  settle: vi.fn(),
  createPayment: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    paymentTransaction: { updateMany: mocks.updatePayment },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        userMembership: {
          findMany: mocks.memberships,
          findUnique: mocks.membershipOne,
        },
        paymentTransaction: {
          findMany: mocks.payments,
          updateMany: mocks.updatePayment,
          create: mocks.createPayment,
        },
      }),
  },
}));

vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx: async () => undefined,
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  renewExistingMembershipPaymobIntention: mocks.renew,
  paymobPaymentProvider: { verifyTransaction: mocks.verify },
}));

vi.mock("@/lib/payments/service", () => ({
  updatePaymentTransactionStatus: mocks.settle,
}));
import {
  maybeRenewPendingMembershipCheckout,
} from "@/lib/payments/membership-paymob-renewal-handoff";

type Fingerprint =
  Parameters<typeof maybeRenewPendingMembershipCheckout>[0]["fingerprint"];

const fingerprint: Fingerprint = {
  membershipId: "plan-a",
  offerId: null,
  scheduleIds: ["schedule-a"],
  paymentMethod: "paymob",
  discountCode: null,
  walletDeduct: 20,
  pointsDeduct: 10,
  selectedMonths: null,
  startDate: null,
  partnerCode: null,
  memberBenefitCode: null,
  affiliateRef: null,
  agentRef: null,
  coachMembershipTrainerId: null,
};

const future = () => new Date(Date.now() + 20 * 60_000);

let hold: Date;
let payment: {
  id: string;
  userId: string;
  membershipId: string;
  purpose: string;
  provider: string;
  providerReference: string;
  providerPayload: string;
  externalReference: string | null;
  metadata: string;
  amount: number;
  currency: string;
  status: string;
  expiresAt: Date;
  checkoutUrl: string | null;
};

function renewed() {
  return {
    checkoutUrl:
      "https://accept.paymob.com/unifiedcheckout/?publicKey=test&clientSecret=test",
    expiresAt: new Date(Date.now() + 60_000),
    providerReference: "pi_test",
    providerPayload: {
      providerMode: "paymob_unified_checkout",
      intentionId: "pi_test",
      intentionOrderId: "123456",
      clientSecret: "egy_csk_test",
      publicKey: "pk_test",
      paymentMethodIds: [123],
    },
  };
}

function attempt() {
  return maybeRenewPendingMembershipCheckout({
    userId: "user-a",
    fingerprint,
    customer: { id: "user-a", name: "Test User" },
  });
}

describe("Paymob renewal real handoff race boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED", "true");

    hold = future();

    payment = {
      id: "payment-a",
      userId: "user-a",
      membershipId: "membership-a",
      purpose: "membership",
      provider: "paymob",
      providerReference: "pi_test",
      providerPayload: JSON.stringify({
        providerMode: "paymob_unified_checkout",
        intentionId: "pi_test",
        intentionOrderId: "123456",
        clientSecret: "egy_csk_test",
        publicKey: "pk_test",
        paymentMethodIds: [123],
      }),
      externalReference: null,
      metadata: JSON.stringify({
        subscribeAttemptFingerprint: fingerprint,
        bookingRecoveryData: {
          selectedScheduleIds: ["schedule-a"],
        },
        paymentAdjustments: {
          walletAmount: 20,
          pointsCount: 10,
        },
      }),
      amount: 90,
      currency: "EGP",
      status: "pending",
      expiresAt: new Date(Date.now() - 60_000),
      checkoutUrl: null,
    };

    mocks.memberships.mockImplementation(async () => [{
      id: "membership-a",
      endDate: new Date("2026-12-01"),
      pendingExpiresAt: hold,
    }]);

    mocks.membershipOne.mockImplementation(async () => ({
      userId: "user-a",
      status: "pending_payment",
      pendingExpiresAt: hold,
    }));

    mocks.payments.mockImplementation(async () => [{
      ...payment,
    }]);

    mocks.updatePayment.mockImplementation(async ({
      where,
      data,
    }: {
      where: {
        id: string;
        status: string;
        providerPayload?: string;
      };
      data: Record<string, unknown>;
    }) => {
      if (
        where.id !== payment.id ||
        where.status !== payment.status ||
        (where.providerPayload !== undefined &&
          where.providerPayload !== payment.providerPayload)
      ) {
        return { count: 0 };
      }

      Object.assign(payment, data);
      return { count: 1 };
    });

    mocks.renew.mockImplementation(async () => renewed());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not contact Live Paymob or modify the payment when renewal is unapproved", async () => {
    vi.stubEnv("PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED", "");
    const originalPayment = JSON.stringify(payment);
    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(JSON.stringify(payment)).toBe(originalPayment);
    expect(mocks.payments).not.toHaveBeenCalled();
    expect(mocks.updatePayment).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("allows normal new membership creation path when no pending hold exists and renewal is disabled", async () => {
    vi.stubEnv("PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED", "");
    mocks.memberships.mockResolvedValue([]);
    expect(await attempt()).toEqual({ kind: "none" });
    expect(mocks.payments).not.toHaveBeenCalled();
    expect(mocks.updatePayment).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("renews the same payment and original membership without new deductions", async () => {
    const originalMetadata = payment.metadata;
    const result = await attempt();

    expect(result).toMatchObject({
      kind: "resumed",
      membershipId: "membership-a",
      transactionId: "payment-a",
    });

    expect(payment.status).toBe("pending");
    expect(payment.metadata).toBe(originalMetadata);
    expect(mocks.updatePayment).toHaveBeenCalledTimes(2);
    expect(mocks.renew).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("allows only one renewal when two requests race", async () => {
    let finish!: (value: ReturnType<typeof renewed>) => void;

    mocks.renew.mockImplementation(
      () => new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const first = attempt();

    await vi.waitFor(() => {
      expect(mocks.renew).toHaveBeenCalledTimes(1);
    });

    const second = await attempt();

    expect(second).toEqual({ kind: "blocked" });
    expect(payment.status).toBe("retrying");
    expect(mocks.renew).toHaveBeenCalledTimes(1);

    finish(renewed());

    expect((await first).kind).toBe("resumed");
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("keeps an uncertain Paymob failure blocked without a second charge", async () => {
    mocks.renew.mockRejectedValue(new Error("provider timeout"));

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(payment.status).toBe("retrying");
    expect(await attempt()).toEqual({ kind: "blocked" });

    expect(mocks.renew).toHaveBeenCalledTimes(1);
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("does not overwrite a paid webhook arriving during renewal", async () => {
    mocks.renew.mockImplementation(async () => {
      payment.status = "paid";
      return renewed();
    });

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(payment.status).toBe("paid");
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it("reconciles a proven paid retry after original hold expiry without renewal", async () => {
    hold = new Date(Date.now() - 60_000);
    payment.status = "retrying";
    payment.providerPayload = JSON.stringify({
      ...JSON.parse(payment.providerPayload),
      renewalClaim: {
        id: "expired-claim",
        claimedAt: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    mocks.verify.mockResolvedValue({
      status: "paid",
      externalReference: "123456789",
      providerReference: "pi_test",
      payload: JSON.parse(payment.providerPayload),
    });

    mocks.settle.mockImplementation(async () => {
      payment.status = "paid";
    });

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith("payment-a", "paid");
    expect(payment.status).toBe("paid");
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });
  it("does not renew after the original hold expires", async () => {
    hold = new Date(Date.now() - 60_000);

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.renew).not.toHaveBeenCalled();
  });

  it("blocks stale retry when Paymob result is unknown", async () => {
    payment.status = "retrying";
    payment.providerPayload = JSON.stringify({
      ...JSON.parse(payment.providerPayload),
      renewalClaim: {
        id: "stale",
        claimedAt: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    mocks.verify.mockResolvedValue({
      status: "pending",
      externalReference: null,
    });

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(payment.status).toBe("retrying");
  });

  it("settles one verified stale payment without a second checkout", async () => {
    payment.status = "retrying";
    payment.providerPayload = JSON.stringify({
      ...JSON.parse(payment.providerPayload),
      renewalClaim: {
        id: "stale",
        claimedAt: new Date(Date.now() - 120_000).toISOString(),
      },
    });

    mocks.verify.mockImplementation(async () => ({
      status: "paid",
      externalReference: "123456789",
      providerReference: "pi_test",
      payload: JSON.parse(payment.providerPayload),
    }));

    mocks.settle.mockImplementation(async () => {
      payment.status = "paid";
    });

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(mocks.settle).toHaveBeenCalledWith("payment-a", "paid");
    expect(payment.externalReference).toBe("123456789");
    expect(payment.status).toBe("paid");
    expect(mocks.renew).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });
});