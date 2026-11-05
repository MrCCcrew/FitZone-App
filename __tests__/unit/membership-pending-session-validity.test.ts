import { describe, expect, it, vi } from "vitest";
import {
  validReusableMembershipCheckoutUrl,
} from "@/lib/payments/membership-pending-session-validity";
import {
  findScheduleReplaceablePendingMembershipCheckoutTx,
  type SubscribeAttemptFingerprint,
} from "@/lib/payments/pending-membership-cleanup";

const start = Date.parse("2026-10-18T12:00:00Z");
const at = (minutes: number) =>
  new Date(start + minutes * 60_000);

const validUrl = "https://checkout.example.test/unifiedcheckout/";

function candidate(minutes: number) {
  return {
    checkoutUrl: validUrl,
    expiresAt: at(59.5),
    holdExpiresAt: at(60),
    now: at(minutes),
  };
}

describe("Membership checkout session reuse safety", () => {
  it.each([0, 10, 30, 50, 59])(
    "accepts an existing valid checkout at minute %i",
    (minute) => {
      expect(
        validReusableMembershipCheckoutUrl(candidate(minute)),
      ).toBe(validUrl);
    },
  );

  it.each([60, 61])(
    "refuses reuse after the original hold at minute %i",
    (minute) => {
      expect(
        validReusableMembershipCheckoutUrl(candidate(minute)),
      ).toBeNull();
    },
  );

  it("refuses a missing provider expiration", () => {
    expect(
      validReusableMembershipCheckoutUrl({
        ...candidate(30),
        expiresAt: null,
      }),
    ).toBeNull();
  });

  it("refuses an already-expired provider checkout", () => {
    expect(
      validReusableMembershipCheckoutUrl({
        ...candidate(50),
        expiresAt: at(40),
      }),
    ).toBeNull();
  });

  it("refuses a checkout extending beyond the original hold", () => {
    expect(
      validReusableMembershipCheckoutUrl({
        ...candidate(30),
        expiresAt: at(65),
      }),
    ).toBeNull();
  });

  it.each([
    "http://checkout.example.test/pay",
    "javascript:alert(1)",
    "https://user:password@checkout.example.test/pay",
    " https://checkout.example.test/pay",
  ])("refuses an unsafe checkout URL", (url) => {
    expect(
      validReusableMembershipCheckoutUrl({
        ...candidate(30),
        checkoutUrl: url,
      }),
    ).toBeNull();
  });

  it("schedule replacement never accepts a missing expiry", async () => {
    const now = at(30);

    const fingerprint: SubscribeAttemptFingerprint = {
      membershipId: "plan-1",
      offerId: null,
      scheduleIds: ["schedule-1"],
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

    const tx = {
      userMembership: {
        findMany: vi.fn().mockResolvedValue([{
          id: "pending-1",
          startDate: at(0),
          endDate: at(60 * 24 * 30),
          pendingExpiresAt: at(60),
          bookingPatternSnapshot: "{}",
          membership: { kind: "subscription" },
        }]),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue({
          id: "payment-1",
          checkoutUrl: validUrl,
          expiresAt: null,
          metadata: JSON.stringify({
            subscribeAttemptFingerprint: fingerprint,
            bookingRecoveryData: {
              selectedScheduleIds: ["schedule-1"],
            },
          }),
        }),
      },
    };

    const result =
      await findScheduleReplaceablePendingMembershipCheckoutTx({
        tx,
        userId: "user-1",
        fingerprint,
        now,
      });

    expect(result).toBeNull();

    expect(tx.paymentTransaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: { gt: now },
        }),
        select: expect.objectContaining({
          expiresAt: true,
        }),
      }),
    );
  });
});
