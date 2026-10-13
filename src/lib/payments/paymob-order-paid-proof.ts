type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

/**
 * Positive payment proof ONLY.
 *
 * Never interprets absence of a paid transaction as permission
 * to create another checkout or refund wallet adjustments.
 */
export function findSinglePaidPaymobOrderTransaction(input: {
  order: unknown;
  expectedOrderId: string;
  expectedAmountCents: number;
  expectedCurrency: string;
}): string | null {
  const order = record(input.order);

  if (
    !order ||
    String(order.id ?? "") !== input.expectedOrderId ||
    !Array.isArray(order.transactions) ||
    !Number.isSafeInteger(input.expectedAmountCents) ||
    input.expectedAmountCents <= 0
  ) {
    return null;
  }

  const currency = input.expectedCurrency.trim().toUpperCase();

  if (!currency) return null;

  const paidIds: string[] = [];

  for (const value of order.transactions) {
    const payment = record(value);

    if (!payment) return null;

    const paymentOrder = record(payment.order);

    if (
      paymentOrder &&
      String(paymentOrder.id ?? "") !== input.expectedOrderId
    ) {
      return null;
    }

    if (
      payment.success !== true ||
      payment.pending !== false
    ) {
      continue;
    }

    // Any suspicious paid record requires manual reconciliation.
    if (
      payment.error_occured !== false ||
      payment.is_voided !== false ||
      payment.is_refunded !== false ||
      typeof payment.refunded_amount_cents !== "number" ||
      !Number.isFinite(payment.refunded_amount_cents) ||
      payment.refunded_amount_cents !== 0 ||
      (payment.is_void !== undefined && payment.is_void !== false) ||
      (payment.refunded_amount_cents_int !== undefined &&
        payment.refunded_amount_cents_int !== 0)
    ) {
      // Missing or ambiguous finality evidence requires reconciliation.
      return null;
    }

    if (
      Number(payment.amount_cents) !== input.expectedAmountCents ||
      String(payment.currency ?? "").trim().toUpperCase() !== currency
    ) {
      return null;
    }

    const id = String(payment.id ?? "");

    if (!/^[0-9]+$/.test(id)) {
      return null;
    }

    paidIds.push(id);
  }

  // Multiple successful payments must not be silently reconciled.
  return paidIds.length === 1 ? paidIds[0] : null;
}