/* R15Z-Y FIX2: isolated R13 test database guard. */
if (process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1") {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("R15ZY_DATABASE_URL_REQUIRED");
  const u = new URL(raw);
  if (
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    u.protocol !== "mysql:" ||
    u.hostname !== "127.0.0.1" ||
    u.port !== "3306" ||
    decodeURIComponent(u.username) !== "fitzone_r13_user" ||
    u.pathname !== "/fitzone_final_release_r13_test" ||
    (process.env.TEST_DATABASE_URL !== undefined &&
      process.env.TEST_DATABASE_URL !== raw)
  ) throw new Error("R15ZY_R13_DATABASE_IDENTITY_REJECTED");
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  applyRetroactiveMembershipAttendance,
  listRetroactiveAttendanceCandidates,
} from "@/lib/retroactive-membership-attendance";

let db: PrismaClient;

let customerId = "";
let adminId = "";
let trainerId = "";
let classId = "";
let membershipPlanId = "";
let userMembershipId = "";

const pastScheduleIds: string[] = [];
const futureScheduleIds: string[] = [];

function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;

  if (!value) {
    throw new Error("TEST_DATABASE_URL is required");
  }

  const parsed = new URL(value);
  const database = decodeURIComponent(
    parsed.pathname.replace(/^\//, ""),
  );

  // Fixture writes are allowed only against the same isolated local
  // MySQL connection used by the imported application helpers.
  if (
    parsed.protocol !== "mysql:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "3306" ||
    decodeURIComponent(parsed.username) !== (process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1" ? "fitzone_r13_user" : "fitzone_test_user") ||
    database !== (process.env.FITZONE_R13_ISOLATED_INTEGRATION === "1" ? "fitzone_final_release_r13_test" : "fitzone_test") ||
    process.env.APP_ENV !== "test" ||
    process.env.DATABASE_URL !== value
  ) {
    throw new Error("REFUSING: attendance tests require matching local fitzone_test URLs");
  }

  return value;
}

function dayOffset(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

beforeAll(async () => {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("NODE_ENV must be test");
  }

  db = new PrismaClient({
    datasources: {
      db: {
        url: testDatabaseUrl(),
      },
    },
  });

  await db.$connect();

  const suffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;

  const customer = await db.user.create({
    data: {
      name: "Retroactive Test Customer",
      email: `retro-customer-${suffix}@test.local`,
      role: "member",
      isActive: true,
    },
  });

  customerId = customer.id;

  const admin = await db.user.create({
    data: {
      name: "Retroactive Test Admin",
      email: `retro-admin-${suffix}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  adminId = admin.id;

  const trainer = await db.trainer.create({
    data: {
      name: `Retro Trainer ${suffix}`,
      specialty: "Fitness",
      isActive: true,
    },
  });

  trainerId = trainer.id;

  const gymClass = await db.class.create({
    data: {
      name: `Retro Class ${suffix}`,
      trainerId,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
      price: 100,
      isActive: true,
    },
  });

  classId = gymClass.id;

  const membershipPlan = await db.membership.create({
    data: {
      name: `Retro Membership ${suffix}`,
      kind: "subscription",
      price: 1200,
      duration: 30,
      cycle: "monthly",
      sessionsCount: 12,
      features: "[]",
      maxClasses: -1,
      isActive: true,
    },
  });

  membershipPlanId = membershipPlan.id;

  const userMembership =
    await db.userMembership.create({
      data: {
        userId: customerId,
        membershipId: membershipPlanId,
        startDate: dayOffset(-1),
        endDate: dayOffset(30),
        status: "active",
        activatedAt: new Date(),
        paymentAmount: 1200,
        paymentMethod: "card",
        totalSessions: 12,
        baseSessions: 12,
        eligibilitySnapshot: JSON.stringify({
          mode: "class_ids",
          classIds: [classId],
          classTypes: [],
        }),
      },
    });

  userMembershipId = userMembership.id;

  for (let index = 0; index < 4; index += 1) {
    const schedule = await db.schedule.create({
      data: {
        classId,
        date: dayOffset(-8 + index),
        time: "10:00",
        availableSpots: 10,
        isActive: true,
      },
    });

    pastScheduleIds.push(schedule.id);
  }

  for (let index = 0; index < 12; index += 1) {
    const schedule = await db.schedule.create({
      data: {
        classId,
        date: dayOffset(2 + index),
        time: "10:00",
        availableSpots: 9,
        isActive: true,
      },
    });

    futureScheduleIds.push(schedule.id);

    await db.booking.create({
      data: {
        userId: customerId,
        scheduleId: schedule.id,
        userMembershipId,
        status: "confirmed",
        paidAmount: 100,
        paymentMethod: "card",
        entitlementUnits: 1,
        isMakeup: false,
      },
    });
  }
}, 30000);

afterAll(async () => {
  if (!db) return;

  try {
    if (userMembershipId) {
      await db.attendanceCheckIn.deleteMany({
        where: {
          userMembershipId,
        },
      });

      await db.attendancePass.deleteMany({
        where: {
          userMembershipId,
        },
      });
    }

    if (customerId) {
      await db.booking.deleteMany({
        where: {
          userId: customerId,
        },
      });
    }

    if (userMembershipId) {
      await db.userMembership.deleteMany({
        where: {
          id: userMembershipId,
        },
      });
    }

    if (classId) {
      await db.schedule.deleteMany({
        where: {
          classId,
        },
      });

      await db.class.deleteMany({
        where: {
          id: classId,
        },
      });
    }

    if (trainerId) {
      await db.trainer.deleteMany({
        where: {
          id: trainerId,
        },
      });
    }

    if (membershipPlanId) {
      await db.membership.deleteMany({
        where: {
          id: membershipPlanId,
        },
      });
    }

    if (customerId || adminId) {
      await db.user.deleteMany({
        where: {
          id: {
            in: [customerId, adminId].filter(Boolean),
          },
        },
      });
    }
  } finally {
    await db.$disconnect();
  }
});

describe("retroactive membership attendance", () => {
  it("converts 4 past sessions into attendance while preserving a 12-session entitlement", async () => {
    const preview =
      await listRetroactiveAttendanceCandidates({
        userMembershipId,
        days: 30,
      });

    const selectablePast =
      preview.schedules.filter((schedule) =>
        pastScheduleIds.includes(schedule.id),
      );

    expect(selectablePast).toHaveLength(4);
    expect(
      selectablePast.every(
        (schedule) => schedule.selectable === true,
      ),
    ).toBe(true);

    const result =
      await applyRetroactiveMembershipAttendance({
        userMembershipId,
        scheduleIds: pastScheduleIds,
        adminUserId: adminId,
      });

    expect(result.addedAttendanceCount).toBe(4);
    expect(result.sessionsUsed).toBe(4);
    expect(result.sessionsRemaining).toBe(8);
    expect(result.sessionLimit).toBe(12);
    expect(result.membershipExpired).toBe(false);
    expect(result.createdBookingIds).toHaveLength(4);
    expect(result.reusedBookingIds).toHaveLength(0);
    expect(result.cancelledFutureBookingIds).toHaveLength(4);
    expect(result.checkInIds).toHaveLength(4);

    const bookings = await db.booking.findMany({
      where: {
        userMembershipId,
      },
      select: {
        id: true,
        scheduleId: true,
        status: true,
        entitlementUnits: true,
      },
    });

    expect(bookings).toHaveLength(16);

    expect(
      bookings.filter(
        (booking) => booking.status === "attended",
      ),
    ).toHaveLength(4);

    expect(
      bookings.filter(
        (booking) => booking.status === "confirmed",
      ),
    ).toHaveLength(8);

    expect(
      bookings.filter(
        (booking) => booking.status === "cancelled",
      ),
    ).toHaveLength(4);

    const counted = bookings.filter((booking) =>
      ["confirmed", "attended", "noshow"].includes(
        booking.status,
      ),
    );

    const countedUnits = counted.reduce(
      (sum, booking) =>
        sum + (booking.entitlementUnits || 1),
      0,
    );

    expect(countedUnits).toBe(12);

    const checkIns =
      await db.attendanceCheckIn.findMany({
        where: {
          userMembershipId,
        },
      });

    expect(checkIns).toHaveLength(4);

    expect(
      checkIns.every(
        (row) =>
          row.scannedByUserId === adminId &&
          row.notes ===
            "retroactive_admin_attendance",
      ),
    ).toBe(true);

    const schedules = await db.schedule.findMany({
      where: {
        id: {
          in: [
            ...pastScheduleIds,
            ...futureScheduleIds,
          ],
        },
      },
      include: {
        bookings: {
          where: {
            status: {
              in: [
                "confirmed",
                "attended",
                "noshow",
              ],
            },
          },
        },
      },
    });

    for (const schedule of schedules) {
      expect(
        schedule.availableSpots +
          schedule.bookings.length,
      ).toBe(10);
    }

    const membership =
      await db.userMembership.findUniqueOrThrow({
        where: {
          id: userMembershipId,
        },
      });

    expect(membership.status).toBe("active");

    await expect(
      applyRetroactiveMembershipAttendance({
        userMembershipId,
        scheduleIds: pastScheduleIds,
        adminUserId: adminId,
      }),
    ).rejects.toMatchObject({
      code: "BOOKING_ALREADY_LINKED",
    });

    const afterRetry =
      await db.attendanceCheckIn.count({
        where: {
          userMembershipId,
        },
      });

    expect(afterRetry).toBe(4);
  }, 30000);
});

describe("retroactive attendance independent ownership", () => {
  it("rejects an independent offer booking and preserves all ownership and financial fields", async () => {
    const originalMembership =
      await db.userMembership.findUniqueOrThrow({
        where: { id: userMembershipId },
      });

    const eligibilitySnapshot = JSON.stringify({
      mode: "class_ids",
      classIds: [classId],
      classTypes: [],
    });

    let purchaseId: string | null = null;
    let entitlementId: string | null = null;
    let independentScheduleId: string | null = null;
    let independentBookingId: string | null = null;

    try {
      const purchase = await db.offerBoxPurchase.create({
        data: {
          userId: customerId,
          status: "redeemed",
          priceSnapshot: 100,
          currency: "EGP",
          paidAt: new Date(),
          redeemedAt: new Date(),
          offerSnapshot: JSON.stringify({
            version: 1,
            offer: {
              title: "Retroactive ownership fixture",
            },
            membershipTemplate: {
              name: "Independent fixture",
              durationDays: 30,
              sessionsCount: 3,
            },
            eligibilitySnapshot: JSON.parse(
              eligibilitySnapshot,
            ),
            commercial: {
              currency: "EGP",
              finalPrice: 100,
            },
          }),
        },
      });

      purchaseId = purchase.id;

      const entitlement = await db.offerBoxEntitlement.create({
        data: {
          purchaseId: purchase.id,
          userId: customerId,
          status: "active",
          startDate: dayOffset(-20),
          endDate: dayOffset(20),
          totalSessions: 3,
          eligibilitySnapshot,
        },
      });

      entitlementId = entitlement.id;

      const schedule = await db.schedule.create({
        data: {
          classId,
          date: dayOffset(-15),
          time: "13:00",
          availableSpots: 9,
          isActive: true,
        },
      });

      independentScheduleId = schedule.id;

      const booking = await db.booking.create({
        data: {
          userId: customerId,
          scheduleId: schedule.id,
          userMembershipId: null,
          offerBoxEntitlementId: entitlement.id,
          status: "confirmed",
          paidAmount: 0,
          paymentMethod: "offer_box",
          entitlementUnits: 1,
          isMakeup: false,
        },
      });

      independentBookingId = booking.id;

      const beforeMembership =
        await db.userMembership.findUniqueOrThrow({
          where: { id: userMembershipId },
        });

      const beforeBookings = await db.booking.findMany({
        where: { userId: customerId },
        orderBy: { id: "asc" },
      });

      const beforeCheckIns =
        await db.attendanceCheckIn.findMany({
          where: { userId: customerId },
          orderBy: { id: "asc" },
        });

      const beforePayments =
        await db.paymentTransaction.findMany({
          where: { userId: customerId },
          orderBy: { id: "asc" },
        });

      const preview =
        await listRetroactiveAttendanceCandidates({
          userMembershipId,
          days: 30,
        });

      const row = preview.schedules.find(
        (candidate) => candidate.id === schedule.id,
      );

      expect(row).toBeDefined();
      expect(row?.selectable).toBe(false);
      expect(row?.hasStandaloneReservation).toBe(false);

      await expect(
        applyRetroactiveMembershipAttendance({
          userMembershipId,
          scheduleIds: [schedule.id],
          adminUserId: adminId,
        }),
      ).rejects.toMatchObject({
        code: "BOOKING_ALREADY_LINKED",
      });

      expect(
        await db.userMembership.findUniqueOrThrow({
          where: { id: userMembershipId },
        }),
      ).toEqual(beforeMembership);

      expect(
        await db.booking.findMany({
          where: { userId: customerId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeBookings);

      expect(
        await db.attendanceCheckIn.findMany({
          where: { userId: customerId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforeCheckIns);

      expect(
        await db.paymentTransaction.findMany({
          where: { userId: customerId },
          orderBy: { id: "asc" },
        }),
      ).toEqual(beforePayments);

      expect(
        await db.booking.findUniqueOrThrow({
          where: { id: booking.id },
        }),
      ).toMatchObject({
        userMembershipId: null,
        offerBoxEntitlementId: entitlement.id,
        status: "confirmed",
        paidAmount: 0,
        entitlementUnits: 1,
      });

      expect(
        await db.schedule.findUniqueOrThrow({
          where: { id: schedule.id },
        }),
      ).toEqual(schedule);

      expect(
        await db.offerBoxEntitlement.findUniqueOrThrow({
          where: { id: entitlement.id },
        }),
      ).toEqual(entitlement);

      expect(
        await db.offerBoxPurchase.findUniqueOrThrow({
          where: { id: purchase.id },
        }),
      ).toEqual(purchase);

      expect(beforeMembership.paymentAmount).toBe(
        originalMembership.paymentAmount,
      );
    } finally {
      // Remove only this test's explicit fixture IDs.
      if (independentBookingId) {
        await db.attendanceCheckIn.deleteMany({
          where: {
            bookingId: independentBookingId,
          },
        });

        await db.booking.deleteMany({
          where: { id: independentBookingId },
        });
      }

      if (entitlementId) {
        await db.offerBoxEntitlement.deleteMany({
          where: { id: entitlementId },
        });
      }

      if (purchaseId) {
        await db.offerBoxPurchase.deleteMany({
          where: { id: purchaseId },
        });
      }

      if (independentScheduleId) {
        await db.schedule.deleteMany({
          where: { id: independentScheduleId },
        });
      }
    }
  }, 30000);
});
