export type PaymobUnpaidOrderProof = {
  paymentId: string;
  orderId: string;
  merchantOrderId: string;
  amountCents: number;
  currency: string;
  paidAmountCents: 0;
  checkedAt: string;
};

export function assessPaymobUnpaidOrder(input: {
  order: unknown;
  paymentId: string;
  expectedOrderId: string;
  expectedAmountCents: number;
  expectedCurrency: string;
  checkedAt: Date;
}): PaymobUnpaidOrderProof | null {
  if (!input.order || typeof input.order !== "object" ||
      Array.isArray(input.order)) return null;

  const order = input.order as Record<string, unknown>;
  const currency = input.expectedCurrency.trim().toUpperCase();

  if (!/^[0-9]+$/.test(input.expectedOrderId) ||
      !input.paymentId ||
      !Number.isSafeInteger(input.expectedAmountCents) ||
      input.expectedAmountCents <= 0 ||
      !currency) return null;

  if (String(order.id ?? "") !== input.expectedOrderId ||
      order.merchant_order_id !== input.paymentId ||
      order.amount_cents !== input.expectedAmountCents ||
      order.paid_amount_cents !== 0 ||
      order.is_paid === true ||
      order.is_refunded === true ||
      order.is_voided === true) return null;

  if (order.currency != null &&
      String(order.currency).trim().toUpperCase() !== currency) {
    return null;
  }

  if (order.refunded_amount_cents != null &&
      order.refunded_amount_cents !== 0) return null;

  if (order.transactions != null) {
    if (!Array.isArray(order.transactions)) return null;

    for (const transaction of order.transactions) {
      if (!transaction ||
          typeof transaction !== "object" ||
          Array.isArray(transaction)) return null;

      if (transaction.success === true) return null;
    }
  }

  if (!Number.isFinite(input.checkedAt.getTime())) return null;

  return {
    paymentId: input.paymentId,
    orderId: input.expectedOrderId,
    merchantOrderId: input.paymentId,
    amountCents: input.expectedAmountCents,
    currency,
    paidAmountCents: 0,
    checkedAt: input.checkedAt.toISOString(),
  };
}


/**
 * Recheck persisted payment ownership and original expiration inside
 * the atomic cleanup transaction. An external order inquiry alone
 * must never authorize financial restoration.
 */
export function canSettleExpiredPaymobOrder(input: {
  proof: PaymobUnpaidOrderProof | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    expiresAt: Date | null;
    providerPayload: string | null;
  };
  membershipExpiresAt: Date | null;
  now: Date;
}): boolean {
  const { proof, payment, membershipExpiresAt, now } = input;
  if (!proof || !membershipExpiresAt) return false;

  const nowMs = now.getTime();
  const holdMs = membershipExpiresAt.getTime();
  const paymentMs = payment.expiresAt?.getTime();
  const checkedMs = Date.parse(proof.checkedAt);

  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(holdMs) ||
    paymentMs == null ||
    !Number.isFinite(paymentMs) ||
    !Number.isFinite(checkedMs) ||
    holdMs > nowMs ||
    paymentMs > nowMs ||
    checkedMs < holdMs ||
    checkedMs > nowMs + 3000 ||
    nowMs - checkedMs > 90000
  ) return false;

  if (
    !["pending", "requires_action", "failed"].includes(payment.status) ||
    proof.paymentId !== payment.id ||
    proof.merchantOrderId !== payment.id ||
    proof.paidAmountCents !== 0 ||
    proof.amountCents !== Math.round(payment.amount * 100) ||
    proof.currency !== payment.currency.trim().toUpperCase()
  ) return false;

  if (!payment.providerPayload) return false;

  try {
    const payload = JSON.parse(payment.providerPayload) as unknown;
    if (!payload || typeof payload !== "object" ||
        Array.isArray(payload)) return false;

    const saved = payload as Record<string, unknown>;

    return (
      /^[0-9]+$/.test(proof.orderId) &&
      String(saved.intentionOrderId ?? "") === proof.orderId
    );
  } catch {
    return false;
  }
}
