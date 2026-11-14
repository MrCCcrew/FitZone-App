import { describe, expect, it, vi } from "vitest";
import {
  claimPaymobRecoveryJob,
  finishPaymobRecoveryJob,
} from "@/lib/payments/paymob-auto-recovery-claim";

describe("Paymob recovery atomic claim", () => {
  it("claims a due job with a conditional update", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const now = new Date("2026-10-29T12:00:00Z");

    expect(await claimPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "job-1",
      token: "worker-a",
      now,
    })).toBe(true);

    expect(updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        id: "job-1",
        OR: [
          {
            status: { in: ["pending", "retry"] },
            nextAttemptAt: { lte: now },
          },
          {
            status: "processing",
            lockedUntil: { lte: now },
          },
        ],
      },
      data: {
        status: "processing",
        leaseToken: "worker-a",
        attempts: { increment: 1 },
      },
    });
  });

  it("returns false if another worker already claimed it", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    expect(await claimPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "job-2",
      token: "worker-b",
      now: new Date(),
    })).toBe(false);
  });

  it("prevents an old worker from completing a newer lease", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    expect(await finishPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "job-3",
      token: "old-worker",
      completedAt: new Date(),
    })).toBe(false);

    expect(updateMany.mock.calls[0][0].where).toMatchObject({
      leaseToken: "old-worker",
      status: "processing",
    });
  });

  it("allows reclaiming a processing job after lease expiry", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const now = new Date("2026-10-29T12:30:00Z");

    const claimed = await claimPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "stalled-job",
      token: "new-worker",
      now,
    });

    expect(claimed).toBe(true);
    expect(updateMany.mock.calls[0][0].where.OR).toContainEqual({
      status: "processing",
      lockedUntil: { lte: now },
    });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({
      status: "processing",
      leaseToken: "new-worker",
      attempts: { increment: 1 },
    });
  });

  it("does not reclaim a job while its processing lease is active", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const claimed = await claimPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "active-job",
      token: "second-worker",
      now: new Date("2026-10-29T12:30:00Z"),
    });

    expect(claimed).toBe(false);
  });

  it("rejects invalid leases before accessing DB", async () => {
    const updateMany = vi.fn();

    await expect(claimPaymobRecoveryJob({
      paymobRecoveryJob: { updateMany },
    }, {
      jobId: "job-4",
      token: "worker",
      now: new Date(),
      leaseMs: 999999,
    })).rejects.toThrow("INVALID_RECOVERY_CLAIM");

    expect(updateMany).not.toHaveBeenCalled();
  });
});
