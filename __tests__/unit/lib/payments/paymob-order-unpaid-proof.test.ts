import { describe, expect, it } from "vitest";
import { assessPaymobUnpaidOrder } from "@/lib/payments/paymob-order-unpaid-proof";

const input = {
  paymentId: "fitzone-payment-1",
  expectedOrderId: "631854294",
  expectedAmountCents: 34300,
  expectedCurrency: "EGP",
  checkedAt: new Date("2026-10-19T12:00:00Z"),
};

const unpaid = {
  id: 631854294,
  merchant_order_id: "fitzone-payment-1",
  amount_cents: 34300,
  paid_amount_cents: 0,
};

const assess = (order: unknown) =>
  assessPaymobUnpaidOrder({ ...input, order });

describe("Paymob unpaid order evidence", () => {
  it("accepts matching unpaid order with zero collected amount", () => {
    expect(assess(unpaid)).toMatchObject({
      paymentId: "fitzone-payment-1",
      orderId: "631854294",
      paidAmountCents: 0,
    });
  });

  it("rejects missing order", () => {
    expect(assess(null)).toBeNull();
  });

  it("rejects wrong order identity", () => {
    expect(assess({ ...unpaid, id: 999 })).toBeNull();
  });

  it("rejects wrong merchant identity", () => {
    expect(assess({
      ...unpaid,
      merchant_order_id: "other-payment",
    })).toBeNull();
  });

  it("rejects missing merchant identity", () => {
    expect(assess({
      ...unpaid,
      merchant_order_id: undefined,
    })).toBeNull();
  });

  it("rejects wrong amount", () => {
    expect(assess({
      ...unpaid,
      amount_cents: 99900,
    })).toBeNull();
  });

  it("rejects nonzero collected funds", () => {
    expect(assess({
      ...unpaid,
      paid_amount_cents: 34300,
    })).toBeNull();
  });

  it("rejects a contradictory paid flag", () => {
    expect(assess({
      ...unpaid,
      is_paid: true,
    })).toBeNull();
  });

  it("rejects contradictory transaction success", () => {
    expect(assess({
      ...unpaid,
      transactions: [{ success: true }],
    })).toBeNull();
  });

  it("rejects refund evidence", () => {
    expect(assess({
      ...unpaid,
      refunded_amount_cents: 100,
    })).toBeNull();
  });

  it("rejects conflicting currency", () => {
    expect(assess({
      ...unpaid,
      currency: "USD",
    })).toBeNull();
  });

  it("accepts explicitly failed attempts with zero paid amount", () => {
    expect(assess({
      ...unpaid,
      transactions: [{ success: false, pending: false }],
    })).not.toBeNull();
  });
});
