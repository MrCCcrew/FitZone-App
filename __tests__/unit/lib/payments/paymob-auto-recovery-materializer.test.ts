import { describe, expect, it, vi } from "vitest";
import {
  materializePaymobRecoveryCandidates,
} from "@/lib/payments/paymob-auto-recovery-materializer";

const now = new Date("2026-10-29T13:00:00Z");

describe("Paymob recovery job materialization", () => {
  it("schedules actionable payment candidates", async () => {
    const upsert = vi.fn().mockResolvedValue({});

    const result = await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [
        { paymentId: "p1", decision: "inquire_only" },
        { paymentId: "p2", decision: "repair_paid_membership" },
      ],
      now,
    );

    expect(result).toEqual({ scheduled: 2, skipped: 0 });
    expect(upsert).toHaveBeenCalledTimes(2);

    for (const [args] of upsert.mock.calls) {
      expect(args.update).toEqual({});
      expect(args.create.status).toBe("pending");
    }
  });

  it("never schedules skipped payments", async () => {
    const upsert = vi.fn();

    expect(await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "paid-complete", decision: "skip" }],
      now,
    )).toEqual({ scheduled: 0, skipped: 1 });

    expect(upsert).not.toHaveBeenCalled();
  });

  it("records manual review without automatic execution", async () => {
    const upsert = vi.fn().mockResolvedValue({});

    await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "paid-cancelled", decision: "manual_review" }],
      now,
    );

    expect(upsert.mock.calls[0][0].create.status)
      .toBe("manual_review");
    expect(upsert.mock.calls[0][0].update).toEqual({});
  });

  it("deduplicates within the scan batch", async () => {
    const upsert = vi.fn().mockResolvedValue({});

    const result = await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [
        { paymentId: "same-payment", decision: "inquire_only" },
        { paymentId: "same-payment", decision: "inquire_only" },
      ],
      now,
    );

    expect(result).toEqual({ scheduled: 1, skipped: 1 });
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("keeps existing database job state unchanged", async () => {
    const upsert = vi.fn().mockResolvedValue({
      status: "completed",
    });

    await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "previously-completed", decision: "inquire_only" }],
      now,
    );

    expect(upsert.mock.calls[0][0].update).toEqual({});
  });

  it("rejects invalid candidates before writing", async () => {
    const upsert = vi.fn();

    await expect(materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [
        { paymentId: "valid", decision: "inquire_only" },
        { paymentId: " ", decision: "inquire_only" },
      ],
      now,
    )).rejects.toThrow("INVALID_RECOVERY_CANDIDATE");

    expect(upsert).not.toHaveBeenCalled();
  });
});
