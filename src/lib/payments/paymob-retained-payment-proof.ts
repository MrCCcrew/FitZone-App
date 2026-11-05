/**
 * Positive financial finality proof for an Acceptance attempt.
 * A webhook/transaction lookup reporting success is not sufficient
 * when a refund, void or provider error was also recorded.
 */
export function isFinalRetainedPaymobPayment(tx: {
  success?: boolean;
  pending?: boolean;
  error_occured?: boolean;
  is_refunded?: boolean;
  is_voided?: boolean;
  refunded_amount_cents?: number;
}): boolean {
  return (
    tx.success === true &&
    tx.pending === false &&
    tx.error_occured === false &&
    tx.is_refunded === false &&
    tx.is_voided === false &&
    Number(tx.refunded_amount_cents ?? 0) === 0
  );
}
