import "server-only";

import type { CoachMembershipEarning, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { cairoCalendarDateKey } from "@/lib/fitzone-time";

export type CoachMembershipEarningActor = {
  userId: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

export type CoachMembershipEconomicConsideration = {
  externalPaidAmount?: number;
  walletAmount?: number;
  pointsAmount?: number;
};

type CoachMembershipEarningTx = Prisma.TransactionClient;

function assertActor(actor: CoachMembershipEarningActor) {
  if (!actor.userId?.trim() || !actor.name?.trim()) {
    throw new Error("COACH_MEMBERSHIP_EARNING_ACTOR_REQUIRED");
  }
}

function toMinor(amount: number | null | undefined, field: string): number {
  const normalized = Number(amount ?? 0);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`COACH_MEMBERSHIP_EARNING_INVALID_${field}`);
  }

  const minor = Math.round(normalized * 100);

  if (!Number.isSafeInteger(minor)) {
    throw new Error(`COACH_MEMBERSHIP_EARNING_UNSAFE_${field}`);
  }

  return minor;
}

function commissionMinor(baseMinor: number, rateBps: number): number {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10_000) {
    throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_RATE");
  }

  const value = (baseMinor * rateBps) / 10_000;

  if (!Number.isFinite(value)) {
    throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_COMMISSION");
  }

  const rounded = Math.round(value);

  if (!Number.isSafeInteger(rounded)) {
    throw new Error("COACH_MEMBERSHIP_EARNING_UNSAFE_COMMISSION");
  }

  return rounded;
}

function monthKeyForInstant(instant: Date): string {
  if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
    throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_FINALIZED_AT");
  }

  return cairoCalendarDateKey(instant).slice(0, 7);
}

function sameFrozenEarning(
  existing: CoachMembershipEarning,
  expected: {
    monthKey: string;
    trainerIdSnapshot: string;
    trainerNameSnapshot: string;
    employeeIdSnapshot: string;
    employeeCodeSnapshot: string;
    employeeNameSnapshot: string;
    coachCompensationTermIdSnapshot: string | null;

    commissionSourceSnapshot: string | null;
    positionTermIdSnapshot: string | null;
    positionIdSnapshot: string | null;
    positionPayrollPolicyIdSnapshot: string | null;

    paymentAmountMinor: number;
    commissionRateBps: number;
    commissionAmountMinor: number;
    gymShareAmountMinor: number;
    currency: string;
  },
): boolean {
  return (
    existing.monthKey === expected.monthKey &&
    existing.trainerIdSnapshot === expected.trainerIdSnapshot &&
    existing.trainerNameSnapshot === expected.trainerNameSnapshot &&
    existing.employeeIdSnapshot === expected.employeeIdSnapshot &&
    existing.employeeCodeSnapshot === expected.employeeCodeSnapshot &&
    existing.employeeNameSnapshot === expected.employeeNameSnapshot &&
    existing.coachCompensationTermIdSnapshot ===
      expected.coachCompensationTermIdSnapshot &&

    existing.commissionSourceSnapshot ===
      expected.commissionSourceSnapshot &&

    existing.positionTermIdSnapshot ===
      expected.positionTermIdSnapshot &&

    existing.positionIdSnapshot ===
      expected.positionIdSnapshot &&

    existing.positionPayrollPolicyIdSnapshot ===
      expected.positionPayrollPolicyIdSnapshot &&

    existing.paymentAmountMinor === expected.paymentAmountMinor &&
    existing.commissionRateBps === expected.commissionRateBps &&
    existing.commissionAmountMinor === expected.commissionAmountMinor &&
    /*
     * Historical rows intentionally remain NULL: no backfill.
     * An exact retry of such a historical row must remain idempotent and
     * must not mutate history merely to populate the new snapshot.
     */
    (existing.gymShareAmountMinor == null ||
      existing.gymShareAmountMinor === expected.gymShareAmountMinor) &&
    existing.currency === expected.currency
  );
}

/**
 * Create the independent Coach Membership earning exactly once at
 * economic finalization.
 *
 * IMPORTANT:
 * - UserMembership.id is the exact-once business boundary.
 * - No Trainer/Employee/Compensation mutable data is re-read.
 * - All identity/rate/currency data comes from purchase-time snapshots.
 * - Economic consideration is supplied by the authoritative payment
 *   finalization path after commercial discounts:
 *
 *   external payment + wallet redeemed + reward-points redeemed.
 *
 * - This does NOT create/refinalize referral, marketing or payout records.
 */
export async function accrueCoachMembershipEarningTx(
  tx: CoachMembershipEarningTx,
  input: {
    userMembershipId: string;
    finalizedAt: Date;
    consideration: CoachMembershipEconomicConsideration;
  },
): Promise<CoachMembershipEarning | null> {
  const userMembershipId = input.userMembershipId?.trim();

  if (!userMembershipId) {
    throw new Error("COACH_MEMBERSHIP_EARNING_MEMBERSHIP_REQUIRED");
  }

  const membership = await tx.userMembership.findUnique({
    where: {
      id: userMembershipId,
    },
    select: {
      id: true,

      coachMembershipTrainerIdSnapshot: true,
      coachMembershipTrainerNameSnapshot: true,

      coachMembershipEmployeeIdSnapshot: true,
      coachMembershipEmployeeCodeSnapshot: true,
      coachMembershipEmployeeNameSnapshot: true,

      coachMembershipCompensationTermIdSnapshot: true,

      coachMembershipCommissionSourceSnapshot: true,
      coachMembershipPositionTermIdSnapshot: true,
      coachMembershipPositionIdSnapshot: true,
      coachMembershipPositionPayrollPolicyIdSnapshot: true,

      coachMembershipCommissionBpsSnapshot: true,
      coachMembershipCurrencySnapshot: true,
    },
  });

  if (!membership) {
    throw new Error("COACH_MEMBERSHIP_EARNING_MEMBERSHIP_NOT_FOUND");
  }

  /*
   * No Coach Membership attribution means this is an ordinary
   * membership and must not create a Coach Membership earning.
   */
  const hasAnyCoachSnapshot =
    membership.coachMembershipTrainerIdSnapshot != null ||
    membership.coachMembershipTrainerNameSnapshot != null ||
    membership.coachMembershipEmployeeIdSnapshot != null ||
    membership.coachMembershipEmployeeCodeSnapshot != null ||
    membership.coachMembershipEmployeeNameSnapshot != null ||
    membership.coachMembershipCompensationTermIdSnapshot != null ||
    membership.coachMembershipCommissionSourceSnapshot != null ||
    membership.coachMembershipPositionTermIdSnapshot != null ||
    membership.coachMembershipPositionIdSnapshot != null ||
    membership.coachMembershipPositionPayrollPolicyIdSnapshot != null ||
    membership.coachMembershipCommissionBpsSnapshot != null ||
    membership.coachMembershipCurrencySnapshot != null;

  if (!hasAnyCoachSnapshot) {
    return null;
  }

  const trainerId = membership.coachMembershipTrainerIdSnapshot;
  const trainerName = membership.coachMembershipTrainerNameSnapshot;
  const employeeId = membership.coachMembershipEmployeeIdSnapshot;
  const employeeCode = membership.coachMembershipEmployeeCodeSnapshot;
  const employeeName = membership.coachMembershipEmployeeNameSnapshot;
  const compensationTermId =
    membership.coachMembershipCompensationTermIdSnapshot;

  const commissionSource =
    membership.coachMembershipCommissionSourceSnapshot;

  const positionTermId =
    membership.coachMembershipPositionTermIdSnapshot;

  const positionId =
    membership.coachMembershipPositionIdSnapshot;

  const positionPayrollPolicyId =
    membership.coachMembershipPositionPayrollPolicyIdSnapshot;

  const rateBps =
    membership.coachMembershipCommissionBpsSnapshot;

  const currency =
    membership.coachMembershipCurrencySnapshot;

  if (
    !trainerId ||
    !trainerName ||
    !employeeId ||
    !employeeCode ||
    !employeeName ||
    rateBps == null ||
    !currency
  ) {
    throw new Error(
      "COACH_MEMBERSHIP_EARNING_INCOMPLETE_SNAPSHOT",
    );
  }

  /*
   * Historical compatibility:
   *
   * Old UserMembership rows were created before an explicit source field
   * existed. source=NULL + legacy compensation-term snapshot is therefore
   * a valid historical legacy contract.
   *
   * Do NOT backfill or rewrite those memberships.
   */
  const historicalLegacySnapshot =
    commissionSource == null &&
    compensationTermId != null &&
    positionTermId == null &&
    positionId == null &&
    positionPayrollPolicyId == null;

  const explicitLegacySnapshot =
    commissionSource ===
      "legacy_coach_compensation_term" &&
    compensationTermId != null &&
    positionTermId == null &&
    positionId == null &&
    positionPayrollPolicyId == null;

  const positionPolicySnapshot =
    commissionSource ===
      "position_payroll_policy" &&
    compensationTermId == null &&
    positionTermId != null &&
    positionId != null &&
    positionPayrollPolicyId != null;

  if (
    !historicalLegacySnapshot &&
    !explicitLegacySnapshot &&
    !positionPolicySnapshot
  ) {
    throw new Error(
      "COACH_MEMBERSHIP_EARNING_INCOMPLETE_SNAPSHOT",
    );
  }

  const externalPaidMinor = toMinor(
    input.consideration.externalPaidAmount,
    "EXTERNAL_PAID_AMOUNT",
  );

  const walletMinor = toMinor(
    input.consideration.walletAmount,
    "WALLET_AMOUNT",
  );

  const pointsMinor = toMinor(
    input.consideration.pointsAmount,
    "POINTS_AMOUNT",
  );

  const paymentAmountMinor = externalPaidMinor + walletMinor + pointsMinor;

  if (!Number.isSafeInteger(paymentAmountMinor)) {
    throw new Error("COACH_MEMBERSHIP_EARNING_UNSAFE_PAYMENT_AMOUNT");
  }

  const amountMinor = commissionMinor(paymentAmountMinor, rateBps);

  const gymShareAmountMinor = paymentAmountMinor - amountMinor;

  if (
    !Number.isSafeInteger(gymShareAmountMinor) ||
    gymShareAmountMinor < 0
  ) {
    throw new Error("COACH_MEMBERSHIP_EARNING_INVALID_GYM_SHARE");
  }

  const monthKey = monthKeyForInstant(input.finalizedAt);

  const expected = {
    monthKey,
    trainerIdSnapshot: trainerId,
    trainerNameSnapshot: trainerName,
    employeeIdSnapshot: employeeId,
    employeeCodeSnapshot: employeeCode,
    employeeNameSnapshot: employeeName,
    coachCompensationTermIdSnapshot:
      compensationTermId,

    commissionSourceSnapshot:
      commissionSource,

    positionTermIdSnapshot:
      positionTermId,

    positionIdSnapshot:
      positionId,

    positionPayrollPolicyIdSnapshot:
      positionPayrollPolicyId,

    paymentAmountMinor,
    commissionRateBps: rateBps,
    commissionAmountMinor: amountMinor,
    gymShareAmountMinor,
    currency,
  };

  const existing = await tx.coachMembershipEarning.findUnique({
    where: {
      userMembershipId,
    },
  });

  /*
   * Idempotent retries are allowed only when they reproduce the exact
   * same immutable earning.
   */
  if (existing) {
    if (!sameFrozenEarning(existing, expected)) {
      throw new Error("COACH_MEMBERSHIP_EARNING_EXISTING_MISMATCH");
    }

    return existing;
  }

  const earning = await tx.coachMembershipEarning.create({
    data: {
      userMembershipId,

      monthKey,

      trainerIdSnapshot: trainerId,
      trainerNameSnapshot: trainerName,

      employeeIdSnapshot: employeeId,
      employeeCodeSnapshot: employeeCode,
      employeeNameSnapshot: employeeName,

      coachCompensationTermIdSnapshot:
        compensationTermId,

      commissionSourceSnapshot:
        commissionSource,

      positionTermIdSnapshot:
        positionTermId,

      positionIdSnapshot:
        positionId,

      positionPayrollPolicyIdSnapshot:
        positionPayrollPolicyId,

      /*
       * Historical schema name retained for compatibility.
       * Semantics = total economic consideration after commercial
       * discounts, not merely external payment.
       */
      paymentAmountMinor,

      commissionRateBps: rateBps,
      commissionAmountMinor: amountMinor,
      gymShareAmountMinor,

      currency,

      status: "calculated",
      blockReason: null,

      calculatedAt: input.finalizedAt,
      calculatedById: null,

      finalizedAt: null,
      finalizedById: null,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: null,
      actorName: "system:coach-membership-accrual",
      actorEmail: null,
      actorRole: "system",

      action: "coach_membership_earning_calculate",

      targetType: "CoachMembershipEarning",
      targetId: earning.id,

      details: JSON.stringify({
        userMembershipId,

        monthKey,

        trainerIdSnapshot: trainerId,
        employeeIdSnapshot: employeeId,
        employeeCodeSnapshot: employeeCode,

        coachCompensationTermIdSnapshot:
          compensationTermId,

        commissionSourceSnapshot:
          commissionSource,

        positionTermIdSnapshot:
          positionTermId,

        positionIdSnapshot:
          positionId,

        positionPayrollPolicyIdSnapshot:
          positionPayrollPolicyId,

        externalPaidMinor,
        walletMinor,
        pointsMinor,

        economicConsiderationMinor: paymentAmountMinor,

        commissionRateBps: rateBps,
        commissionAmountMinor: amountMinor,
        gymShareAmountMinor,

        currency,
      }),
    },
  });

  return earning;
}

/**
 * Payroll/admin finalization boundary.
 *
 * Finalization is idempotent. Once finalized the earning is immutable.
 */
export async function finalizeCoachMembershipEarning(
  input: {
    earningId: string;
  },
  actor: CoachMembershipEarningActor,
): Promise<CoachMembershipEarning> {
  assertActor(actor);

  const earningId = input.earningId?.trim();

  if (!earningId) {
    throw new Error("COACH_MEMBERSHIP_EARNING_ID_REQUIRED");
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
      FROM \`CoachMembershipEarning\`
      WHERE \`id\` = ${earningId}
      FOR UPDATE
    `;

    const lockedRow = locked[0];

    if (!lockedRow) {
      throw new Error("COACH_MEMBERSHIP_EARNING_NOT_FOUND");
    }

    if (lockedRow.status === "finalized") {
      return tx.coachMembershipEarning.findUniqueOrThrow({
        where: {
          id: earningId,
        },
      });
    }

    if (lockedRow.status !== "calculated") {
      throw new Error("COACH_MEMBERSHIP_EARNING_NOT_CALCULATED");
    }

    const before = await tx.coachMembershipEarning.findUniqueOrThrow({
      where: {
        id: earningId,
      },
    });

    const finalized = await tx.coachMembershipEarning.update({
      where: {
        id: earningId,
      },
      data: {
        status: "finalized",
        finalizedAt: new Date(),
        finalizedById: actor.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorName: actor.name,
        actorEmail: actor.email ?? null,
        actorRole: actor.role ?? null,

        action: "coach_membership_earning_finalize",

        targetType: "CoachMembershipEarning",
        targetId: earningId,

        details: JSON.stringify({
          userMembershipId: finalized.userMembershipId,

          before: {
            status: before.status,
            paymentAmountMinor: before.paymentAmountMinor,
            commissionRateBps: before.commissionRateBps,
            commissionAmountMinor: before.commissionAmountMinor,
          },

          after: {
            status: finalized.status,
            finalizedAt: finalized.finalizedAt,
            finalizedById: finalized.finalizedById,
          },
        }),
      },
    });

    return finalized;
  });
}
