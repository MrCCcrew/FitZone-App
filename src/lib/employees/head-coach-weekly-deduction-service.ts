import type { Prisma } from "@prisma/client";

import { cairoCalendarDateKey } from "@/lib/fitzone-time";

type Tx = Prisma.TransactionClient;

export type HeadCoachWeeklyPeriodResult = {
  period: 1 | 2 | 3 | 4;
  startDay: number;
  endDay: number;

  actualMinutes: number;
  creditedMinutes: number;
  missingMinutes: number;
};

export type HeadCoachWeeklyDeductionResult = {
  employeeId: string;
  positionId: string;
  positionPayrollPolicyId: string;

  monthKey: string;

  fixedSalaryMinor: number;

  monthlyBaseMinutes: number;
  weeklyMinimumMinutes: number;
  weeklyCapMinutes: number;

  totalActualMinutes: number;
  totalCreditedMinutes: number;
  totalMissingMinutes: number;

  deductionMinor: number;
  currency: string;

  periods: HeadCoachWeeklyPeriodResult[];
};

function assertMonthKey(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error("HEAD_COACH_DEDUCTION_INVALID_MONTH");
  }
}

function mysqlMonthBounds(monthKey: string) {
  assertMonthKey(monthKey);

  const [year, month] = monthKey.split("-").map(Number);

  return {
    year,
    month,
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
    lastDay: new Date(Date.UTC(year, month, 0)).getUTCDate(),
  };
}

function roundPositiveRatio(
  numerator: bigint,
  denominator: bigint,
): number {
  if (numerator < BigInt(0) || denominator <= BigInt(0)) {
    throw new Error("HEAD_COACH_DEDUCTION_INVALID_RATIO");
  }

  /*
   * Round once to the nearest minor currency unit.
   * Positive values: half rounds upward.
   */
  const rounded =
    (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));

  const value = Number(rounded);

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("HEAD_COACH_DEDUCTION_INVALID_AMOUNT");
  }

  return value;
}

function assertPositiveInteger(value: number | null, code: string) {
  if (value == null || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(code);
  }

  return value;
}

function assertMoney(value: number | null) {
  if (value == null || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_MISSING_FIXED_SALARY_SETTING",
    );
  }

  return value;
}

export async function calculateHeadCoachWeeklyDeductionTx(
  tx: Tx,
  input: {
    employeeId: string;
    positionId: string;
    monthKey: string;

    /*
     * Optional immutable Payroll authority boundary.
     *
     * When provided, C07 MUST use the exact policy and salary
     * already selected by C10 Payroll salary resolution.
     */
    expectedPositionPayrollPolicyId?: string;
    expectedFixedSalaryMinor?: number;
  },
): Promise<HeadCoachWeeklyDeductionResult> {
  const employeeId = input.employeeId?.trim();
  const positionId = input.positionId?.trim();

  if (!employeeId) {
    throw new Error("HEAD_COACH_DEDUCTION_EMPLOYEE_REQUIRED");
  }

  if (!positionId) {
    throw new Error("HEAD_COACH_DEDUCTION_POSITION_REQUIRED");
  }

  const bounds = mysqlMonthBounds(input.monthKey);

  const position = await tx.position.findUnique({
    where: {
      id: positionId,
    },
    select: {
      id: true,
      code: true,
    },
  });

  if (!position) {
    throw new Error("HEAD_COACH_DEDUCTION_POSITION_NOT_FOUND");
  }

  if (position.code !== "HEAD_COACH_OWNER") {
    throw new Error(
      "HEAD_COACH_DEDUCTION_HEAD_COACH_POSITION_REQUIRED",
    );
  }

  /*
   * Payroll-locked mode:
   *
   * If Payroll already resolved the historical PositionPayrollPolicy,
   * C07 must use that exact policy rather than performing an independent
   * mutable lookup.
   *
   * Standalone callers retain the original effective-policy lookup.
   */
  const expectedPolicyId =
    input.expectedPositionPayrollPolicyId?.trim() || null;

  const policy = expectedPolicyId
    ? await tx.positionPayrollPolicy.findUnique({
        where: {
          id: expectedPolicyId,
        },
      })
    : await (async () => {
        const overlappingPolicies =
          await tx.positionPayrollPolicy.findMany({
            where: {
              positionId,
              isActive: true,

              effectiveFrom: {
                lte: bounds.end,
              },

              OR: [
                {
                  effectiveTo: null,
                },
                {
                  effectiveTo: {
                    gte: bounds.start,
                  },
                },
              ],
            },

            orderBy: {
              effectiveFrom: "asc",
            },
          });

        if (overlappingPolicies.length !== 1) {
          throw new Error(
            overlappingPolicies.length === 0
              ? "HEAD_COACH_DEDUCTION_MISSING_POSITION_POLICY"
              : "HEAD_COACH_DEDUCTION_MULTIPLE_POSITION_POLICIES_IN_MONTH",
          );
        }

        return overlappingPolicies[0];
      })();

  if (!policy) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_EXPECTED_POSITION_POLICY_NOT_FOUND",
    );
  }

  if (policy.positionId !== positionId) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_POSITION_POLICY_MISMATCH",
    );
  }

  /*
   * effectiveFrom/effectiveTo are MySQL DATE values.
   * Compare calendar-date semantics, never JS timestamp milliseconds,
   * otherwise timezone representation can falsely reject a full-month term.
   */
  const policyStartKey = cairoCalendarDateKey(
    policy.effectiveFrom,
  );

  const policyEndKey = policy.effectiveTo
    ? cairoCalendarDateKey(policy.effectiveTo)
    : null;

  const monthStartKey =
    `${bounds.year}-${String(bounds.month).padStart(2, "0")}-01`;

  const monthEndKey =
    `${bounds.year}-${String(bounds.month).padStart(2, "0")}-${String(
      bounds.lastDay,
    ).padStart(2, "0")}`;

  if (
    policyStartKey > monthStartKey ||
    (policyEndKey != null && policyEndKey < monthEndKey)
  ) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_POLICY_DOES_NOT_COVER_FULL_MONTH",
    );
  }

  const fixedSalaryMinor = assertMoney(
    policy.fixedSalaryMinor,
  );

  if (input.expectedFixedSalaryMinor != null) {
    if (
      !Number.isSafeInteger(
        input.expectedFixedSalaryMinor,
      ) ||
      input.expectedFixedSalaryMinor < 0
    ) {
      throw new Error(
        "HEAD_COACH_DEDUCTION_INVALID_EXPECTED_FIXED_SALARY",
      );
    }

    if (
      fixedSalaryMinor !==
      input.expectedFixedSalaryMinor
    ) {
      throw new Error(
        "HEAD_COACH_DEDUCTION_FIXED_SALARY_MISMATCH",
      );
    }
  }

  if (
    expectedPolicyId &&
    policy.id !== expectedPolicyId
  ) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_POSITION_POLICY_MISMATCH",
    );
  }

  const monthlyBaseMinutes = assertPositiveInteger(
    policy.headCoachMonthlyBaseMinutes,
    "HEAD_COACH_DEDUCTION_MISSING_MONTHLY_BASE_MINUTES",
  );

  const weeklyMinimumMinutes = assertPositiveInteger(
    policy.headCoachWeeklyMinMinutes,
    "HEAD_COACH_DEDUCTION_MISSING_WEEKLY_MINIMUM_MINUTES",
  );

  const weeklyCapMinutes = assertPositiveInteger(
    policy.headCoachWeeklyCapMinutes,
    "HEAD_COACH_DEDUCTION_MISSING_WEEKLY_CAP_MINUTES",
  );

  if (weeklyMinimumMinutes > weeklyCapMinutes) {
    throw new Error(
      "HEAD_COACH_DEDUCTION_WEEKLY_MINIMUM_EXCEEDS_CAP",
    );
  }

  /*
   * Only work actually performed by this employee counts.
   *
   * CoachClassAttendance service only assigns actualEmployeeId for:
   * - present
   * - substitute
   *
   * We retain the explicit status predicate as a second safety boundary.
   */
  const attendance = await tx.coachClassAttendance.findMany({
    where: {
      actualEmployeeId: employeeId,

      scheduleDate: {
        gte: bounds.start,
        lte: bounds.end,
      },

      status: {
        in: ["present", "substitute"],
      },
    },

    select: {
      scheduleDate: true,
      durationMinutesSnapshot: true,
    },
  });

  const periods: HeadCoachWeeklyPeriodResult[] = [
    {
      period: 1,
      startDay: 1,
      endDay: 7,
      actualMinutes: 0,
      creditedMinutes: 0,
      missingMinutes: 0,
    },
    {
      period: 2,
      startDay: 8,
      endDay: 14,
      actualMinutes: 0,
      creditedMinutes: 0,
      missingMinutes: 0,
    },
    {
      period: 3,
      startDay: 15,
      endDay: 21,
      actualMinutes: 0,
      creditedMinutes: 0,
      missingMinutes: 0,
    },
    {
      period: 4,
      startDay: 22,
      endDay: bounds.lastDay,
      actualMinutes: 0,
      creditedMinutes: 0,
      missingMinutes: 0,
    },
  ];

  for (const row of attendance) {
    if (
      !Number.isSafeInteger(row.durationMinutesSnapshot) ||
      row.durationMinutesSnapshot < 0
    ) {
      throw new Error(
        "HEAD_COACH_DEDUCTION_INVALID_CLASS_DURATION",
      );
    }

    const day = row.scheduleDate.getUTCDate();

    const target =
      day <= 7
        ? periods[0]
        : day <= 14
          ? periods[1]
          : day <= 21
            ? periods[2]
            : periods[3];

    target.actualMinutes += row.durationMinutesSnapshot;
  }

  for (const period of periods) {
    /*
     * Time above the configured weekly cap generates no extra earning.
     * It is retained in actualMinutes for audit/reporting only.
     */
    period.creditedMinutes = Math.min(
      period.actualMinutes,
      weeklyCapMinutes,
    );

    period.missingMinutes = Math.max(
      weeklyMinimumMinutes - period.creditedMinutes,
      0,
    );
  }

  const totalActualMinutes = periods.reduce(
    (sum, period) => sum + period.actualMinutes,
    0,
  );

  const totalCreditedMinutes = periods.reduce(
    (sum, period) => sum + period.creditedMinutes,
    0,
  );

  const totalMissingMinutes = periods.reduce(
    (sum, period) => sum + period.missingMinutes,
    0,
  );

  /*
   * Manager-approved rule:
   *
   * Hour/minute deduction rate derives from:
   *
   * monthly fixed salary / configured monthly base minutes.
   *
   * The monetary rounding occurs ONCE after aggregating all four
   * payroll periods, preventing per-period rounding drift.
   */
  const deductionMinor = roundPositiveRatio(
    BigInt(fixedSalaryMinor) * BigInt(totalMissingMinutes),
    BigInt(monthlyBaseMinutes),
  );

  return {
    employeeId,
    positionId,
    positionPayrollPolicyId: policy.id,

    monthKey: input.monthKey,

    fixedSalaryMinor,

    monthlyBaseMinutes,
    weeklyMinimumMinutes,
    weeklyCapMinutes,

    totalActualMinutes,
    totalCreditedMinutes,
    totalMissingMinutes,

    deductionMinor,
    currency: policy.currency,

    periods,
  };
}
