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
/**
 * Live Paymob Orders may omit the transactions array.
 *
 * This fallback is ONLY for a separately fetched Acceptance Transaction
 * plus an independently fetched Order. Neither response alone is enough.
 *
 * The legacy transaction-list proof remains unchanged.
 */
export function assessPaymobOrderAndAcceptanceProof(input: {
  order: unknown;
  acceptance: unknown;
  expectedOrderId: string;
  expectedMerchantOrderId: string;
  expectedTransactionId: string;
  expectedAmountCents: number;
  expectedCurrency: string;
}): boolean {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  if (
    !isRecord(input.order) ||
    !isRecord(input.acceptance) ||
    !/^[1-9][0-9]*$/.test(input.expectedOrderId) ||
    !/^[1-9][0-9]*$/.test(input.expectedTransactionId) ||
    !input.expectedMerchantOrderId ||
    !Number.isSafeInteger(input.expectedAmountCents) ||
    input.expectedAmountCents <= 0 ||
    !input.expectedCurrency.trim()
  ) {
    return false;
  }

  const order = input.order;
  const tx = input.acceptance;

  // A present but malformed transaction list is not a missing list.
  // Never bypass the existing multi-charge checks.
  if (order.transactions !== undefined) return false;

  if (!isRecord(tx.order)) return false;

  const expectedCurrency = input.expectedCurrency.toUpperCase();

  if (
    String(order.id ?? "") !== input.expectedOrderId ||
    String(order.merchant_order_id ?? "") !== input.expectedMerchantOrderId ||
    Number(order.amount_cents) !== input.expectedAmountCents ||
    String(order.currency ?? "").toUpperCase() !== expectedCurrency ||
    typeof order.paid_amount_cents !== "number" ||
    !Number.isFinite(order.paid_amount_cents) ||
    order.paid_amount_cents !== input.expectedAmountCents ||
    order.is_cancel === true ||
    order.is_canceled === true ||
    order.is_return === true ||
    order.is_returned === true
  ) {
    return false;
  }

  if (
    String(tx.id ?? "") !== input.expectedTransactionId ||
    tx.success !== true ||
    tx.pending !== false ||
    tx.error_occured !== false ||
    tx.is_refunded !== false ||
    tx.is_voided !== false ||
    (
      tx.refunded_amount_cents != null &&
      Number(tx.refunded_amount_cents) !== 0
    ) ||
    Number(tx.amount_cents) !== input.expectedAmountCents ||
    String(tx.currency ?? "").toUpperCase() !== expectedCurrency ||
    String(tx.order.id ?? "") !== input.expectedOrderId ||
    String(tx.order.merchant_order_id ?? "") !== input.expectedMerchantOrderId
  ) {
    return false;
  }

  return true;
}
