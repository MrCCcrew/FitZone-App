import { describe, expect, it, vi } from "vitest";
import {
  processPersistentPaymobRecoveryJob,
} from "@/lib/payments/paymob-auto-recovery-persistent-runner";

const now = new Date("2026-10-29T13:00:00Z");

describe("Paymob persistent runner wiring", () => {
  it("claims, executes, and persists a completed job", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const findUnique = vi.fn().mockResolvedValue({
      id: "job-1",
      paymentTransactionId: "payment-1",
      status: "processing",
      leaseToken: "lease-1",
      lockedUntil: new Date(now.getTime() + 120000),
      attempts: 1,
    });

    const execute = vi.fn().mockResolvedValue("completed");

    const result = await processPersistentPaymobRecoveryJob(
      {
        paymobRecoveryJob: { updateMany, findUnique },
      },
      {
        jobId: "job-1",
        leaseToken: "lease-1",
        now: () => now,
      },
      execute,
    );

    expect(result).toBe("saved");
    expect(execute).toHaveBeenCalledWith("payment-1");
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1][0].data.status)
      .toBe("completed");
  });

  it("does not execute an already claimed job", async () => {
    const updateMany = vi.fn()
      .mockResolvedValue({ count: 0 });
    const findUnique = vi.fn();
    const execute = vi.fn();

    expect(await processPersistentPaymobRecoveryJob(
      {
        paymobRecoveryJob: { updateMany, findUnique },
      },
      {
        jobId: "job-2",
        leaseToken: "lease-2",
        now: () => now,
      },
      execute,
    )).toBe("not_claimed");

    expect(execute).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("preserves retries when execution fails", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const findUnique = vi.fn().mockResolvedValue({
      id: "job-3",
      paymentTransactionId: "payment-3",
      status: "processing",
      leaseToken: "lease-3",
      lockedUntil: new Date(now.getTime() + 120000),
      attempts: 2,
    });

    const execute = vi.fn()
      .mockRejectedValue(new Error("Paymob unavailable"));

    expect(await processPersistentPaymobRecoveryJob(
      {
        paymobRecoveryJob: { updateMany, findUnique },
      },
      {
        jobId: "job-3",
        leaseToken: "lease-3",
        now: () => now,
      },
      execute,
    )).toBe("saved");

    expect(updateMany.mock.calls[1][0].data.status)
      .toBe("retry");
  });
});
