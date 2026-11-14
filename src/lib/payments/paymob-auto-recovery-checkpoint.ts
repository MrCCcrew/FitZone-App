import type { RecoveryCursor } from "./paymob-auto-recovery-cursor";

export type RecoveryCheckpointDb = {
  paymobRecoveryScanState: {
    updateMany: (args: {
      where: { id: string; version: number };
      data: {
        cursorCreatedAt: Date | null;
        cursorPaymentId: string | null;
        version: { increment: number };
      };
    }) => Promise<{ count: number }>;
  };
};

/**
 * Compare-and-swap checkpoint. Caller must first create/read the
 * singleton scan state and supply the version it actually observed.
 * A false result means a competing scheduler advanced the cursor.
 */
export async function savePaymobRecoveryCheckpoint(
  db: RecoveryCheckpointDb,
  input: {
    id: string;
    expectedVersion: number;
    cursor: RecoveryCursor | null;
  },
): Promise<boolean> {
  if (
    !input.id.trim() ||
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    (input.cursor !== null && (
      !(input.cursor.createdAt instanceof Date) ||
      !Number.isFinite(input.cursor.createdAt.getTime()) ||
      !input.cursor.id.trim()
    ))
  ) {
    throw new Error("INVALID_RECOVERY_CHECKPOINT");
  }

  const updated = await db.paymobRecoveryScanState.updateMany({
    where: {
      id: input.id,
      version: input.expectedVersion,
    },
    data: {
      cursorCreatedAt: input.cursor?.createdAt ?? null,
      cursorPaymentId: input.cursor?.id ?? null,
      version: { increment: 1 },
    },
  });

  return updated.count === 1;
}
