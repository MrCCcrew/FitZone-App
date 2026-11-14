import type { RecoveryExecutionResult } from "./paymob-auto-recovery-orchestrator";

export type RecoveryJobRow = {
  id: string;
  paymentTransactionId: string;
  status: string;
  leaseToken: string | null;
  lockedUntil: Date | null;
  attempts: number;
};

export type RecoveryJobRunnerDeps = {
  findJob: (jobId: string) => Promise<RecoveryJobRow | null>;
  execute: (paymentId: string) => Promise<RecoveryExecutionResult>;
  persist: (input: {
    jobId: string;
    leaseToken: string;
    now: Date;
    attempts: number;
    result: RecoveryExecutionResult;
    errorCode?: string | null;
  }) => Promise<boolean>;
};

export async function runClaimedPaymobRecoveryJob(
  input: {
    jobId: string;
    leaseToken: string;
    now: () => Date;
  },
  deps: RecoveryJobRunnerDeps,
): Promise<"saved" | "lease_lost"> {
  if (!input.jobId.trim() || !input.leaseToken.trim()) {
    throw new Error("INVALID_RECOVERY_JOB_IDENTITY");
  }

  const job = await deps.findJob(input.jobId);
  const startedAt = input.now();

  if (
    !job ||
    job.status !== "processing" ||
    job.leaseToken !== input.leaseToken ||
    !job.lockedUntil ||
    job.lockedUntil <= startedAt ||
    !Number.isSafeInteger(job.attempts) ||
    job.attempts < 1
  ) {
    return "lease_lost";
  }

  let result: RecoveryExecutionResult;
  let errorCode: string | null = null;

  try {
    result = await deps.execute(job.paymentTransactionId);
  } catch {
    // Fail closed. Do not mark successful or expose provider secrets.
    result = "retry";
    errorCode = "RECOVERY_EXECUTION_ERROR";
  }

  const persisted = await deps.persist({
    jobId: job.id,
    leaseToken: input.leaseToken,
    now: input.now(),
    attempts: job.attempts,
    result,
    errorCode,
  });

  return persisted ? "saved" : "lease_lost";
}
