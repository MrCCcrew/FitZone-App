import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type SavePositionPayrollPolicyInput = {
  positionId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;

  fixedSalaryMinor?: number | null;
  defaultFixedClassMonthlyMinor?: number | null;

  traineeClassCommissionBps?: number | null;
  privateSessionCommissionBps?: number | null;
  coachMembershipCommissionBps?: number | null;

  headCoachMonthlyBaseMinutes?: number | null;
  headCoachWeeklyMinMinutes?: number | null;
  headCoachWeeklyCapMinutes?: number | null;

  currency?: string | null;
  isActive?: boolean;
  notes?: string | null;
  createdById?: string | null;
};

function dateValue(value: string, field: string): Date {
  if (!value?.trim()) {
    throw new Error(`POSITION_PAYROLL_POLICY_${field}_REQUIRED`);
  }

  /*
   * Prisma MySQL @db.Date is a calendar DATE, not an instant.
   *
   * Store the requested YYYY-MM-DD at UTC midnight so Prisma/MySQL
   * preserve the exact calendar date. Using Cairo midnight here would
   * shift the Date object into the previous UTC day before persistence.
   */
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());

  if (!match) {
    throw new Error(`POSITION_PAYROLL_POLICY_INVALID_${field}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`POSITION_PAYROLL_POLICY_INVALID_${field}`);
  }

  return date;
}

function nullableMoney(value: number | null | undefined, field: string) {
  if (value == null) return null;

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`POSITION_PAYROLL_POLICY_INVALID_${field}`);
  }

  return value;
}

function nullableBps(value: number | null | undefined, field: string) {
  if (value == null) return null;

  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error(`POSITION_PAYROLL_POLICY_INVALID_${field}`);
  }

  return value;
}

function nullableMinutes(
  value: number | null | undefined,
  field: string,
) {
  if (value == null) return null;

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`POSITION_PAYROLL_POLICY_INVALID_${field}`);
  }

  return value;
}

function currencyValue(value?: string | null) {
  const currency = (value?.trim() || "EGP").toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("POSITION_PAYROLL_POLICY_INVALID_CURRENCY");
  }

  return currency;
}

export async function savePositionPayrollPolicyTx(
  tx: Tx,
  input: SavePositionPayrollPolicyInput,
) {
  const positionId = input.positionId?.trim();

  if (!positionId) {
    throw new Error("POSITION_PAYROLL_POLICY_POSITION_REQUIRED");
  }

  const effectiveFrom = dateValue(
    input.effectiveFrom,
    "EFFECTIVE_FROM",
  );

  const effectiveTo =
    input.effectiveTo == null || input.effectiveTo.trim() === ""
      ? null
      : dateValue(input.effectiveTo, "EFFECTIVE_TO");

  if (
    effectiveTo &&
    effectiveTo.getTime() < effectiveFrom.getTime()
  ) {
    throw new Error(
      "POSITION_PAYROLL_POLICY_EFFECTIVE_TO_BEFORE_FROM",
    );
  }

  const position = await tx.position.findUnique({
    where: { id: positionId },
    select: {
      id: true,
      code: true,
      isActive: true,
    },
  });

  if (!position) {
    throw new Error("POSITION_PAYROLL_POLICY_POSITION_NOT_FOUND");
  }

  const fixedSalaryMinor = nullableMoney(
    input.fixedSalaryMinor,
    "FIXED_SALARY_MINOR",
  );

  const defaultFixedClassMonthlyMinor = nullableMoney(
    input.defaultFixedClassMonthlyMinor,
    "DEFAULT_FIXED_CLASS_MONTHLY_MINOR",
  );

  const traineeClassCommissionBps = nullableBps(
    input.traineeClassCommissionBps,
    "TRAINEE_CLASS_COMMISSION_BPS",
  );

  const privateSessionCommissionBps = nullableBps(
    input.privateSessionCommissionBps,
    "PRIVATE_SESSION_COMMISSION_BPS",
  );

  const coachMembershipCommissionBps = nullableBps(
    input.coachMembershipCommissionBps,
    "COACH_MEMBERSHIP_COMMISSION_BPS",
  );

  const headCoachMonthlyBaseMinutes = nullableMinutes(
    input.headCoachMonthlyBaseMinutes,
    "HEAD_COACH_MONTHLY_BASE_MINUTES",
  );

  const headCoachWeeklyMinMinutes = nullableMinutes(
    input.headCoachWeeklyMinMinutes,
    "HEAD_COACH_WEEKLY_MIN_MINUTES",
  );

  const headCoachWeeklyCapMinutes = nullableMinutes(
    input.headCoachWeeklyCapMinutes,
    "HEAD_COACH_WEEKLY_CAP_MINUTES",
  );

  const headValues = [
    headCoachMonthlyBaseMinutes,
    headCoachWeeklyMinMinutes,
    headCoachWeeklyCapMinutes,
  ];

  const hasSomeHeadRule = headValues.some((value) => value != null);
  const hasAllHeadRule = headValues.every((value) => value != null);

  if (hasSomeHeadRule && !hasAllHeadRule) {
    throw new Error(
      "POSITION_PAYROLL_POLICY_INCOMPLETE_HEAD_COACH_RULE",
    );
  }

  if (
    hasAllHeadRule &&
    headCoachWeeklyMinMinutes! > headCoachWeeklyCapMinutes!
  ) {
    throw new Error(
      "POSITION_PAYROLL_POLICY_HEAD_MIN_EXCEEDS_CAP",
    );
  }

  /*
   * The special weekly-hours rule belongs only to the official
   * HEAD_COACH_OWNER position.
   *
   * No numeric value is hardcoded here.
   */
  if (hasAllHeadRule && position.code !== "HEAD_COACH_OWNER") {
    throw new Error(
      "POSITION_PAYROLL_POLICY_HEAD_RULE_POSITION_REQUIRED",
    );
  }

  const overlapping =
    await tx.positionPayrollPolicy.findMany({
      where: {
        positionId,
        isActive: true,

        AND: [
          {
            effectiveFrom: {
              lte:
                effectiveTo ??
                new Date(
                  "9999-12-31T00:00:00.000Z",
                ),
            },
          },
          {
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
          },
        ],
      },

      orderBy: {
        effectiveFrom: "asc",
      },

      select: {
        id: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });

  /*
   * Lifecycle rule:
   *
   * A single earlier open-ended policy may be succeeded by a
   * new policy. Close only its date range; never mutate any of
   * its economic values.
   *
   * Everything else remains a hard overlap:
   * - bounded historical overlap
   * - same-start replacement
   * - future/scheduled conflict
   * - ambiguous/multiple overlaps
   */
  const predecessor =
    overlapping.length === 1 &&
    overlapping[0].effectiveTo == null &&
    overlapping[0].effectiveFrom.getTime() <
      effectiveFrom.getTime()
      ? overlapping[0]
      : null;

  if (overlapping.length > 0 && !predecessor) {
    throw new Error(
      "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP",
    );
  }

  if (predecessor) {
    const predecessorEffectiveTo =
      new Date(effectiveFrom.getTime());

    predecessorEffectiveTo.setUTCDate(
      predecessorEffectiveTo.getUTCDate() - 1,
    );

    if (
      predecessorEffectiveTo.getTime() <
      predecessor.effectiveFrom.getTime()
    ) {
      throw new Error(
        "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP",
      );
    }

    await tx.positionPayrollPolicy.update({
      where: {
        id: predecessor.id,
      },

      data: {
        effectiveTo:
          predecessorEffectiveTo,
      },
    });
  }

  return tx.positionPayrollPolicy.create({
    data: {
      positionId,
      effectiveFrom,
      effectiveTo,

      fixedSalaryMinor,
      defaultFixedClassMonthlyMinor,

      traineeClassCommissionBps,
      privateSessionCommissionBps,
      coachMembershipCommissionBps,

      headCoachMonthlyBaseMinutes,
      headCoachWeeklyMinMinutes,
      headCoachWeeklyCapMinutes,

      currency: currencyValue(input.currency),

      isActive: input.isActive ?? true,
      notes: input.notes?.trim() || null,
      createdById: input.createdById?.trim() || null,
    },
  });
}

export async function resolvePositionPayrollPolicyTx(
  tx: Tx,
  positionId: string,
  date: Date,
) {
  return tx.positionPayrollPolicy.findFirst({
    where: {
      positionId,
      isActive: true,
      effectiveFrom: {
        lte: date,
      },
      OR: [
        { effectiveTo: null },
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
