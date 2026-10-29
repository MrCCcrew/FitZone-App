import type { Prisma } from "@prisma/client";
import { buildPaymobRecoveryCandidateWhere } from "./paymob-auto-recovery-query";
import {
  buildPaymobRecoveryKeysetWhere,
  nextPaymobRecoveryCursor,
  type RecoveryCursor,
} from "./paymob-auto-recovery-cursor";
import { decidePaymobRecoveryDispatch } from "./paymob-auto-recovery-dispatch";

type PaymentRow = {
  id: string;
  purpose: string;
  provider: string;
  status: string;
  membershipId: string | null;
  metadata: string | null;
  createdAt: Date;
};

type MembershipRow = {
  id: string;
  status: string;
};

export type RecoveryScanDb = {
  paymentTransaction: {
    findMany: (args: {
      where: Prisma.PaymentTransactionWhereInput;
      select: Record<string, boolean>;
      orderBy: Array<Record<string, "asc">>;
      take: number;
    }) => Promise<PaymentRow[]>;
  };
  userMembership: {
    findMany: (args: {
      where: { id: { in: string[] } };
      select: { id: true; status: true };
    }) => Promise<MembershipRow[]>;
  };
};

export function isPaymobReconciliationComplete(
  metadata: string | null,
  membershipId: string | null,
): boolean {
  if (!metadata || !membershipId) return false;
  try {
    const parsed: unknown = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const reconciliation = (
      parsed as Record<string, unknown>
    ).postActivationReconciliation;
    if (!reconciliation ||
        typeof reconciliation !== "object" ||
        Array.isArray(reconciliation)) {
      return false;
    }
    const state = reconciliation as Record<string, unknown>;
    return state.completed === true &&
      state.userMembershipId === membershipId;
  } catch {
    return false;
  }
}

export async function scanPaymobRecoveryCandidates(
  db: RecoveryScanDb,
  limit = 25,
  cursor: RecoveryCursor | null = null,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("INVALID_RECOVERY_SCAN_LIMIT");
  }

  const payments = await db.paymentTransaction.findMany({
    where: {
      AND: [
        buildPaymobRecoveryCandidateWhere(),
        buildPaymobRecoveryKeysetWhere(cursor),
      ],
    },
    select: {
      id: true,
      purpose: true,
      provider: true,
      status: true,
      membershipId: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
  });

  const membershipIds = [...new Set(
    payments.map(payment => payment.membershipId)
      .filter((id): id is string => Boolean(id)),
  )];

  const memberships = membershipIds.length
    ? await db.userMembership.findMany({
        where: { id: { in: membershipIds } },
        select: { id: true, status: true },
      })
    : [];

  const statuses = new Map(
    memberships.map(membership => [membership.id, membership.status]),
  );

  const candidates = payments.map(payment => ({
    paymentId: payment.id,
    decision: decidePaymobRecoveryDispatch({
      purpose: payment.purpose,
      provider: payment.provider,
      paymentStatus: payment.status,
      membershipId: payment.membershipId,
      membershipStatus: payment.membershipId
        ? statuses.get(payment.membershipId) ?? null
        : null,
      reconciliationCompleted: isPaymobReconciliationComplete(
        payment.metadata,
        payment.membershipId,
      ),
    }),
  }));

  return {
    candidates,
    nextCursor: nextPaymobRecoveryCursor(payments),
    hasMore: payments.length === limit,
  };
}
