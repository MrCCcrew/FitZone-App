import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/membership-carryover-customer-preview", () => ({
  previewMembershipCarryoverForCustomerTx:
    vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {};

  return {
    asDbTransactionClient: (tx: unknown) => tx,
    db: {
      user: {
        findUnique: vi.fn(),
      },
      siteContent: {
        findUnique: vi.fn(),
      },
      userMembership: {
        count: vi.fn(),
      },
      partnerAffiliateLink: {
        findUnique: vi.fn(),
      },
      partner: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(
        async (
          callback: (
            tx: unknown,
          ) => unknown,
        ) => callback(tx),
      ),
    },
  };
});

import { GET } from "@/app/api/me/checkout-options/route";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { previewMembershipCarryoverForCustomerTx } from "@/lib/membership-carryover-customer-preview";

describe(
  "GET /api/me/checkout-options carryover preview",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        getCurrentAppUser,
      ).mockResolvedValue({
        id: "user-1",
      } as never);

      vi.mocked(
        db.user.findUnique,
      ).mockResolvedValue({
        wallet: { balance: 20 },
        rewardPoints: { points: 50 },
        pendingPartnerRef: null,
      } as never);

      vi.mocked(
        db.siteContent.findUnique,
      ).mockResolvedValue(null);

      vi.mocked(
        db.userMembership.count,
      ).mockResolvedValue(0);

      vi.mocked(
        previewMembershipCarryoverForCustomerTx,
      ).mockResolvedValue({
        eligible: true,
        reason: "eligible",
        baseSessions: 12,
        freeCarryoverSessions: 4,
        transferredReservedUnits: 0,
        carryoverSessions: 4,
        expectedTotalSessions: 16,
        blocking: false,
        targetMembershipId: "plan-1",
        targetOfferId: null,
      });
    });

    it(
      "passes the selected checkout contract to the authoritative preview",
      async () => {
        const response = await GET(
          new Request(
            "http://localhost/api/me/checkout-options?membershipId=plan-1&scheduleId=s1&scheduleId=s2&selectedMonths=3&startDate=2026-09-25",
          ),
        );

        expect(response.status).toBe(200);

        expect(
          previewMembershipCarryoverForCustomerTx,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "user-1",
          {
            membershipId: "plan-1",
            offerId: null,
            scheduleIds: ["s1", "s2"],
            selectedMonths: 3,
            startDate: "2026-09-25",
          },
        );

        const body =
          await response.json();

        expect(body.carryover).toEqual(
          expect.objectContaining({
            eligible: true,
            carryoverSessions: 4,
            expectedTotalSessions: 16,
          }),
        );
      },
    );

    it(
      "keeps legacy checkout-options calls working without a selected plan",
      async () => {
        const response = await GET(
          new Request(
            "http://localhost/api/me/checkout-options",
          ),
        );

        expect(response.status).toBe(200);

        expect(
          previewMembershipCarryoverForCustomerTx,
        ).not.toHaveBeenCalled();

        const body =
          await response.json();

        expect(body.carryover).toBeNull();
        expect(body.walletBalance).toBe(20);
      },
    );
  },
);
