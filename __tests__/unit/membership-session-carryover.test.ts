import type { Prisma } from "@prisma/client";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applyMembershipSessionCarryoverTx,
  prepareMembershipSessionCarryoverTx,
  previewMembershipSessionCarryoverTx,
} from "@/lib/membership-session-carryover";

const START =
  new Date("2026-09-21T00:00:00.000Z");
const END =
  new Date("2026-10-21T00:00:00.000Z");
const SLOT =
  new Date("2026-09-25T00:00:00.000Z");

const ELIGIBILITY =
  JSON.stringify({
    mode: "class_ids",
    classIds: ["class-b", "class-a"],
  });

const ELIGIBILITY_REORDERED =
  JSON.stringify({
    classIds: ["class-a", "class-b"],
    mode: "class_ids",
  });

type BookingFixture = {
  id: string;
  status: "confirmed" | "attended";
  entitlementUnits: number | null;
  isMakeup: boolean;
  schedule: {
    date: Date;
    time: string;
  };
};

function attended(
  count: number,
): BookingFixture[] {
  return Array.from(
    {
      length: count,
    },
    (_, index) => ({
      id: `attended-${index + 1}`,
      status: "attended",
      entitlementUnits: 1,
      isMakeup: false,
      schedule: {
        date: SLOT,
        time: "10:00",
      },
    }),
  );
}

function createHarness(options?: {
  sourceMembershipId?: string;
  sourcePlanId?: string;
  sourceOfferId?: string | null;
  sourceEligibility?: string | null;
  sourceTotalSessions?: number | null;
  bookings?: BookingFixture[];
  pendingExchangeRequests?: number;
  targetPlanId?: string;
  targetOfferId?: string | null;
  targetEligibility?: string | null;
  targetTotalSessions?: number | null;
  targetBaseSessions?: number | null;
  targetStatus?: string;
  targetStart?: Date;
  targetEnd?: Date;
  alreadyApplied?: boolean;
}) {
  const sourceMembershipId =
    options?.sourceMembershipId ??
    "old-membership";

  const sourcePlanId =
    options?.sourcePlanId ??
    "plan-1";

  const sourceOfferId =
    options?.sourceOfferId ?? null;

  const targetPlanId =
    options?.targetPlanId ??
    "plan-1";

  const targetOfferId =
    options?.targetOfferId ?? null;

  const source = {
    id: sourceMembershipId,
    membershipId: sourcePlanId,
    offerId: sourceOfferId,
    totalSessions:
      options?.sourceTotalSessions ??
      12,
    eligibilitySnapshot:
      options?.sourceEligibility ??
      ELIGIBILITY,
    allowedClassTypesSnapshot:
      JSON.stringify(["fitness"]),
    membership: {
      kind: "subscription",
    },
  };

  const alreadyApplied =
    options?.alreadyApplied === true;

  const target = {
    id: "new-membership",
    userId: "user-1",
    membershipId: targetPlanId,
    offerId: targetOfferId,
    status:
      options?.targetStatus ??
      "active",
    startDate:
      options?.targetStart ??
      START,
    endDate:
      options?.targetEnd ??
      END,
    totalSessions:
      options?.targetTotalSessions ??
      12,
    baseSessions:
      options?.targetBaseSessions ??
      12,
    carryoverSessions:
      alreadyApplied ? 4 : 0,
    carryoverFromMembershipId:
      alreadyApplied
        ? sourceMembershipId
        : null,
    carryoverAppliedAt:
      alreadyApplied
        ? new Date(
            "2026-09-21T12:00:00.000Z",
          )
        : null,
    eligibilitySnapshot:
      options?.targetEligibility ??
      ELIGIBILITY_REORDERED,
    allowedClassTypesSnapshot:
      JSON.stringify(["fitness"]),
    membership: {
      kind: "subscription",
    },
  };

  const tx = {
    $queryRaw:
      vi.fn().mockResolvedValue([
        {
          id: sourceMembershipId,
        },
      ]),
    userMembership: {
      findUnique:
        vi.fn().mockResolvedValue(
          target,
        ),
      findMany:
        vi.fn().mockResolvedValue(
          [source],
        ),
      updateMany:
        vi.fn().mockResolvedValue({
          count: 1,
        }),
    },
    classExchangeRequest: {
      count:
        vi.fn().mockResolvedValue(
          options?.pendingExchangeRequests ??
            0,
        ),
    },
    booking: {
      findMany:
        vi.fn().mockResolvedValue(
          options?.bookings ?? [],
        ),
      updateMany:
        vi.fn().mockImplementation(
          async (args: {
            where?: {
              id?: {
                in?: string[];
              };
            };
          }) => ({
            count:
              args.where?.id?.in?.length ??
              0,
          }),
        ),
    },
    membershipClassExchange: {
      updateMany:
        vi.fn().mockResolvedValue({
          count: 0,
        }),
    },
  };

  return {
    tx,
    prismaTx:
      tx as unknown as
        Prisma.TransactionClient,
  };
}

describe(
  "membership session carryover",
  () => {
    it(
      "preserves both free and already-reserved unused units on early renewal",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "future-1",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "11:00",
                },
              },
              {
                id: "future-2",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "12:00",
                },
              },
            ],
          });

        const appliedAt =
          new Date(
            "2026-09-21T13:00:00.000Z",
          );

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
              appliedAt,
            },
          );

        expect(result).toMatchObject({
          eligible: true,
          reason: "applied",
          sourceMembershipId:
            "old-membership",
          baseSessions: 12,
          freeCarryoverSessions: 2,
          transferredReservedUnits: 2,
          carryoverSessions: 4,
          expectedTotalSessions: 16,
          transferableBookingIds: [
            "future-1",
            "future-2",
          ],
          appliedAt,
        });

        expect(
          harness.tx.booking.updateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              userMembershipId:
                "new-membership",
            },
          }),
        );

        expect(
          harness.tx.userMembership
            .updateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                baseSessions: 12,
                carryoverSessions: 4,
                carryoverFromMembershipId:
                  "old-membership",
                totalSessions: 16,
              }),
          }),
        );
      },
    );

    it(
      "keeps confirmed make-up on the expired source and never double carries it",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "makeup-1",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: true,
                schedule: {
                  date: SLOT,
                  time: "11:00",
                },
              },
              {
                id: "ordinary-1",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "12:00",
                },
              },
            ],
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(
          result.freeCarryoverSessions,
        ).toBe(2);
        expect(
          result.transferredReservedUnits,
        ).toBe(1);
        expect(
          result.carryoverSessions,
        ).toBe(3);
        expect(
          result.expectedTotalSessions,
        ).toBe(15);
        expect(
          result.transferableBookingIds,
        ).toEqual(["ordinary-1"]);

        const moveCall =
          harness.tx.booking.updateMany
            .mock.calls[0]?.[0];

        expect(
          moveCall.where.id.in,
        ).toEqual(["ordinary-1"]);
      },
    );

    it(
      "preserves weighted Class Exchange units and relinks its audit lineage",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "exchange-booking",
                status: "confirmed",
                entitlementUnits: 2,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "13:00",
                },
              },
            ],
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(
          result.transferredReservedUnits,
        ).toBe(2);
        expect(
          result.freeCarryoverSessions,
        ).toBe(2);
        expect(
          result.carryoverSessions,
        ).toBe(4);
        expect(
          result.expectedTotalSessions,
        ).toBe(16);

        expect(
          harness.tx
            .membershipClassExchange
            .updateMany,
        ).toHaveBeenCalledWith({
          where: {
            bookingId: {
              in: [
                "exchange-booking",
              ],
            },
            userMembershipId:
              "old-membership",
          },
          data: {
            userMembershipId:
              "new-membership",
          },
        });
      },
    );

    it(
      "does not apply carryover when no entitlement remains",
      async () => {
        const harness =
          createHarness({
            bookings: attended(12),
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "zero_balance",
        );
        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();
        expect(
          harness.tx.userMembership
            .updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed instead of choosing one of multiple active paid sources",
      async () => {
        const harness =
          createHarness();

        harness.tx.userMembership.findMany
          .mockResolvedValueOnce([
            {
              id: "old-membership-a",
              membershipId: "plan-1",
              offerId: null,
              totalSessions: 12,
              eligibilitySnapshot:
                ELIGIBILITY,
              allowedClassTypesSnapshot:
                JSON.stringify(
                  ["fitness"],
                ),
              membership: {
                kind: "subscription",
              },
            },
            {
              id: "old-membership-b",
              membershipId: "plan-1",
              offerId: null,
              totalSessions: 12,
              eligibilitySnapshot:
                ELIGIBILITY,
              allowedClassTypesSnapshot:
                JSON.stringify(
                  ["fitness"],
                ),
              membership: {
                kind: "subscription",
              },
            },
          ]);

        const result =
          await previewMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              excludeMembershipId:
                "new-membership",
              target: {
                membershipId: "plan-1",
                offerId: null,
                eligibilitySnapshot:
                  ELIGIBILITY_REORDERED,
                allowedClassTypesSnapshot:
                  JSON.stringify(
                    ["fitness"],
                  ),
                baseSessions: 12,
                startDate: START,
                endDate: END,
                kind: "subscription",
              },
            },
          );

        expect(result.eligible).toBe(false);

        expect(result.reason).toBe(
          "multiple_active_sources",
        );

        expect(
          harness.tx.classExchangeRequest.count,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx.booking.findMany,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx.userMembership.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects automatic carryover across different plans",
      async () => {
        const harness =
          createHarness({
            sourcePlanId: "plan-old",
            targetPlanId: "plan-new",
          });

        const result =
          await previewMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              target: {
                membershipId: "plan-new",
                offerId: null,
                eligibilitySnapshot:
                  ELIGIBILITY,
                allowedClassTypesSnapshot:
                  JSON.stringify(
                    ["fitness"],
                  ),
                baseSessions: 12,
                startDate: START,
                endDate: END,
                kind: "subscription",
              },
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "different_plan",
        );
      },
    );

    it(
      "rejects same-plan carryover when frozen entitlement differs",
      async () => {
        const harness =
          createHarness({
            targetEligibility:
              JSON.stringify({
                mode: "class_ids",
                classIds: ["different"],
              }),
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "incompatible_entitlement",
        );
        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "blocks carryover while a Class Exchange request is still pending",
      async () => {
        const harness =
          createHarness({
            pendingExchangeRequests: 1,
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "pending_exchange_request",
        );
      },
    );

    it(
      "is idempotent when the target already records applied carryover",
      async () => {
        const harness =
          createHarness({
            alreadyApplied: true,
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.reason).toBe(
          "already_applied",
        );
        expect(
          result.carryoverSessions,
        ).toBe(4);

        expect(
          harness.tx.userMembership
            .findMany,
        ).not.toHaveBeenCalled();
        expect(
          harness.tx.booking.findMany,
        ).not.toHaveBeenCalled();
        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "prepares an authoritative preview under the source membership row lock",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "reserved-after-lock",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "10:00",
                },
              },
            ],
          });

        const result =
          await prepareMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              excludeMembershipId:
                "new-membership",
              target: {
                membershipId: "plan-1",
                offerId: null,
                eligibilitySnapshot:
                  ELIGIBILITY_REORDERED,
                allowedClassTypesSnapshot:
                  JSON.stringify(
                    ["fitness"],
                  ),
                baseSessions: 12,
                startDate: START,
                endDate: END,
                kind: "subscription",
              },
            },
          );

        expect(result.eligible).toBe(true);
        expect(
          result.sourceMembershipId,
        ).toBe("old-membership");
        expect(
          result.freeCarryoverSessions,
        ).toBe(3);
        expect(
          result.transferredReservedUnits,
        ).toBe(1);
        expect(
          result.carryoverSessions,
        ).toBe(4);

        expect(
          harness.tx.$queryRaw,
        ).toHaveBeenCalledTimes(1);

        /*
         * One read before the lock + one authoritative read after it.
         */
        expect(
          harness.tx.userMembership
            .findMany,
        ).toHaveBeenCalledTimes(2);

        expect(
          harness.tx.booking.findMany,
        ).toHaveBeenCalledTimes(2);

        /*
         * Prepare is read-only apart from the SQL row lock.
         */
        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx.userMembership
            .updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed if the source membership changes before the row lock is acquired",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "future-race",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date: SLOT,
                  time: "10:00",
                },
              },
            ],
          });

        harness.tx.$queryRaw.mockResolvedValueOnce(
          [],
        );

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "source_changed_during_apply",
        );

        expect(
          harness.tx.$queryRaw,
        ).toHaveBeenCalledTimes(1);

        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx
            .membershipClassExchange
            .updateMany,
        ).not.toHaveBeenCalled();

        expect(
          harness.tx.userMembership
            .updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "refuses to relink a reserved booking outside the renewed membership period",
      async () => {
        const harness =
          createHarness({
            bookings: [
              ...attended(8),
              {
                id: "outside-period",
                status: "confirmed",
                entitlementUnits: 1,
                isMakeup: false,
                schedule: {
                  date:
                    new Date(
                      "2026-11-05T00:00:00.000Z",
                    ),
                  time: "10:00",
                },
              },
            ],
          });

        const result =
          await applyMembershipSessionCarryoverTx(
            harness.prismaTx,
            {
              userId: "user-1",
              targetMembershipId:
                "new-membership",
            },
          );

        expect(result.eligible).toBe(false);
        expect(result.reason).toBe(
          "booking_outside_target_period",
        );

        expect(
          harness.tx.booking.updateMany,
        ).not.toHaveBeenCalled();
        expect(
          harness.tx
            .membershipClassExchange
            .updateMany,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
