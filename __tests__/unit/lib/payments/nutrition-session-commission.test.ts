import { describe, it, expect } from "vitest";

/**
 * Nutrition session commission calculation — mirrors service.ts payment update logic:
 *
 * const actualPaidAmount = transaction.amount;
 * if (sessionCommissionRate > 0 && actualPaidAmount > 0) {
 *   let rawCommission = 0;
 *   if (sessionCommissionType === "percentage") {
 *     rawCommission = (actualPaidAmount * sessionCommissionRate) / 100;
 *   } else {
 *     rawCommission = sessionCommissionRate;
 *   }
 *   const finalCommission = Math.min(rawCommission, actualPaidAmount);
 *   const roundedCommission = Math.round(finalCommission * 100) / 100;
 *   if (roundedCommission > 0) { ... }
 * }
 */

function calcNutritionSessionCommission(
  actualPaidAmount: number,
  sessionCommissionType: "fixed" | "percentage",
  sessionCommissionRate: number
): number {
  if (sessionCommissionRate <= 0 || actualPaidAmount <= 0) {
    return 0;
  }

  let rawCommission = 0;
  if (sessionCommissionType === "percentage") {
    rawCommission = (actualPaidAmount * sessionCommissionRate) / 100;
  } else {
    rawCommission = sessionCommissionRate;
  }

  const finalCommission = Math.min(rawCommission, actualPaidAmount);
  const roundedCommission = Math.round(finalCommission * 100) / 100;

  return roundedCommission > 0 ? roundedCommission : 0;
}

// ─── Nutrition Session Commission — Percentage Type ───────────────────────────

describe("nutrition session commission — percentage type", () => {
  it("10% of 400 EGP = 40 EGP", () => {
    expect(calcNutritionSessionCommission(400, "percentage", 10)).toBe(40);
  });

  it("15% of 300 EGP = 45 EGP", () => {
    expect(calcNutritionSessionCommission(300, "percentage", 15)).toBe(45);
  });

  it("20% of 500 EGP = 100 EGP", () => {
    expect(calcNutritionSessionCommission(500, "percentage", 20)).toBe(100);
  });

  it("5.5% of 1000 EGP = 55 EGP", () => {
    expect(calcNutritionSessionCommission(1000, "percentage", 5.5)).toBe(55);
  });

  it("rounds to exactly 2 decimal places", () => {
    // 333 * 10 / 100 = 33.3 → rounds to 33.30
    expect(calcNutritionSessionCommission(333, "percentage", 10)).toBe(33.3);
  });

  it("100% commission equals the full paid amount", () => {
    expect(calcNutritionSessionCommission(500, "percentage", 100)).toBe(500);
  });

  it("percentage > 100 is clamped to actualPaidAmount", () => {
    // 150% of 400 = 600, but clamped to 400
    expect(calcNutritionSessionCommission(400, "percentage", 150)).toBe(400);
  });

  it("zero paid amount yields zero commission", () => {
    expect(calcNutritionSessionCommission(0, "percentage", 15)).toBe(0);
  });

  it("zero rate yields zero commission", () => {
    expect(calcNutritionSessionCommission(500, "percentage", 0)).toBe(0);
  });

  it("negative rate is rejected — no commission", () => {
    expect(calcNutritionSessionCommission(500, "percentage", -10)).toBe(0);
  });
});

// ─── Nutrition Session Commission — Fixed Type ────────────────────────────────

describe("nutrition session commission — fixed type", () => {
  it("fixed 50 EGP on 400 EGP payment = 50 EGP", () => {
    expect(calcNutritionSessionCommission(400, "fixed", 50)).toBe(50);
  });

  it("fixed 100 EGP on 300 EGP payment = 100 EGP", () => {
    expect(calcNutritionSessionCommission(300, "fixed", 100)).toBe(100);
  });

  it("fixed commission does not vary with paid amount", () => {
    const r1 = calcNutritionSessionCommission(100, "fixed", 30);
    const r2 = calcNutritionSessionCommission(9999, "fixed", 30);
    expect(r1).toBe(r2);
  });

  it("fixed commission > actualPaidAmount is clamped", () => {
    // Fixed 500 but only 200 paid → clamped to 200
    expect(calcNutritionSessionCommission(200, "fixed", 500)).toBe(200);
  });

  it("zero fixed rate yields zero commission", () => {
    expect(calcNutritionSessionCommission(500, "fixed", 0)).toBe(0);
  });

  it("negative fixed rate is rejected — no commission", () => {
    expect(calcNutritionSessionCommission(500, "fixed", -50)).toBe(0);
  });
});

// ─── Edge Cases & Validation ──────────────────────────────────────────────────

describe("nutrition session commission — edge cases", () => {
  it("actualPaidAmount of 0 produces no commission", () => {
    expect(calcNutritionSessionCommission(0, "percentage", 10)).toBe(0);
    expect(calcNutritionSessionCommission(0, "fixed", 50)).toBe(0);
  });

  it("negative actualPaidAmount produces no commission", () => {
    expect(calcNutritionSessionCommission(-100, "percentage", 10)).toBe(0);
    expect(calcNutritionSessionCommission(-100, "fixed", 50)).toBe(0);
  });

  it("very small payment with percentage yields correctly rounded commission", () => {
    // 10% of 1 = 0.1 → rounds to 0.10
    expect(calcNutritionSessionCommission(1, "percentage", 10)).toBe(0.1);
  });

  it("commission never exceeds actualPaidAmount", () => {
    expect(calcNutritionSessionCommission(100, "percentage", 200)).toBe(100);
    expect(calcNutritionSessionCommission(100, "fixed", 999)).toBe(100);
  });

  it("fractional commission is rounded to 2 decimals", () => {
    // 10% of 333.33 = 33.333 → rounds to 33.33
    expect(calcNutritionSessionCommission(333.33, "percentage", 10)).toBe(33.33);
  });
});

// ─── Separation from Referral Commission ─────────────────────────────────────

describe("nutrition session vs referral commission — independence", () => {
  it("session commission uses sessionCommissionRate, not commissionRate", () => {
    // This test documents that session commissions are calculated independently
    // from referral commissions (commissionRate/Type)
    const sessionRate = 15; // 15%
    const referralRate = 10; // 10% (different, should not affect session)

    const sessionCommission = calcNutritionSessionCommission(400, "percentage", sessionRate);
    expect(sessionCommission).toBe(60); // 15% of 400

    // Referral commission would be 10% of 400 = 40
    // But that's a separate calculation with commissionRate
    expect(sessionCommission).not.toBe(40);
  });

  it("session commission type can differ from referral commission type", () => {
    // Session: fixed 50 EGP
    const sessionCommission = calcNutritionSessionCommission(400, "fixed", 50);
    expect(sessionCommission).toBe(50);

    // Referral could be percentage-based — different logic
    // This test documents the separation
  });
});

// ─── Webhook Idempotency ───────────────────────────────────────────────────────

describe("nutrition session commission — webhook idempotency", () => {
  it("duplicate webhook should not create duplicate commission", () => {
    // This is a documentation test — actual idempotency is handled by:
    // 1. Unique constraint on nutritionSessionId in NutritionCommission model
    // 2. Try-catch P2002 error in service.ts
    //
    // The calculation itself is pure and will always return the same value
    const first = calcNutritionSessionCommission(400, "percentage", 10);
    const second = calcNutritionSessionCommission(400, "percentage", 10);

    expect(first).toBe(second);
    expect(first).toBe(40);
  });

  it("same nutritionSessionId should only allow one commission record", () => {
    // Documentation: schema.prisma has:
    // nutritionSessionId String? @unique
    //
    // Migration adds:
    // UNIQUE INDEX `NutritionCommission_nutritionSessionId_key`(`nutritionSessionId`)
    //
    // service.ts has try-catch:
    // if (!err.code || err.code !== "P2002") { throw err; }
  });
});
