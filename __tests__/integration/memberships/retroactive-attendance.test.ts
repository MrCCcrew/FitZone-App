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
    decodeURIComponent(parsed.username) !== "fitzone_test_user" ||
    database !== "fitzone_test" ||
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