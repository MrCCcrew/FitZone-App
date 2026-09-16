import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  applyMembershipBookingPlanTx,
  MembershipBookingPlanError,
} from "@/lib/payments/membership-booking-plan";

describe("Revenue false-blocker contract", () => {
  let userId = "";
  let trainerId = "";
  let classId = "";
  let zeroMembershipId = "";
  let scheduledMembershipId = "";
  let zeroUserMembershipId = "";
  let scheduledUserMembershipId = "";

  beforeAll(async () => {
    const token = Date.now().toString();

    const user = await db.user.create({
      data: {
        name: `Revenue Gate User ${token}`,
        email: `revenue-gate-${token}@fitzone.test`,
        phone: `010${token.slice(-8).padStart(8, "0")}`,
        password: "hashed",
        role: "customer",
      },
    });
    userId = user.id;

    const trainer = await db.trainer.create({
      data: {
        name: `Revenue Gate Trainer ${token}`,
        specialty: "fitness",
        bio: "integration test",
        isActive: true,
      },
    });
    trainerId = trainer.id;

    const gymClass = await db.class.create({
      data: {
        name: `Revenue Gate Class ${token}`,
        trainerId,
        type: `revenue_gate_${token}`,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });
    classId = gymClass.id;

    const zeroMembership = await db.membership.create({
      data: {
        name: `Zero Schedule Membership ${token}`,
        nameEn: `Zero Schedule Membership ${token}`,
        duration: 30,
        price: 100,
        sessionsCount: 4,
        kind: "subscription",
        isActive: true,
        walletBonus: 0,
        features: "[]",
        classSessions: "[]",
      },
    });
    zeroMembershipId = zeroMembership.id;

    const scheduledMembership = await db.membership.create({
      data: {
        name: `Scheduled Membership ${token}`,
        nameEn: `Scheduled Membership ${token}`,
        duration: 30,
        price: 100,
        sessionsCount: 4,
        kind: "subscription",
        isActive: true,
        walletBonus: 0,
        features: "[]",
        classSessions: JSON.stringify([
          {
            classId,
            classType: `revenue_gate_${token}`,
            sessions: 4,
          },
        ]),
      },
    });
    scheduledMembershipId = scheduledMembership.id;

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    const zeroUserMembership = await db.userMembership.create({
      data: {
        userId,
        membershipId: zeroMembershipId,
        totalSessions: 4,
        startDate,
        endDate,
        status: "active",
      },
    });
    zeroUserMembershipId = zeroUserMembership.id;

    const scheduledUserMembership = await db.userMembership.create({
      data: {
        userId,
        membershipId: scheduledMembershipId,
        totalSessions: 4,
        startDate,
        endDate,
        status: "active",
      },
    });
    scheduledUserMembershipId = scheduledUserMembership.id;
  });

  afterAll(async () => {
    if (zeroUserMembershipId || scheduledUserMembershipId) {
      await db.booking.deleteMany({
        where: {
          userMembershipId: {
            in: [
              zeroUserMembershipId,
              scheduledUserMembershipId,
            ].filter(Boolean),
          },
        },
      });

      await db.userMembership.deleteMany({
        where: {
          id: {
            in: [
              zeroUserMembershipId,
              scheduledUserMembershipId,
            ].filter(Boolean),
          },
        },
      });
    }

    await db.membership.deleteMany({
      where: {
        id: {
          in: [
            zeroMembershipId,
            scheduledMembershipId,
          ].filter(Boolean),
        },
      },
    });

    if (classId) {
      await db.class.deleteMany({ where: { id: classId } });
    }

    if (trainerId) {
      await db.trainer.deleteMany({ where: { id: trainerId } });
    }

    if (userId) {
      await db.user.deleteMany({ where: { id: userId } });
    }
  });

  it("allows empty schedule selection when source has zero schedulable entitlement", async () => {
    const record = await db.userMembership.findUniqueOrThrow({
      where: { id: zeroUserMembershipId },
      select: { startDate: true, endDate: true },
    });

    const result = await db.$transaction((tx) =>
      applyMembershipBookingPlanTx({
        tx,
        userId,
        userMembershipId: zeroUserMembershipId,
        startDate: record.startDate,
        endDate: record.endDate,
        selectedScheduleIds: [],
        source: {
          type: "membership",
          id: zeroMembershipId,
        },
        plan: {
          kind: "subscription",
          sessionsCount: 4,
          duration: 30,
        },
      }),
    );

    expect(result).toMatchObject({
      selectedScheduleIds: [],
      plannedScheduleIds: [],
      createdCount: 0,
      bookedSchedules: [],
    });
  });

  it("rejects empty schedule selection when source has schedulable entitlement", async () => {
    const record = await db.userMembership.findUniqueOrThrow({
      where: { id: scheduledUserMembershipId },
      select: { startDate: true, endDate: true },
    });

    let thrown: unknown;

    try {
      await db.$transaction((tx) =>
        applyMembershipBookingPlanTx({
          tx,
          userId,
          userMembershipId: scheduledUserMembershipId,
          startDate: record.startDate,
          endDate: record.endDate,
          selectedScheduleIds: [],
          source: {
            type: "membership",
            id: scheduledMembershipId,
          },
          plan: {
            kind: "subscription",
            sessionsCount: 4,
            duration: 30,
          },
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MembershipBookingPlanError);

    const error = thrown as MembershipBookingPlanError;

    expect(error.action).toBe("back_to_schedule");
    expect(error.message).toBe(
      "هذا الاشتراك يتطلب اختيار موعد متاح قبل المتابعة إلى الدفع.",
    );
  });
});
