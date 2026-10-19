import { describe, expect, it } from "vitest";
import {
  canSettleExpiredPaymobOrder,
} from "@/lib/payments/paymob-order-unpaid-proof";

const now = new Date("2026-10-19T12:00:00Z");
const expiry = new Date("2026-10-19T11:59:00Z");

const proof = {
  paymentId: "payment-1",
  merchantOrderId: "payment-1",
  orderId: "631854294",
  amountCents: 34300,
  currency: "EGP",
  paidAmountCents: 0 as const,
  checkedAt: now.toISOString(),
};

const payment = {
  id: "payment-1",
  status: "pending",
  amount: 343,
  currency: "EGP",
  expiresAt: expiry,
  providerPayload: JSON.stringify({
    intentionOrderId: "631854294",
  }),
};

const assess = (overrides: Record<string, unknown> = {}) =>
  canSettleExpiredPaymobOrder({
    proof,
    payment,
    membershipExpiresAt: expiry,
    now,
    ...overrides,
  });

describe("Paymob automated no-charge settlement gate", () => {
  it("allows matching unpaid proof after original hold expires", () => {
    expect(assess()).toBe(true);
  });

  it("rejects a still-valid 60-minute membership hold", () => {
    expect(assess({
      membershipExpiresAt: new Date(now.getTime() + 60000),
    })).toBe(false);
  });

  it("rejects a still-payable provider checkout", () => {
    expect(assess({
      payment: {
        ...payment,
        expiresAt: new Date(now.getTime() + 60000),
      },
    })).toBe(false);
  });

  it("rejects proof for a different payment", () => {
    expect(assess({
      proof: { ...proof, paymentId: "another-payment" },
    })).toBe(false);
  });

  it("rejects proof for a different Paymob order", () => {
    expect(assess({
      proof: { ...proof, orderId: "999999" },
    })).toBe(false);
  });

  it("rejects amount differences", () => {
    expect(assess({
      proof: { ...proof, amountCents: 99900 },
    })).toBe(false);
  });

  it("rejects paid or processing local states", () => {
    for (const status of ["paid", "processing", "retrying"]) {
      expect(assess({
        payment: { ...payment, status },
      })).toBe(false);
    }
  });

  it("rejects absent or stale provider proof", () => {
    expect(assess({ proof: null })).toBe(false);
    expect(assess({
      proof: {
        ...proof,
        checkedAt: new Date(now.getTime() - 120000).toISOString(),
      },
    })).toBe(false);
  });

  it("rejects proof obtained before hold expiration", () => {
    expect(assess({
      proof: {
        ...proof,
        checkedAt: new Date(expiry.getTime() - 1000).toISOString(),
      },
    })).toBe(false);
  });

  it("rejects invalid provider payload", () => {
    expect(assess({
      payment: { ...payment, providerPayload: "{bad" },
    })).toBe(false);
  });

  it("accepts a failed local attempt only with fresh order proof", () => {
    expect(assess({
      payment: { ...payment, status: "failed" },
    })).toBe(true);
  });
});
