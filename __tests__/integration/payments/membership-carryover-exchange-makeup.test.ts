import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  asDbTransactionClient,
  db,
} from "@/lib/db";
import {
  applyMembershipSessionCarryoverTx,
} from "@/lib/membership-session-carryover";

function assertTestDatabase() {
  const raw =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL;

  if (!raw) {
    throw new Error(
      "TEST_DATABASE_URL or DATABASE_URL is required for carryover exchange/makeup integration tests.",
    );
  }

  const url = new URL(raw);
  const database = decodeURIComponent(
    url.pathname.replace(/^\//, ""),
  );
  const username = decodeURIComponent(
    url.username,
  );

  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    database !== "fitzone_test" ||
    username !== "fitzone_test_user"
  ) {
    throw new Error(
      "Carryover exchange/makeup integration tests require fitzone_test as fitzone_test_user on 127.0.0.1:3306.",
    );
  }
}

assertTestDatabase();

const DAY_MS = 24 * 60 * 60 * 1000;

describe(
  "Membership carryover — Exchange/Makeup real fitzone_test integration",
  () => {
    let customerId = "";
    let adminId = "";
    let trainerId = "";
    let classId = "";
    let planId = "";
    let sourceMembershipId = "";
    let targetMembershipId = "";
    let exchangeBookingId = "";
    let ordinaryBookingId = "";
    let makeupBookingId = "";
    let attendedBookingIds: string[] = [];
    let scheduleIds: string[] = [];
    let allBookingIds: string[] = [];

    async function createSchedule(
      dayOffset: number,
      time: string,
    ) {
      const schedule = await db.schedule.create({
        data: {
          classId,
          date: new Date(
            Date.now() + dayOffset * DAY_MS,
          ),
          time,
          availableSpots: 20,
          isActive: true,
        },
      });

      scheduleIds.push(schedule.id);
      return schedule;
    }

    async function createBooking(input: {
      scheduleId: string;
      status: "confirmed" | "attended";
      entitlementUnits?: number;
      isMakeup?: boolean;
      makeupReason?: string | null;
    }) {
      const booking = await db.booking.create({
        data: {
          userId: customerId,
          scheduleId: input.scheduleId,
          userMembershipId:
            sourceMembershipId,
          status: input.status,
          paidAmount: 0,
          paymentMethod: "membership",
          entitlementUnits:
            input.entitlementUnits ?? 1,
          isMakeup:
            input.isMakeup ?? false,
          makeupReason:
            input.makeupReason ?? null,
        },
      });

      allBookingIds.push(booking.id);
      return booking;
    }

    beforeEach(async () => {
      const stamp =
        `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

      const customer = await db.user.create({
        data: {
          name: "Carryover Exchange Makeup Customer",
          email:
            `carryover-exchange-makeup-${stamp}@test.local`,
          phone:
            `07${Date.now()
              .toString()
              .slice(-8)}`,
          role: "member",
          isActive: true,
        },
      });
      customerId = customer.id;

      const admin = await db.user.create({
        data: {
          name: "Carryover Exchange Makeup Admin",
          email:
            `carryover-exchange-admin-${stamp}@test.local`,
          role: "admin",
          adminAccess: true,
          isActive: true,
        },
      });
      adminId = admin.id;

      const trainer = await db.trainer.create({
        data: {
          name:
            "Carryover Exchange Makeup Trainer",
          specialty: "fitness",
          bio: "Integration fixture",
          isActive: true,
        },
      });
      trainerId = trainer.id;

      const gymClass = await db.class.create({
        data: {
          name:
            "Carryover Exchange Makeup Class",
          trainerId,
          type: "fitness",
          duration: 60,
          intensity: "medium",
          maxSpots: 20,
          price: 100,
          isActive: true,
        },
      });
      classId = gymClass.id;

      const plan = await db.membership.create({
        data: {
          name:
            "Carryover Exchange Makeup Membership",
          nameEn:
            "Carryover Exchange Makeup Membership",
          price: 333,
          duration: 30,
          kind: "subscription",
          sessionsCount: 12,
          features: JSON.stringify([
            "carryover-exchange-makeup-integration",
          ]),
          isActive: true,
        },
      });
      planId = plan.id;

      const source =
        await db.userMembership.create({
          data: {
            userId: customerId,
            membershipId: planId,
            status: "active",
            startDate: new Date(
              Date.now() - 10 * DAY_MS,
            ),
            endDate: new Date(
              Date.now() + 20 * DAY_MS,
            ),
            paymentAmount: 333,
            baseSessions: 8,
            totalSessions: 8,
            snapshotDurationDays: 30,
            eligibilitySnapshot: null,
            allowedClassTypesSnapshot: null,
          },
        });
      sourceMembershipId = source.id;

      const target =
        await db.userMembership.create({
          data: {
            userId: customerId,
            membershipId: planId,
            status: "active",
            startDate: new Date(
              Date.now() - DAY_MS,
            ),
            endDate: new Date(
              Date.now() + 30 * DAY_MS,
            ),
            paymentAmount: 333,
            baseSessions: 12,
            totalSessions: 12,
            snapshotDurationDays: 30,
            eligibilitySnapshot: null,
            allowedClassTypesSnapshot: null,
          },
        });
      targetMembershipId = target.id;

      const attendedSchedule1 =
        await createSchedule(-3, "08:00");
      const attendedSchedule2 =
        await createSchedule(-2, "09:00");
      const exchangeSchedule =
        await createSchedule(2, "10:00");
      const ordinarySchedule =
        await createSchedule(3, "11:00");
      const makeupSchedule =
        await createSchedule(4, "12:00");

      const attended1 = await createBooking({
        scheduleId: attendedSchedule1.id,
        status: "attended",
      });
      const attended2 = await createBooking({
        scheduleId: attendedSchedule2.id,
        status: "attended",
      });
      attendedBookingIds = [
        attended1.id,
        attended2.id,
      ];

      const exchangeBooking =
        await createBooking({
          scheduleId: exchangeSchedule.id,
          status: "confirmed",
          entitlementUnits: 2,
        });
      exchangeBookingId = exchangeBooking.id;

      const ordinaryBooking =
        await createBooking({
          scheduleId: ordinarySchedule.id,
          status: "confirmed",
          entitlementUnits: 1,
        });
      ordinaryBookingId = ordinaryBooking.id;

      const makeupBooking =
        await createBooking({
          scheduleId: makeupSchedule.id,
          status: "confirmed",
          entitlementUnits: 1,
          isMakeup: true,
          makeupReason:
            "integration-makeup-entitlement",
        });
      makeupBookingId = makeupBooking.id;

      await db.membershipClassExchange.create({
        data: {
          userMembershipId:
            sourceMembershipId,
          bookingId: exchangeBookingId,
          entitlementUnits: 2,
          status: "active",
          reason:
            "integration weighted exchange",
          createdByUserId: adminId,
        },
      });
    });

    afterEach(async () => {
      await db.classExchangeRequest.deleteMany({
        where: {
          userMembershipId: {
            in: [
              sourceMembershipId,
              targetMembershipId,
            ],
          },
        },
      });

      await db.membershipClassExchange.deleteMany({
        where: {
          bookingId: {
            in: allBookingIds,
          },
        },
      });

      await db.booking.deleteMany({
        where: {
          id: {
            in: allBookingIds,
          },
        },
      });

      await db.userMembership.updateMany({
        where: {
          id: targetMembershipId,
        },
        data: {
          carryoverFromMembershipId: null,
          carryoverAppliedAt: null,
          carryoverSessions: 0,
        },
      });

      await db.userMembership.deleteMany({
        where: {
          id: {
            in: [
              targetMembershipId,
              sourceMembershipId,
            ],
          },
        },
      });

      await db.schedule.deleteMany({
        where: {
          id: {
            in: scheduleIds,
          },
        },
      });

      await db.class.deleteMany({
        where: { id: classId },
      });

      await db.trainer.deleteMany({
        where: { id: trainerId },
      });

      await db.membership.deleteMany({
        where: { id: planId },
      });

      await db.user.deleteMany({
        where: {
          id: {
            in: [customerId, adminId],
          },
        },
      });
    });

    it(
      "moves weighted ordinary entitlement and exchange lineage while keeping makeup on the source exactly once",
      async () => {
        const result = await db.$transaction(
          async (tx) =>
            applyMembershipSessionCarryoverTx(
              asDbTransactionClient(tx),
              {
                userId: customerId,
                targetMembershipId,
              },
            ),
        );

        expect(result).toMatchObject({
          eligible: true,
          reason: "applied",
          sourceMembershipId,
          baseSessions: 12,
          freeCarryoverSessions: 2,
          transferredReservedUnits: 3,
          carryoverSessions: 5,
          expectedTotalSessions: 17,
        });
        expect(
          [...result.transferableBookingIds].sort(),
        ).toEqual(
          [
            exchangeBookingId,
            ordinaryBookingId,
          ].sort(),
        );

        const target =
          await db.userMembership.findUniqueOrThrow({
            where: { id: targetMembershipId },
          });

        expect(target.baseSessions).toBe(12);
        expect(target.carryoverSessions).toBe(5);
        expect(target.totalSessions).toBe(17);
        expect(
          target.carryoverFromMembershipId,
        ).toBe(sourceMembershipId);
        expect(target.carryoverAppliedAt).not.toBeNull();

        const bookings = await db.booking.findMany({
          where: {
            id: {
              in: allBookingIds,
            },
          },
          select: {
            id: true,
            userMembershipId: true,
            entitlementUnits: true,
            isMakeup: true,
            status: true,
          },
        });

        expect(bookings).toHaveLength(5);
        expect(
          new Set(bookings.map((row) => row.id)).size,
        ).toBe(5);

        const byId = new Map(
          bookings.map((row) => [row.id, row]),
        );

        expect(
          byId.get(exchangeBookingId)
            ?.userMembershipId,
        ).toBe(targetMembershipId);
        expect(
          byId.get(exchangeBookingId)
            ?.entitlementUnits,
        ).toBe(2);

        expect(
          byId.get(ordinaryBookingId)
            ?.userMembershipId,
        ).toBe(targetMembershipId);
        expect(
          byId.get(ordinaryBookingId)
            ?.entitlementUnits,
        ).toBe(1);

        expect(
          byId.get(makeupBookingId)
            ?.userMembershipId,
        ).toBe(sourceMembershipId);
        expect(
          byId.get(makeupBookingId)?.isMakeup,
        ).toBe(true);
        expect(
          byId.get(makeupBookingId)
            ?.entitlementUnits,
        ).toBe(1);

        for (const id of attendedBookingIds) {
          expect(
            byId.get(id)?.userMembershipId,
          ).toBe(sourceMembershipId);
          expect(byId.get(id)?.status).toBe(
            "attended",
          );
        }

        expect(
          bookings.filter(
            (row) => row.isMakeup === true,
          ),
        ).toHaveLength(1);

        const exchangeAudit =
          await db.membershipClassExchange.findUniqueOrThrow({
            where: {
              bookingId: exchangeBookingId,
            },
          });

        expect(
          exchangeAudit.userMembershipId,
        ).toBe(targetMembershipId);
        expect(exchangeAudit.entitlementUnits).toBe(2);
        expect(exchangeAudit.status).toBe("active");

        const retry = await db.$transaction(
          async (tx) =>
            applyMembershipSessionCarryoverTx(
              asDbTransactionClient(tx),
              {
                userId: customerId,
                targetMembershipId,
              },
            ),
        );

        expect(retry.reason).toBe(
          "already_applied",
        );
        expect(retry.carryoverSessions).toBe(5);
        expect(retry.expectedTotalSessions).toBe(
          17,
        );

        const bookingsAfterRetry =
          await db.booking.findMany({
            where: {
              id: {
                in: allBookingIds,
              },
            },
            select: {
              id: true,
              userMembershipId: true,
              entitlementUnits: true,
              isMakeup: true,
            },
          });

        expect(bookingsAfterRetry).toHaveLength(5);
        expect(
          bookingsAfterRetry.filter(
            (row) => row.isMakeup === true,
          ),
        ).toHaveLength(1);

        const totalPhysicalEntitlementUnits =
          bookingsAfterRetry.reduce(
            (sum, row) =>
              sum + row.entitlementUnits,
            0,
          );
        expect(totalPhysicalEntitlementUnits).toBe(6);

        const lineageCount =
          await db.userMembership.count({
            where: {
              carryoverFromMembershipId:
                sourceMembershipId,
            },
          });
        expect(lineageCount).toBe(1);

        const exchangeCount =
          await db.membershipClassExchange.count({
            where: {
              bookingId: exchangeBookingId,
            },
          });
        expect(exchangeCount).toBe(1);
      },
      30000,
    );

    it(
      "rolls back booking relinks, exchange lineage, and target entitlement atomically when the outer transaction fails",
      async () => {
        await expect(
          db.$transaction(async (tx) => {
            const applied =
              await applyMembershipSessionCarryoverTx(
                asDbTransactionClient(tx),
                {
                  userId: customerId,
                  targetMembershipId,
                },
              );

            expect(applied.reason).toBe(
              "applied",
            );

            throw new Error(
              "FORCED_CARRYOVER_ROLLBACK",
            );
          }),
        ).rejects.toThrow(
          "FORCED_CARRYOVER_ROLLBACK",
        );

        const target =
          await db.userMembership.findUniqueOrThrow({
            where: { id: targetMembershipId },
          });

        expect(target.baseSessions).toBe(12);
        expect(target.totalSessions).toBe(12);
        expect(target.carryoverSessions).toBe(0);
        expect(
          target.carryoverFromMembershipId,
        ).toBeNull();
        expect(target.carryoverAppliedAt).toBeNull();

        const bookings = await db.booking.findMany({
          where: {
            id: {
              in: allBookingIds,
            },
          },
          select: {
            id: true,
            userMembershipId: true,
            isMakeup: true,
          },
        });

        expect(bookings).toHaveLength(5);
        expect(
          bookings.every(
            (row) =>
              row.userMembershipId ===
              sourceMembershipId,
          ),
        ).toBe(true);
        expect(
          bookings.filter(
            (row) => row.isMakeup === true,
          ),
        ).toHaveLength(1);

        const exchangeAudit =
          await db.membershipClassExchange.findUniqueOrThrow({
            where: {
              bookingId: exchangeBookingId,
            },
          });

        expect(
          exchangeAudit.userMembershipId,
        ).toBe(sourceMembershipId);
        expect(exchangeAudit.entitlementUnits).toBe(2);

        const lineageCount =
          await db.userMembership.count({
            where: {
              carryoverFromMembershipId:
                sourceMembershipId,
            },
          });
        expect(lineageCount).toBe(0);
      },
      30000,
    );

    it(
      "fails closed on a pending Class Exchange request without moving bookings, makeup, lineage, or target entitlement",
      async () => {
        const requestTarget =
          await createSchedule(5, "13:00");

        const request =
          await db.classExchangeRequest.create({
            data: {
              userId: customerId,
              userMembershipId:
                sourceMembershipId,
              targetScheduleId:
                requestTarget.id,
              note:
                "integration pending exchange guard",
              status: "pending",
              pendingKey:
                `carryover-pending:${sourceMembershipId}`,
            },
          });

        const beforeBookings =
          await db.booking.findMany({
            where: {
              id: {
                in: allBookingIds,
              },
            },
            orderBy: { id: "asc" },
            select: {
              id: true,
              userMembershipId: true,
              entitlementUnits: true,
              isMakeup: true,
              status: true,
            },
          });

        const result = await db.$transaction(
          async (tx) =>
            applyMembershipSessionCarryoverTx(
              asDbTransactionClient(tx),
              {
                userId: customerId,
                targetMembershipId,
              },
            ),
        );

        expect(result).toMatchObject({
          eligible: false,
          reason: "pending_exchange_request",
          sourceMembershipId,
          baseSessions: 12,
          carryoverSessions: 0,
          expectedTotalSessions: 12,
          appliedAt: null,
        });

        const target =
          await db.userMembership.findUniqueOrThrow({
            where: { id: targetMembershipId },
          });

        expect(target.baseSessions).toBe(12);
        expect(target.totalSessions).toBe(12);
        expect(target.carryoverSessions).toBe(0);
        expect(
          target.carryoverFromMembershipId,
        ).toBeNull();
        expect(target.carryoverAppliedAt).toBeNull();

        const afterBookings =
          await db.booking.findMany({
            where: {
              id: {
                in: allBookingIds,
              },
            },
            orderBy: { id: "asc" },
            select: {
              id: true,
              userMembershipId: true,
              entitlementUnits: true,
              isMakeup: true,
              status: true,
            },
          });

        expect(afterBookings).toEqual(beforeBookings);
        expect(
          afterBookings.every(
            (row) =>
              row.userMembershipId ===
              sourceMembershipId,
          ),
        ).toBe(true);
        expect(
          afterBookings.filter(
            (row) => row.isMakeup === true,
          ),
        ).toHaveLength(1);

        const exchangeAudit =
          await db.membershipClassExchange.findUniqueOrThrow({
            where: {
              bookingId: exchangeBookingId,
            },
          });

        expect(
          exchangeAudit.userMembershipId,
        ).toBe(sourceMembershipId);
        expect(exchangeAudit.entitlementUnits).toBe(2);

        const requestAfter =
          await db.classExchangeRequest.findUniqueOrThrow({
            where: { id: request.id },
          });
        expect(requestAfter.status).toBe("pending");
      },
      30000,
    );
  },
);
