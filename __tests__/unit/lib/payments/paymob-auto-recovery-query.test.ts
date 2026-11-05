import { describe, expect, it } from "vitest";
import {
  buildPaymobRecoveryCandidateWhere,
} from "@/lib/payments/paymob-auto-recovery-query";

describe("Paymob recovery query contract", () => {
  it("limits scanning to Paymob membership payments", () => {
    const where = buildPaymobRecoveryCandidateWhere();
    expect(where).toMatchObject({
      provider: "paymob",
      purpose: "membership",
      membershipId: { not: null },
    });
  });

  it("includes unresolved and paid crash-window payments", () => {
    const where = buildPaymobRecoveryCandidateWhere();
    const text = JSON.stringify(where);

    for (const status of [
      "pending", "requires_action", "processing",
      "failed", "cancelled", "expired", "paid",
    ]) {
      expect(text).toContain(status);
    }
  });

  it("does not impose a recent-only createdAt cutoff", () => {
    const where = buildPaymobRecoveryCandidateWhere();
    expect(JSON.stringify(where)).not.toContain("createdAt");
  });
});
