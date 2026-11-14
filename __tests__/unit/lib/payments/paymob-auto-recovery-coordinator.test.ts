import { describe, expect, it, vi } from "vitest";
import {
  coordinatePaymobRecoveryDiscovery,
} from "@/lib/payments/paymob-auto-recovery-coordinator";

describe("Paymob durable discovery coordinator", () => {
  it("resumes and saves progress after each persisted page", async () => {
    const previous = {
      createdAt: new Date("2026-10-28T10:00:00Z"),
      id: "old-payment",
    };
    const next = {
      createdAt: new Date("2026-10-29T10:00:00Z"),
      id: "new-payment",
    };

    const scan = vi.fn()
      .mockResolvedValueOnce({
        candidates: [{ paymentId: "p1", decision: "inquire_only" }],
        nextCursor: next,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        candidates: [],
        nextCursor: null,
        hasMore: false,
      });

    const materialize = vi.fn().mockResolvedValue(undefined);
    const saveCheckpoint = vi.fn().mockResolvedValue(true);

    const result = await coordinatePaymobRecoveryDiscovery({
      readCheckpoint: async () => ({ cursor: previous, version: 7 }),
      saveCheckpoint,
      scan,
      materialize,
      maxPages: 2,
    });

    expect(scan.mock.calls[0][1]).toEqual(previous);
    expect(saveCheckpoint.mock.calls).toEqual([
      [7, next],
      [8, null],
    ]);
    expect(result.checkpointVersion).toBe(9);
  });

  it("stops scanning after a version conflict", async () => {
    const scan = vi.fn().mockResolvedValue({
      candidates: [{ paymentId: "p1", decision: "inquire_only" }],
      nextCursor: {
        createdAt: new Date("2026-10-29T10:00:00Z"),
        id: "p1",
      },
      hasMore: true,
    });

    const materialize = vi.fn().mockResolvedValue(undefined);
    const saveCheckpoint = vi.fn().mockResolvedValue(false);

    await expect(coordinatePaymobRecoveryDiscovery({
      readCheckpoint: async () => ({ cursor: null, version: 2 }),
      saveCheckpoint,
      scan,
      materialize,
    })).rejects.toThrow("PAYMOB_RECOVERY_CHECKPOINT_CONFLICT");

    expect(scan).toHaveBeenCalledOnce();
    expect(materialize).toHaveBeenCalledOnce();
  });

  it("rejects invalid checkpoint versions", async () => {
    const scan = vi.fn();

    await expect(coordinatePaymobRecoveryDiscovery({
      readCheckpoint: async () => ({ cursor: null, version: -1 }),
      saveCheckpoint: vi.fn(),
      scan,
      materialize: vi.fn(),
    })).rejects.toThrow("INVALID_RECOVERY_CHECKPOINT_VERSION");

    expect(scan).not.toHaveBeenCalled();
  });
});
