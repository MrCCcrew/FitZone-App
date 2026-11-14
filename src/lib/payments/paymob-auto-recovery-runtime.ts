import "server-only";

import { db } from "@/lib/db";
import {
  paymobAutoRecoveryDependencies,
  repairAlreadyPaidMembership,
} from "./paymob-auto-recovery-adapter";
import {
  discoverAndRecoverPaymobPayment,
} from "./paymob-auto-recovery-discovery";
import {
  buildPaymobRecoveryIdentity,
} from "./paymob-auto-recovery-identity";
import {
  readCurrentPaymobRecoveryCandidate,
} from "./paymob-auto-recovery-reader";
import {
  isPaymobReconciliationComplete,
} from "./paymob-auto-recovery-scanner";
import {
  executePaymobRecoveryJob,
} from "./paymob-auto-recovery-orchestrator";

async function isFullyReconciled(paymentId: string) {
  const payment = await db.paymentTransaction.findUnique({
    where: { id: paymentId },
  });

  if (
    !payment ||
    payment.status !== "paid" ||
    !payment.membershipId
  ) {
    return false;
  }

  const membership = await db.userMembership.findUnique({
    where: { id: payment.membershipId },
    select: { status: true },
  });

  return membership?.status === "active" &&
    isPaymobReconciliationComplete(
      payment.metadata,
      payment.membershipId,
    );
}

/**
 * Not invoked automatically.
 * The persistent job runner must own scheduling, claims and retries.
 */
export async function executeRealPaymobRecovery(
  paymentId: string,
) {
  return executePaymobRecoveryJob(paymentId, {
    readCurrent: (id) =>
      readCurrentPaymobRecoveryCandidate(db, id),

    discoverVerified: async (id) => {
      const payment = await db.paymentTransaction.findUnique({
        where: { id },
      });

      if (!payment) return "unresolved";

      const identity = buildPaymobRecoveryIdentity(payment);
      if (!identity) return "unresolved";

      return discoverAndRecoverPaymobPayment(
        identity,
        paymobAutoRecoveryDependencies,
      );
    },

    repairPaid: async (id) => {
      const payment = await db.paymentTransaction.findUnique({
        where: { id },
      });

      if (
        payment?.purpose !== "membership" ||
        payment.provider !== "paymob" ||
        payment.status !== "paid" ||
        !payment.membershipId
      ) {
        return false;
      }

      const membership = await db.userMembership.findUnique({
        where: { id: payment.membershipId },
        select: { status: true },
      });

      if (
        membership?.status !== "pending_payment" &&
        membership?.status !== "active"
      ) {
        return false;
      }

      await repairAlreadyPaidMembership(id);
      return true;
    },

    isFullyReconciled,
  });
}
