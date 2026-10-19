import { describe, expect, it } from "vitest";
import { assessPaymobOrderPositiveProof } from "@/lib/payments/paymob-order-positive-proof";

const input = {
  expectedOrderId: "631854294",
  expectedMerchantOrderId: "fitzone-payment-1",
  expectedAmountCents: 34300,
  expectedCurrency: "EGP",
};

const paidTransaction = {
  id: 553643635,
  success: true,
  pending: false,
  error_occured: false,
  is_voided: false,
  is_refunded: false,
  refunded_amount_cents: 0,
  amount_cents: 34300,
  currency: "EGP",
  order: { id: 631854294 },
};

const order = {
  id: 631854294,
  merchant_order_id: "fitzone-payment-1",
  amount_cents: 34300,
  paid_amount_cents: 34300,
  transactions: [paidTransaction],
};

const assess = (value: unknown) =>
  assessPaymobOrderPositiveProof({ ...input, order: value });

describe("Paymob order financial finality", () => {
  it("accepts one fully verified paid attempt", () => {
    expect(assess(order)).toBe("553643635");
  });

  it("never treats an unavailable order as no-charge proof", () => {
    expect(assess(null)).toBeNull();
  });

  it("does not trust zero paid amount without transactions", () => {
    expect(assess({
      ...order,
      paid_amount_cents: 0,
      transactions: undefined,
    })).toBeNull();
  });

  it("does not treat failed attempts as paid", () => {
    expect(assess({
      ...order,
      paid_amount_cents: 0,
      transactions: [{ ...paidTransaction, success: false }],
    })).toBeNull();
  });

  it("rejects mismatched merchant identity", () => {
    expect(assess({
      ...order,
      merchant_order_id: "another-payment",
    })).toBeNull();
  });

  it("rejects mismatched order amount", () => {
    expect(assess({
      ...order,
      amount_cents: 99900,
    })).toBeNull();
  });

  it("rejects contradictory order paid totals", () => {
    expect(assess({
      ...order,
      paid_amount_cents: 0,
    })).toBeNull();
  });

  it("blocks multiple successful charges", () => {
    expect(assess({
      ...order,
      paid_amount_cents: 68600,
      transactions: [
        paidTransaction,
        { ...paidTransaction, id: 553643636 },
      ],
    })).toBeNull();
  });

  it("permits a successful retry after a failed attempt", () => {
    expect(assess({
      ...order,
      transactions: [
        { ...paidTransaction, id: 553643634, success: false },
        paidTransaction,
      ],
    })).toBe("553643635");
  });

  it("rejects refunded payments", () => {
    expect(assess({
      ...order,
      transactions: [{
        ...paidTransaction,
        is_refunded: true,
      }],
    })).toBeNull();
  });
});
