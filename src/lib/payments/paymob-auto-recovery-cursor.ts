export type RecoveryCursor = {
  createdAt: Date;
  id: string;
};

export function buildPaymobRecoveryKeysetWhere(
  cursor: RecoveryCursor | null,
) {
  if (!cursor) return {};

  if (
    !(cursor.createdAt instanceof Date) ||
    !Number.isFinite(cursor.createdAt.getTime()) ||
    !cursor.id.trim()
  ) {
    throw new Error("INVALID_PAYMOB_RECOVERY_CURSOR");
  }

  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        id: { gt: cursor.id },
      },
    ],
  };
}

export function nextPaymobRecoveryCursor(
  rows: readonly RecoveryCursor[],
): RecoveryCursor | null {
  if (rows.length === 0) return null;

  const last = rows[rows.length - 1];

  if (
    !(last.createdAt instanceof Date) ||
    !Number.isFinite(last.createdAt.getTime()) ||
    !last.id.trim()
  ) {
    throw new Error("INVALID_PAYMOB_RECOVERY_ROW");
  }

  return {
    createdAt: last.createdAt,
    id: last.id,
  };
}
