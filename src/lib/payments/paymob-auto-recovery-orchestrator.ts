import {
  decidePaymobRecoveryDispatch,
} from "./paymob-auto-recovery-dispatch";

import type {
  PaymobRecoveryCandidateInput,
} from "./paymob-auto-recovery-candidate";

export type RecoveryExecutionResult =
  | "completed"
  | "retry"
  | "manual_review"
  | "skipped";

export type RecoveryExecutionDependencies = {
  readCurrent: (
    paymentId: string,
  ) => Promise<PaymobRecoveryCandidateInput | null>;

  discoverVerified: (
    paymentId: string,
  ) => Promise<"paid_recovered" | "unresolved">;

  repairPaid: (
    paymentId: string,
  ) => Promise<boolean>;

  isFullyReconciled: (
    paymentId: string,
  ) => Promise<boolean>;
};

export async function executePaymobRecoveryJob(
  paymentId: string,
  deps: RecoveryExecutionDependencies,
): Promise<RecoveryExecutionResult> {
  if (!paymentId.trim()) {
    throw new Error("INVALID_RECOVERY_PAYMENT_ID");
  }

  // Never act on a stale scanner snapshot.
  const current = await deps.readCurrent(paymentId);

  if (!current) {
    return "manual_review";
  }

  const decision = decidePaymobRecoveryDispatch(current);

  if (decision === "skip") {
    return "skipped";
  }

  if (decision === "manual_review") {
    return "manual_review";
  }

  if (decision === "inquire_only") {
    const outcome = await deps.discoverVerified(paymentId);

    if (outcome !== "paid_recovered") {
      return "retry";
    }
  } else if (decision === "repair_paid_membership") {
    const repaired = await deps.repairPaid(paymentId);

    if (!repaired) {
      return "retry";
    }
  }

  // Never mark a job completed based solely on Paymob inquiry,
  // payment status, or a recovery helper's return value.
  return await deps.isFullyReconciled(paymentId)
    ? "completed"
    : "retry";
}
