import type { RecoveryCursor } from "./paymob-auto-recovery-cursor";
import {
  schedulePaymobRecoveryPages,
  type RecoveryDiscoveryPage,
} from "./paymob-auto-recovery-scheduler";
import type {
  RecoveryMaterializationCandidate,
} from "./paymob-auto-recovery-materializer";

export type RecoveryScanCheckpoint = {
  cursor: RecoveryCursor | null;
  version: number;
};

export async function coordinatePaymobRecoveryDiscovery(input: {
  readCheckpoint: () => Promise<RecoveryScanCheckpoint>;
  saveCheckpoint: (
    expectedVersion: number,
    cursor: RecoveryCursor | null,
  ) => Promise<boolean>;
  scan: (
    limit: number,
    cursor: RecoveryCursor | null,
  ) => Promise<RecoveryDiscoveryPage>;
  materialize: (
    candidates: readonly RecoveryMaterializationCandidate[],
  ) => Promise<unknown>;
  pageSize?: number;
  maxPages?: number;
}) {
  const initial = await input.readCheckpoint();

  if (
    !Number.isSafeInteger(initial.version) ||
    initial.version < 0
  ) {
    throw new Error("INVALID_RECOVERY_CHECKPOINT_VERSION");
  }

  let version = initial.version;

  const result = await schedulePaymobRecoveryPages({
    scan: input.scan,
    materialize: input.materialize,
    pageSize: input.pageSize,
    maxPages: input.maxPages,
    initialCursor: initial.cursor,
    checkpoint: async (cursor) => {
      const saved = await input.saveCheckpoint(version, cursor);

      if (!saved) {
        throw new Error("PAYMOB_RECOVERY_CHECKPOINT_CONFLICT");
      }

      version++;
    },
  });

  return {
    ...result,
    checkpointVersion: version,
  };
}
