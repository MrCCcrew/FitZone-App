import type { RecoveryExecutionResult } from "./paymob-auto-recovery-orchestrator";
import {
  runClaimedPaymobRecoveryJob,
  type RecoveryJobRow,
} from "./paymob-auto-recovery-job-runner";
import {
  claimPaymobRecoveryJob,
} from "./paymob-auto-recovery-claim";
import {
  persistPaymobRecoveryResult,
} from "./paymob-auto-recovery-result";

type JobDb = {
  paymobRecoveryJob: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    findUnique: (args: {
      where: { id: string };
    }) => Promise<RecoveryJobRow | null>;
  };
};

export async function processPersistentPaymobRecoveryJob(
  db: JobDb,
  input: {
    jobId: string;
    leaseToken: string;
    now: () => Date;
  },
  execute: (paymentId: string) => Promise<RecoveryExecutionResult>,
): Promise<"saved" | "lease_lost" | "not_claimed"> {
  const claimed = await claimPaymobRecoveryJob(db, {
    jobId: input.jobId,
    token: input.leaseToken,
    now: input.now(),
  });

  if (!claimed) return "not_claimed";

  return runClaimedPaymobRecoveryJob(input, {
    findJob: (jobId) =>
      db.paymobRecoveryJob.findUnique({
        where: { id: jobId },
      }),

    execute,

    persist: (result) =>
      persistPaymobRecoveryResult(db, result),
  });
}
