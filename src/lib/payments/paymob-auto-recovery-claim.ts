export type RecoveryClaimDb = {
  paymobRecoveryJob: {
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
};

export async function claimPaymobRecoveryJob(
  db: RecoveryClaimDb,
  input: {
    jobId: string;
    token: string;
    now: Date;
    leaseMs?: number;
  },
): Promise<boolean> {
  const leaseMs = input.leaseMs ?? 120000;

  if (
    !input.jobId.trim() ||
    !input.token.trim() ||
    !Number.isFinite(input.now.getTime()) ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1000 ||
    leaseMs > 300000
  ) {
    throw new Error("INVALID_RECOVERY_CLAIM");
  }

  const lockedUntil = new Date(input.now.getTime() + leaseMs);

  const result = await db.paymobRecoveryJob.updateMany({
    where: {
      id: input.jobId,
      OR: [
        {
          status: { in: ["pending", "retry"] },
          nextAttemptAt: { lte: input.now },
          OR: [
            { lockedUntil: null },
            { lockedUntil: { lte: input.now } },
          ],
        },
        {
          status: "processing",
          lockedUntil: { lte: input.now },
        },
      ],
    },
    data: {
      status: "processing",
      leaseToken: input.token,
      lockedUntil,
      attempts: { increment: 1 },
    },
  });

  return result.count === 1;
}

export async function finishPaymobRecoveryJob(
  db: RecoveryClaimDb,
  input: {
    jobId: string;
    token: string;
    completedAt: Date;
  },
): Promise<boolean> {
  if (
    !input.jobId.trim() ||
    !input.token.trim() ||
    !Number.isFinite(input.completedAt.getTime())
  ) {
    throw new Error("INVALID_RECOVERY_COMPLETION");
  }

  const result = await db.paymobRecoveryJob.updateMany({
    where: {
      id: input.jobId,
      status: "processing",
      leaseToken: input.token,
      lockedUntil: { gt: input.completedAt },
    },
    data: {
      status: "completed",
      completedAt: input.completedAt,
      lastCheckedAt: input.completedAt,
      lockedUntil: null,
      leaseToken: null,
      lastErrorCode: null,
    },
  });

  return result.count === 1;
}
