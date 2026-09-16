import type { Prisma } from "@prisma/client";

import { asDbTransactionClient, db } from "@/lib/db";

import {
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";

type Tx = Prisma.TransactionClient;

export type AttendanceDeductionActor = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SaveAttendanceDeductionPolicyInput = {
  policyId?: string | null;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;

  salaryDivisorDays: number;
  workdayMinutes: number;

  absenceMultiplierBps: number;

  lateDeductionEnabled: boolean;
  lateGraceMinutes: number;
  lateMultiplierBps: number;

  notes?: string | null;
  editReason?: string | null;
};

function assertActor(actor: AttendanceDeductionActor) {
  if (!actor.userId?.trim()) {
    throw new Error("ATTENDANCE_DEDUCTION_ACTOR_REQUIRED");
  }
}

function assertMonthKey(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("ATTENDANCE_DEDUCTION_INVALID_MONTH");
  }
}

function assertDateKey(value: string, field: string) {
  const instant = cairoDateStartInstant(value);

  if (cairoCalendarDateKey(instant) !== value) {
    throw new Error(`ATTENDANCE_DEDUCTION_INVALID_${field}`);
  }

  return instant;
}

function normalizeDateRange(fromRaw: string, toRaw?: string | null) {
  const from = assertDateKey(fromRaw, "EFFECTIVE_FROM");

  const to = !toRaw?.trim() ? null : assertDateKey(toRaw, "EFFECTIVE_TO");

  if (to && to.getTime() < from.getTime()) {
    throw new Error("ATTENDANCE_DEDUCTION_EFFECTIVE_TO_BEFORE_FROM");
  }

  return { from, to };
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`ATTENDANCE_DEDUCTION_INVALID_${field}`);
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`ATTENDANCE_DEDUCTION_INVALID_${field}`);
  }
}

function assertBps(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > 100000) {
    throw new Error(`ATTENDANCE_DEDUCTION_INVALID_${field}`);
  }
}

function normalizeNotes(value?: string | null) {
  const v = value?.trim() || "";
  return v || null;
}

function normalizeEditReason(existing: boolean, value?: string | null) {
  const reason = value?.trim() || null;

  if (existing && (!reason || reason.length < 3)) {
    throw new Error("ATTENDANCE_DEDUCTION_POLICY_EDIT_REASON_REQUIRED");
  }

  return reason;
}

async function writeMandatoryAudit(
  tx: Tx,
  actor: AttendanceDeductionActor,
  input: {
    action: string;
    targetType: string;
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
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: JSON.stringify(input.details),
    },
  });
}

async function assertEmployee(tx: Tx, employeeId: string) {
  const employee = await tx.employeeProfile.findUnique({
    where: {
      id: employeeId,
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      employmentStatus: true,
      payrollEnabled: true,
    },
  });

  if (!employee) {
    throw new Error("ATTENDANCE_DEDUCTION_EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

function overlapWhere(effectiveFrom: Date, effectiveTo: Date | null) {
  return {
    ...(effectiveTo
      ? {
          effectiveFrom: {
            lte: effectiveTo,
          },
        }
      : {}),
    OR: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          gte: effectiveFrom,
        },
      },
    ],
  };
}

export async function saveAttendanceDeductionPolicy(
  input: SaveAttendanceDeductionPolicyInput,
  actor: AttendanceDeductionActor,
) {
  assertActor(actor);

  if (!input.employeeId?.trim()) {
    throw new Error("ATTENDANCE_DEDUCTION_EMPLOYEE_REQUIRED");
  }

  const { from, to } = normalizeDateRange(
    input.effectiveFrom,
    input.effectiveTo,
  );

  assertPositiveInteger(input.salaryDivisorDays, "SALARY_DIVISOR_DAYS");

  assertPositiveInteger(input.workdayMinutes, "WORKDAY_MINUTES");

  assertBps(input.absenceMultiplierBps, "ABSENCE_MULTIPLIER_BPS");

  assertNonNegativeInteger(input.lateGraceMinutes, "LATE_GRACE_MINUTES");

  assertBps(input.lateMultiplierBps, "LATE_MULTIPLIER_BPS");

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const employee = await assertEmployee(tx, input.employeeId);

    const existing = input.policyId
      ? await tx.attendanceDeductionPolicy.findUnique({
          where: {
            id: input.policyId,
          },
        })
      : null;

    if (input.policyId && !existing) {
      throw new Error("ATTENDANCE_DEDUCTION_POLICY_NOT_FOUND");
    }

    if (existing && existing.employeeId !== input.employeeId) {
      throw new Error("ATTENDANCE_DEDUCTION_POLICY_EMPLOYEE_IMMUTABLE");
    }

    const editReason = normalizeEditReason(Boolean(existing), input.editReason);

    const overlap = await tx.attendanceDeductionPolicy.findFirst({
      where: {
        employeeId: input.employeeId,
        ...(existing
          ? {
              id: {
                not: existing.id,
              },
            }
          : {}),
        ...overlapWhere(from, to),
      },
      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new Error("ATTENDANCE_DEDUCTION_POLICY_OVERLAP");
    }

    const before = existing
      ? {
          effectiveFrom: cairoCalendarDateKey(existing.effectiveFrom),
          effectiveTo: existing.effectiveTo
            ? cairoCalendarDateKey(existing.effectiveTo)
            : null,
          salaryDivisorDays: existing.salaryDivisorDays,
          workdayMinutes: existing.workdayMinutes,
          absenceMultiplierBps: existing.absenceMultiplierBps,
          lateDeductionEnabled: existing.lateDeductionEnabled,
          lateGraceMinutes: existing.lateGraceMinutes,
          lateMultiplierBps: existing.lateMultiplierBps,
        }
      : null;

    const data = {
      effectiveFrom: from,
      effectiveTo: to,
      salaryDivisorDays: input.salaryDivisorDays,
      workdayMinutes: input.workdayMinutes,
      absenceMultiplierBps: input.absenceMultiplierBps,
      lateDeductionEnabled: Boolean(input.lateDeductionEnabled),
      lateGraceMinutes: input.lateGraceMinutes,
      lateMultiplierBps: input.lateMultiplierBps,
      notes: normalizeNotes(input.notes),
      createdById: actor.userId,
    };

    const policy = existing
      ? await tx.attendanceDeductionPolicy.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await tx.attendanceDeductionPolicy.create({
          data: {
            employeeId: input.employeeId,
            ...data,
          },
        });

    await writeMandatoryAudit(tx, actor, {
      action: existing
        ? "attendance_deduction_policy_update"
        : "attendance_deduction_policy_create",
      targetType: "AttendanceDeductionPolicy",
      targetId: policy.id,
      details: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        before,
        after: {
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          salaryDivisorDays: policy.salaryDivisorDays,
          workdayMinutes: policy.workdayMinutes,
          absenceMultiplierBps: policy.absenceMultiplierBps,
          lateDeductionEnabled: policy.lateDeductionEnabled,
          lateGraceMinutes: policy.lateGraceMinutes,
          lateMultiplierBps: policy.lateMultiplierBps,
        },
        editReason,
      },
    });

    return policy;
  });
}

function monthBounds(monthKey: string) {
  assertMonthKey(monthKey);

  const [year, month] = monthKey.split("-").map(Number);

  const start = cairoDateStartInstant(
    `${year}-${String(month).padStart(2, "0")}-01`,
  );

  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const endExclusive = cairoDateStartInstant(nextMonth);

  return {
    start,
    endExclusive,
  };
}

function roundMinor(numerator: bigint, denominator: bigint) {
  if (denominator <= BigInt(0)) {
    throw new Error("ATTENDANCE_DEDUCTION_INVALID_DENOMINATOR");
  }

  return Number((numerator + denominator / BigInt(2)) / denominator);
}

async function resolveCompensationTerm(tx: Tx, employeeId: string, date: Date) {
  return tx.employeeCompensationTerm.findFirst({
    where: {
      employeeId,
      effectiveFrom: {
        lte: date,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: date,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });
}

async function resolvePolicy(tx: Tx, employeeId: string, date: Date) {
  return tx.attendanceDeductionPolicy.findFirst({
    where: {
      employeeId,
      effectiveFrom: {
        lte: date,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: date,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "desc",
    },
  });
}

export async function calculateAttendanceDeduction(
  employeeId: string,
  monthKey: string,
  actor: AttendanceDeductionActor,
) {
  assertActor(actor);
  assertMonthKey(monthKey);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const employee = await assertEmployee(tx, employeeId);

    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
      }>
    >`
          SELECT id, status
          FROM AttendanceDeduction
          WHERE employeeId = ${employeeId}
            AND monthKey = ${monthKey}
          FOR UPDATE
        `;

    if (locked[0]?.status === "finalized") {
      throw new Error("ATTENDANCE_DEDUCTION_FINALIZED_IMMUTABLE");
    }

    const { start, endExclusive } = monthBounds(monthKey);

    const attendance = await tx.employeeAttendance.findMany({
      where: {
        employeeId,
        attendanceDate: {
          gte: start,
          lt: endExclusive,
        },
      },
      orderBy: {
        attendanceDate: "asc",
      },
    });

    const existing = await tx.attendanceDeduction.findUnique({
      where: {
        employeeId_monthKey: {
          employeeId,
          monthKey,
        },
      },
    });

    const deduction = existing
      ? await tx.attendanceDeduction.update({
          where: {
            id: existing.id,
          },
          data: {
            status: "blocked",
            employeeCodeSnapshot: employee.employeeCode,
            employeeNameSnapshot: employee.name,
            blockReason: null,
            calculatedAt: null,
            calculatedById: null,
            finalizedAt: null,
            finalizedById: null,
          },
        })
      : await tx.attendanceDeduction.create({
          data: {
            employeeId,
            monthKey,
            status: "blocked",
            employeeCodeSnapshot: employee.employeeCode,
            employeeNameSnapshot: employee.name,
          },
        });

    await tx.attendanceDeductionOccurrence.deleteMany({
      where: {
        deductionId: deduction.id,
      },
    });

    if (employee.employmentStatus !== "active") {
      const blocked = await tx.attendanceDeduction.update({
        where: {
          id: deduction.id,
        },
        data: {
          blockReason: "EMPLOYEE_NOT_ACTIVE",
        },
        include: {
          occurrences: {
            orderBy: {
              attendanceDate: "asc",
            },
          },
        },
      });

      await writeMandatoryAudit(tx, actor, {
        action: "attendance_deduction_calculate_blocked",
        targetType: "AttendanceDeduction",
        targetId: blocked.id,
        details: {
          employeeId,
          monthKey,
          blockReason: blocked.blockReason,
        },
      });

      return blocked;
    }

    if (!employee.payrollEnabled) {
      const blocked = await tx.attendanceDeduction.update({
        where: {
          id: deduction.id,
        },
        data: {
          blockReason: "PAYROLL_DISABLED",
        },
        include: {
          occurrences: {
            orderBy: {
              attendanceDate: "asc",
            },
          },
        },
      });

      await writeMandatoryAudit(tx, actor, {
        action: "attendance_deduction_calculate_blocked",
        targetType: "AttendanceDeduction",
        targetId: blocked.id,
        details: {
          employeeId,
          monthKey,
          blockReason: blocked.blockReason,
        },
      });

      return blocked;
    }

    let absenceCount = 0;
    let totalLateMinutes = 0;
    let deductibleLateMinutes = 0;

    let absenceDeductionMinor = 0;
    let lateDeductionMinor = 0;

    const compensationIds = new Set<string>();

    const policyIds = new Set<string>();

    const currencies = new Set<string>();

    const occurrenceCreates: Prisma.AttendanceDeductionOccurrenceCreateManyInput[] =
      [];

    for (const row of attendance) {
      const date = row.attendanceDate;

      const term = await resolveCompensationTerm(tx, employeeId, date);

      if (!term) {
        const blocked = await tx.attendanceDeduction.update({
          where: {
            id: deduction.id,
          },
          data: {
            blockReason: `MISSING_COMPENSATION_TERM:${row.id}`,
          },
          include: {
            occurrences: {
              orderBy: {
                attendanceDate: "asc",
              },
            },
          },
        });

        await writeMandatoryAudit(tx, actor, {
          action: "attendance_deduction_calculate_blocked",
          targetType: "AttendanceDeduction",
          targetId: blocked.id,
          details: {
            employeeId,
            monthKey,
            attendanceId: row.id,
            blockReason: blocked.blockReason,
          },
        });

        return blocked;
      }

      const policy = await resolvePolicy(tx, employeeId, date);

      if (!policy) {
        const blocked = await tx.attendanceDeduction.update({
          where: {
            id: deduction.id,
          },
          data: {
            blockReason: `MISSING_POLICY:${row.id}`,
          },
          include: {
            occurrences: {
              orderBy: {
                attendanceDate: "asc",
              },
            },
          },
        });

        await writeMandatoryAudit(tx, actor, {
          action: "attendance_deduction_calculate_blocked",
          targetType: "AttendanceDeduction",
          targetId: blocked.id,
          details: {
            employeeId,
            monthKey,
            attendanceId: row.id,
            blockReason: blocked.blockReason,
          },
        });

        return blocked;
      }

      compensationIds.add(term.id);
      policyIds.add(policy.id);
      currencies.add(term.currency);

      if (currencies.size > 1) {
        const blocked = await tx.attendanceDeduction.update({
          where: {
            id: deduction.id,
          },
          data: {
            blockReason: "MULTIPLE_CURRENCIES_IN_MONTH",
          },
          include: {
            occurrences: {
              orderBy: {
                attendanceDate: "asc",
              },
            },
          },
        });

        await writeMandatoryAudit(tx, actor, {
          action: "attendance_deduction_calculate_blocked",
          targetType: "AttendanceDeduction",
          targetId: blocked.id,
          details: {
            employeeId,
            monthKey,
            blockReason: blocked.blockReason,
          },
        });

        return blocked;
      }

      let rowDeduction = 0;
      let rowDeductibleLate = 0;

      if (row.status === "absent") {
        absenceCount += 1;

        const amount = roundMinor(
          BigInt(term.fixedSalaryMinor) * BigInt(policy.absenceMultiplierBps),
          BigInt(policy.salaryDivisorDays) * BigInt(10000),
        );

        rowDeduction += amount;
        absenceDeductionMinor += amount;
      }

      totalLateMinutes += row.lateMinutes;

      if (row.status === "late" && policy.lateDeductionEnabled) {
        rowDeductibleLate = Math.max(
          0,
          row.lateMinutes - policy.lateGraceMinutes,
        );

        deductibleLateMinutes += rowDeductibleLate;

        const amount = roundMinor(
          BigInt(term.fixedSalaryMinor) *
            BigInt(rowDeductibleLate) *
            BigInt(policy.lateMultiplierBps),
          BigInt(policy.salaryDivisorDays) *
            BigInt(policy.workdayMinutes) *
            BigInt(10000),
        );

        rowDeduction += amount;
        lateDeductionMinor += amount;
      }

      occurrenceCreates.push({
        deductionId: deduction.id,
        attendanceId: row.id,
        attendanceDate: row.attendanceDate,
        statusSnapshot: row.status,

        compensationTermIdSnapshot: term.id,
        policyIdSnapshot: policy.id,

        fixedSalaryMinorSnapshot: term.fixedSalaryMinor,
        currencySnapshot: term.currency,

        salaryDivisorDaysSnapshot: policy.salaryDivisorDays,
        workdayMinutesSnapshot: policy.workdayMinutes,
        absenceMultiplierBpsSnapshot: policy.absenceMultiplierBps,

        lateDeductionEnabledSnapshot: policy.lateDeductionEnabled,
        lateGraceMinutesSnapshot: policy.lateGraceMinutes,
        lateMultiplierBpsSnapshot: policy.lateMultiplierBps,

        lateMinutesSnapshot: row.lateMinutes,
        deductibleLateMinutes: rowDeductibleLate,
        deductionMinor: rowDeduction,
      });
    }

    if (occurrenceCreates.length > 0) {
      await tx.attendanceDeductionOccurrence.createMany({
        data: occurrenceCreates,
      });
    }

    const onlyCompensationId =
      compensationIds.size === 1 ? [...compensationIds][0] : null;

    const onlyPolicyId = policyIds.size === 1 ? [...policyIds][0] : null;

    const onlyCurrency = currencies.size === 1 ? [...currencies][0] : "EGP";

    let monthTerm = null;
    let monthPolicy = null;

    if (onlyCompensationId) {
      monthTerm = await tx.employeeCompensationTerm.findUnique({
        where: {
          id: onlyCompensationId,
        },
      });
    }

    if (onlyPolicyId) {
      monthPolicy = await tx.attendanceDeductionPolicy.findUnique({
        where: {
          id: onlyPolicyId,
        },
      });
    }

    const calculated = await tx.attendanceDeduction.update({
      where: {
        id: deduction.id,
      },
      data: {
        status: "calculated",
        currency: onlyCurrency,

        compensationTermIdSnapshot: onlyCompensationId,
        policyIdSnapshot: onlyPolicyId,

        fixedSalaryMinorSnapshot: monthTerm?.fixedSalaryMinor ?? 0,

        salaryDivisorDaysSnapshot: monthPolicy?.salaryDivisorDays ?? null,

        workdayMinutesSnapshot: monthPolicy?.workdayMinutes ?? null,

        absenceMultiplierBpsSnapshot: monthPolicy?.absenceMultiplierBps ?? null,

        lateDeductionEnabledSnapshot: monthPolicy?.lateDeductionEnabled ?? null,

        lateGraceMinutesSnapshot: monthPolicy?.lateGraceMinutes ?? null,

        lateMultiplierBpsSnapshot: monthPolicy?.lateMultiplierBps ?? null,

        absenceCount,
        totalLateMinutes,
        deductibleLateMinutes,

        absenceDeductionMinor,
        lateDeductionMinor,
        totalDeductionMinor: absenceDeductionMinor + lateDeductionMinor,

        blockReason: null,

        calculatedAt: new Date(),

        calculatedById: actor.userId,
      },
      include: {
        occurrences: {
          orderBy: {
            attendanceDate: "asc",
          },
        },
      },
    });

    await writeMandatoryAudit(tx, actor, {
      action: "attendance_deduction_calculate",
      targetType: "AttendanceDeduction",
      targetId: calculated.id,
      details: {
        employeeId,
        monthKey,
        occurrenceCount: calculated.occurrences.length,
        absenceCount,
        totalLateMinutes,
        deductibleLateMinutes,
        absenceDeductionMinor,
        lateDeductionMinor,
        totalDeductionMinor: calculated.totalDeductionMinor,
      },
    });

    return calculated;
  });
}

export async function finalizeAttendanceDeduction(
  employeeId: string,
  monthKey: string,
  actor: AttendanceDeductionActor,
) {
  assertActor(actor);
  assertMonthKey(monthKey);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
      }>
    >`
          SELECT id, status
          FROM AttendanceDeduction
          WHERE employeeId = ${employeeId}
            AND monthKey = ${monthKey}
          FOR UPDATE
        `;

    const row = rows[0];

    if (!row) {
      throw new Error("ATTENDANCE_DEDUCTION_NOT_FOUND");
    }

    if (row.status === "finalized") {
      return tx.attendanceDeduction.findUniqueOrThrow({
        where: {
          id: row.id,
        },
        include: {
          occurrences: true,
        },
      });
    }

    if (row.status !== "calculated") {
      throw new Error("ATTENDANCE_DEDUCTION_NOT_FINALIZABLE");
    }

    const periodRows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
      }>
    >`
      SELECT id, status
      FROM AttendancePeriod
      WHERE monthKey = ${monthKey}
      FOR UPDATE
    `;

    const period = periodRows[0];

    if (!period || period.status !== "locked") {
      throw new Error("ATTENDANCE_DEDUCTION_PERIOD_NOT_LOCKED");
    }

    const finalized = await tx.attendanceDeduction.update({
      where: {
        id: row.id,
      },
      data: {
        status: "finalized",
        finalizedAt: new Date(),
        finalizedById: actor.userId,
      },
      include: {
        occurrences: true,
      },
    });

    await writeMandatoryAudit(tx, actor, {
      action: "attendance_deduction_finalize",
      targetType: "AttendanceDeduction",
      targetId: finalized.id,
      details: {
        employeeId,
        monthKey,
        totalDeductionMinor: finalized.totalDeductionMinor,
        occurrenceCount: finalized.occurrences.length,
      },
    });

    return finalized;
  });
}
