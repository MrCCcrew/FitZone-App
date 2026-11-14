import { describe, expect, it } from "vitest";
import {
  buildPaymobRecoveryKeysetWhere,
  nextPaymobRecoveryCursor,
} from "@/lib/payments/paymob-auto-recovery-cursor";

describe("Paymob recovery keyset cursor", () => {
  const date = new Date("2026-10-29T10:00:00.000Z");

  it("starts from the beginning without a cursor", () => {
    expect(buildPaymobRecoveryKeysetWhere(null)).toEqual({});
  });

  it("uses date and ID for deterministic progression", () => {
    expect(buildPaymobRecoveryKeysetWhere({
      createdAt: date,
      id: "payment-5",
    })).toEqual({
      OR: [
        { createdAt: { gt: date } },
        {
          createdAt: date,
          id: { gt: "payment-5" },
        },
      ],
    });
  });

  it("returns the final row as the next cursor", () => {
    expect(nextPaymobRecoveryCursor([
      { createdAt: date, id: "payment-1" },
      { createdAt: date, id: "payment-2" },
    ])).toEqual({
      createdAt: date,
      id: "payment-2",
    });
  });

  it("handles an empty page safely", () => {
    expect(nextPaymobRecoveryCursor([])).toBeNull();
  });

  it("rejects invalid cursors", () => {
    expect(() => buildPaymobRecoveryKeysetWhere({
      createdAt: new Date("invalid"),
      id: "payment-1",
    })).toThrow();
  });
});


describe("Paymob recovery cursor replay guarantees", () => {
  const date = new Date("2026-10-29T10:00:00.000Z");

  it("can restart a complete scan from the beginning", () => {
    expect(buildPaymobRecoveryKeysetWhere(null)).toEqual({});
  });

  it("can revisit an earlier unresolved transaction on a fresh pass", () => {
    const firstPass = buildPaymobRecoveryKeysetWhere({
      createdAt: date,
      id: "payment-10",
    });

    expect(firstPass).toHaveProperty("OR");

    const replay = buildPaymobRecoveryKeysetWhere(null);

    expect(replay).toEqual({});
  });

  it("keeps identical timestamps distinguishable by payment ID", () => {
    const cursor = buildPaymobRecoveryKeysetWhere({
      createdAt: date,
      id: "payment-10",
    });

    expect(cursor).toEqual({
      OR: [
        { createdAt: { gt: date } },
        {
          createdAt: date,
          id: { gt: "payment-10" },
        },
      ],
    });
  });
});
