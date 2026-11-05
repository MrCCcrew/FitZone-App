import type {
  PaymobRecoveryDispatch,
} from "./paymob-auto-recovery-dispatch";

export type RecoveryMaterializationCandidate = {
  paymentId: string;
  decision: PaymobRecoveryDispatch;
};

export type RecoveryMaterializationDb = {
  paymobRecoveryJob: {
    upsert: (args: {
      where: { paymentTransactionId: string };
      create: {
        paymentTransactionId: string;
        status: "pending" | "manual_review";
        nextAttemptAt: Date;
      };
      update: Record<string, never>;
    }) => Promise<unknown>;
  };
};

/**
 * Persist candidates without reopening or changing existing jobs.
 * This does not contact Paymob or activate memberships.
 */
export async function materializePaymobRecoveryCandidates(
  db: RecoveryMaterializationDb,
  candidates: readonly RecoveryMaterializationCandidate[],
  now: Date,
): Promise<{ scheduled: number; skipped: number }> {
  if (
    !Number.isFinite(now.getTime()) ||
    candidates.length > 100
  ) {
    throw new Error("INVALID_RECOVERY_MATERIALIZATION_INPUT");
  }

  // Validate the complete batch before issuing any database write.
  const accepted = new Set([
    "skip",
    "inquire_only",
    "repair_paid_membership",
    "manual_review",
  ]);

  for (const candidate of candidates) {
    if (
      !candidate.paymentId ||
      !candidate.paymentId.trim() ||
      !accepted.has(candidate.decision)
    ) {
      throw new Error("INVALID_RECOVERY_CANDIDATE");
    }
  }

  let scheduled = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (
      candidate.decision === "skip" ||
      seen.has(candidate.paymentId)
    ) {
      skipped++;
      continue;
    }

    seen.add(candidate.paymentId);

    await db.paymobRecoveryJob.upsert({
      where: {
        paymentTransactionId: candidate.paymentId,
      },
      create: {
        paymentTransactionId: candidate.paymentId,
        status: candidate.decision === "manual_review"
          ? "manual_review"
          : "pending",
        nextAttemptAt: now,
      },
      update: {},
    });

    scheduled++;
  }

  return { scheduled, skipped };
}
