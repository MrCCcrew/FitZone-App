import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  memberships: vi.fn(),
  payments: vi.fn(),
  update: vi.fn(),
  renew: vi.fn(),
  inquire: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx: mocks.lock,
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  renewExistingMembershipPaymobIntention: mocks.renew,
  inquirePaymobUnpaidOrder: mocks.inquire,
}));

import {
  maybeRenewPendingMembershipCheckout,
} from "@/lib/payments/membership-paymob-renewal-handoff";

describe("Paymob renewal release safety 20261110", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function input() {
    return {
      userId: "release-test-user",
      customer: {
        id: "release-test-user",
        name: "Release Test",
      },
      fingerprint: {
        membershipId: "release-test-plan",
        offerId: null,
        scheduleIds: [],
        paymentMethod: "paymob",
        discountCode: null,
        walletDeduct: 0,
        pointsDeduct: 0,
        selectedMonths: null,
        startDate: null,
        partnerCode: null,
        memberBenefitCode: null,
        affiliateRef: null,
        agentRef: null,
      },
    };
  }

  function setup(pending: boolean) {
    mocks.memberships.mockResolvedValue(
      pending
        ? [{
            id: "release-test-membership",
            endDate: new Date(Date.now() + 86400000),
            pendingExpiresAt: new Date(Date.now() + 600000),
          }]
        : [],
    );

    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        userMembership: {
          findMany: mocks.memberships,
        },
        paymentTransaction: {
          findMany: mocks.payments,
          updateMany: mocks.update,
        },
      }),
    );
  }

  it.each(["false", ""])(
    "blocks external renewal when the environment flag is %s",
    async (flag) => {
      vi.stubEnv(
        "PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED",
        flag,
      );

      setup(true);

      expect(
        await maybeRenewPendingMembershipCheckout(input()),
      ).toEqual({ kind: "blocked" });

      expect(mocks.renew).not.toHaveBeenCalled();
      expect(mocks.inquire).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    },
  );

  it("preserves the normal new checkout path when no pending membership exists", async () => {
    vi.stubEnv(
      "PAYMOB_MEMBERSHIP_INTENTION_RENEWAL_ENABLED",
      "true",
    );

    setup(false);

    expect(
      await maybeRenewPendingMembershipCheckout(input()),
    ).toEqual({ kind: "none" });

    expect(mocks.renew).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});