import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  consumePrivateSession,
  markClassAttendance,
} from "@/lib/attendance-service";
import {
  ensureMembershipAttendancePass,
  ensurePrivateAttendancePass,
} from "@/lib/attendance";

function assertTestDatabase() {
  const raw = process.env.TEST_DATABASE_URL;

  if (!raw) {
    throw new Error(
      "TEST_DATABASE_URL is required for attendance integration tests.",
    );
  }

  const url = new URL(raw);
  const database = decodeURIComponent(
    url.pathname.replace(/^\//, ""),
  );
  const username = decodeURIComponent(url.username);

  if (
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    database !== "fitzone_test" ||
    username !== "fitzone_test_user"
  ) {
    throw new Error(
      "Attendance integration tests require fitzone_test as fitzone_test_user on 127.0.0.1:3306.",
    );
  }
}

assertTestDatabase();

const db = new PrismaClient();

describe("AttendanceService — real fitzone_test integration", () => {
  const suffix = Date.now();

  let scannerUserId = "";
  let trainerUserId = "";
  let trainerId = "";
  let classId = "";
  let membershipId = "";

  const createdUserIds: string[] = [];
  const createdScheduleIds: string[] = [];
  const createdMembershipIds: string[] = [];
  const createdPrivateApplicationIds: string[] = [];

  let sequence = 0;

  function uniquePhone() {
    sequence += 1;

    return `09${String(suffix).slice(-6)}${String(sequence).padStart(2, "0")}`;
  }

  function scheduleTime() {
    sequence += 1;

    const hour = 8 + Math.floor(sequence / 50);
    const minute = sequence % 50;

    return `${String(Math.min(hour, 22)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  async function createCustomer(label: string) {
    sequence += 1;

    const user = await db.user.create({
      data: {
        name: `Attendance ${label}`,
        email:
          `attendance-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-` +
          `${suffix}-${sequence}@fitzone.test`,
        phone: uniquePhone(),
        password: "hashed",
        role: "customer",
        isActive: true,
      },
    });

    createdUserIds.push(user.id);

    return user;
  }

  async function createSchedule(dayOffset: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + dayOffset);
    date.setUTCHours(0, 0, 0, 0);

    const schedule = await db.schedule.create({
      data: {
        classId,
        date,
        time: scheduleTime(),
        availableSpots: 20,
        isActive: true,
      },
    });

    createdScheduleIds.push(schedule.id);

    return schedule;
  }

  async function createMembershipBooking(options?: {
    status?: "active" | "expired";
    totalSessions?: number;
    isMakeup?: boolean;
    dayOffset?: number;
    label?: string;
  }) {
    const customer = await createCustomer(
      options?.label ?? `Member-${sequence}`,
    );

    const now = new Date();
    const startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - 30);

    const endDate = new Date(now);
    endDate.setUTCDate(
      endDate.getUTCDate() +
        (options?.status === "expired" ? -1 : 30),
    );

    const userMembership = await db.userMembership.create({
      data: {
        userId: customer.id,
        membershipId,
        totalSessions: options?.totalSessions ?? 5,
        startDate,
        endDate,
        status: options?.status ?? "active",
      },
    });

    createdMembershipIds.push(userMembership.id);

    const schedule = await createSchedule(
      options?.dayOffset ?? -1,
    );

    const booking = await db.booking.create({
      data: {
        userId: customer.id,
        scheduleId: schedule.id,
        userMembershipId: userMembership.id,
        status: "confirmed",
        isMakeup: options?.isMakeup ?? false,
        makeupReason:
          options?.isMakeup === true
            ? "attendance_test_makeup"
            : null,
        paidAmount: 0,
        paymentMethod: "cash",
      },
    });

    return {
      customer,
      userMembership,
      schedule,
      booking,
    };
  }

  beforeAll(async () => {
    const scanner = await db.user.create({
      data: {
        name: "Attendance Scanner",
        email: `attendance-scanner-${suffix}@fitzone.test`,
        phone: uniquePhone(),
        password: "hashed",
        role: "admin",
        isActive: true,
      },
    });

    scannerUserId = scanner.id;
    createdUserIds.push(scanner.id);

    const trainerUser = await db.user.create({
      data: {
        name: "Attendance Trainer User",
        email: `attendance-trainer-${suffix}@fitzone.test`,
        phone: uniquePhone(),
        password: "hashed",
        role: "trainer",
        isActive: true,
      },
    });

    trainerUserId = trainerUser.id;
    createdUserIds.push(trainerUser.id);

    const trainer = await db.trainer.create({
      data: {
        userId: trainerUserId,
        name: "Attendance Integration Trainer",
        specialty: "fitness",
        bio: "attendance integration test",
        isActive: true,
      },
    });

    trainerId = trainer.id;

    const gymClass = await db.class.create({
      data: {
        name: "Attendance Integration Class",
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

    const membership = await db.membership.create({
      data: {
        name: "Attendance Integration Membership",
        price: 100,
        duration: 30,
        sessionsCount: 12,
        kind: "subscription",
        isActive: true,
        features: "[]",
      },
    });

    membershipId = membership.id;
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.notification.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await db.attendanceCheckIn.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await db.attendancePass.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });
    }

    if (createdPrivateApplicationIds.length > 0) {
      await db.privateSessionApplication.deleteMany({
        where: {
          id: {
            in: createdPrivateApplicationIds,
          },
        },
      });
    }

    if (createdMembershipIds.length > 0) {
      await db.booking.deleteMany({
        where: {
          userMembershipId: {
            in: createdMembershipIds,
          },
        },
      });

      await db.userMembership.deleteMany({
        where: {
          id: {
            in: createdMembershipIds,
          },
        },
      });
    }

    if (createdScheduleIds.length > 0) {
      await db.schedule.deleteMany({
        where: {
          id: {
            in: createdScheduleIds,
          },
        },
      });
    }

    if (membershipId) {
      await db.membership.deleteMany({
        where: {
          id: membershipId,
        },
      });
    }

    if (classId) {
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

    if (createdUserIds.length > 0) {
      await db.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await db.$disconnect();
  });

  it("rejects a future class without consuming the booking", async () => {
    const scenario = await createMembershipBooking({
      dayOffset: 1,
      totalSessions: 3,
      label: "Future",
    });

    const result = await markClassAttendance({
      bookingId: scenario.booking.id,
      scannedByUserId: scannerUserId,
      source: "qr",
    });

    expect(result).toEqual({
      ok: false,
      code: "FUTURE_SESSION",
    });

    const booking = await db.booking.findUniqueOrThrow({
      where: {
        id: scenario.booking.id,
      },
      select: {
        status: true,
      },
    });

    const checkIns = await db.attendanceCheckIn.count({
      where: {
        bookingId: scenario.booking.id,
      },
    });

    expect(booking.status).toBe("confirmed");
    expect(checkIns).toBe(0);
  });

  it("consumes a class booking only once under concurrent attendance", async () => {
    const scenario = await createMembershipBooking({
      dayOffset: -1,
      totalSessions: 5,
      label: "Concurrent-Class",
    });

    const pass = await ensureMembershipAttendancePass(
      scenario.userMembership.id,
    );

    expect(pass?.status).toBe("active");

    const results = await Promise.all([
      markClassAttendance({
        bookingId: scenario.booking.id,
        scannedByUserId: scannerUserId,
        source: "manual",
      }),
      markClassAttendance({
        bookingId: scenario.booking.id,
        scannedByUserId: scannerUserId,
        source: "qr",
      }),
    ]);

    const successfulConsumption = results.filter(
      (result) =>
        result.ok === true &&
        result.status === "checked_in",
    );

    expect(successfulConsumption).toHaveLength(1);

    const booking = await db.booking.findUniqueOrThrow({
      where: {
        id: scenario.booking.id,
      },
      select: {
        status: true,
      },
    });

    const checkIns = await db.attendanceCheckIn.count({
      where: {
        bookingId: scenario.booking.id,
      },
    });

    expect(booking.status).toBe("attended");
    expect(checkIns).toBe(1);
  });

  it("manual and QR use the same session accounting", async () => {
    const manual = await createMembershipBooking({
      dayOffset: -1,
      totalSessions: 3,
      label: "Accounting-Manual",
    });

    const qr = await createMembershipBooking({
      dayOffset: -1,
      totalSessions: 3,
      label: "Accounting-QR",
    });

    await ensureMembershipAttendancePass(
      manual.userMembership.id,
    );
    await ensureMembershipAttendancePass(
      qr.userMembership.id,
    );

    const manualResult = await markClassAttendance({
      bookingId: manual.booking.id,
      scannedByUserId: scannerUserId,
      source: "manual",
    });

    const qrResult = await markClassAttendance({
      bookingId: qr.booking.id,
      scannedByUserId: scannerUserId,
      source: "qr",
    });

    expect(manualResult.ok).toBe(true);
    expect(qrResult.ok).toBe(true);

    if (
      !manualResult.ok ||
      manualResult.status !== "checked_in" ||
      !qrResult.ok ||
      qrResult.status !== "checked_in"
    ) {
      throw new Error(
        "Expected both attendance operations to consume one session.",
      );
    }

    expect(manualResult.sessionsUsed).toBe(1);
    expect(qrResult.sessionsUsed).toBe(1);

    expect(manualResult.sessionsRemaining).toBe(2);
    expect(qrResult.sessionsRemaining).toBe(2);
  });

  it("expires the membership and pass when the final session is consumed", async () => {
    const scenario = await createMembershipBooking({
      dayOffset: -1,
      totalSessions: 1,
      label: "Final-Session",
    });

    const pass = await ensureMembershipAttendancePass(
      scenario.userMembership.id,
    );

    expect(pass).toBeTruthy();

    const result = await markClassAttendance({
      bookingId: scenario.booking.id,
      scannedByUserId: scannerUserId,
      source: "manual",
    });

    expect(result.ok).toBe(true);

    if (
      !result.ok ||
      result.status !== "checked_in"
    ) {
      throw new Error(
        "Expected final session attendance to succeed.",
      );
    }

    expect(result.membershipExpired).toBe(true);
    expect(result.sessionsRemaining).toBe(0);

    const [membershipAfter, passAfter] =
      await Promise.all([
        db.userMembership.findUniqueOrThrow({
          where: {
            id: scenario.userMembership.id,
          },
          select: {
            status: true,
          },
        }),
        db.attendancePass.findUniqueOrThrow({
          where: {
            userMembershipId:
              scenario.userMembership.id,
          },
          select: {
            status: true,
          },
        }),
      ]);

    expect(membershipAfter.status).toBe("expired");
    expect(passAfter.status).toBe("expired");
  });

  it("rejects an ordinary booking on an expired membership", async () => {
    const scenario = await createMembershipBooking({
      status: "expired",
      dayOffset: -1,
      totalSessions: 5,
      isMakeup: false,
      label: "Expired-Ordinary",
    });

    const result = await markClassAttendance({
      bookingId: scenario.booking.id,
      scannedByUserId: scannerUserId,
      source: "qr",
    });

    expect(result).toEqual({
      ok: false,
      code: "BOOKING_NOT_OPERATIONAL",
    });

    const checkIns = await db.attendanceCheckIn.count({
      where: {
        bookingId: scenario.booking.id,
      },
    });

    expect(checkIns).toBe(0);
  });

  it("allows an expired-membership make-up and closes the pass after the last make-up", async () => {
    const scenario = await createMembershipBooking({
      status: "expired",
      dayOffset: -1,
      totalSessions: 5,
      isMakeup: true,
      label: "Expired-Makeup",
    });

    const pass = await ensureMembershipAttendancePass(
      scenario.userMembership.id,
      {
        allowExpiredMakeup: true,
      },
    );

    expect(pass?.status).toBe("active");

    const result = await markClassAttendance({
      bookingId: scenario.booking.id,
      scannedByUserId: scannerUserId,
      source: "qr",
    });

    expect(result.ok).toBe(true);

    if (
      !result.ok ||
      result.status !== "checked_in"
    ) {
      throw new Error(
        "Expected expired-membership make-up attendance to succeed.",
      );
    }

    const [membershipAfter, bookingAfter, passAfter] =
      await Promise.all([
        db.userMembership.findUniqueOrThrow({
          where: {
            id: scenario.userMembership.id,
          },
          select: {
            status: true,
          },
        }),
        db.booking.findUniqueOrThrow({
          where: {
            id: scenario.booking.id,
          },
          select: {
            status: true,
            isMakeup: true,
          },
        }),
        db.attendancePass.findUniqueOrThrow({
          where: {
            userMembershipId:
              scenario.userMembership.id,
          },
          select: {
            status: true,
          },
        }),
      ]);

    expect(membershipAfter.status).toBe("expired");
    expect(bookingAfter.status).toBe("attended");
    expect(bookingAfter.isMakeup).toBe(true);
    expect(passAfter.status).toBe("expired");
  });

  it("cannot over-consume the final Private/Mini Private session under concurrency", async () => {
    const customer = await createCustomer(
      "Private-Concurrent",
    );

    const application =
      await db.privateSessionApplication.create({
        data: {
          userId: customer.id,
          trainerId,
          type: "mini_private",
          status: "paid",
          sessionsCount: 1,
          durationDays: 30,
          trainerPrice: 100,
          paidAt: new Date(),
          expiresAt: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      });

    createdPrivateApplicationIds.push(application.id);

    const pass = await ensurePrivateAttendancePass(
      application.id,
    );

    expect(pass?.status).toBe("active");

    const results = await Promise.all([
      consumePrivateSession({
        passId: pass!.id,
        scannedByUserId: scannerUserId,
      }),
      consumePrivateSession({
        passId: pass!.id,
        scannedByUserId: scannerUserId,
      }),
    ]);

    const successfulConsumption = results.filter(
      (result) => result.ok === true,
    );

    expect(successfulConsumption).toHaveLength(1);

    const checkIns = await db.attendanceCheckIn.count({
      where: {
        privateSessionApplicationId: application.id,
      },
    });

    const passAfter =
      await db.attendancePass.findUniqueOrThrow({
        where: {
          privateSessionApplicationId: application.id,
        },
        select: {
          status: true,
        },
      });

    expect(checkIns).toBe(1);
    expect(passAfter.status).toBe("expired");

    const success = successfulConsumption[0];

    if (!success.ok) {
      throw new Error(
        "Expected one private attendance consumption.",
      );
    }

    expect(success.remainingSessions).toBe(0);
  });
});
