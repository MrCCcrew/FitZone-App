import { describe, expect, it, vi } from "vitest";
import {
  schedulePaymobRecoveryPages,
} from "@/lib/payments/paymob-auto-recovery-scheduler";

describe("Paymob recovery discovery scheduler", () => {
  it("persists each page before reading the next", async () => {
    const events: string[] = [];
    const cursor = {
      createdAt: new Date("2026-10-29T10:00:00Z"),
      id: "p1",
    };

    const scan = vi.fn()
      .mockImplementationOnce(async () => {
        events.push("scan-1");
        return {
          candidates: [{ paymentId: "p1", decision: "inquire_only" }],
          nextCursor: cursor,
          hasMore: true,
        };
      })
      .mockImplementationOnce(async () => {
        events.push("scan-2");
        return {
          candidates: [{ paymentId: "p2", decision: "manual_review" }],
          nextCursor: null,
          hasMore: false,
        };
      });

    const materialize = vi.fn(async () => {
      events.push("persist");
    });

    const result = await schedulePaymobRecoveryPages({
      scan,
      materialize,
      maxPages: 2,
    });

    expect(events).toEqual([
      "scan-1", "persist", "scan-2", "persist",
    ]);
    expect(scan.mock.calls[1][1]).toEqual(cursor);
    expect(result.candidates).toBe(2);
    expect(result.hasMore).toBe(false);
  });

  it("stops immediately if persistence fails", async () => {
    const scan = vi.fn().mockResolvedValue({
      candidates: [{ paymentId: "p1", decision: "inquire_only" }],
      nextCursor: {
        createdAt: new Date("2026-10-29T10:00:00Z"),
        id: "p1",
      },
      hasMore: true,
    });

    const materialize = vi.fn()
      .mockRejectedValue(new Error("DB unavailable"));

    await expect(schedulePaymobRecoveryPages({
      scan,
      materialize,
    })).rejects.toThrow("DB unavailable");

    expect(scan).toHaveBeenCalledOnce();
  });

  it("rejects invalid paging configuration", async () => {
    const scan = vi.fn();
    const materialize = vi.fn();

    await expect(schedulePaymobRecoveryPages({
      scan,
      materialize,
      maxPages: 0,
    })).rejects.toThrow("INVALID_RECOVERY_SCHEDULE_LIMITS");

    expect(scan).not.toHaveBeenCalled();
  });

  it("rejects missing continuation cursor", async () => {
    const scan = vi.fn().mockResolvedValue({
      candidates: [],
      nextCursor: null,
      hasMore: true,
    });

    const materialize = vi.fn();

    await expect(schedulePaymobRecoveryPages({
      scan,
      materialize,
    })).rejects.toThrow("INVALID_RECOVERY_SCAN_PAGE");

    expect(materialize).not.toHaveBeenCalled();
  });
});

describe("Paymob scheduler resumable scans", () => {
  it("resumes from a previously saved cursor", async () => {
    const previous = {
      createdAt: new Date("2026-10-28T10:00:00Z"),
      id: "previous-payment",
    };
    const scan = vi.fn().mockResolvedValue({
      candidates: [],
      nextCursor: null,
      hasMore: false,
    });
    const materialize = vi.fn().mockResolvedValue(undefined);

    const result = await schedulePaymobRecoveryPages({
      scan,
      materialize,
      initialCursor: previous,
    });

    expect(scan).toHaveBeenCalledWith(25, previous);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("rejects invalid saved cursors before scanning", async () => {
    const scan = vi.fn();
    const materialize = vi.fn();

    await expect(schedulePaymobRecoveryPages({
      scan,
      materialize,
      initialCursor: {
        createdAt: new Date("invalid"),
        id: "payment",
      },
    })).rejects.toThrow("INVALID_RECOVERY_INITIAL_CURSOR");

    expect(scan).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });
});

describe("Paymob scheduler durable checkpoint ordering", () => {
  it("persists candidates then checkpoint before next page", async () => {
    const events: string[] = [];
    const cursor = {
      createdAt: new Date("2026-10-29T10:00:00Z"),
      id: "p1",
    };
    const scan = vi.fn()
      .mockResolvedValueOnce({
        candidates: [{ paymentId: "p1", decision: "inquire_only" }],
        nextCursor: cursor,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        candidates: [], nextCursor: null, hasMore: false,
      });
    const materialize = vi.fn(async () => { events.push("materialize"); });
    const checkpoint = vi.fn(async () => { events.push("checkpoint"); });
    await schedulePaymobRecoveryPages({
      scan, materialize, checkpoint, maxPages: 2,
    });
    expect(events).toEqual([
      "materialize", "checkpoint", "materialize", "checkpoint",
    ]);
    expect(checkpoint).toHaveBeenLastCalledWith(null);
  });

  it("stops if the durable checkpoint cannot be saved", async () => {
    const scan = vi.fn().mockResolvedValue({
      candidates: [{ paymentId: "p1", decision: "inquire_only" }],
      nextCursor: {
        createdAt: new Date("2026-10-29T10:00:00Z"), id: "p1",
      },
      hasMore: true,
    });
    const materialize = vi.fn().mockResolvedValue(undefined);
    const checkpoint = vi.fn()
      .mockRejectedValue(new Error("CHECKPOINT_CONFLICT"));
    await expect(schedulePaymobRecoveryPages({
      scan, materialize, checkpoint,
    })).rejects.toThrow("CHECKPOINT_CONFLICT");
    expect(scan).toHaveBeenCalledOnce();
  });
});
