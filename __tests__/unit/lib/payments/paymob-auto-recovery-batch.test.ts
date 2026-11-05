import { describe, expect, it, vi } from "vitest";
import {
  runDuePaymobRecoveryBatch,
} from "@/lib/payments/paymob-auto-recovery-batch";

describe("Paymob due recovery batch", () => {
  const now = new Date("2026-10-29T14:00:00Z");

  it("selects only bounded due pending/retry jobs", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "job-1" },
      { id: "job-2" },
    ]);

    const execute = vi.fn().mockResolvedValue(undefined);

    const result = await runDuePaymobRecoveryBatch({
      db: { paymobRecoveryJob: { findMany } },
      execute,
      now,
      limit: 2,
    });

    expect(findMany.mock.calls[0][0]).toEqual({
      where: {
        status: { in: ["pending", "retry"] },
        nextAttemptAt: { lte: now },
      },
      select: { id: true },
      orderBy: [
        { nextAttemptAt: "asc" },
        { id: "asc" },
      ],
      take: 2,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      selected: 2,
      succeeded: 2,
      failed: 0,
    });
  });

  it("continues after an individual job failure", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "job-1" },
      { id: "job-2" },
    ]);

    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);

    const result = await runDuePaymobRecoveryBatch({
      db: { paymobRecoveryJob: { findMany } },
      execute,
      now,
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  it("rejects excessive batch sizes before DB access", async () => {
    const findMany = vi.fn();

    await expect(runDuePaymobRecoveryBatch({
      db: { paymobRecoveryJob: { findMany } },
      execute: vi.fn(),
      now,
      limit: 1000,
    })).rejects.toThrow("INVALID_PAYMOB_RECOVERY_BATCH");

    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("Paymob batch concurrency selection", () => {
  it("does not select already processing jobs", async () => {
    const now = new Date("2026-10-29T14:00:00Z");
    const findMany = vi.fn().mockResolvedValue([]);
    const execute = vi.fn();

    const result = await runDuePaymobRecoveryBatch({
      db: { paymobRecoveryJob: { findMany } },
      execute,
      now,
    });

    expect(findMany.mock.calls[0][0].where.status.in)
      .toEqual(["pending", "retry"]);
    expect(execute).not.toHaveBeenCalled();
    expect(result.selected).toBe(0);
  });
});
