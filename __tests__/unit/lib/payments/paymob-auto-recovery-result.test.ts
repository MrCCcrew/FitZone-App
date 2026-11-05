import { describe, expect, it, vi } from "vitest";
import {
  recoveryRetryDelayMs,
  persistPaymobRecoveryResult,
} from "@/lib/payments/paymob-auto-recovery-result";

const now = new Date("2026-10-29T12:00:00Z");

function mockDb(count = 1) {
  const updateMany = vi.fn().mockResolvedValue({ count });

  return {
    db: {
      paymobRecoveryJob: { updateMany },
    },
    updateMany,
  };
}

describe("Paymob recovery persistent job results", () => {
  it("marks completed only with the matching active lease", async () => {
    const { db, updateMany } = mockDb();

    expect(await persistPaymobRecoveryResult(db, {
      jobId: "job-1",
      leaseToken: "worker-1",
      now,
      attempts: 1,
      result: "completed",
    })).toBe(true);

    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: "job-1",
        status: "processing",
        leaseToken: "worker-1",
        lockedUntil: { gt: now },
      },
      data: {
        status: "completed",
        leaseToken: null,
        lockedUntil: null,
      },
    });
  });

  it("retries unresolved payments with bounded exponential backoff", async () => {
    const { db, updateMany } = mockDb();

    await persistPaymobRecoveryResult(db, {
      jobId: "job-2",
      leaseToken: "worker-2",
      now,
      attempts: 3,
      result: "retry",
    });

    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: "retry",
      nextAttemptAt: new Date(now.getTime() + 240000),
    });
  });

  it("sends financial anomalies to manual review", async () => {
    const { db, updateMany } = mockDb();

    await persistPaymobRecoveryResult(db, {
      jobId: "job-3",
      leaseToken: "worker-3",
      now,
      attempts: 1,
      result: "manual_review",
    });

    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: "manual_review",
      lastErrorCode: "REQUIRES_MANUAL_REVIEW",
    });
  });

  it("does not let an expired worker overwrite job status", async () => {
    const { db } = mockDb(0);

    expect(await persistPaymobRecoveryResult(db, {
      jobId: "job-4",
      leaseToken: "expired-worker",
      now,
      attempts: 1,
      result: "completed",
    })).toBe(false);
  });

  it("caps retry delays at 24 hours", () => {
    expect(recoveryRetryDelayMs(1)).toBe(60000);
    expect(recoveryRetryDelayMs(3)).toBe(240000);
    expect(recoveryRetryDelayMs(20)).toBeLessThanOrEqual(86400000);
  });
});
