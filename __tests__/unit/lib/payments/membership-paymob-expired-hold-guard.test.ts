import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  payments: vi.fn(),
  renewal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  asDbTransactionClient: (tx: unknown) => tx,
  db: {
    $transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
    ) =>
      fn({
        userMembership: { findMany: mocks.memberships },
        paymentTransaction: { findMany: mocks.payments },
      }),
  },
}));

vi.mock("@/lib/membership-lifecycle-lock", () => ({
  lockMembershipLifecycleUserTx: async () => undefined,
}));

vi.mock("@/lib/payments/providers/paymob", () => ({
  renewExistingMembershipPaymobIntention: mocks.renewal,
}));

import {
  maybeRenewPendingMembershipCheckout,
} from "@/lib/payments/membership-paymob-renewal-handoff";

type Fingerprint =
  Parameters<typeof maybeRenewPendingMembershipCheckout>[0]["fingerprint"];

const fingerprint: Fingerprint = {
  membershipId: "plan-a",
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
  coachMembershipTrainerId: null,
};

async function attempt() {
  return maybeRenewPendingMembershipCheckout({
    userId: "user-a",
    fingerprint,
    customer: { id: "user-a" },
  });
}

describe("Expired Paymob membership hold guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.payments.mockResolvedValue([]);
  });

  it("blocks an expired unresolved membership", async () => {
    mocks.memberships.mockResolvedValue([{
      id: "old-membership",
      endDate: new Date(),
      pendingExpiresAt: new Date(Date.now() - 60_000),
    }]);

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.payments).toHaveBeenCalledTimes(1);
    expect(mocks.renewal).not.toHaveBeenCalled();
  });

  it("blocks renewal too close to hold expiry", async () => {
    mocks.memberships.mockResolvedValue([{
      id: "old-membership",
      endDate: new Date(),
      pendingExpiresAt: new Date(Date.now() + 20_000),
    }]);

    expect(await attempt()).toEqual({ kind: "blocked" });
    expect(mocks.renewal).not.toHaveBeenCalled();
  });

  it("allows normal creation if no pending membership exists", async () => {
    mocks.memberships.mockResolvedValue([]);

    expect(await attempt()).toEqual({ kind: "none" });
    expect(mocks.renewal).not.toHaveBeenCalled();
  });
});