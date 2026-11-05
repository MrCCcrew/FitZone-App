import { describe, expect, it, vi } from "vitest";
import {
  runPaymobRecoveryCycle,
} from "@/lib/payments/paymob-auto-recovery-cycle";

describe("Paymob unified recovery cycle", () => {
  it("discovers before executing eligible jobs", async () => {
    const events: string[] = [];

    const result = await runPaymobRecoveryCycle({
      discover: async () => {
        events.push("discover");
        return { pages: 2, candidates: 30 };
      },
      executeBatch: async () => {
        events.push("execute");
        return { selected: 3, succeeded: 2, failed: 1 };
      },
    });

    expect(events).toEqual(["discover", "execute"]);
    expect(result).toEqual({
      discovery: { pages: 2, candidates: 30 },
      execution: { selected: 3, succeeded: 2, failed: 1 },
    });
  });

  it("does not execute when discovery fails", async () => {
    const executeBatch = vi.fn();

    await expect(runPaymobRecoveryCycle({
      discover: async () => {
        throw new Error("CHECKPOINT_CONFLICT");
      },
      executeBatch,
    })).rejects.toThrow("CHECKPOINT_CONFLICT");

    expect(executeBatch).not.toHaveBeenCalled();
  });

  it("propagates batch failures for cron monitoring", async () => {
    await expect(runPaymobRecoveryCycle({
      discover: async () => ({ pages: 1 }),
      executeBatch: async () => {
        throw new Error("BATCH_DATABASE_UNAVAILABLE");
      },
    })).rejects.toThrow("BATCH_DATABASE_UNAVAILABLE");
  });
});
