import { describe, expect, it } from "vitest";

import type { SubscribeAttemptFingerprint } from "@/lib/payments/pending-membership-cleanup";

function fingerprint(
  coachMembershipTrainerId?: string | null,
): SubscribeAttemptFingerprint {
  return {
    membershipId: "membership-1",
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
    coachMembershipTrainerId,
  };
}

describe("Coach Membership checkout fingerprint", () => {
  it("fingerprint contract carries coachMembershipTrainerId", () => {
    const value = fingerprint("trainer-1");

    expect(value.coachMembershipTrainerId).toBe("trainer-1");
  });

  it("different coach selections represent different purchase identities", () => {
    const coachA = fingerprint("trainer-A");
    const coachB = fingerprint("trainer-B");

    expect(coachA).not.toEqual(coachB);
  });

  it("legacy regular fingerprint may omit coach identity", () => {
    const value = fingerprint();

    expect(value.coachMembershipTrainerId).toBeUndefined();
  });
});
