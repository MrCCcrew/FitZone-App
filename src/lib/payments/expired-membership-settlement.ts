import { db } from "@/lib/db";
import { reconcileExpiredPaymobMembership } from "@/lib/payments/expired-membership-paymob-reconciliation";
import {
  cleanupExpiredPendingMembership,
  type PendingMembershipCleanupResult,
} from "@/lib/payments/pending-membership-cleanup";
import { inquirePaymobUnpaidOrder } from "@/lib/payments/providers/paymob";

export type ExpiredMembershipSettlementResult =
  | { kind: "paid_recovered" }
  | {
      kind: "cleanup";
      cleanup: PendingMembershipCleanupResult;
    };

/**
 * Shared expired-membership settlement for cron and customer retry.
 *
 * First recover verified payment; then request matching order-unpaid
 * evidence. Never turn missing or inaccessible provider evidence into
 * authorization to refund wallet adjustments or free bookings.
 */
export async function settleExpiredPendingMembership(
  membershipId: string,
): Promise<ExpiredMembershipSettlementResult> {
  try {
    const reconciliation =
      await reconcileExpiredPaymobMembership(membershipId);

    if (reconciliation.kind === "paid_recovered") {
      return { kind: "paid_recovered" };
    }
  } catch (error) {
    console.warn("[EXPIRED_MEMBERSHIP_POSITIVE_CHECK_UNAVAILABLE]", {
      membershipId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }

  let unpaidProof = null;

  try {
    const payments = await db.paymentTransaction.findMany({
      where: {
        membershipId,
        provider: "paymob",
        purpose: "membership",
      },
      take: 2,
      select: {
        id: true,
        status: true,
        providerPayload: true,
        amount: true,
        currency: true,
      },
    });

    if (
      payments.length === 1 &&
      ["pending", "requires_action", "failed"].includes(payments[0].status)
    ) {
      unpaidProof = await inquirePaymobUnpaidOrder({
        paymentId: payments[0].id,
        providerPayload: payments[0].providerPayload,
        amount: payments[0].amount,
        currency: payments[0].currency,
      });
    }
  } catch (error) {
    console.warn("[EXPIRED_MEMBERSHIP_UNPAID_CHECK_UNAVAILABLE]", {
      membershipId,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }

  return {
    kind: "cleanup",
    cleanup: await cleanupExpiredPendingMembership(
      membershipId,
      new Date(),
      unpaidProof,
    ),
  };
}
