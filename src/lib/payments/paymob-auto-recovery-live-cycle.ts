import "server-only";

import { db } from "@/lib/db";
import { runPaymobRecoveryCycle } from "./paymob-auto-recovery-cycle";
import { discoverPaymobRecoveryJobs } from "./paymob-auto-recovery-discovery-db";
import { runDuePaymobRecoveryBatch } from "./paymob-auto-recovery-batch";
import { executePersistedPaymobRecoveryJob } from "./paymob-auto-recovery-db-runner";

/**
 * Explicit invocation only.
 * Importing this module does not start recovery or contact Paymob.
 */
export async function runRealPaymobRecoveryCycle() {
  return runPaymobRecoveryCycle({
    discover: discoverPaymobRecoveryJobs,
    executeBatch: () =>
      runDuePaymobRecoveryBatch({
        db,
        execute: executePersistedPaymobRecoveryJob,
        now: new Date(),
        limit: 10,
      }),
  });
}
