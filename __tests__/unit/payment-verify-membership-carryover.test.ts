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

vi.mock("@/lib/payments/friend-offer-finalization", () => ({
  maybeFinalizeFriendOfferPayment:
    vi.fn(),
}));

vi.mock("@/lib/payments/service", () => ({
  recoverPaidMembershipActivation:
    vi.fn(),
  verifyPaymentTransaction:
    vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    paymentTransaction: {
      findUnique: vi.fn(),
    },
    userMembership: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/payments/verify/[transactionId]/route";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { maybeFinalizeFriendOfferPayment } from "@/lib/payments/friend-offer-finalization";
import {
  recoverPaidMembershipActivation,
  verifyPaymentTransaction,
} from "@/lib/payments/service";

describe(
  "payment verify membership carryover result",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      vi.mocked(
        getCurrentAppUser,
      ).mockResolvedValue({
        id: "user-1",
      } as never);

      vi.mocked(
        verifyPaymentTransaction,
      ).mockResolvedValue({
        id: "payment-1",
        status: "paid",
        purpose: "membership",
      } as never);

      vi.mocked(
        maybeFinalizeFriendOfferPayment,
      ).mockResolvedValue({
        kind: "not_friend_offer",
        reason: "different_payment_source",
      } as never);
    });

    it(
      "returns the actual persisted carryover after an active paid renewal",
      async () => {
        vi.mocked(
          db.paymentTransaction.findUnique,
        )
          .mockResolvedValueOnce({
            id: "payment-1",
            userId: "user-1",
            status: "paid",
            purpose: "membership",
          } as never)
          .mockResolvedValueOnce({
            membershipId: "membership-1",
          } as never)
          .mockResolvedValueOnce({
            membershipId: "membership-1",
          } as never);

        vi.mocked(
          db.userMembership.findUnique,
        )
          .mockResolvedValueOnce({
            status: "active",
          } as never)
          .mockResolvedValueOnce({
            userId: "user-1",
            status: "active",
            baseSessions: 12,
            carryoverSessions: 4,
            totalSessions: 16,
            carryoverFromMembershipId:
              "source-membership",
            carryoverAppliedAt:
              new Date(
                "2026-09-22T12:00:00.000Z",
              ),
          } as never);

        const response = await GET(
          new Request(
            "http://localhost/api/payments/verify/payment-1",
          ),
          {
            params: Promise.resolve({
              transactionId: "payment-1",
            }),
          },
        );

        expect(response.status).toBe(200);

        const body =
          await response.json();

        expect(
          body.membershipCarryover,
        ).toEqual({
          baseSessions: 12,
          carryoverSessions: 4,
          totalSessions: 16,
          appliedAt:
            "2026-09-22T12:00:00.000Z",
        });

        expect(
          recoverPaidMembershipActivation,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns the persisted carryover for a completed Friend Offer participant",
      async () => {
        vi.mocked(
          maybeFinalizeFriendOfferPayment,
        ).mockResolvedValue({
          kind: "friend_offer",
          groupId: "group-1",
          status: "completed",
          alreadyCompleted: false,
        } as never);

        vi.mocked(
          db.paymentTransaction.findUnique,
        )
          .mockResolvedValueOnce({
            id: "friend-payment",
            userId: "user-1",
            status: "paid",
            purpose: "membership",
          } as never)
          .mockResolvedValueOnce({
            membershipId: "friend-membership",
          } as never);

        vi.mocked(
          db.userMembership.findUnique,
        ).mockResolvedValueOnce({
          userId: "user-1",
          status: "active",
          baseSessions: 12,
          carryoverSessions: 3,
          totalSessions: 15,
          carryoverFromMembershipId:
            "source-friend",
          carryoverAppliedAt:
            new Date(
              "2026-09-22T13:00:00.000Z",
            ),
        } as never);

        const response = await GET(
          new Request(
            "http://localhost/api/payments/verify/friend-payment",
          ),
          {
            params: Promise.resolve({
              transactionId:
                "friend-payment",
            }),
          },
        );

        const body =
          await response.json();

        expect(body.friendOffer).toEqual({
          groupId: "group-1",
          status: "completed",
        });

        expect(
          body.membershipCarryover,
        ).toEqual(
          expect.objectContaining({
            baseSessions: 12,
            carryoverSessions: 3,
            totalSessions: 15,
          }),
        );
      },
    );

    it(
      "does not invent carryover when the active membership has none",
      async () => {
        vi.mocked(
          db.paymentTransaction.findUnique,
        )
          .mockResolvedValueOnce({
            id: "payment-2",
            userId: "user-1",
            status: "paid",
            purpose: "membership",
          } as never)
          .mockResolvedValueOnce({
            membershipId: "membership-2",
          } as never)
          .mockResolvedValueOnce({
            membershipId: "membership-2",
          } as never);

        vi.mocked(
          db.userMembership.findUnique,
        )
          .mockResolvedValueOnce({
            status: "active",
          } as never)
          .mockResolvedValueOnce({
            userId: "user-1",
            status: "active",
            baseSessions: 12,
            carryoverSessions: 0,
            totalSessions: 12,
            carryoverFromMembershipId: null,
            carryoverAppliedAt: null,
          } as never);

        const response = await GET(
          new Request(
            "http://localhost/api/payments/verify/payment-2",
          ),
          {
            params: Promise.resolve({
              transactionId: "payment-2",
            }),
          },
        );

        const body =
          await response.json();

        expect(
          body.membershipCarryover,
        ).toEqual({
          baseSessions: 12,
          carryoverSessions: 0,
          totalSessions: 12,
          appliedAt: null,
        });
      },
    );
  },
);
