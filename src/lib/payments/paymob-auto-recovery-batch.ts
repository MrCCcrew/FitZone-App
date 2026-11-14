import type { Prisma } from "@prisma/client";

export type DueRecoveryJob = {
  id: string;
};

export type RecoveryBatchDb = {
  paymobRecoveryJob: {
    findMany: (args: {
      where: {
        status: { in: string[] };
        nextAttemptAt: { lte: Date };
      };
      select: { id: true };
      orderBy: Prisma.PaymobRecoveryJobOrderByWithRelationInput[];
      take: number;
    }) => Promise<DueRecoveryJob[]>;
  };
};

export async function runDuePaymobRecoveryBatch(
  input: {
    db: RecoveryBatchDb;
    execute: (jobId: string) => Promise<unknown>;
    now: Date;
    limit?: number;
  },
): Promise<{
  selected: number;
  succeeded: number;
  failed: number;
}> {
  const limit = input.limit ?? 10;

  if (
    !(input.now instanceof Date) ||
    !Number.isFinite(input.now.getTime()) ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 25
  ) {
    throw new Error("INVALID_PAYMOB_RECOVERY_BATCH");
  }

  const jobs = await input.db.paymobRecoveryJob.findMany({
    where: {
      status: { in: ["pending", "retry"] },
      nextAttemptAt: { lte: input.now },
    },
    select: { id: true },
    orderBy: [
      { nextAttemptAt: "asc" },
      { id: "asc" },
    ],
    take: limit,
  });

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      await input.execute(job.id);
      succeeded++;
    } catch {
      // The persistent runner owns lease and retry state.
      // One failed job must not prevent other jobs from running.
      failed++;
    }
  }

  return {
    selected: jobs.length,
    succeeded,
    failed,
  };
}
