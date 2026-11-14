import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

import {
  processPersistentPaymobRecoveryJob,
} from "./paymob-auto-recovery-persistent-runner";

import {
  executeRealPaymobRecovery,
} from "./paymob-auto-recovery-runtime";

/**
 * Execute one existing recovery job.
 *
 * No database or provider calls occur on module import.
 * Caller must enforce bounded scheduling and authorization.
 */
export async function executePersistedPaymobRecoveryJob(
  jobId: string,
) {
  if (!jobId.trim()) {
    throw new Error("INVALID_RECOVERY_JOB_ID");
  }

  return processPersistentPaymobRecoveryJob(
    db,
    {
      jobId,
      leaseToken: randomUUID(),
      now: () => new Date(),
    },
    executeRealPaymobRecovery,
  );
}
