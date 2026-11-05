import "server-only";

import type { Prisma, PrivateSessionEarning } from "@prisma/client";

import { db } from "@/lib/db";
import {
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";

export type PrivateSessionEarningActor = {
  userId: string;
  name: string;
  email?: string | null;
  role?: string | null;
};

type Tx = Prisma.TransactionClient;

function assertActor(actor: PrivateSessionEarningActor) {
  if (!actor.userId?.trim()) {
    throw new Error("PRIVATE_SESSION_EARNING_ACTOR_REQUIRED");
  }
}

function toMinor(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("PRIVATE_SESSION_EARNING_INVALID_PAYMENT_AMOUNT");
  }

  const minor = Math.round(amount * 100);

  if (!Number.isSafeInteger(minor)) {
    throw new Error("PRIVATE_SESSION_EARNING_INVALID_PAYMENT_AMOUNT");
  }

  return minor;
}

function commissionMinor(baseMinor: number, bps: number) {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error("PRIVATE_SESSION_EARNING_INVALID_COMMISSION_RATE");
  }

  return Math.round((baseMinor * bps) / 10000);
}

function monthKeyForInstant(instant: Date) {
  return cairoCalendarDateKey(instant).slice(0, 7);
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = (value?.trim() || "EGP").toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("PRIVATE_SESSION_EARNING_INVALID_CURRENCY");
  }

  return currency;
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function writeSystemAudit(
  tx: Tx,
  input: {
    action: string;
    targetId: string;
    details: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: null,
      actorName: "system:private-session-accrual",
      actorEmail: null,
      actorRole: "system",

      action: input.action,

      targetType: "PrivateSessionEarning",

      targetId: input.targetId,

      details: JSON.stringify(input.details),
    },
  });
}

export async function accruePrivateSessionEarningTx(
  tx: Tx,
  input: {
    privateSessionApplicationId: string;
  },
): Promise<PrivateSessionEarning> {
  const applicationId = input.privateSessionApplicationId?.trim();

  if (!applicationId) {
    throw new Error("PRIVATE_SESSION_EARNING_APPLICATION_REQUIRED");
  }

  /*
   * Serialize every accrual/retry around the exact-once
   * business source boundary.
   */
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT \`id\`
    FROM \`PrivateSessionApplication\`
    WHERE \`id\` = ${applicationId}
    FOR UPDATE
  `;

  if (!locked[0]) {
    throw new Error("PRIVATE_SESSION_EARNING_APPLICATION_NOT_FOUND");
  }

  const application = await tx.privateSessionApplication.findUnique({
    where: {
      id: applicationId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
        },
      },
      trainer: {
        select: {
          id: true,
          name: true,
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
      },
    },
  });

  if (!application) {
    throw new Error("PRIVATE_SESSION_EARNING_APPLICATION_NOT_FOUND");
  }

  if (application.status !== "paid" || !application.paidAt) {
    throw new Error("PRIVATE_SESSION_EARNING_APPLICATION_NOT_PAID");
  }

  if (!application.paymentTransactionId) {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_TRANSACTION_REQUIRED");
  }

  const payment = await tx.paymentTransaction.findUnique({
    where: {
      id: application.paymentTransactionId,
    },
    select: {
      id: true,
      userId: true,
      purpose: true,
      status: true,
      amount: true,
      currency: true,
      paidAt: true,
      metadata: true,
    },
  });

  if (!payment) {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_NOT_FOUND");
  }

  if (payment.status !== "paid") {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_NOT_PAID");
  }

  if (payment.userId !== application.userId) {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_USER_MISMATCH");
  }

  if (payment.purpose !== "private_session") {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_PURPOSE_MISMATCH");
  }

  const metadata = parseMetadata(payment.metadata);

  if (metadata.privateSessionApplicationId !== application.id) {
    throw new Error("PRIVATE_SESSION_EARNING_PAYMENT_SOURCE_MISMATCH");
  }

  const paidAt = payment.paidAt ?? application.paidAt;

  const paymentAmountMinor = toMinor(Number(payment.amount));

  const currency = normalizeCurrency(payment.currency);

  const monthKey = monthKeyForInstant(paidAt);

  const existing = await tx.privateSessionEarning.findUnique({
    where: {
      privateSessionApplicationId: application.id,
    },
  });

  /*
   * Once calculated/finalized, HR ownership/rate snapshots
   * are immutable. Only verify the immutable paid source.
   */
  if (existing && existing.status !== "blocked") {
    if (
      existing.paymentTransactionIdSnapshot !== payment.id ||
      existing.paymentAmountMinor !== paymentAmountMinor ||
      existing.currency !== currency ||
      existing.trainerIdSnapshot !== application.trainer.id ||
      existing.monthKey !== monthKey
    ) {
      throw new Error("PRIVATE_SESSION_EARNING_EXISTING_MISMATCH");
    }

    return existing;
  }

  const employee = application.trainer.employee;

  let blockReason: string | null = null;

  if (!application.trainer.employeeId || !employee) {
    blockReason = "PRIVATE_SESSION_EARNING_TRAINER_EMPLOYEE_LINK_MISSING";
  } else if (employee.employmentStatus !== "active") {
    blockReason = "PRIVATE_SESSION_EARNING_EMPLOYEE_NOT_ACTIVE";
  } else if (!employee.payrollEnabled) {
    blockReason = "PRIVATE_SESSION_EARNING_EMPLOYEE_PAYROLL_DISABLED";
  }

  type CommissionSource = {
    source:
      | "legacy_coach_compensation_term"
      | "position_payroll_policy";

    coachCompensationTermId: string | null;

    positionTermId: string | null;
    positionId: string | null;
    positionPayrollPolicyId: string | null;

    privateSessionCommissionBps: number;
    currency: string;
  };

  let commissionSource: CommissionSource | null = null;

  if (!blockReason && employee) {
    const cairoDate = cairoCalendarDateKey(paidAt);
    const effectiveInstant = cairoDateStartInstant(cairoDate);

    /*
     * Compatibility boundary:
     *
     * Before Position History starts for this employee, preserve the
     * historical CoachCompensationTerm source.
     *
     * Once Position History has started, Position + PositionPayrollPolicy
     * become authoritative. There is no silent fallback to legacy terms.
     */
    const latestStartedPositionTerm =
      await tx.employeePositionTerm.findFirst({
        where: {
          employeeId: employee.id,
          effectiveFrom: {
            lte: effectiveInstant,
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
            employeeId: employee.id,
            effectiveFrom: {
              lte: effectiveInstant,
            },
            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: effectiveInstant,
                },
              },
            ],
          },
          orderBy: {
            effectiveFrom: "desc",
          },
          select: {
            id: true,
            privateSessionCommissionBps: true,
            currency: true,
          },
        });

      if (!legacyTerm) {
        blockReason =
          "PRIVATE_SESSION_EARNING_COMPENSATION_TERM_MISSING";
      } else {
        commissionSource = {
          source:
            "legacy_coach_compensation_term",

          coachCompensationTermId:
            legacyTerm.id,

          positionTermId: null,
          positionId: null,
          positionPayrollPolicyId: null,

          privateSessionCommissionBps:
            legacyTerm.privateSessionCommissionBps,

          currency:
            legacyTerm.currency,
        };
      }
    } else if (
      latestStartedPositionTerm.effectiveTo &&
      latestStartedPositionTerm.effectiveTo.getTime() <
        effectiveInstant.getTime()
    ) {
      blockReason =
        "PRIVATE_SESSION_EARNING_POSITION_TERM_MISSING";
    } else {
      const policies =
        await tx.positionPayrollPolicy.findMany({
          where: {
            positionId:
              latestStartedPositionTerm.positionId,

            effectiveFrom: {
              lte: effectiveInstant,
            },

            OR: [
              {
                effectiveTo: null,
              },
              {
                effectiveTo: {
                  gte: effectiveInstant,
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
            privateSessionCommissionBps: true,
            currency: true,
          },
        });

      if (policies.length === 0) {
        blockReason =
          "PRIVATE_SESSION_EARNING_POSITION_PAYROLL_POLICY_MISSING";
      } else if (policies.length > 1) {
        blockReason =
          "PRIVATE_SESSION_EARNING_POSITION_PAYROLL_POLICY_AMBIGUOUS";
      } else if (
        policies[0].privateSessionCommissionBps == null
      ) {
        blockReason =
          "PRIVATE_SESSION_EARNING_PRIVATE_SESSION_RATE_MISSING";
      } else {
        commissionSource = {
          source:
            "position_payroll_policy",

          coachCompensationTermId: null,

          positionTermId:
            latestStartedPositionTerm.id,

          positionId:
            latestStartedPositionTerm.positionId,

          positionPayrollPolicyId:
            policies[0].id,

          privateSessionCommissionBps:
            policies[0].privateSessionCommissionBps,

          currency:
            policies[0].currency,
        };
      }
    }
  }

  let commissionRateBps: number | null = null;
  let commissionAmountMinor = 0;
  let gymShareAmountMinor: number | null = null;

  if (!blockReason && employee && commissionSource) {
    const sourceCurrency =
      normalizeCurrency(commissionSource.currency);

    if (sourceCurrency !== currency) {
      blockReason =
        "PRIVATE_SESSION_EARNING_CURRENCY_MISMATCH";
    } else {
      commissionRateBps =
        commissionSource.privateSessionCommissionBps;

      commissionAmountMinor = commissionMinor(
        paymentAmountMinor,
        commissionRateBps,
      );

      gymShareAmountMinor =
        paymentAmountMinor - commissionAmountMinor;
    }
  }

  const status = blockReason ? "blocked" : "calculated";

  const commonData = {
    monthKey,

    privateSessionType: application.type,

    customerIdSnapshot: application.user.id,

    customerNameSnapshot: application.user.name ?? null,

    sessionsCountSnapshot: application.sessionsCount ?? null,

    paymentTransactionIdSnapshot: payment.id,

    paymentAmountMinor,
    currency,

    trainerIdSnapshot: application.trainer.id,

    trainerNameSnapshot: application.trainer.name,

    employeeIdSnapshot: employee?.id ?? null,

    employeeCodeSnapshot: employee?.employeeCode ?? null,

    employeeNameSnapshot: employee?.name ?? null,

    coachCompensationTermIdSnapshot:
      blockReason
        ? null
        : (commissionSource?.coachCompensationTermId ?? null),

    commissionSourceSnapshot:
      blockReason
        ? null
        : (commissionSource?.source ?? null),

    positionTermIdSnapshot:
      blockReason
        ? null
        : (commissionSource?.positionTermId ?? null),

    positionIdSnapshot:
      blockReason
        ? null
        : (commissionSource?.positionId ?? null),

    positionPayrollPolicyIdSnapshot:
      blockReason
        ? null
        : (commissionSource?.positionPayrollPolicyId ?? null),

    commissionRateBps:
      blockReason ? null : commissionRateBps,

    commissionAmountMinor:
      blockReason ? 0 : commissionAmountMinor,

    gymShareAmountMinor:
      blockReason ? null : gymShareAmountMinor,

    status,
    blockReason,

    calculatedAt: blockReason ? null : paidAt,

    calculatedById: null,

    finalizedAt: null,
    finalizedById: null,
  };

  let earning: PrivateSessionEarning;

  if (existing) {
    earning = await tx.privateSessionEarning.update({
      where: {
        id: existing.id,
      },
      data: commonData,
    });
  } else {
    earning = await tx.privateSessionEarning.create({
      data: {
        privateSessionApplicationId: application.id,
        ...commonData,
      },
    });
  }

  await writeSystemAudit(tx, {
    action: blockReason
      ? "private_session_earning_block"
      : "private_session_earning_calculate",

    targetId: earning.id,

    details: {
      privateSessionApplicationId: application.id,

      paymentTransactionId: payment.id,

      paymentAmountMinor,
      currency,
      monthKey,

      trainerIdSnapshot: earning.trainerIdSnapshot,

      employeeIdSnapshot: earning.employeeIdSnapshot,

      coachCompensationTermIdSnapshot:
        earning.coachCompensationTermIdSnapshot,

      commissionSourceSnapshot:
        earning.commissionSourceSnapshot,

      positionTermIdSnapshot:
        earning.positionTermIdSnapshot,

      positionIdSnapshot:
        earning.positionIdSnapshot,

      positionPayrollPolicyIdSnapshot:
        earning.positionPayrollPolicyIdSnapshot,

      commissionRateBps:
        earning.commissionRateBps,

      commissionAmountMinor:
        earning.commissionAmountMinor,

      gymShareAmountMinor:
        earning.gymShareAmountMinor,

      blockReason: earning.blockReason,
    },
  });

  return earning;
}

export async function finalizePrivateSessionEarning(
  input: {
    earningId: string;
  },
  actor: PrivateSessionEarningActor,
): Promise<PrivateSessionEarning> {
  assertActor(actor);

  const earningId = input.earningId?.trim();

  if (!earningId) {
    throw new Error("PRIVATE_SESSION_EARNING_ID_REQUIRED");
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
        FROM \`PrivateSessionEarning\`
        WHERE \`id\` = ${earningId}
        FOR UPDATE
      `;

    const row = locked[0];

    if (!row) {
      throw new Error("PRIVATE_SESSION_EARNING_NOT_FOUND");
    }

    if (row.status === "finalized") {
      return tx.privateSessionEarning.findUniqueOrThrow({
        where: {
          id: earningId,
        },
      });
    }

    if (row.status !== "calculated") {
      throw new Error("PRIVATE_SESSION_EARNING_NOT_CALCULATED");
    }

    const before = await tx.privateSessionEarning.findUniqueOrThrow({
      where: {
        id: earningId,
      },
    });

    const finalized = await tx.privateSessionEarning.update({
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

        action: "private_session_earning_finalize",

        targetType: "PrivateSessionEarning",

        targetId: earningId,

        details: JSON.stringify({
          privateSessionApplicationId: finalized.privateSessionApplicationId,

          before: {
            status: before.status,
            paymentAmountMinor: before.paymentAmountMinor,
            commissionSourceSnapshot:
              before.commissionSourceSnapshot,

            positionTermIdSnapshot:
              before.positionTermIdSnapshot,

            positionIdSnapshot:
              before.positionIdSnapshot,

            positionPayrollPolicyIdSnapshot:
              before.positionPayrollPolicyIdSnapshot,

            commissionRateBps:
              before.commissionRateBps,

            commissionAmountMinor:
              before.commissionAmountMinor,

            gymShareAmountMinor:
              before.gymShareAmountMinor,
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
