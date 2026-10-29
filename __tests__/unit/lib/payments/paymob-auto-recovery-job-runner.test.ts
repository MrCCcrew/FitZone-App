import { describe, expect, it, vi } from "vitest";
import {
  runClaimedPaymobRecoveryJob,
} from "@/lib/payments/paymob-auto-recovery-job-runner";

const now = new Date("2026-10-29T12:00:00Z");

function setup(overrides: Record<string, unknown> = {}) {
  const deps = {
    findJob: vi.fn().mockResolvedValue({
      id: "job-1",
      paymentTransactionId: "payment-1",
      status: "processing",
      leaseToken: "worker-1",
      lockedUntil: new Date(now.getTime() + 120000),
      attempts: 3,
    }),
    execute: vi.fn().mockResolvedValue("completed"),
    persist: vi.fn().mockResolvedValue(true),
    ...overrides,
  };

  return deps;
}

describe("Paymob recovery claimed job runner", () => {
  it("executes and saves a valid claimed job", async () => {
    const deps = setup();

    expect(await runClaimedPaymobRecoveryJob({
      jobId: "job-1",
      leaseToken: "worker-1",
      now: () => now,
    }, deps)).toBe("saved");

    expect(deps.execute).toHaveBeenCalledWith("payment-1");
    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        leaseToken: "worker-1",
        attempts: 3,
        result: "completed",
      }),
    );
  });

  it("does not execute when lease ownership has changed", async () => {
    const deps = setup({
      findJob: vi.fn().mockResolvedValue({
        id: "job-1",
        paymentTransactionId: "payment-1",
        status: "processing",
        leaseToken: "another-worker",
        lockedUntil: new Date(now.getTime() + 120000),
        attempts: 2,
      }),
    });

    expect(await runClaimedPaymobRecoveryJob({
      jobId: "job-1",
      leaseToken: "worker-1",
      now: () => now,
    }, deps)).toBe("lease_lost");

    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("retries on execution failure", async () => {
    const deps = setup({
      execute: vi.fn().mockRejectedValue(new Error("provider failure")),
    });

    expect(await runClaimedPaymobRecoveryJob({
      jobId: "job-1",
      leaseToken: "worker-1",
      now: () => now,
    }, deps)).toBe("saved");

    expect(deps.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "retry",
        errorCode: "RECOVERY_EXECUTION_ERROR",
      }),
    );
  });

  it("rejects completion when persistence loses the lease", async () => {
    const deps = setup({
      persist: vi.fn().mockResolvedValue(false),
    });

    expect(await runClaimedPaymobRecoveryJob({
      jobId: "job-1",
      leaseToken: "worker-1",
      now: () => now,
    }, deps)).toBe("lease_lost");
  });
});
