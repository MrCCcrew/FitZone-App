import { describe, expect, it } from "vitest";
import { assessPaymobOrderPositiveProof, assessPaymobOrderAndAcceptanceProof } from "@/lib/payments/paymob-order-positive-proof";

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

describe("Live Paymob Order and Acceptance recovery proof", () => {
  const liveOrder = {
    id: 631854294,
    merchant_order_id: "fitzone-payment-1",
    amount_cents: 34300,
    paid_amount_cents: 34300,
    currency: "EGP",
    is_cancel: false,
    is_canceled: false,
    is_return: false,
    is_returned: false,
  };

  const acceptance = {
    id: 553643635,
    success: true,
    pending: false,
    error_occured: false,
    is_refunded: false,
    is_voided: false,
    refunded_amount_cents: 0,
    amount_cents: 34300,
    currency: "EGP",
    order: {
      id: 631854294,
      merchant_order_id: "fitzone-payment-1",
    },
  };

  const verify = (orderValue: unknown, acceptanceValue: unknown) =>
    assessPaymobOrderAndAcceptanceProof({
      order: orderValue,
      acceptance: acceptanceValue,
      expectedOrderId: "631854294",
      expectedMerchantOrderId: "fitzone-payment-1",
      expectedTransactionId: "553643635",
      expectedAmountCents: 34300,
      expectedCurrency: "EGP",
    });

  it("accepts two matching live provider responses without a transaction list", () => {
    expect(verify(liveOrder, acceptance)).toBe(true);
  });

  it("rejects absent, malformed or conflicting Order evidence", () => {
    const invalid = [
      null,
      { ...liveOrder, id: 1 },
      { ...liveOrder, merchant_order_id: "another-payment" },
      { ...liveOrder, amount_cents: 1 },
      { ...liveOrder, paid_amount_cents: 0 },
      { ...liveOrder, paid_amount_cents: 68600 },
      { ...liveOrder, paid_amount_cents: undefined },
      { ...liveOrder, currency: "USD" },
      { ...liveOrder, is_cancel: true },
      { ...liveOrder, is_returned: true },
      { ...liveOrder, transactions: null },
      { ...liveOrder, transactions: [] },
    ];

    for (const value of invalid) {
      expect(verify(value, acceptance)).toBe(false);
    }
  });

  it("rejects wrong, unpaid, refunded or mismatched Acceptance evidence", () => {
    const invalid = [
      null,
      { ...acceptance, id: 553643636 },
      { ...acceptance, success: false },
      { ...acceptance, pending: true },
      { ...acceptance, error_occured: true },
      { ...acceptance, is_refunded: true },
      { ...acceptance, is_voided: true },
      { ...acceptance, refunded_amount_cents: 100 },
      { ...acceptance, amount_cents: 1 },
      { ...acceptance, currency: "USD" },
      { ...acceptance, order: { ...acceptance.order, id: 1 } },
      {
        ...acceptance,
        order: {
          ...acceptance.order,
          merchant_order_id: "another-payment",
        },
      },
    ];

    for (const value of invalid) {
      expect(verify(liveOrder, value)).toBe(false);
    }
  });
});
