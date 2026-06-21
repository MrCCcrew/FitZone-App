import { describe, it, expect } from "vitest";

/**
 * Commission calculation formula — mirrors service.ts:
 *   partner.commissionType === "fixed"
 *     ? partner.commissionRate
 *     : Math.round((base * partner.commissionRate) / 100 * 100) / 100
 */
function calcCommission(base: number, type: "fixed" | "percentage", rate: number): number {
  return type === "fixed" ? rate : Math.round((base * rate) / 100 * 100) / 100;
}

/**
 * Membership end date formula — mirrors service.ts:
 *   new Date(now.getTime() + duration * 24 * 60 * 60 * 1000)
 */
function membershipEndDate(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Wallet amount safety guard — mirrors extractPaymentAdjustments in service.ts:
 *   Number.isFinite(n) ? Math.max(0, n) : 0
 */
function safeWallet(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Points safety guard — mirrors extractPaymentAdjustments in service.ts:
 *   Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
 */
function safePoints(raw: unknown): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

// ─── Partner commission ────────────────────────────────────────────────────────

describe("partner commission — fixed type", () => {
  it("returns the flat rate regardless of base amount", () => {
    expect(calcCommission(1000, "fixed", 50)).toBe(50);
    expect(calcCommission(500, "fixed", 50)).toBe(50);
    expect(calcCommission(10000, "fixed", 50)).toBe(50);
  });

  it("zero fixed rate yields zero commission", () => {
    expect(calcCommission(1000, "fixed", 0)).toBe(0);
  });

  it("fixed rate is never proportional to base", () => {
    const r1 = calcCommission(100, "fixed", 20);
    const r2 = calcCommission(9999, "fixed", 20);
    expect(r1).toBe(r2);
  });
});

describe("partner commission — percentage type", () => {
  it("10% of 1000 = 100", () => {
    expect(calcCommission(1000, "percentage", 10)).toBe(100);
  });

  it("15% of 1000 = 150", () => {
    expect(calcCommission(1000, "percentage", 15)).toBe(150);
  });

  it("15% of 999 = 149.85 (two decimal precision)", () => {
    expect(calcCommission(999, "percentage", 15)).toBe(149.85);
  });

  it("5.5% of 1000 = 55", () => {
    expect(calcCommission(1000, "percentage", 5.5)).toBe(55);
  });

  it("rounds to exactly 2 decimal places", () => {
    // 100 * 33.333 / 100 = 33.333 → rounds to 33.33
    expect(calcCommission(100, "percentage", 33.333)).toBe(33.33);
  });

  it("zero base amount yields zero commission", () => {
    expect(calcCommission(0, "percentage", 15)).toBe(0);
  });

  it("100% commission equals the base amount", () => {
    expect(calcCommission(500, "percentage", 100)).toBe(500);
  });
});

// ─── Membership end date ───────────────────────────────────────────────────────

describe("membership end date calculation", () => {
  it("30-day membership adds exactly 30 days", () => {
    const start = new Date("2024-01-01T12:00:00.000Z");
    expect(membershipEndDate(start, 30).toISOString()).toBe("2024-01-31T12:00:00.000Z");
  });

  it("90-day membership adds exactly 90 days", () => {
    const start = new Date("2024-01-01T12:00:00.000Z");
    // Jan(31) + Feb(29 leap) + 30 of March = 90 days → March 31
    expect(membershipEndDate(start, 90).toISOString()).toBe("2024-03-31T12:00:00.000Z");
  });

  it("365-day annual membership adds exactly 365 days", () => {
    const start = new Date("2024-01-01T00:00:00.000Z");
    // 2024 is a leap year (366 days), so +365 = Dec 31
    expect(membershipEndDate(start, 365).toISOString()).toBe("2024-12-31T00:00:00.000Z");
  });

  it("7-day trial adds exactly 7 days", () => {
    const start = new Date("2024-06-01T10:00:00.000Z");
    expect(membershipEndDate(start, 7).toISOString()).toBe("2024-06-08T10:00:00.000Z");
  });

  it("preserves the exact time-of-day in the end date", () => {
    const start = new Date("2024-03-15T14:30:45.123Z");
    const end = membershipEndDate(start, 30);
    expect(end.getUTCHours()).toBe(14);
    expect(end.getUTCMinutes()).toBe(30);
    expect(end.getUTCSeconds()).toBe(45);
    expect(end.getUTCMilliseconds()).toBe(123);
  });

  it("crossing month boundary is handled correctly", () => {
    const start = new Date("2024-01-31T00:00:00.000Z");
    expect(membershipEndDate(start, 1).toISOString()).toBe("2024-02-01T00:00:00.000Z");
  });
});

// ─── Payment adjustment safety guards ─────────────────────────────────────────

describe("wallet amount safety guard", () => {
  it("accepts positive numbers unchanged", () => {
    expect(safeWallet(100)).toBe(100);
    expect(safeWallet(0.5)).toBe(0.5);
    expect(safeWallet(1)).toBe(1);
  });

  it("clamps negative amounts to 0", () => {
    expect(safeWallet(-50)).toBe(0);
    expect(safeWallet(-0.01)).toBe(0);
  });

  it("zero stays zero", () => {
    expect(safeWallet(0)).toBe(0);
  });

  it("NaN is treated as 0", () => {
    expect(safeWallet(NaN)).toBe(0);
  });

  it("Infinity is treated as 0", () => {
    expect(safeWallet(Infinity)).toBe(0);
    expect(safeWallet(-Infinity)).toBe(0);
  });

  it("null and undefined default to 0", () => {
    expect(safeWallet(null)).toBe(0);
    expect(safeWallet(undefined)).toBe(0);
  });

  it("numeric strings are converted", () => {
    expect(safeWallet("100")).toBe(100);
    expect(safeWallet("0")).toBe(0);
  });
});

describe("points count safety guard", () => {
  it("accepts positive integers unchanged", () => {
    expect(safePoints(10)).toBe(10);
    expect(safePoints(1000)).toBe(1000);
  });

  it("floors fractional values — no fractional loyalty points", () => {
    expect(safePoints(9.9)).toBe(9);
    expect(safePoints(1.1)).toBe(1);
    expect(safePoints(0.99)).toBe(0);
  });

  it("clamps negative values to 0", () => {
    expect(safePoints(-5)).toBe(0);
    expect(safePoints(-0.1)).toBe(0);
  });

  it("NaN and Infinity are treated as 0", () => {
    expect(safePoints(NaN)).toBe(0);
    expect(safePoints(Infinity)).toBe(0);
  });

  it("null and undefined default to 0", () => {
    expect(safePoints(null)).toBe(0);
    expect(safePoints(undefined)).toBe(0);
  });
});
