import type { Prisma, TraineeClassEarning } from "@prisma/client";

import { db } from "@/lib/db";
import { getBookingEntitlementUnits } from "@/lib/membership-session-units";

export type TraineeClassEarningActor = {
  userId: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

function assertActor(actor: TraineeClassEarningActor) {
  if (!actor.userId?.trim() || !actor.name?.trim()) {
    throw new Error("TRAINEE_CLASS_EARNING_ACTOR_REQUIRED");
  }
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value: string): string {
  return value.trim();
}

function toMinor(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("TRAINEE_CLASS_EARNING_INVALID_PAYMENT_AMOUNT");
  }

  return Math.round(amount * 100);
}

function buildOccurrenceKey(input: {
  classId: string;
  scheduleDate: Date;
  scheduleTime: string;
}) {
  return [
    input.classId,
    dateKey(input.scheduleDate),
    normalizeTime(input.scheduleTime),
  ].join(":");
}

async function saveResult(
  tx: Tx,
  attendanceCheckInId: string,
  data: Omit<
    Prisma.TraineeClassEarningUncheckedCreateInput,
    "id" | "attendanceCheckInId"
  >,
): Promise<TraineeClassEarning> {
  const existing = await tx.traineeClassEarning.findUnique({
    where: {
      attendanceCheckInId,
    },
  });

  if (existing?.status === "finalized") {
    throw new Error("TRAINEE_CLASS_EARNING_FINALIZED");
  }

  if (existing) {
    return tx.traineeClassEarning.update({
      where: {
        id: existing.id,
      },
      data,
    });
  }

  return tx.traineeClassEarning.create({
    data: {
      attendanceCheckInId,
      ...data,
    },
  });
}

async function writeMandatoryAudit(
  tx: Tx,
  actor: TraineeClassEarningActor,
  input: {
    action: string;
    targetId: string;
    details: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      action: input.action,
      targetType: "TraineeClassEarning",
      targetId: input.targetId,
      details: JSON.stringify(input.details),
    },
  });
}

async function saveResultWithAudit(
  tx: Tx,
  actor: TraineeClassEarningActor,
  attendanceCheckInId: string,
  data: Omit<
    Prisma.TraineeClassEarningUncheckedCreateInput,
    "id" | "attendanceCheckInId"
  >,
): Promise<TraineeClassEarning> {
  const before = await tx.traineeClassEarning.findUnique({
    where: {
      attendanceCheckInId,
    },
  });

  const result = await saveResult(tx, attendanceCheckInId, data);

  await writeMandatoryAudit(tx, actor, {
    action: "trainee_class_earning_calculate",
    targetId: result.id,
    details: {
      attendanceCheckInId,
      before: before
        ? {
            status: before.status,
            actualEmployeeId: before.actualEmployeeId,
            coachCompensationTermId: before.coachCompensationTermId,
            commissionRateBps: before.commissionRateBps,
            commissionBaseMinor: before.commissionBaseMinor,
            commissionAmountMinor: before.commissionAmountMinor,
            blockReason: before.blockReason,
          }
        : null,
      after: {
        status: result.status,
        actualEmployeeId: result.actualEmployeeId,
        coachCompensationTermId: result.coachCompensationTermId,
        paymentAmountMinor: result.paymentAmountMinor,
        totalSessionsSnapshot: result.totalSessionsSnapshot,
        entitlementUnitsSnapshot: result.entitlementUnitsSnapshot,
        unitValueMinor: result.unitValueMinor,
        commissionRateBps: result.commissionRateBps,
        commissionBaseMinor: result.commissionBaseMinor,
        commissionAmountMinor: result.commissionAmountMinor,
        blockReason: result.blockReason,
      },
    },
  });

  return result;
}

export async function calculateTraineeClassEarning(
  input: {
    attendanceCheckInId: string;
  },
  actor: TraineeClassEarningActor,
): Promise<TraineeClassEarning> {
  assertActor(actor);

  const attendanceCheckInId = input.attendanceCheckInId?.trim();

  if (!attendanceCheckInId) {
    throw new Error("TRAINEE_CLASS_EARNING_ATTENDANCE_REQUIRED");
  }

  return db.$transaction(async (tx) => {
    const checkIn = await tx.attendanceCheckIn.findUnique({
      where: {
        id: attendanceCheckInId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
        userMembership: {
          select: {
            id: true,
            paymentAmount: true,
            totalSessions: true,
          },
        },
        booking: {
          include: {
            schedule: {
              include: {
                class: {
                  include: {
                    trainer: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!checkIn) {
      throw new Error("TRAINEE_CLASS_EARNING_ATTENDANCE_NOT_FOUND");
    }

    if (checkIn.checkInType !== "class") {
      throw new Error("TRAINEE_CLASS_EARNING_CLASS_CHECKIN_REQUIRED");
    }

    const booking = checkIn.booking;

    if (!booking || !checkIn.bookingId) {
      throw new Error("TRAINEE_CLASS_EARNING_BOOKING_REQUIRED");
    }

    const membership = checkIn.userMembership;

    if (!membership || !checkIn.userMembershipId) {
      throw new Error("TRAINEE_CLASS_EARNING_MEMBERSHIP_REQUIRED");
    }

    if (booking.userMembershipId !== checkIn.userMembershipId) {
      throw new Error("TRAINEE_CLASS_EARNING_MEMBERSHIP_MISMATCH");
    }

    const schedule = booking.schedule;
    const classRow = schedule.class;

    const attendanceDate = new Date(schedule.date);

    const attendanceDateKey = dateKey(attendanceDate);

    const monthKey = attendanceDateKey.slice(0, 7);

    const fallbackOccurrenceKey = buildOccurrenceKey({
      classId: classRow.id,
      scheduleDate: attendanceDate,
      scheduleTime: schedule.time,
    });

    const common = {
      monthKey,

      userMembershipId: membership.id,
      bookingId: booking.id,
      scheduleId: schedule.id,

      occurrenceKey: fallbackOccurrenceKey,

      attendanceDate,
      attendanceTime: normalizeTime(schedule.time),

      customerId: checkIn.user.id,
      customerNameSnapshot: checkIn.user.name ?? null,

      classId: classRow.id,
      classNameSnapshot: classRow.name,

      paymentAmountMinor: toMinor(membership.paymentAmount),

      totalSessionsSnapshot: membership.totalSessions,

      entitlementUnitsSnapshot: getBookingEntitlementUnits({
        entitlementUnits: booking.entitlementUnits,
      }),

      calculatedAt: new Date(),
      calculatedById: actor.userId,

      finalizedAt: null,
      finalizedById: null,

      commissionSourceSnapshot: null,
      positionTermIdSnapshot: null,
      positionIdSnapshot: null,
      positionPayrollPolicyIdSnapshot: null,
    } satisfies Partial<Prisma.TraineeClassEarningUncheckedCreateInput>;

    const coachAttendance = await tx.coachClassAttendance.findUnique({
      where: {
        scheduleId: schedule.id,
      },
    });

    if (!coachAttendance) {
      return saveResultWithAudit(tx, actor, attendanceCheckInId, {
        ...common,

        actualTrainerId: null,
        actualTrainerNameSnapshot: null,

        actualEmployeeId: null,
        actualEmployeeCodeSnapshot: null,
        actualEmployeeNameSnapshot: null,

        coachCompensationTermId: null,

        unitValueMinor: 0,
        commissionBaseMinor: 0,
        commissionRateBps: null,
        commissionAmountMinor: 0,

        currency: "EGP",

        status: "blocked",
        blockReason: "COACH_ATTENDANCE_MISSING",
      });
    }

    const actualCoach = {
      actualTrainerId: coachAttendance.actualTrainerId,
      actualTrainerNameSnapshot: coachAttendance.actualTrainerNameSnapshot,

      actualEmployeeId: coachAttendance.actualEmployeeId,
      actualEmployeeCodeSnapshot: coachAttendance.actualEmployeeCodeSnapshot,
      actualEmployeeNameSnapshot: coachAttendance.actualEmployeeNameSnapshot,
    };

    const occurrenceKey = coachAttendance.occurrenceKey;

    if (
      !["present", "substitute"].includes(coachAttendance.status) ||
      !coachAttendance.actualTrainerId ||
      !coachAttendance.actualEmployeeId
    ) {
      return saveResultWithAudit(tx, actor, attendanceCheckInId, {
        ...common,
        occurrenceKey,

        ...actualCoach,

        coachCompensationTermId: null,

        unitValueMinor: 0,
        commissionBaseMinor: 0,
        commissionRateBps: null,
        commissionAmountMinor: 0,

        currency: "EGP",

        status: "blocked",
        blockReason: "ACTUAL_COACH_NOT_PAYABLE",
      });
    }

    const totalSessions = membership.totalSessions;

    if (
      totalSessions == null ||
      !Number.isInteger(totalSessions) ||
      totalSessions <= 0
    ) {
      return saveResultWithAudit(tx, actor, attendanceCheckInId, {
        ...common,
        occurrenceKey,

        ...actualCoach,

        coachCompensationTermId: null,

        unitValueMinor: 0,
        commissionBaseMinor: 0,
        commissionRateBps: null,
        commissionAmountMinor: 0,

        currency: "EGP",

        status: "blocked",
        blockReason: "INVALID_SESSION_DENOMINATOR",
      });
    }

    type TraineeCommissionSource = {
      source:
        | "legacy_coach_compensation_term"
        | "position_payroll_policy";

      coachCompensationTermId: string | null;

      positionTermId: string | null;
      positionId: string | null;
      positionPayrollPolicyId: string | null;

      traineeClassCommissionBps: number;
      currency: string;
    };

    let commissionSource: TraineeCommissionSource | null = null;
    let compensationBlockReason: string | null = null;

    /*
     * Rule 5 compatibility boundary:
     *
     * Before Position History starts:
     *   legacy CoachCompensationTerm remains authoritative.
     *
     * Once Position History has started:
     *   EmployeePositionTerm + PositionPayrollPolicy are authoritative.
     *   There is NO silent fallback to legacy compensation.
     */
    const latestStartedPositionTerm =
      await tx.employeePositionTerm.findFirst({
        where: {
          employeeId: coachAttendance.actualEmployeeId,
          effectiveFrom: {
            lte: attendanceDate,
          },
        },
        orderBy: {
          effectiveFrom: "desc",
        },
        select: {
          id: true,
          positionId: true,
          effectiveFrom: true,
          effectiveTo: true,
        },
      });

    if (!latestStartedPositionTerm) {
      const legacyTerm =
        await tx.coachCompensationTerm.findFirst({
          where: {
            employeeId: coachAttendance.actualEmployeeId,

            effectiveFrom: {
              lte: attendanceDate,
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: attendanceDate,
                },
              },
            ],
          },

          orderBy: {
            effectiveFrom: "desc",
          },

          select: {
            id: true,
            traineeClassCommissionBps: true,
            currency: true,
          },
        });

      if (!legacyTerm) {
        compensationBlockReason =
          "COACH_COMPENSATION_TERM_MISSING";
      } else {
        commissionSource = {
          source: "legacy_coach_compensation_term",

          coachCompensationTermId: legacyTerm.id,

          positionTermId: null,
          positionId: null,
          positionPayrollPolicyId: null,

          traineeClassCommissionBps:
            legacyTerm.traineeClassCommissionBps,

          currency: legacyTerm.currency,
        };
      }
    } else if (
      latestStartedPositionTerm.effectiveTo &&
      latestStartedPositionTerm.effectiveTo.getTime() <
        attendanceDate.getTime()
    ) {
      compensationBlockReason =
        "TRAINEE_CLASS_EARNING_POSITION_TERM_MISSING";
    } else {
      const policies =
        await tx.positionPayrollPolicy.findMany({
          where: {
            positionId:
              latestStartedPositionTerm.positionId,

            effectiveFrom: {
              lte: attendanceDate,
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: attendanceDate,
                },
              },
            ],
          },

          orderBy: {
            effectiveFrom: "desc",
          },

          take: 2,

          select: {
            id: true,
            positionId: true,
            traineeClassCommissionBps: true,
            currency: true,
          },
        });

      if (policies.length === 0) {
        compensationBlockReason =
          "TRAINEE_CLASS_EARNING_POSITION_PAYROLL_POLICY_MISSING";
      } else if (policies.length > 1) {
        compensationBlockReason =
          "TRAINEE_CLASS_EARNING_POSITION_PAYROLL_POLICY_AMBIGUOUS";
      } else if (
        policies[0].traineeClassCommissionBps == null
      ) {
        compensationBlockReason =
          "TRAINEE_CLASS_EARNING_TRAINEE_RATE_MISSING";
      } else {
        commissionSource = {
          source: "position_payroll_policy",

          coachCompensationTermId: null,

          positionTermId:
            latestStartedPositionTerm.id,

          positionId:
            latestStartedPositionTerm.positionId,

          positionPayrollPolicyId:
            policies[0].id,

          traineeClassCommissionBps:
            policies[0].traineeClassCommissionBps,

          currency:
            policies[0].currency,
        };
      }
    }

    if (compensationBlockReason || !commissionSource) {
      return saveResultWithAudit(
        tx,
        actor,
        attendanceCheckInId,
        {
          ...common,
          occurrenceKey,

          ...actualCoach,

          coachCompensationTermId: null,

          commissionSourceSnapshot: null,
          positionTermIdSnapshot: null,
          positionIdSnapshot: null,
          positionPayrollPolicyIdSnapshot: null,

          unitValueMinor: 0,
          commissionBaseMinor: 0,
          commissionRateBps: null,
          commissionAmountMinor: 0,

          currency: "EGP",

          status: "blocked",
          blockReason:
            compensationBlockReason ??
            "TRAINEE_CLASS_EARNING_COMPENSATION_SOURCE_MISSING",
        },
      );
    }

    const paymentAmountMinor = common.paymentAmountMinor;

    const entitlementUnits = common.entitlementUnitsSnapshot;

    const unitValueMinor = Math.round(paymentAmountMinor / totalSessions);

    const commissionBaseMinor = unitValueMinor * entitlementUnits;

    const commissionAmountMinor = Math.round(
      (commissionBaseMinor *
        commissionSource.traineeClassCommissionBps) /
        10000,
    );

    return saveResultWithAudit(tx, actor, attendanceCheckInId, {
      ...common,
      occurrenceKey,

      ...actualCoach,

      coachCompensationTermId:
        commissionSource.coachCompensationTermId,

      commissionSourceSnapshot:
        commissionSource.source,

      positionTermIdSnapshot:
        commissionSource.positionTermId,

      positionIdSnapshot:
        commissionSource.positionId,

      positionPayrollPolicyIdSnapshot:
        commissionSource.positionPayrollPolicyId,

      unitValueMinor,
      commissionBaseMinor,

      commissionRateBps:
        commissionSource.traineeClassCommissionBps,

      commissionAmountMinor,

      currency:
        commissionSource.currency,

      status: "calculated",
      blockReason: null,
    });
  });
}

export async function finalizeTraineeClassEarning(
  input: {
    earningId: string;
  },
  actor: TraineeClassEarningActor,
): Promise<TraineeClassEarning> {
  assertActor(actor);

  const earningId = input.earningId?.trim();

  if (!earningId) {
    throw new Error("TRAINEE_CLASS_EARNING_ID_REQUIRED");
  }

  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
      }>
    >`
        SELECT
          \`id\`,
          \`status\`
        FROM \`TraineeClassEarning\`
        WHERE \`id\` = ${earningId}
        FOR UPDATE
      `;

    const lockedRow = locked[0];

    if (!lockedRow) {
      throw new Error("TRAINEE_CLASS_EARNING_NOT_FOUND");
    }

    if (lockedRow.status === "finalized") {
      return tx.traineeClassEarning.findUniqueOrThrow({
        where: {
          id: earningId,
        },
      });
    }

    if (lockedRow.status !== "calculated") {
      throw new Error("TRAINEE_CLASS_EARNING_NOT_CALCULATED");
    }

    const before = await tx.traineeClassEarning.findUniqueOrThrow({
      where: {
        id: earningId,
      },
    });

    const finalized = await tx.traineeClassEarning.update({
      where: {
        id: earningId,
      },
      data: {
        status: "finalized",
        finalizedAt: new Date(),
        finalizedById: actor.userId,
      },
    });

    await writeMandatoryAudit(tx, actor, {
      action: "trainee_class_earning_finalize",
      targetId: earningId,
      details: {
        attendanceCheckInId: finalized.attendanceCheckInId,
        before: {
          status: before.status,
          actualEmployeeId: before.actualEmployeeId,
          coachCompensationTermId: before.coachCompensationTermId,
          commissionRateBps: before.commissionRateBps,
          commissionBaseMinor: before.commissionBaseMinor,
          commissionAmountMinor: before.commissionAmountMinor,
        },
        after: {
          status: finalized.status,
          finalizedAt: finalized.finalizedAt,
          finalizedById: finalized.finalizedById,
        },
      },
    });

    return finalized;
  });
}
