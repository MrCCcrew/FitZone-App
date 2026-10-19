import { findSinglePaidPaymobOrderTransaction } from "./paymob-order-paid-proof";

type OrderRecord = Record<string, unknown>;

export function assessPaymobOrderPositiveProof(input: {
  order: unknown;
  expectedOrderId: string;
  expectedMerchantOrderId: string;
  expectedAmountCents: number;
  expectedCurrency: string;
}): string | null {
  const order = input.order;

  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return null;
  }

  const value = order as OrderRecord;

  if (String(value.id ?? "") !== input.expectedOrderId) {
    return null;
  }

  if (
    value.merchant_order_id != null &&
    String(value.merchant_order_id) !== input.expectedMerchantOrderId
  ) {
    return null;
  }

  if (
    value.amount_cents != null &&
    Number(value.amount_cents) !== input.expectedAmountCents
  ) {
    return null;
  }

  // Never derive negative financial finality from a zero amount.
  // A 404, missing transaction list or unpaid order is inconclusive.
  if (!Array.isArray(value.transactions)) return null;

  const paidId = findSinglePaidPaymobOrderTransaction({
    order,
    expectedOrderId: input.expectedOrderId,
    expectedAmountCents: input.expectedAmountCents,
    expectedCurrency: input.expectedCurrency,
  });

  if (!paidId) return null;

  // Reject a contradiction between a successful transaction and
  // the order's explicitly reported captured/paid total.
  if (
    value.paid_amount_cents != null &&
    (
      typeof value.paid_amount_cents !== "number" ||
      !Number.isFinite(value.paid_amount_cents) ||
      value.paid_amount_cents !== input.expectedAmountCents
    )
  ) {
    return null;
  }

  return paidId;
}
