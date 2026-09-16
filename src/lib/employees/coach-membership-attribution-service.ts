import type { Prisma } from "@prisma/client";

import { cairoCalendarDateKey } from "@/lib/fitzone-time";

export type CoachMembershipAttributionSnapshot = {
  trainerIdSnapshot: string;
  trainerNameSnapshot: string;

  employeeIdSnapshot: string;
  employeeCodeSnapshot: string;
  employeeNameSnapshot: string;

  coachCompensationTermIdSnapshot: string | null;

  coachMembershipCommissionSourceSnapshot:
    | "legacy_coach_compensation_term"
    | "position_payroll_policy";

  coachMembershipPositionTermIdSnapshot: string | null;
  coachMembershipPositionIdSnapshot: string | null;
  coachMembershipPositionPayrollPolicyIdSnapshot: string | null;
  coachMembershipCommissionBpsSnapshot: number;
  coachMembershipCurrencySnapshot: string;
};

export type BuildCoachMembershipAttributionInput = {
  membershipId: string;
  trainerId?: string | null;
  purchaseAt: Date;
};

export type CoachMembershipAttributionErrorCode =
  | "MEMBERSHIP_NOT_FOUND"
  | "COACH_NOT_ALLOWED"
  | "COACH_REQUIRED"
  | "TRAINER_NOT_FOUND"
  | "TRAINER_INACTIVE"
  | "TRAINER_EMPLOYEE_LINK_REQUIRED"
  | "EMPLOYEE_INACTIVE"
  | "EMPLOYEE_PAYROLL_DISABLED"
  | "COACH_COMPENSATION_TERM_MISSING"
  | "COACH_MEMBERSHIP_POSITION_TERM_MISSING"
  | "COACH_MEMBERSHIP_POSITION_PAYROLL_POLICY_MISSING"
  | "COACH_MEMBERSHIP_POSITION_PAYROLL_POLICY_AMBIGUOUS"
  | "COACH_MEMBERSHIP_RATE_MISSING";

export class CoachMembershipAttributionError extends Error {
  readonly code: CoachMembershipAttributionErrorCode;

  constructor(code: CoachMembershipAttributionErrorCode, message: string) {
    super(message);
    this.name = "CoachMembershipAttributionError";
    this.code = code;
  }
}

function assertNonEmptyId(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}

function cairoDateAnchor(instant: Date): Date {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new Error("purchaseAt must be a valid Date");
  }

  const key = cairoCalendarDateKey(instant);

  return new Date(`${key}T00:00:00.000Z`);
}

/**
 * Resolve and freeze Coach Membership ownership/economics.
 *
 * IMPORTANT:
 * - Independent from trainer referrals, discount codes and SalesAgent attribution.
 * - Performs NO writes.
 * - Performs NO commission accrual.
 * - Must be called inside the checkout transaction before UserMembership.create().
 * - Returned values are purchase-time immutable snapshots.
 */
export async function buildCoachMembershipAttributionTx(
  tx: Prisma.TransactionClient,
  input: BuildCoachMembershipAttributionInput,
): Promise<CoachMembershipAttributionSnapshot | null> {
  const membershipId = assertNonEmptyId(input.membershipId, "membershipId");

  const membership = await tx.membership.findUnique({
    where: {
      id: membershipId,
    },
    select: {
      id: true,
      coachMembershipEnabled: true,
    },
  });

  if (!membership) {
    throw new CoachMembershipAttributionError(
      "MEMBERSHIP_NOT_FOUND",
      "Membership not found",
    );
  }

  const trainerId =
    typeof input.trainerId === "string" ? input.trainerId.trim() : "";

  if (!membership.coachMembershipEnabled) {
    if (trainerId) {
      throw new CoachMembershipAttributionError(
        "COACH_NOT_ALLOWED",
        "Regular membership must not carry Coach Membership ownership",
      );
    }

    return null;
  }

  if (!trainerId) {
    throw new CoachMembershipAttributionError(
      "COACH_REQUIRED",
      "Coach Membership requires a trainer",
    );
  }

  const trainer = await tx.trainer.findUnique({
    where: {
      id: trainerId,
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      employeeId: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          employmentStatus: true,
          payrollEnabled: true,
        },
      },
    },
  });

  if (!trainer) {
    throw new CoachMembershipAttributionError(
      "TRAINER_NOT_FOUND",
      "Selected trainer does not exist",
    );
  }

  if (!trainer.isActive) {
    throw new CoachMembershipAttributionError(
      "TRAINER_INACTIVE",
      "Selected trainer is inactive",
    );
  }

  if (!trainer.employeeId || !trainer.employee) {
    throw new CoachMembershipAttributionError(
      "TRAINER_EMPLOYEE_LINK_REQUIRED",
      "Selected trainer is not linked to an EmployeeProfile",
    );
  }

  if (trainer.employee.employmentStatus !== "active") {
    throw new CoachMembershipAttributionError(
      "EMPLOYEE_INACTIVE",
      "Selected trainer employee is not active",
    );
  }

  if (!trainer.employee.payrollEnabled) {
    throw new CoachMembershipAttributionError(
      "EMPLOYEE_PAYROLL_DISABLED",
      "Selected trainer employee is excluded from payroll",
    );
  }

  const purchaseDate = cairoDateAnchor(input.purchaseAt);

  const latestStartedPositionTerm =
    await tx.employeePositionTerm.findFirst({
      where: {
        employeeId: trainer.employee.id,

        effectiveFrom: {
          lte: purchaseDate,
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

  let commissionSource:
    | "legacy_coach_compensation_term"
    | "position_payroll_policy";

  let coachCompensationTermIdSnapshot:
    | string
    | null = null;

  let coachMembershipPositionTermIdSnapshot:
    | string
    | null = null;

  let coachMembershipPositionIdSnapshot:
    | string
    | null = null;

  let coachMembershipPositionPayrollPolicyIdSnapshot:
    | string
    | null = null;

  let coachMembershipCommissionBpsSnapshot: number;
  let coachMembershipCurrencySnapshot: string;

  /*
   * Rule 5 compatibility boundary:
   *
   * Before Position History begins:
   *   CoachCompensationTerm remains authoritative.
   *
   * Once Position History begins:
   *   PositionPayrollPolicy is authoritative.
   *   No silent fallback to legacy compensation.
   */
  if (!latestStartedPositionTerm) {
    const term =
      await tx.coachCompensationTerm.findFirst({
        where: {
          employeeId: trainer.employee.id,

          effectiveFrom: {
            lte: purchaseDate,
          },

          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gte: purchaseDate,
              },
            },
          ],
        },

        orderBy: {
          effectiveFrom: "desc",
        },

        select: {
          id: true,
          coachMembershipCommissionBps: true,
          currency: true,
        },
      });

    if (!term) {
      throw new CoachMembershipAttributionError(
        "COACH_COMPENSATION_TERM_MISSING",
        "No effective CoachCompensationTerm exists for the selected trainer",
      );
    }

    commissionSource =
      "legacy_coach_compensation_term";

    coachCompensationTermIdSnapshot =
      term.id;

    coachMembershipCommissionBpsSnapshot =
      term.coachMembershipCommissionBps;

    coachMembershipCurrencySnapshot =
      term.currency;
  } else {
    if (
      latestStartedPositionTerm.effectiveTo &&
      latestStartedPositionTerm.effectiveTo.getTime() <
        purchaseDate.getTime()
    ) {
      throw new CoachMembershipAttributionError(
        "COACH_MEMBERSHIP_POSITION_TERM_MISSING",
        "Position History started but no PositionTerm is effective on purchase date",
      );
    }

    const policies =
      await tx.positionPayrollPolicy.findMany({
        where: {
          positionId:
            latestStartedPositionTerm.positionId,

          effectiveFrom: {
            lte: purchaseDate,
          },

          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gte: purchaseDate,
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
          coachMembershipCommissionBps: true,
          currency: true,
        },
      });

    if (policies.length === 0) {
      throw new CoachMembershipAttributionError(
        "COACH_MEMBERSHIP_POSITION_PAYROLL_POLICY_MISSING",
        "No PositionPayrollPolicy is effective on purchase date",
      );
    }

    if (policies.length > 1) {
      throw new CoachMembershipAttributionError(
        "COACH_MEMBERSHIP_POSITION_PAYROLL_POLICY_AMBIGUOUS",
        "Multiple PositionPayrollPolicies are effective on purchase date",
      );
    }

    const policy = policies[0];

    if (
      policy.coachMembershipCommissionBps ==
      null
    ) {
      throw new CoachMembershipAttributionError(
        "COACH_MEMBERSHIP_RATE_MISSING",
        "PositionPayrollPolicy has no Coach Membership commission rate",
      );
    }

    commissionSource =
      "position_payroll_policy";

    coachMembershipPositionTermIdSnapshot =
      latestStartedPositionTerm.id;

    coachMembershipPositionIdSnapshot =
      latestStartedPositionTerm.positionId;

    coachMembershipPositionPayrollPolicyIdSnapshot =
      policy.id;

    coachMembershipCommissionBpsSnapshot =
      policy.coachMembershipCommissionBps;

    coachMembershipCurrencySnapshot =
      policy.currency;
  }

  return {
    trainerIdSnapshot: trainer.id,
    trainerNameSnapshot: trainer.name,

    employeeIdSnapshot: trainer.employee.id,
    employeeCodeSnapshot: trainer.employee.employeeCode,
    employeeNameSnapshot: trainer.employee.name,

    coachCompensationTermIdSnapshot,

    coachMembershipCommissionSourceSnapshot:
      commissionSource,

    coachMembershipPositionTermIdSnapshot,
    coachMembershipPositionIdSnapshot,
    coachMembershipPositionPayrollPolicyIdSnapshot,

    coachMembershipCommissionBpsSnapshot,
    coachMembershipCurrencySnapshot,
  };
}
