import type {
  RecoveryExecutionResult,
} from "./paymob-auto-recovery-orchestrator";

export type RecoveryResultDb = {
  paymobRecoveryJob: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export function recoveryRetryDelayMs(attempts: number): number {
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("INVALID_RECOVERY_ATTEMPTS");
  }

  return Math.min(
    24 * 60 * 60 * 1000,
    60_000 * 2 ** Math.min(attempts - 1, 11),
  );
}

export async function persistPaymobRecoveryResult(
  db: RecoveryResultDb,
  input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    attempts: number;
    result: RecoveryExecutionResult;
    errorCode?: string | null;
  },
): Promise<boolean> {
  if (
    !input.jobId.trim() ||
    !input.leaseToken.trim() ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error("INVALID_RECOVERY_RESULT");
  }

  const delay = recoveryRetryDelayMs(input.attempts);

  const outcome = input.result === "completed"
    ? {
        status: "completed",
        completedAt: input.now,
        lastErrorCode: null,
      }
    : input.result === "manual_review"
      ? {
          status: "manual_review",
          completedAt: null,
          lastErrorCode: input.errorCode ?? "REQUIRES_MANUAL_REVIEW",
        }
      : {
          status: "retry",
          completedAt: null,
          nextAttemptAt: new Date(input.now.getTime() + delay),
          lastErrorCode: input.errorCode ?? (
            input.result === "skipped"
              ? "SKIPPED_RECHECK_REQUIRED"
              : "RECOVERY_UNRESOLVED"
          ),
        };

  const update = await db.paymobRecoveryJob.updateMany({
    where: {
      id: input.jobId,
      status: "processing",
      leaseToken: input.leaseToken,
      lockedUntil: { gt: input.now },
    },
    data: {
      ...outcome,
      lastCheckedAt: input.now,
      lockedUntil: null,
      leaseToken: null,
    },
  });

  return update.count === 1;
}
