import { runDuePaymobRecoveryBatch } from "./paymob-auto-recovery-batch";

type CycleSummary = {
  discovery: unknown;
  execution: {
    selected: number;
    succeeded: number;
    failed: number;
  };
};

export async function runPaymobRecoveryCycle(input: {
  discover: () => Promise<unknown>;
  executeBatch: () => Promise<{
    selected: number;
    succeeded: number;
    failed: number;
  }>;
}): Promise<CycleSummary> {
  // Discovery failure must prevent executing a potentially stale batch.
  const discovery = await input.discover();
  const execution = await input.executeBatch();
  return { discovery, execution };
}

// Production dependencies are intentionally not invoked here.
// The future authenticated cron route will explicitly provide them.
export type { RecoveryBatchDb } from "./paymob-auto-recovery-batch";
