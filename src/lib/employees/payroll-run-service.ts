import type { Prisma } from "@prisma/client";

import { asDbTransactionClient, db } from "@/lib/db";

import {
  calculateHeadCoachWeeklyDeductionTx,
} from "@/lib/employees/head-coach-weekly-deduction-service";

import {
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";

type Tx = Prisma.TransactionClient;

export type PayrollActor = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type PayrollItemInput = {
  sourceType: string;
  sourceId: string;
  direction: "earning" | "deduction";
  amountMinor: number;
  currency: string;
  sourceStatusSnapshot?: string | null;
  labelSnapshot?: string | null;
  metadataSnapshot?: Record<string, unknown> | null;
};

function assertActor(actor: PayrollActor) {
  if (!actor.userId?.trim()) {
    throw new Error("PAYROLL_ACTOR_REQUIRED");
  }
}

function assertMonthKey(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new Error("PAYROLL_INVALID_MONTH");
  }
}

function monthBounds(monthKey: string) {
  assertMonthKey(monthKey);

  const [year, month] = monthKey.split("-").map(Number);

  const startKey = `${year}-${String(month).padStart(2, "0")}-01`;

  const nextKey =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const start = cairoDateStartInstant(startKey);

  const endExclusive = cairoDateStartInstant(nextKey);

  const endInclusive = new Date(endExclusive.getTime() - 1);

  return {
    start,
    endExclusive,
    endInclusive,
  };
}

function mysqlDateMonthBounds(monthKey: string) {
  assertMonthKey(monthKey);

  const [year, month] = monthKey.split("-").map(Number);

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endInclusive: new Date(Date.UTC(year, month, 0)),
  };
}

function assertMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`PAYROLL_INVALID_MINOR:${label}`);
  }
}

async function writeAudit(
  tx: Tx,
  actor: PayrollActor,
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
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      action: input.action,
      targetType: "PayrollRun",
      targetId: input.targetId,
      details: JSON.stringify(input.details),
    },
  });
}

function addCurrency(
  currencies: Set<string>,
  value: string | null | undefined,
) {
  if (value?.trim()) {
    currencies.add(value.trim().toUpperCase());
  }
}

function json(value: Record<string, unknown> | null | undefined) {
  return value ? JSON.stringify(value) : null;
}

async function resolveFullMonthPayrollEligibility(
  tx: Tx,
  employeeId: string,
  monthKey: string,
) {
  const { start, endInclusive } = mysqlDateMonthBounds(monthKey);

  const overlapping = await tx.employeePayrollEligibilityTerm.findMany({
    where: {
      employeeId,
      effectiveFrom: {
        lte: endInclusive,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: start,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "asc",
    },
  });

  if (overlapping.length !== 1) {
    return {
      term: null,
      reason:
        overlapping.length === 0
          ? "MISSING_PAYROLL_ELIGIBILITY_TERM"
          : "MULTIPLE_PAYROLL_ELIGIBILITY_TERMS_IN_MONTH",
    };
  }

  const term = overlapping[0];

  const monthStartKey = `${monthKey}-01`;

  const monthEndKey = cairoCalendarDateKey(endInclusive);

  const termStartKey = cairoCalendarDateKey(term.effectiveFrom);

  const termEndKey = term.effectiveTo
    ? cairoCalendarDateKey(term.effectiveTo)
    : null;

  const startsInTime = termStartKey <= monthStartKey;

  const endsInTime = !termEndKey || termEndKey >= monthEndKey;

  if (!startsInTime || !endsInTime) {
    return {
      term: null,
      reason: "PAYROLL_ELIGIBILITY_TERM_DOES_NOT_COVER_FULL_MONTH",
    };
  }

  return {
    term,
    reason: null,
  };
}

async function resolveFullMonthCompensation(
  tx: Tx,
  employeeId: string,
  monthKey: string,
) {
  const { start, endInclusive } = mysqlDateMonthBounds(monthKey);

  const overlapping = await tx.employeeCompensationTerm.findMany({
    where: {
      employeeId,
      effectiveFrom: {
        lte: endInclusive,
      },
      OR: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            gte: start,
          },
        },
      ],
    },
    orderBy: {
      effectiveFrom: "asc",
    },
  });

  if (overlapping.length !== 1) {
    return {
      term: null,
      reason:
        overlapping.length === 0
          ? "MISSING_COMPENSATION_TERM"
          : "MULTIPLE_COMPENSATION_TERMS_IN_MONTH",
    };
  }

  const term = overlapping[0];

  // EmployeeCompensationTerm uses MySQL DATE semantics.
  // Compare calendar date keys instead of timezone instants.
  const monthStartKey = `${monthKey}-01`;

  const monthEndKey = cairoCalendarDateKey(endInclusive);

  const termStartKey = cairoCalendarDateKey(term.effectiveFrom);

  const termEndKey = term.effectiveTo
    ? cairoCalendarDateKey(term.effectiveTo)
    : null;

  const startsInTime = termStartKey <= monthStartKey;

  const endsInTime = !termEndKey || termEndKey >= monthEndKey;

  if (!startsInTime || !endsInTime) {
    return {
      term: null,
      reason: "COMPENSATION_TERM_DOES_NOT_COVER_FULL_MONTH",
    };
  }

  return {
    term,
    reason: null,
  };
}

async function resolveFullMonthPositionSalary(
  tx: Tx,
  employeeId: string,
  monthKey: string,
) {
  const { start, endInclusive } =
    mysqlDateMonthBounds(monthKey);

  /*
   * Compatibility boundary:
   *
   * If Position History has not started by this payroll month,
   * legacy EmployeeCompensationTerm remains authoritative.
   *
   * Once Position History exists on/before this month,
   * Payroll MUST resolve salary from:
   *
   * EmployeePositionTerm
   *          +
   * PositionPayrollPolicy
   *
   * There is no silent fallback to legacy compensation.
   */
  const firstPositionTerm =
    await tx.employeePositionTerm.findFirst({
      where: {
        employeeId,
        effectiveFrom: {
          lte: endInclusive,
        },
      },
      orderBy: {
        effectiveFrom: "asc",
      },
      select: {
        id: true,
      },
    });

  if (!firstPositionTerm) {
    return {
      mode: "legacy" as const,
      positionTerm: null,
      positionPolicy: null,
      reason: null,
    };
  }

  const positionTerms =
    await tx.employeePositionTerm.findMany({
      where: {
        employeeId,
        effectiveFrom: {
          lte: endInclusive,
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gte: start,
            },
          },
        ],
      },
      include: {
        position: true,
      },
      orderBy: {
        effectiveFrom: "asc",
      },
    });

  if (positionTerms.length !== 1) {
    return {
      mode: "position" as const,
      positionTerm: null,
      positionPolicy: null,
      reason:
        positionTerms.length === 0
          ? "MISSING_POSITION_TERM_FOR_MONTH"
          : "MULTIPLE_POSITION_TERMS_IN_MONTH",
    };
  }

  const positionTerm = positionTerms[0];

  const monthStartKey = `${monthKey}-01`;

  const monthEndKey = [
    String(endInclusive.getUTCFullYear()).padStart(4, "0"),
    String(endInclusive.getUTCMonth() + 1).padStart(2, "0"),
    String(endInclusive.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const positionStartKey = [
    String(positionTerm.effectiveFrom.getUTCFullYear()).padStart(4, "0"),
    String(positionTerm.effectiveFrom.getUTCMonth() + 1).padStart(2, "0"),
    String(positionTerm.effectiveFrom.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const positionEndKey = positionTerm.effectiveTo
    ? [
        String(positionTerm.effectiveTo.getUTCFullYear()).padStart(4, "0"),
        String(positionTerm.effectiveTo.getUTCMonth() + 1).padStart(2, "0"),
        String(positionTerm.effectiveTo.getUTCDate()).padStart(2, "0"),
      ].join("-")
    : null;

  if (
    positionStartKey > monthStartKey ||
    (positionEndKey != null &&
      positionEndKey < monthEndKey)
  ) {
    return {
      mode: "position" as const,
      positionTerm,
      positionPolicy: null,
      reason: "POSITION_TERM_DOES_NOT_COVER_FULL_MONTH",
    };
  }

  /*
   * Historical resolution intentionally uses the effective date range.
   * Do not make historical Payroll depend on a later mutable isActive flip.
   */
  const policies =
    await tx.positionPayrollPolicy.findMany({
      where: {
        positionId: positionTerm.positionId,
        effectiveFrom: {
          lte: endInclusive,
        },
        OR: [
          {
            effectiveTo: null,
          },
          {
            effectiveTo: {
              gte: start,
            },
          },
        ],
      },
      orderBy: {
        effectiveFrom: "asc",
      },
    });

  if (policies.length !== 1) {
    return {
      mode: "position" as const,
      positionTerm,
      positionPolicy: null,
      reason:
        policies.length === 0
          ? "MISSING_POSITION_PAYROLL_POLICY"
          : "MULTIPLE_POSITION_PAYROLL_POLICIES_IN_MONTH",
    };
  }

  const positionPolicy = policies[0];

  const policyStartKey = [
    String(positionPolicy.effectiveFrom.getUTCFullYear()).padStart(4, "0"),
    String(positionPolicy.effectiveFrom.getUTCMonth() + 1).padStart(2, "0"),
    String(positionPolicy.effectiveFrom.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const policyEndKey = positionPolicy.effectiveTo
    ? [
        String(positionPolicy.effectiveTo.getUTCFullYear()).padStart(4, "0"),
        String(positionPolicy.effectiveTo.getUTCMonth() + 1).padStart(2, "0"),
        String(positionPolicy.effectiveTo.getUTCDate()).padStart(2, "0"),
      ].join("-")
    : null;

  if (
    policyStartKey > monthStartKey ||
    (policyEndKey != null &&
      policyEndKey < monthEndKey)
  ) {
    return {
      mode: "position" as const,
      positionTerm,
      positionPolicy,
      reason:
        "POSITION_PAYROLL_POLICY_DOES_NOT_COVER_FULL_MONTH",
    };
  }

  if (positionPolicy.fixedSalaryMinor == null) {
    return {
      mode: "position" as const,
      positionTerm,
      positionPolicy,
      reason:
        "POSITION_PAYROLL_POLICY_FIXED_SALARY_REQUIRED",
    };
  }

  assertMinor(
    positionPolicy.fixedSalaryMinor,
    "position_fixed_salary",
  );

  return {
    mode: "position" as const,
    positionTerm,
    positionPolicy,
    reason: null,
  };
}

async function collectEmployeePayroll(
  tx: Tx,
  employee: {
    id: string;
    userId: string | null;
    employeeCode: string;
    name: string;
    hireDate: Date | null;
    employmentEndDate: Date | null;
  },
  monthKey: string,
) {
  const salarySource =
    await resolveFullMonthPositionSalary(
      tx,
      employee.id,
      monthKey,
    );

  let salarySourceSnapshot:
    | "legacy_compensation_term"
    | "position_payroll_policy";

  let compensationTermId: string | null = null;
  let positionTermId: string | null = null;
  let positionId: string | null = null;
  let positionCode: string | null = null;
  let positionPayrollPolicyId: string | null = null;

  let fixedSalaryMinor = 0;
  let salaryCurrency = "EGP";

  let fixedSalarySourceId = "";
  let fixedSalarySourceStatus = "";

  let fixedSalaryMetadata:
    Record<string, unknown> = {};

  if (salarySource.mode === "legacy") {
    const compensation =
      await resolveFullMonthCompensation(
        tx,
        employee.id,
        monthKey,
      );

    if (!compensation.term) {
      return {
        blocked: true as const,
        blockReason: compensation.reason,
        currency: "EGP",

        salarySourceSnapshot: null,
        compensationTermId: null,
        positionTermId: null,
        positionId: null,
        positionPayrollPolicyId: null,

        fixedSalaryMinor: 0,
        items: [] as PayrollItemInput[],
      };
    }

    const term = compensation.term;

    salarySourceSnapshot =
      "legacy_compensation_term";

    compensationTermId = term.id;

    fixedSalaryMinor =
      term.fixedSalaryMinor;

    salaryCurrency =
      term.currency;

    fixedSalarySourceId =
      term.id;

    fixedSalarySourceStatus =
      "effective_term";

    fixedSalaryMetadata = {
      salarySource: salarySourceSnapshot,
      compensationTermId: term.id,
      effectiveFrom:
        cairoCalendarDateKey(
          term.effectiveFrom,
        ),
      effectiveTo:
        term.effectiveTo
          ? cairoCalendarDateKey(
              term.effectiveTo,
            )
          : null,
    };
  } else {
    if (
      salarySource.reason ||
      !salarySource.positionTerm ||
      !salarySource.positionPolicy
    ) {
      return {
        blocked: true as const,

        blockReason:
          salarySource.reason ??
          "POSITION_SALARY_SOURCE_UNRESOLVED",

        currency:
          salarySource.positionPolicy?.currency ??
          "EGP",

        salarySourceSnapshot:
          "position_payroll_policy" as const,

        compensationTermId: null,

        positionTermId:
          salarySource.positionTerm?.id ??
          null,

        positionId:
          salarySource.positionTerm?.positionId ??
          null,

        positionPayrollPolicyId:
          salarySource.positionPolicy?.id ??
          null,

        fixedSalaryMinor: 0,
        items: [] as PayrollItemInput[],
      };
    }

    const positionTerm =
      salarySource.positionTerm;

    const policy =
      salarySource.positionPolicy;

    if (policy.fixedSalaryMinor == null) {
      throw new Error(
        "POSITION_PAYROLL_POLICY_FIXED_SALARY_REQUIRED_UNEXPECTED",
      );
    }

    salarySourceSnapshot =
      "position_payroll_policy";

    positionTermId =
      positionTerm.id;

    positionId =
      positionTerm.positionId;

    positionCode =
      positionTerm.position.code;

    positionPayrollPolicyId =
      policy.id;

    fixedSalaryMinor =
      policy.fixedSalaryMinor;

    salaryCurrency =
      policy.currency;

    fixedSalarySourceId =
      policy.id;

    fixedSalarySourceStatus =
      "effective_position_policy";

    fixedSalaryMetadata = {
      salarySource:
        salarySourceSnapshot,

      positionTermId:
        positionTerm.id,

      positionId:
        positionTerm.positionId,

      positionCode:
        positionTerm.position.code,

      positionName:
        positionTerm.position.name,

      positionPayrollPolicyId:
        policy.id,

      positionTermEffectiveFrom:
        positionTerm.effectiveFrom
          .toISOString()
          .slice(0, 10),

      positionTermEffectiveTo:
        positionTerm.effectiveTo
          ? positionTerm.effectiveTo
              .toISOString()
              .slice(0, 10)
          : null,

      policyEffectiveFrom:
        policy.effectiveFrom
          .toISOString()
          .slice(0, 10),

      policyEffectiveTo:
        policy.effectiveTo
          ? policy.effectiveTo
              .toISOString()
              .slice(0, 10)
          : null,
    };
  }

  const { start, endExclusive, endInclusive } =
    monthBounds(monthKey);

  const monthStartKey = cairoCalendarDateKey(start);

  const monthEndKey = cairoCalendarDateKey(endInclusive);

  const hireDateKey = employee.hireDate
    ? cairoCalendarDateKey(employee.hireDate)
    : null;

  const employmentEndDateKey = employee.employmentEndDate
    ? cairoCalendarDateKey(employee.employmentEndDate)
    : null;

  const partialEmploymentMonth =
    Boolean(hireDateKey && hireDateKey > monthStartKey) ||
    Boolean(employmentEndDateKey && employmentEndDateKey < monthEndKey);

  if (partialEmploymentMonth) {
    return {
      blocked: true as const,

      blockReason:
        "PARTIAL_EMPLOYMENT_MONTH_REQUIRES_PRORATION_POLICY",

      currency: salaryCurrency,

      salarySourceSnapshot,
      compensationTermId,
      positionTermId,
      positionId,
      positionPayrollPolicyId,

      fixedSalaryMinor: 0,
      items: [] as PayrollItemInput[],
    };
  }

  assertMinor(
    fixedSalaryMinor,
    "fixed_salary",
  );

  const currencies = new Set<string>();

  addCurrency(
    currencies,
    salaryCurrency,
  );

  const items: PayrollItemInput[] = [];

  items.push({
    sourceType: "fixed_salary",
    sourceId: fixedSalarySourceId,
    direction: "earning",
    amountMinor: fixedSalaryMinor,
    currency: salaryCurrency,
    sourceStatusSnapshot:
      fixedSalarySourceStatus,
    labelSnapshot: "Fixed Salary",
    metadataSnapshot:
      fixedSalaryMetadata,
  });

  const [
    fixedClass,
    traineeClass,
    coachMembership,
    privateSession,
    staffReferral,
    attendanceDeduction,
    adjustments,
    loanInstallments,
  ] = await Promise.all([
    tx.fixedClassEarning.findMany({
      where: {
        employeeId: employee.id,
        monthKey,
        status: "finalized",
      },
    }),

    tx.traineeClassEarning.findMany({
      where: {
        actualEmployeeId: employee.id,
        monthKey,
        status: "finalized",
      },
    }),

    tx.coachMembershipEarning.findMany({
      where: {
        employeeIdSnapshot: employee.id,
        monthKey,
        status: "finalized",
      },
    }),

    tx.privateSessionEarning.findMany({
      where: {
        employeeIdSnapshot: employee.id,
        monthKey,
        status: "finalized",
      },
    }),

    employee.userId
      ? tx.staffCommission.findMany({
          where: {
            staffUserId: employee.userId,
            status: "earned",
            settlementOwnerType: null,
            settlementOwnerId: null,
            earnedAt: {
              gte: start,
              lt: endExclusive,
            },
          },
          orderBy: [{ earnedAt: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),

    tx.attendanceDeduction.findMany({
      where: {
        employeeId: employee.id,
        monthKey,
        status: "finalized",
      },
    }),

    tx.payrollAdjustment.findMany({
      where: {
        employeeId: employee.id,
        monthKey,
        status: "approved",
      },
    }),

    tx.employeeLoanInstallment.findMany({
      where: {
        monthKey,
        status: "approved",
        loan: {
          employeeId: employee.id,
          status: "active",
        },
      },
      include: {
        loan: true,
      },
    }),
  ]);

  for (const row of fixedClass) {
    assertMinor(row.earnedAmountMinor, "fixed_class");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "fixed_class",
      sourceId: row.id,
      direction: "earning",
      amountMinor: row.earnedAmountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Fixed Class Earning",
      metadataSnapshot: {
        classId: row.classId,
      },
    });
  }

  for (const row of traineeClass) {
    assertMinor(row.commissionAmountMinor, "trainee_class");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "trainee_class",
      sourceId: row.id,
      direction: "earning",
      amountMinor: row.commissionAmountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Trainee Class Earning",
      metadataSnapshot: {
        attendanceCheckInId: row.attendanceCheckInId,
      },
    });
  }

  for (const row of coachMembership) {
    assertMinor(row.commissionAmountMinor, "coach_membership");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "coach_membership",
      sourceId: row.id,
      direction: "earning",
      amountMinor: row.commissionAmountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Coach Membership Earning",
      metadataSnapshot: {
        userMembershipId: row.userMembershipId,
      },
    });
  }

  for (const row of privateSession) {
    assertMinor(row.commissionAmountMinor, "private_session");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "private_session",
      sourceId: row.id,
      direction: "earning",
      amountMinor: row.commissionAmountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Private Session Earning",
      metadataSnapshot: {
        privateSessionApplicationId: row.privateSessionApplicationId,
      },
    });
  }

  for (const row of staffReferral) {
    /*
     * New policy rows carry an immutable minor-unit snapshot.
     * Legacy rows may predate that field, so their frozen StaffCommission.amount
     * remains the authoritative historical amount.
     */
    const amountMinor =
      row.commissionAmountMinorSnapshot != null
        ? row.commissionAmountMinorSnapshot
        : Math.round(Number(row.amount) * 100);

    assertMinor(amountMinor, "staff_referral");

    addCurrency(currencies, "EGP");

    items.push({
      sourceType: "staff_referral",
      sourceId: row.id,
      direction: "earning",
      amountMinor,
      currency: "EGP",
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Referral Commission",
      metadataSnapshot: {
        staffUserId: row.staffUserId,
        staffReferralLinkId: row.staffReferralLinkId,
        userMembershipId: row.userMembershipId,
        earnedAt: row.earnedAt?.toISOString() ?? null,
        customerClassification:
          row.customerClassificationSnapshot,
        previousMembershipEndDate:
          row.previousMembershipEndDateSnapshot?.toISOString() ?? null,
        gapDays: row.gapDaysSnapshot,
        referralPolicyId: row.referralPolicyIdSnapshot,
        positionId: row.positionIdSnapshot,
        positionCode: row.positionCodeSnapshot,
        commissionRateBps: row.commissionRateBpsSnapshot,
        commissionBaseMinor: row.commissionBaseMinorSnapshot,
        commissionAmountMinor: amountMinor,
      },
    });
  }

  for (const row of attendanceDeduction) {
    assertMinor(row.totalDeductionMinor, "attendance_deduction");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "attendance_deduction",
      sourceId: row.id,
      direction: "deduction",
      amountMinor: row.totalDeductionMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: "Attendance Deduction",
      metadataSnapshot: {
        absenceDeductionMinor: row.absenceDeductionMinor,
        lateDeductionMinor: row.lateDeductionMinor,
      },
    });
  }

  for (const row of adjustments) {
    assertMinor(row.amountMinor, "payroll_adjustment");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "payroll_adjustment",
      sourceId: row.id,
      direction: row.direction === "earning" ? "earning" : "deduction",
      amountMinor: row.amountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: row.reason,
      metadataSnapshot: {
        sourceType: row.sourceType,
        sourceRefId: row.sourceRefId,
      },
    });
  }

  for (const row of loanInstallments) {
    assertMinor(row.amountMinor, "loan_installment");

    addCurrency(currencies, row.currency);

    items.push({
      sourceType: "loan_installment",
      sourceId: row.id,
      direction: "deduction",
      amountMinor: row.amountMinor,
      currency: row.currency,
      sourceStatusSnapshot: row.status,
      labelSnapshot: row.loan.reason,
      metadataSnapshot: {
        loanId: row.loanId,
      },
    });
  }

  /*
   * C07 Head Coach fixed-salary hours deduction.
   *
   * Critical invariant:
   * use the exact Position policy and fixed salary already selected by
   * C10. C07 is not allowed to independently select another Payroll policy.
   */
  if (
    salarySourceSnapshot ===
      "position_payroll_policy" &&
    positionCode === "HEAD_COACH_OWNER"
  ) {
    if (
      !positionId ||
      !positionPayrollPolicyId
    ) {
      throw new Error(
        "HEAD_COACH_PAYROLL_SNAPSHOT_REQUIRED",
      );
    }

    const headCoachDeduction =
      await calculateHeadCoachWeeklyDeductionTx(
        tx,
        {
          employeeId: employee.id,
          positionId,
          monthKey,

          expectedPositionPayrollPolicyId:
            positionPayrollPolicyId,

          expectedFixedSalaryMinor:
            fixedSalaryMinor,
        },
      );

    if (
      headCoachDeduction.positionPayrollPolicyId !==
      positionPayrollPolicyId
    ) {
      throw new Error(
        "HEAD_COACH_PAYROLL_POLICY_SNAPSHOT_MISMATCH",
      );
    }

    if (
      headCoachDeduction.fixedSalaryMinor !==
      fixedSalaryMinor
    ) {
      throw new Error(
        "HEAD_COACH_PAYROLL_FIXED_SALARY_MISMATCH",
      );
    }

    addCurrency(
      currencies,
      headCoachDeduction.currency,
    );

    items.push({
      sourceType:
        "head_coach_hours_deduction",

      sourceId:
        headCoachDeduction
          .positionPayrollPolicyId,

      direction:
        "deduction",

      amountMinor:
        headCoachDeduction.deductionMinor,

      currency:
        headCoachDeduction.currency,

      sourceStatusSnapshot:
        "calculated",

      labelSnapshot:
        "Head Coach Hours Deduction",

      metadataSnapshot: {
        employeeId:
          headCoachDeduction.employeeId,

        positionId:
          headCoachDeduction.positionId,

        positionPayrollPolicyId:
          headCoachDeduction
            .positionPayrollPolicyId,

        monthKey:
          headCoachDeduction.monthKey,

        fixedSalaryMinor:
          headCoachDeduction
            .fixedSalaryMinor,

        monthlyBaseMinutes:
          headCoachDeduction
            .monthlyBaseMinutes,

        weeklyMinimumMinutes:
          headCoachDeduction
            .weeklyMinimumMinutes,

        weeklyCapMinutes:
          headCoachDeduction
            .weeklyCapMinutes,

        totalActualMinutes:
          headCoachDeduction
            .totalActualMinutes,

        totalCreditedMinutes:
          headCoachDeduction
            .totalCreditedMinutes,

        totalMissingMinutes:
          headCoachDeduction
            .totalMissingMinutes,

        deductionMinor:
          headCoachDeduction
            .deductionMinor,

        periods:
          headCoachDeduction.periods,
      },
    });
  }

  if (currencies.size !== 1) {
    return {
      blocked: true as const,
      blockReason: "MULTIPLE_CURRENCIES",
      currency: salaryCurrency,

      salarySourceSnapshot,
      compensationTermId,
      positionTermId,
      positionId,
      positionPayrollPolicyId,

      fixedSalaryMinor,
      items: [] as PayrollItemInput[],
    };
  }

  const currency = [...currencies][0];

  return {
    blocked: false as const,
    blockReason: null,
    currency,

    salarySourceSnapshot,
    compensationTermId,
    positionTermId,
    positionId,
    positionPayrollPolicyId,

    fixedSalaryMinor,
    items,
  };
}

function sum(
  items: PayrollItemInput[],
  predicate: (item: PayrollItemInput) => boolean,
) {
  return items
    .filter(predicate)
    .reduce((total, item) => total + item.amountMinor, 0);
}

export async function calculatePayrollRun(
  monthKey: string,
  actor: PayrollActor,
) {
  assertActor(actor);
  assertMonthKey(monthKey);

  const { start: employmentMonthStart, endInclusive: employmentMonthEnd } =
    mysqlDateMonthBounds(monthKey);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const locked = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
      }>
    >`
          SELECT id, status
          FROM PayrollRun
          WHERE monthKey = ${monthKey}
          FOR UPDATE
        `;

    if (locked[0]?.status === "finalized") {
      throw new Error("PAYROLL_RUN_FINALIZED_IMMUTABLE");
    }

    const existing = locked[0]
      ? await tx.payrollRun.findUniqueOrThrow({
          where: {
            id: locked[0].id,
          },
        })
      : null;

    const run = existing
      ? await tx.payrollRun.update({
          where: {
            id: existing.id,
          },
          data: {
            status: "draft",
            employeeCount: 0,
            blockedEmployeeCount: 0,
            totalGrossEarningsMinor: 0,
            totalDeductionsMinor: 0,
            totalNetPayMinor: 0,
            calculatedAt: null,
            calculatedById: null,
          },
        })
      : await tx.payrollRun.create({
          data: {
            monthKey,
            status: "draft",
            createdById: actor.userId,
          },
        });

    await tx.payrollRunItem.deleteMany({
      where: {
        payrollRunEmployee: {
          payrollRunId: run.id,
        },
      },
    });

    await tx.payrollRunEmployee.deleteMany({
      where: {
        payrollRunId: run.id,
      },
    });

    const employees = await tx.employeeProfile.findMany({
      where: {
        AND: [
          {
            OR: [
              {
                hireDate: null,
              },
              {
                hireDate: {
                  lte: employmentMonthEnd,
                },
              },
            ],
          },
          {
            OR: [
              {
                employmentEndDate: null,
              },
              {
                employmentEndDate: {
                  gte: employmentMonthStart,
                },
              },
            ],
          },
        ],
      },
      orderBy: {
        employeeCode: "asc",
      },
      select: {
        id: true,
        userId: true,
        employeeCode: true,
        name: true,
        hireDate: true,
        employmentEndDate: true,
      },
    });

    let payrollEmployeeCount = 0;

    let blockedEmployeeCount = 0;

    let runGross = 0;
    let runDeductions = 0;
    let runNet = 0;

    const runCurrencies = new Set<string>();

    for (const employee of employees) {
      const eligibility = await resolveFullMonthPayrollEligibility(
        tx,
        employee.id,
        monthKey,
      );

      if (!eligibility.term) {
        payrollEmployeeCount += 1;
        blockedEmployeeCount += 1;

        await tx.payrollRunEmployee.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,

            employeeCodeSnapshot: employee.employeeCode,

            employeeNameSnapshot: employee.name,

            status: "blocked",

            blockReason: eligibility.reason,

            currency: "EGP",

            salarySourceSnapshot: null,

            compensationTermIdSnapshot: null,
            positionTermIdSnapshot: null,
            positionIdSnapshot: null,
            positionPayrollPolicyIdSnapshot: null,

            fixedSalaryMinor: 0,
          },
        });

        continue;
      }

      if (!eligibility.term.enabled) {
        continue;
      }

      payrollEmployeeCount += 1;

      const result = await collectEmployeePayroll(tx, employee, monthKey);

      if (result.blocked) {
        blockedEmployeeCount += 1;

        await tx.payrollRunEmployee.create({
          data: {
            payrollRunId: run.id,
            employeeId: employee.id,

            employeeCodeSnapshot: employee.employeeCode,
            employeeNameSnapshot: employee.name,

            status: "blocked",
            blockReason: result.blockReason,

            currency: result.currency,

            salarySourceSnapshot:
              result.salarySourceSnapshot,

            compensationTermIdSnapshot:
              result.compensationTermId,

            positionTermIdSnapshot:
              result.positionTermId,

            positionIdSnapshot:
              result.positionId,

            positionPayrollPolicyIdSnapshot:
              result.positionPayrollPolicyId,

            fixedSalaryMinor:
              result.fixedSalaryMinor,
          },
        });

        continue;
      }

      addCurrency(runCurrencies, result.currency);

      const fixedClassMinor = sum(
        result.items,
        (item) => item.sourceType === "fixed_class",
      );

      const traineeClassMinor = sum(
        result.items,
        (item) => item.sourceType === "trainee_class",
      );

      const coachMembershipMinor = sum(
        result.items,
        (item) => item.sourceType === "coach_membership",
      );

      const privateSessionMinor = sum(
        result.items,
        (item) => item.sourceType === "private_session",
      );

      const referralCommissionMinor = sum(
        result.items,
        (item) => item.sourceType === "staff_referral",
      );

      const adjustmentEarningMinor = sum(
        result.items,
        (item) =>
          item.sourceType === "payroll_adjustment" &&
          item.direction === "earning",
      );

      const attendanceDeductionMinor = sum(
        result.items,
        (item) => item.sourceType === "attendance_deduction",
      );

      const headCoachHoursDeductionMinor = sum(
        result.items,
        (item) =>
          item.sourceType ===
          "head_coach_hours_deduction",
      );

      const loanDeductionMinor = sum(
        result.items,
        (item) => item.sourceType === "loan_installment",
      );

      const adjustmentDeductionMinor = sum(
        result.items,
        (item) =>
          item.sourceType === "payroll_adjustment" &&
          item.direction === "deduction",
      );

      const gross =
        result.fixedSalaryMinor +
        fixedClassMinor +
        traineeClassMinor +
        coachMembershipMinor +
        privateSessionMinor +
        referralCommissionMinor +
        adjustmentEarningMinor;

      const deductions =
        attendanceDeductionMinor +
        headCoachHoursDeductionMinor +
        loanDeductionMinor +
        adjustmentDeductionMinor;

      const net = gross - deductions;

      const negativeNetBlocked = net < 0;

      if (negativeNetBlocked) {
        blockedEmployeeCount += 1;
      }

      const employeeRun = await tx.payrollRunEmployee.create({
        data: {
          payrollRunId: run.id,
          employeeId: employee.id,

          employeeCodeSnapshot: employee.employeeCode,
          employeeNameSnapshot: employee.name,

          status: negativeNetBlocked ? "blocked" : "calculated",

          blockReason: negativeNetBlocked
            ? "NEGATIVE_NET_PAY_REQUIRES_POLICY"
            : null,

          currency: result.currency,

          salarySourceSnapshot:
            result.salarySourceSnapshot,

          compensationTermIdSnapshot:
            result.compensationTermId,

          positionTermIdSnapshot:
            result.positionTermId,

          positionIdSnapshot:
            result.positionId,

          positionPayrollPolicyIdSnapshot:
            result.positionPayrollPolicyId,

          fixedSalaryMinor:
            result.fixedSalaryMinor,

          fixedClassEarningMinor: fixedClassMinor,

          traineeClassEarningMinor: traineeClassMinor,

          coachMembershipEarningMinor: coachMembershipMinor,

          privateSessionEarningMinor: privateSessionMinor,

          referralCommissionEarningMinor: referralCommissionMinor,

          adjustmentEarningMinor,

          grossEarningsMinor: gross,

          attendanceDeductionMinor,

          headCoachHoursDeductionMinor,

          loanDeductionMinor,

          adjustmentDeductionMinor,

          totalDeductionsMinor: deductions,

          netPayMinor: net,
        },
      });

      if (result.items.length > 0) {
        await tx.payrollRunItem.createMany({
          data: result.items.map((item) => ({
            payrollRunEmployeeId: employeeRun.id,
            sourceType: item.sourceType,
            sourceId: item.sourceId,
            direction: item.direction,
            amountMinor: item.amountMinor,
            currency: item.currency,
            sourceStatusSnapshot: item.sourceStatusSnapshot ?? null,
            labelSnapshot: item.labelSnapshot ?? null,
            metadataSnapshot: json(item.metadataSnapshot),
          })),
        });
      }

      runGross += gross;
      runDeductions += deductions;
      runNet += net;
    }

    let status = blockedEmployeeCount > 0 ? "blocked" : "calculated";

    if (runCurrencies.size > 1) {
      status = "blocked";
    }

    const currency = runCurrencies.size === 1 ? [...runCurrencies][0] : "EGP";

    const calculated = await tx.payrollRun.update({
      where: {
        id: run.id,
      },
      data: {
        status,
        currency,

        employeeCount: payrollEmployeeCount,

        blockedEmployeeCount:
          blockedEmployeeCount + (runCurrencies.size > 1 ? 1 : 0),

        totalGrossEarningsMinor: runGross,

        totalDeductionsMinor: runDeductions,

        totalNetPayMinor: runNet,

        calculatedAt: new Date(),

        calculatedById: actor.userId,
      },
      include: {
        employees: {
          include: {
            items: true,
          },
          orderBy: {
            employeeCodeSnapshot: "asc",
          },
        },
      },
    });

    await writeAudit(tx, actor, {
      action: "payroll_run_calculate",
      targetId: calculated.id,
      details: {
        monthKey,
        employeeCount: calculated.employeeCount,
        blockedEmployeeCount: calculated.blockedEmployeeCount,
        totalGrossEarningsMinor: calculated.totalGrossEarningsMinor,
        totalDeductionsMinor: calculated.totalDeductionsMinor,
        totalNetPayMinor: calculated.totalNetPayMinor,
        status: calculated.status,
      },
    });

    return calculated;
  });
}

export async function finalizePayrollRun(
  monthKey: string,
  actor: PayrollActor,
) {
  assertActor(actor);
  assertMonthKey(monthKey);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        blockedEmployeeCount: number;
      }>
    >`
          SELECT
            id,
            status,
            blockedEmployeeCount
          FROM PayrollRun
          WHERE monthKey = ${monthKey}
          FOR UPDATE
        `;

    const row = rows[0];

    if (!row) {
      throw new Error("PAYROLL_RUN_NOT_FOUND");
    }

    if (row.status === "finalized") {
      return tx.payrollRun.findUniqueOrThrow({
        where: {
          id: row.id,
        },
        include: {
          employees: {
            include: {
              items: true,
            },
          },
        },
      });
    }

    if (row.status !== "calculated" || row.blockedEmployeeCount !== 0) {
      throw new Error("PAYROLL_RUN_NOT_FINALIZABLE");
    }

    const employeeRows = await tx.payrollRunEmployee.findMany({
      where: {
        payrollRunId: row.id,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (employeeRows.some((employee) => employee.status !== "calculated")) {
      throw new Error("PAYROLL_RUN_HAS_BLOCKED_EMPLOYEE");
    }

    // Payroll may apply only the exact owned sources captured by the
    // latest Calculate snapshot. Any source-set change requires Recalculate.
    const sourceItems = await tx.payrollRunItem.findMany({
      where: {
        payrollRunEmployee: {
          payrollRunId: row.id,
        },
        sourceType: {
          in: [
            "payroll_adjustment",
            "loan_installment",
            "staff_referral",
          ],
        },
      },
      select: {
        sourceType: true,
        sourceId: true,
      },
    });

    const payrollEmployeeIds = employeeRows.map((employee) => employee.id);

    const payrollEmployees = await tx.payrollRunEmployee.findMany({
      where: {
        id: {
          in: payrollEmployeeIds,
        },
      },
      select: {
        employeeId: true,
      },
    });

    const employeeIds = payrollEmployees.map((employee) => employee.employeeId);

    const adjustmentSnapshotIds = sourceItems
      .filter((item) => item.sourceType === "payroll_adjustment")
      .map((item) => item.sourceId)
      .sort();

    const loanSnapshotIds = sourceItems
      .filter((item) => item.sourceType === "loan_installment")
      .map((item) => item.sourceId)
      .sort();

    const staffReferralSnapshotIds = sourceItems
      .filter((item) => item.sourceType === "staff_referral")
      .map((item) => item.sourceId)
      .sort();

    const payrollEmployeeProfiles = await tx.employeeProfile.findMany({
      where: {
        id: {
          in: employeeIds,
        },
      },
      select: {
        userId: true,
      },
    });

    const payrollStaffUserIds = payrollEmployeeProfiles
      .map((employee) => employee.userId)
      .filter((userId): userId is string => Boolean(userId));

    const { start: referralMonthStart, endExclusive: referralMonthEnd } =
      monthBounds(monthKey);

    const [
      currentAdjustments,
      currentLoanInstallments,
    ] = await Promise.all([
      tx.payrollAdjustment.findMany({
        where: {
          employeeId: {
            in: employeeIds,
          },
          monthKey,
          status: "approved",
          payrollRunId: null,
        },
        select: {
          id: true,
        },
      }),

      tx.employeeLoanInstallment.findMany({
        where: {
          monthKey,
          status: "approved",
          payrollRunId: null,
          loan: {
            employeeId: {
              in: employeeIds,
            },
            status: "active",
          },
        },
        select: {
          id: true,
        },
      }),
    ]);

    const currentAdjustmentIds = currentAdjustments
      .map((item) => item.id)
      .sort();

    const currentLoanIds = currentLoanInstallments
      .map((item) => item.id)
      .sort();

    /*
     * Lock the complete open StaffCommission month-range, not only the
     * Calculate snapshot IDs.
     *
     * With the (staffUserId,status,earnedAt) index this is the serialization
     * boundary for open referral commissions belonging to this payroll month.
     * It prevents a qualifying commission from appearing between the
     * source-set check and final payroll ownership claim.
     */
    const currentStaffReferralIds: string[] = [];

    for (const staffUserId of [...payrollStaffUserIds].sort()) {
      const lockedMonthRows =
        await tx.$queryRaw<
          Array<{
            id: string;
          }>
        >`
          SELECT id
          FROM StaffCommission
          WHERE staffUserId = ${staffUserId}
            AND status = 'earned'
            AND settlementOwnerType IS NULL
            AND settlementOwnerId IS NULL
            AND earnedAt >= ${referralMonthStart}
            AND earnedAt < ${referralMonthEnd}
          ORDER BY earnedAt, id
          FOR UPDATE
        `;

      currentStaffReferralIds.push(
        ...lockedMonthRows.map((item) => item.id),
      );
    }

    currentStaffReferralIds.sort();

    const sameIds = (left: string[], right: string[]) =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]);

    if (
      !sameIds(adjustmentSnapshotIds, currentAdjustmentIds) ||
      !sameIds(loanSnapshotIds, currentLoanIds) ||
      !sameIds(staffReferralSnapshotIds, currentStaffReferralIds)
    ) {
      throw new Error("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");
    }

    const appliedAt = new Date();

    /*
     * Staff referral rows are already range-locked above.
     * Snapshot mismatch fails before any ownership mutation.
     */

    if (adjustmentSnapshotIds.length > 0) {
      const adjustmentUpdate = await tx.payrollAdjustment.updateMany({
        where: {
          id: {
            in: adjustmentSnapshotIds,
          },
          status: "approved",
          payrollRunId: null,
        },
        data: {
          status: "applied",
          payrollRunId: row.id,
          appliedAt,
        },
      });

      if (adjustmentUpdate.count !== adjustmentSnapshotIds.length) {
        throw new Error("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");
      }
    }

    if (loanSnapshotIds.length > 0) {
      const loanUpdate = await tx.employeeLoanInstallment.updateMany({
        where: {
          id: {
            in: loanSnapshotIds,
          },
          status: "approved",
          payrollRunId: null,
          loan: {
            status: "active",
          },
        },
        data: {
          status: "applied",
          payrollRunId: row.id,
          appliedAt,
        },
      });

      if (loanUpdate.count !== loanSnapshotIds.length) {
        throw new Error("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");
      }
    }

    if (staffReferralSnapshotIds.length > 0) {
      const staffReferralUpdate = await tx.staffCommission.updateMany({
        where: {
          id: {
            in: staffReferralSnapshotIds,
          },
          status: "earned",
          settlementOwnerType: null,
          settlementOwnerId: null,
        },
        data: {
          status: "settled",
          settledAt: appliedAt,
          settlementOwnerType: "payroll",
          settlementOwnerId: row.id,
        },
      });

      if (
        staffReferralUpdate.count !==
        staffReferralSnapshotIds.length
      ) {
        throw new Error("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");
      }
    }

    const finalized = await tx.payrollRun.update({
      where: {
        id: row.id,
      },
      data: {
        status: "finalized",
        finalizedAt: new Date(),
        finalizedById: actor.userId,
      },
      include: {
        employees: {
          include: {
            items: true,
          },
        },
      },
    });

    await writeAudit(tx, actor, {
      action: "payroll_run_finalize",
      targetId: finalized.id,
      details: {
        monthKey,
        employeeCount: finalized.employeeCount,
        totalGrossEarningsMinor: finalized.totalGrossEarningsMinor,
        totalDeductionsMinor: finalized.totalDeductionsMinor,
        totalNetPayMinor: finalized.totalNetPayMinor,
      },
    });

    return finalized;
  });
}
