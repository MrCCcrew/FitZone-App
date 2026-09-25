import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";

import {
  BookingRescheduleDomainError,
  createBookingRescheduleRequest,
  reviewBookingRescheduleRequest,
} from "@/lib/booking-reschedule-service";
import { scheduleSlotInstant } from "@/lib/fitzone-time";

function assertTestDatabase() {
  const raw = process.env.TEST_DATABASE_URL;

  if (!raw) {
    throw new Error(
      "TEST_DATABASE_URL is required for booking-reschedule integration tests.",
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
      "Booking-reschedule integration tests require fitzone_test as fitzone_test_user on 127.0.0.1:3306.",
    );
  }
}

assertTestDatabase();

const db = new PrismaClient();
const tag = `RSC-${Date.now()}`;

function domainCode(error: unknown) {
  return error instanceof BookingRescheduleDomainError
    ? error.code
    : null;
}

function cairoParts(instant: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

describe("BookingRescheduleService — real fitzone_test integration", () => {
  let scannerId = "";
  let trainerUserId = "";
  let trainerId = "";
  let classId = "";
  let membershipId = "";

  const userIds: string[] = [];
  const membershipIds: string[] = [];
  const scheduleIds: string[] = [];
  const bookingIds: string[] = [];
  const requestIds: string[] = [];

  let seq = 0;

  function phone() {
    seq += 1;
    return `08${String(Date.now()).slice(-6)}${String(seq).padStart(2, "0")}`;
  }

  async function createCustomer(label: string) {
    seq += 1;

    const user = await db.user.create({
      data: {
        name: `${tag} ${label}`,
        email: `${tag.toLowerCase()}-${label.toLowerCase()}-${seq}@fitzone.test`,
        phone: phone(),
        password: "hashed",
        role: "customer",
        isActive: true,
      },
    });

    userIds.push(user.id);
    return user;
  }

  async function createScheduleAt(
    instant: Date,
    availableSpots = 10,
  ) {
    const parts = cairoParts(instant);

    /*
     * Schedule.date is a calendar anchor only.
     * Schedule.time carries Cairo local clock time.
     */
    const date = new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        0,
        0,
        0,
        0,
      ),
    );

    const time =
      `${String(parts.hour).padStart(2, "0")}:` +
      `${String(parts.minute).padStart(2, "0")}`;

    const schedule = await db.schedule.create({
      data: {
        classId,
        date,
        time,
        availableSpots,
        isActive: true,
      },
    });

    scheduleIds.push(schedule.id);
    return schedule;
  }

  async function createMembershipFor(userId: string) {
    const now = new Date();

    const startDate = new Date(
      now.getTime() - 2 * 24 * 60 * 60 * 1000,
    );

    const endDate = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const userMembership = await db.userMembership.create({
      data: {
        userId,
        membershipId,
        totalSessions: 12,
        startDate,
        endDate,
        status: "active",
      },
    });

    membershipIds.push(userMembership.id);
    return userMembership;
  }

  async function createScenario(input: {
    label: string;
    sourceOffsetMinutes: number;
    targetOffsetMinutes: number;
    sourceStatus?: "confirmed" | "noshow";
    targetSpots?: number;
    paymentMethod?: string;
  }) {
    const customer = await createCustomer(input.label);
    const userMembership =
      await createMembershipFor(customer.id);

    const now = Date.now();

    const sourceSchedule = await createScheduleAt(
      new Date(
        now +
          input.sourceOffsetMinutes *
            60 *
            1000,
      ),
      9,
    );

    const targetSchedule = await createScheduleAt(
      new Date(
        now +
          input.targetOffsetMinutes *
            60 *
            1000,
      ),
      input.targetSpots ?? 10,
    );

    const booking = await db.booking.create({
      data: {
        userId: customer.id,
        scheduleId: sourceSchedule.id,
        userMembershipId: userMembership.id,
        status: input.sourceStatus ?? "confirmed",
        paidAmount: 125,
        paymentMethod:
          input.paymentMethod ?? "card",
      },
    });

    bookingIds.push(booking.id);

    return {
      customer,
      userMembership,
      sourceSchedule,
      targetSchedule,
      booking,
    };
  }

  beforeAll(async () => {
    const reviewer = await db.user.create({
      data: {
        name: `${tag} Reviewer`,
        email: `${tag.toLowerCase()}-reviewer@fitzone.test`,
        phone: phone(),
        password: "hashed",
        role: "admin",
        isActive: true,
      },
    });

    scannerId = reviewer.id;
    userIds.push(reviewer.id);

    const trainerUser = await db.user.create({
      data: {
        name: `${tag} Trainer`,
        email: `${tag.toLowerCase()}-trainer@fitzone.test`,
        phone: phone(),
        password: "hashed",
        role: "trainer",
        isActive: true,
      },
    });

    trainerUserId = trainerUser.id;
    userIds.push(trainerUser.id);

    const trainer = await db.trainer.create({
      data: {
        userId: trainerUserId,
        name: `${tag} Trainer`,
        specialty: "fitness",
        bio: "booking reschedule integration",
        isActive: true,
      },
    });

    trainerId = trainer.id;

    const gymClass = await db.class.create({
      data: {
        name: `${tag} Fitness`,
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
        name: `${tag} Membership`,
        price: 500,
        duration: 30,
        sessionsCount: 12,
        kind: "subscription",
        isActive: true,
        features: "[]",
        classSessions: JSON.stringify([
          {
            classId,
            classType: "fitness",
            sessions: 12,
          },
        ]),
      },
    });

    membershipId = membership.id;
  });

  afterAll(async () => {
    /*
     * Admin notifications may target other test-admin users,
     * so remove our uniquely-tagged notification bodies as well.
     */
    await db.notification.deleteMany({
      where: {
        OR: [
          {
            userId: {
              in: userIds,
            },
          },
          {
            body: {
              contains: tag,
            },
          },
        ],
      },
    });

    if (requestIds.length > 0) {
      await db.bookingRescheduleRequest.deleteMany({
        where: {
          id: {
            in: requestIds,
          },
        },
      });
    }

    if (bookingIds.length > 0) {
      await db.booking.deleteMany({
        where: {
          id: {
            in: bookingIds,
          },
        },
      });
    }

    if (membershipIds.length > 0) {
      await db.userMembership.deleteMany({
        where: {
          id: {
            in: membershipIds,
          },
        },
      });
    }

    if (scheduleIds.length > 0) {
      await db.schedule.deleteMany({
        where: {
          id: {
            in: scheduleIds,
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

    if (userIds.length > 0) {
      await db.user.deleteMany({
        where: {
          id: {
            in: userIds,
          },
        },
      });
    }

    await db.$disconnect();
  });

  it("uses the real Cairo session instant for the 4-hour rule", async () => {
    /*
     * Correct Cairo instant = ~2.5 hours from now.
     *
     * The old setHours() implementation on a UTC Node process
     * interpreted the same wall-clock value 2-3 hours later,
     * potentially making this appear >4 hours away.
     */
    const scenario = await createScenario({
      label: "Cairo-Time",
      sourceOffsetMinutes: 150,
      targetOffsetMinutes: 24 * 60 + 180,
    });

    const source = await db.schedule.findUniqueOrThrow({
      where: {
        id: scenario.sourceSchedule.id,
      },
    });

    const correctInstant = scheduleSlotInstant(
      source.date,
      source.time,
    );

    const legacyUtcInterpretation = new Date(
      source.date,
    );

    const [hour, minute] = source.time
      .split(":")
      .map(Number);

    legacyUtcInterpretation.setHours(
      hour,
      minute,
      0,
      0,
    );

    expect(
      correctInstant.getTime() - Date.now(),
    ).toBeLessThan(
      4 * 60 * 60 * 1000,
    );

    expect(
      legacyUtcInterpretation.getTime() -
        Date.now(),
    ).toBeGreaterThan(
      4 * 60 * 60 * 1000,
    );

    await expect(
      createBookingRescheduleRequest({
        userId: scenario.customer.id,
        bookingId: scenario.booking.id,
        targetScheduleId:
          scenario.targetSchedule.id,
        requestType: "upcoming_change",
      }),
    ).rejects.toMatchObject({
      code: "CURRENT_SLOT_TOO_CLOSE",
    });

    const count =
      await db.bookingRescheduleRequest.count({
        where: {
          bookingId: scenario.booking.id,
        },
      });

    expect(count).toBe(0);
  });

  it("creates only one pending request under concurrency and does not mutate bookings or seats", async () => {
    const scenario = await createScenario({
      label: "Concurrent-Request",
      sourceOffsetMinutes: 8 * 60,
      targetOffsetMinutes: 30 * 60,
      targetSpots: 5,
    });

    const beforeSource =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      });

    const beforeTarget =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      });

    const attempt = () =>
      createBookingRescheduleRequest({
        userId: scenario.customer.id,
        bookingId: scenario.booking.id,
        targetScheduleId:
          scenario.targetSchedule.id,
        requestType: "upcoming_change",
      });

    const results = await Promise.allSettled([
      attempt(),
      attempt(),
    ]);

    const fulfilled = results.filter(
      (result) =>
        result.status === "fulfilled",
    );

    const rejected = results.filter(
      (result) =>
        result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (fulfilled[0].status === "fulfilled") {
      requestIds.push(
        fulfilled[0].value.requestId,
      );
    }

    if (rejected[0].status === "rejected") {
      expect(
        domainCode(rejected[0].reason),
      ).toBe("RESCHEDULE_ALREADY_PENDING");
    }

    const [
      bookingAfter,
      sourceAfter,
      targetAfter,
      requests,
    ] = await Promise.all([
      db.booking.findUniqueOrThrow({
        where: {
          id: scenario.booking.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      }),
      db.bookingRescheduleRequest.findMany({
        where: {
          bookingId: scenario.booking.id,
          status: "pending",
        },
      }),
    ]);

    expect(requests).toHaveLength(1);
    expect(bookingAfter.scheduleId).toBe(
      scenario.sourceSchedule.id,
    );
    expect(bookingAfter.status).toBe(
      "confirmed",
    );

    expect(sourceAfter.availableSpots).toBe(
      beforeSource.availableSpots,
    );

    expect(targetAfter.availableSpots).toBe(
      beforeTarget.availableSpots,
    );
  });

  it("approves an upcoming change by moving the same booking and balancing capacity once", async () => {
    const scenario = await createScenario({
      label: "Upcoming-Approve",
      sourceOffsetMinutes: 10 * 60,
      targetOffsetMinutes: 34 * 60,
      targetSpots: 4,
    });

    const request =
      await createBookingRescheduleRequest({
        userId: scenario.customer.id,
        bookingId: scenario.booking.id,
        targetScheduleId:
          scenario.targetSchedule.id,
        requestType: "upcoming_change",
      });

    requestIds.push(request.requestId);

    const sourceBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      });

    const targetBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      });

    const result =
      await reviewBookingRescheduleRequest({
        requestId: request.requestId,
        decision: "approve",
        reviewedByUserId: scannerId,
      });

    expect(result.decision).toBe(
      "approved",
    );

    const [
      bookingAfter,
      sourceAfter,
      targetAfter,
      requestAfter,
    ] = await Promise.all([
      db.booking.findUniqueOrThrow({
        where: {
          id: scenario.booking.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      }),
      db.bookingRescheduleRequest.findUniqueOrThrow({
        where: {
          id: request.requestId,
        },
      }),
    ]);

    expect(bookingAfter.id).toBe(
      scenario.booking.id,
    );

    expect(bookingAfter.scheduleId).toBe(
      scenario.targetSchedule.id,
    );

    expect(
      sourceAfter.availableSpots,
    ).toBe(
      sourceBefore.availableSpots + 1,
    );

    expect(
      targetAfter.availableSpots,
    ).toBe(
      targetBefore.availableSpots - 1,
    );

    expect(requestAfter.status).toBe(
      "approved",
    );

    expect(requestAfter.pendingKey).toBeNull();
  });

  it("approves a past-absence make-up exactly once and creates one zero-value marked replacement", async () => {
    const scenario = await createScenario({
      label: "Past-Makeup",
      sourceOffsetMinutes: -24 * 60,
      targetOffsetMinutes: 40 * 60,
      sourceStatus: "confirmed",
      targetSpots: 1,
      paymentMethod: "card",
    });

    const request =
      await createBookingRescheduleRequest({
        userId: scenario.customer.id,
        bookingId: scenario.booking.id,
        targetScheduleId:
          scenario.targetSchedule.id,
        requestType:
          "past_absence_makeup",
        absenceReason:
          "ظرف طارئ منع الحضور",
      });

    requestIds.push(request.requestId);

    const sourceBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      });

    const targetBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      });

    const attempt = () =>
      reviewBookingRescheduleRequest({
        requestId: request.requestId,
        decision: "approve",
        reviewedByUserId: scannerId,
      });

    const results = await Promise.allSettled([
      attempt(),
      attempt(),
    ]);

    const fulfilled = results.filter(
      (result) =>
        result.status === "fulfilled",
    );

    const rejected = results.filter(
      (result) =>
        result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    if (rejected[0].status === "rejected") {
      expect(
        domainCode(rejected[0].reason),
      ).toBe("REQUEST_ALREADY_REVIEWED");
    }

    const [
      historicalAfter,
      sourceAfter,
      targetAfter,
      requestAfter,
      replacements,
    ] = await Promise.all([
      db.booking.findUniqueOrThrow({
        where: {
          id: scenario.booking.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      }),
      db.bookingRescheduleRequest.findUniqueOrThrow({
        where: {
          id: request.requestId,
        },
      }),
      db.booking.findMany({
        where: {
          userId: scenario.customer.id,
          scheduleId:
            scenario.targetSchedule.id,
          isMakeup: true,
        },
      }),
    ]);

    replacements.forEach((booking) => {
      if (!bookingIds.includes(booking.id)) {
        bookingIds.push(booking.id);
      }
    });

    expect(historicalAfter.status).toBe(
      "noshow",
    );

    /*
     * Historical class already happened:
     * its capacity must NOT be returned.
     */
    expect(
      sourceAfter.availableSpots,
    ).toBe(
      sourceBefore.availableSpots,
    );

    expect(
      targetAfter.availableSpots,
    ).toBe(
      targetBefore.availableSpots - 1,
    );

    expect(replacements).toHaveLength(1);

    const replacement = replacements[0];

    expect(replacement.isMakeup).toBe(true);
    expect(replacement.makeupReason).toBe(
      "past_absence_makeup",
    );
    expect(replacement.paidAmount).toBe(0);
    expect(replacement.paymentMethod).toBe(
      scenario.booking.paymentMethod,
    );
    expect(replacement.userMembershipId).toBe(
      scenario.userMembership.id,
    );

    expect(requestAfter.status).toBe(
      "approved",
    );
    expect(requestAfter.pendingKey).toBeNull();
  });

  it("rejects a request exactly once without mutating the booking or capacities", async () => {
    const scenario = await createScenario({
      label: "Reject",
      sourceOffsetMinutes: 12 * 60,
      targetOffsetMinutes: 44 * 60,
      targetSpots: 6,
    });

    const request =
      await createBookingRescheduleRequest({
        userId: scenario.customer.id,
        bookingId: scenario.booking.id,
        targetScheduleId:
          scenario.targetSchedule.id,
        requestType: "upcoming_change",
      });

    requestIds.push(request.requestId);

    const sourceBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      });

    const targetBefore =
      await db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      });

    const first =
      await reviewBookingRescheduleRequest({
        requestId: request.requestId,
        decision: "reject",
        reviewedByUserId: scannerId,
        rejectionReason:
          "الموعد البديل غير مناسب",
      });

    expect(first.decision).toBe(
      "rejected",
    );

    await expect(
      reviewBookingRescheduleRequest({
        requestId: request.requestId,
        decision: "reject",
        reviewedByUserId: scannerId,
      }),
    ).rejects.toMatchObject({
      code: "REQUEST_ALREADY_REVIEWED",
    });

    const [
      bookingAfter,
      sourceAfter,
      targetAfter,
      requestAfter,
    ] = await Promise.all([
      db.booking.findUniqueOrThrow({
        where: {
          id: scenario.booking.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.sourceSchedule.id,
        },
      }),
      db.schedule.findUniqueOrThrow({
        where: {
          id: scenario.targetSchedule.id,
        },
      }),
      db.bookingRescheduleRequest.findUniqueOrThrow({
        where: {
          id: request.requestId,
        },
      }),
    ]);

    expect(bookingAfter.status).toBe(
      "confirmed",
    );

    expect(bookingAfter.scheduleId).toBe(
      scenario.sourceSchedule.id,
    );

    expect(
      sourceAfter.availableSpots,
    ).toBe(
      sourceBefore.availableSpots,
    );

    expect(
      targetAfter.availableSpots,
    ).toBe(
      targetBefore.availableSpots,
    );

    expect(requestAfter.status).toBe(
      "rejected",
    );

    expect(requestAfter.pendingKey).toBeNull();

    expect(requestAfter.rejectionReason).toBe(
      "الموعد البديل غير مناسب",
    );
  });
});
