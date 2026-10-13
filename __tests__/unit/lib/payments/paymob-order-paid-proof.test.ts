import { describe, expect, it } from "vitest";
import {
  findSinglePaidPaymobOrderTransaction,
} from "@/lib/payments/paymob-order-paid-proof";

function payment(overrides: Record<string, unknown> = {}) {
  return {
    id: 123456789,
    success: true,
    pending: false,
    error_occured: false,
    is_voided: false,
    is_refunded: false,
    refunded_amount_cents: 0,
    amount_cents: 9000,
    currency: "EGP",
    order: { id: 987654321 },
    ...overrides,
  };
}

function prove(
  transactions: unknown[],
  overrides: Record<string, unknown> = {},
) {
  return findSinglePaidPaymobOrderTransaction({
    order: { id: 987654321, transactions },
    expectedOrderId: "987654321",
    expectedAmountCents: 9000,
    expectedCurrency: "EGP",
    ...overrides,
  });
}

describe("Paymob positive order payment proof", () => {
  it("recognizes exactly one confirmed matching payment", () => {
    expect(prove([payment()])).toBe("123456789");
  });

  it("does not mistake a failed attempt for payment", () => {
    expect(prove([payment({ success: false })])).toBeNull();
  });

  it("does not mistake a processing attempt for payment", () => {
    expect(prove([payment({ pending: true })])).toBeNull();
  });

  it("rejects a different amount", () => {
    expect(prove([payment({ amount_cents: 9100 })])).toBeNull();
  });

  it("rejects a different currency", () => {
    expect(prove([payment({ currency: "USD" })])).toBeNull();
  });

  it("rejects a different Paymob order", () => {
    expect(prove([payment({ order: { id: 999 } })])).toBeNull();
  });

  it("rejects refunded or voided transactions", () => {
    expect(prove([payment({ is_refunded: true })])).toBeNull();
    expect(prove([payment({ is_voided: true })])).toBeNull();
  });

  it("fails closed when required retained-funds evidence is missing", () => {
    for (const key of [
      "error_occured",
      "is_voided",
      "is_refunded",
      "refunded_amount_cents",
    ]) {
      const incomplete: Record<string, unknown> = payment();
      delete incomplete[key];
      expect(prove([incomplete]), key).toBeNull();
    }
  });

  it("rejects ambiguous refund and void fields", () => {
    expect(prove([payment({ refunded_amount_cents: "0" })])).toBeNull();
    expect(prove([payment({ refunded_amount_cents: null })])).toBeNull();
    expect(prove([payment({ is_void: true })])).toBeNull();
    expect(prove([payment({ refunded_amount_cents_int: 100 })])).toBeNull();
    expect(prove([payment({ refunded_amount_cents_int: null })])).toBeNull();
  });

  it("does not auto-reconcile two successful charges", () => {
    expect(
      prove([
        payment(),
        payment({ id: 123456790 }),
      ]),
    ).toBeNull();
  });

  it("accepts one success alongside a failed attempt", () => {
    expect(
      prove([
        payment({ id: 123456788, success: false }),
        payment(),
      ]),
    ).toBe("123456789");
  });

  it("fails closed if the order has no complete transaction list", () => {
    expect(
      findSinglePaidPaymobOrderTransaction({
        order: { id: 987654321 },
        expectedOrderId: "987654321",
        expectedAmountCents: 9000,
        expectedCurrency: "EGP",
      }),
    ).toBeNull();
  });

  it("never treats zero transactions as proof of failed payment", () => {
    expect(prove([])).toBeNull();
  });
});