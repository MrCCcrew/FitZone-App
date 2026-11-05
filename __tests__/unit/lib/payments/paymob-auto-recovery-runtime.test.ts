import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPayment: vi.fn(),
  findMembership: vi.fn(),
  inquire: vi.fn(),
  recoverVerified: vi.fn(),
  repairPaid: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: mocks.findPayment,
    },
    userMembership: {
      findUnique: mocks.findMembership,
    },
  },
}));

vi.mock(
  "@/lib/payments/paymob-auto-recovery-adapter",
  () => ({
    paymobAutoRecoveryDependencies: {
      inquire: mocks.inquire,
      recoverVerified: mocks.recoverVerified,
    },
    repairAlreadyPaidMembership: mocks.repairPaid,
  }),
);

import {
  executeRealPaymobRecovery,
} from "@/lib/payments/paymob-auto-recovery-runtime";

const payment = {
  id: "payment-test",
  purpose: "membership",
  provider: "paymob",
  status: "pending",
  membershipId: "membership-test",
  amount: 343,
  currency: "EGP",
  referenceCode: "FZ-Offers-0000115",
  providerReference: "pi_live_5a14cfd9e274473cac19ffda5f3cedbe",
  metadata: null,
};

const reconciledMetadata = JSON.stringify({
  postActivationReconciliation: {
    completed: true,
    userMembershipId: "membership-test",
  },
});

describe("Paymob actual runtime wiring with isolated dependencies", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.findPayment.mockResolvedValue(payment);
    mocks.findMembership.mockResolvedValue({
      id: "membership-test",
      status: "pending_payment",
    });

    mocks.inquire.mockResolvedValue({
      found: false,
      status: "pending",
    });
  });

  it("retries when Paymob cannot prove successful payment", async () => {
    expect(await executeRealPaymobRecovery("payment-test"))
      .toBe("retry");

    expect(mocks.inquire).toHaveBeenCalledWith("payment-test");
    expect(mocks.recoverVerified).not.toHaveBeenCalled();
    expect(mocks.repairPaid).not.toHaveBeenCalled();
  });

  it("recovers only after matching Paymob proof and reconciliation", async () => {
    mocks.inquire.mockResolvedValue({
      found: true,
      status: "paid",
      success: true,
      pending: false,
      merchantOrderId: "payment-test",
      paymobTransactionId: "562456224",
      amountCents: 34300,
      currency: "EGP",
    });

    mocks.recoverVerified.mockImplementation(async () => {
      mocks.findPayment.mockResolvedValue({
        ...payment,
        status: "paid",
        metadata: reconciledMetadata,
      });

      mocks.findMembership.mockResolvedValue({
        id: "membership-test",
        status: "active",
      });

      return { status: "paid" };
    });

    expect(await executeRealPaymobRecovery("payment-test"))
      .toBe("completed");

    expect(mocks.recoverVerified).toHaveBeenCalledOnce();
    expect(mocks.recoverVerified.mock.calls[0][0])
      .toMatchObject({
        paymentTransactionId: "payment-test",
        paymobTransactionId: "562456224",
        expectedAmount: 343,
        expectedCurrency: "EGP",
      });
  });

  it("repairs an already-paid pending membership", async () => {
    mocks.findPayment.mockResolvedValue({
      ...payment,
      status: "paid",
    });

    mocks.repairPaid.mockImplementation(async () => {
      mocks.findPayment.mockResolvedValue({
        ...payment,
        status: "paid",
        metadata: reconciledMetadata,
      });

      mocks.findMembership.mockResolvedValue({
        id: "membership-test",
        status: "active",
      });
    });

    expect(await executeRealPaymobRecovery("payment-test"))
      .toBe("completed");

    expect(mocks.repairPaid).toHaveBeenCalledOnce();
    expect(mocks.inquire).not.toHaveBeenCalled();
  });

  it("does not automatically reactivate cancelled paid memberships", async () => {
    mocks.findPayment.mockResolvedValue({
      ...payment,
      status: "paid",
    });

    mocks.findMembership.mockResolvedValue({
      id: "membership-test",
      status: "cancelled",
    });

    expect(await executeRealPaymobRecovery("payment-test"))
      .toBe("manual_review");

    expect(mocks.repairPaid).not.toHaveBeenCalled();
    expect(mocks.inquire).not.toHaveBeenCalled();
    expect(mocks.recoverVerified).not.toHaveBeenCalled();
  });
});
