import { describe, expect, it, vi } from "vitest";
import {
  materializePaymobRecoveryCandidates,
} from "@/lib/payments/paymob-auto-recovery-materializer";

const now = new Date("2026-10-29T14:00:00Z");

describe("Paymob recovery materializer transition safety", () => {
  it("does not reopen completed recovery jobs", async () => {
    const upsert = vi.fn().mockResolvedValue({
      status: "completed",
    });

    await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "payment-completed", decision: "inquire_only" }],
      now,
    );

    expect(upsert.mock.calls[0][0].update).toEqual({});
  });

  it("never automatically resumes a manual-review job", async () => {
    const upsert = vi.fn().mockResolvedValue({
      status: "manual_review",
    });

    await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "payment-review", decision: "inquire_only" }],
      now,
    );

    expect(upsert.mock.calls[0][0].update).toEqual({});
  });

  it("records newly detected manual-review conditions safely", async () => {
    const upsert = vi.fn().mockResolvedValue({
      status: "retry",
    });

    await materializePaymobRecoveryCandidates(
      { paymobRecoveryJob: { upsert } },
      [{ paymentId: "payment-needs-review", decision: "manual_review" }],
      now,
    );

    const args = upsert.mock.calls[0][0];

    expect(args.create.status).toBe("manual_review");

    // Existing jobs must not be reset without a guarded
    // state transition and fresh financial evidence.
    expect(args.update).toEqual({});
  });
});
