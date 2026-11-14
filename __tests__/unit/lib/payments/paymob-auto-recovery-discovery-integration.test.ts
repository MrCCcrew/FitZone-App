import { describe, expect, it, vi } from "vitest";
import { coordinatePaymobRecoveryDiscovery } from "@/lib/payments/paymob-auto-recovery-coordinator";
import { materializePaymobRecoveryCandidates } from "@/lib/payments/paymob-auto-recovery-materializer";
import type { RecoveryMaterializationCandidate } from "@/lib/payments/paymob-auto-recovery-materializer";

describe("Paymob recovery full discovery pipeline", () => {
  it("persists jobs, checkpoints, resumes, and resets only after end", async () => {
    const first = {
      createdAt: new Date("2026-10-28T10:00:00Z"),
      id: "payment-1",
    };
    const second = {
      createdAt: new Date("2026-10-29T10:00:00Z"),
      id: "payment-2",
    };

    const jobs = new Map<string, string>();
    let cursor: typeof first | null = null;
    let version = 0;

    const upsert = vi.fn(async (args: {
      where: { paymentTransactionId: string };
      create: { status: string };
      update: Record<string, never>;
    }) => {
      const id = args.where.paymentTransactionId;
      if (!jobs.has(id)) jobs.set(id, args.create.status);
      return { status: jobs.get(id) };
    });

    const db = {
      paymobRecoveryJob: { upsert },
    };

    const scan = vi.fn(async (
      _limit: number,
      after: typeof first | null,
    ) => {
      if (!after) {
        return {
          candidates: [{
            paymentId: "payment-1",
            decision: "inquire_only" as const,
          }],
          nextCursor: first,
          hasMore: true,
        };
      }

      if (after.id === "payment-1") {
        return {
          candidates: [{
            paymentId: "payment-2",
            decision: "manual_review" as const,
          }],
          nextCursor: second,
          hasMore: true,
        };
      }

      return {
        candidates: [] as RecoveryMaterializationCandidate[],
        nextCursor: null,
        hasMore: false,
      };
    });

    const run = (maxPages: number) =>
      coordinatePaymobRecoveryDiscovery({
        readCheckpoint: async () => ({ cursor, version }),
        saveCheckpoint: async (expectedVersion, next) => {
          if (expectedVersion !== version) return false;
          cursor = next;
          version++;
          return true;
        },
        scan,
        materialize: (candidates) =>
          materializePaymobRecoveryCandidates(
            db, candidates, new Date("2026-10-29T14:00:00Z"),
          ),
        pageSize: 1,
        maxPages,
      });

    const firstRun = await run(1);
    expect(firstRun.hasMore).toBe(true);
    expect(cursor).toEqual(first);
    expect(jobs.get("payment-1")).toBe("pending");

    const secondRun = await run(1);
    expect(secondRun.hasMore).toBe(true);
    expect(cursor).toEqual(second);
    expect(jobs.get("payment-2")).toBe("manual_review");

    const finalRun = await run(1);
    expect(finalRun.hasMore).toBe(false);
    expect(cursor).toBeNull();
    expect(jobs.size).toBe(2);
    expect(version).toBe(3);

    await run(1);
    expect(jobs.size).toBe(2);
    expect(jobs.get("payment-1")).toBe("pending");
    expect(jobs.get("payment-2")).toBe("manual_review");
  });

  it("never advances checkpoint when materialization fails", async () => {
    const scan = vi.fn().mockResolvedValue({
      candidates: [{
        paymentId: "payment-error",
        decision: "inquire_only",
      }],
      nextCursor: {
        createdAt: new Date("2026-10-29T10:00:00Z"),
        id: "payment-error",
      },
      hasMore: true,
    });

    const saveCheckpoint = vi.fn();

    await expect(coordinatePaymobRecoveryDiscovery({
      readCheckpoint: async () => ({
        cursor: null,
        version: 0,
      }),
      saveCheckpoint,
      scan,
      materialize: async () => {
        throw new Error("SIMULATED_DATABASE_FAILURE");
      },
    })).rejects.toThrow("SIMULATED_DATABASE_FAILURE");

    expect(saveCheckpoint).not.toHaveBeenCalled();
  });
});
