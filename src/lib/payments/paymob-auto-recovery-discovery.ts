import {
  executeVerifiedPaymobRecovery,
  type PaymobRecoveryIdentity,
  type PaymobVerifiedRecoveryDependencies,
} from "./paymob-auto-recovery-bridge";

export type PaymobDiscoveryResult = {
  found: boolean;
  status: "paid" | "pending" | "failed";
  paymobTransactionId: string | null;
  merchantOrderId: string | null;
  amountCents: number | null;
  currency: string | null;
  pending: boolean | null;
  success: boolean | null;
  retainedPaymentFailure?:
    | "refunded"
    | "voided"
    | "partially_refunded"
    | "duplicate_charge";
};

export type PaymobAutoRecoveryDiscoveryDependencies =
  PaymobVerifiedRecoveryDependencies & {
    inquire: (localPaymentId: string) => Promise<PaymobDiscoveryResult>;
    inquireOrderAttempts?: (
      localPaymentId: string,
      paymobOrderId: string | null,
    ) => Promise<PaymobDiscoveryResult>;
  };

export async function discoverAndRecoverPaymobPayment(
  identity: Omit<PaymobRecoveryIdentity, "paymobTransactionId">,
  deps: PaymobAutoRecoveryDiscoveryDependencies,
): Promise<"paid_recovered" | "unresolved"> {
  const inquiry = await deps.inquire(identity.paymentTransactionId);
  const expectedCents = Math.round(identity.expectedAmount * 100);

  const isMatchingPaidAttempt = (candidate: PaymobDiscoveryResult) =>
    candidate.found === true &&
    candidate.status === "paid" &&
    candidate.success === true &&
    candidate.pending === false &&
    candidate.merchantOrderId === identity.paymentTransactionId &&
    !!candidate.paymobTransactionId &&
    /^[1-9][0-9]*$/.test(candidate.paymobTransactionId) &&
    Number.isSafeInteger(expectedCents) &&
    expectedCents > 0 &&
    candidate.amountCents === expectedCents &&
    candidate.currency === identity.expectedCurrency.toUpperCase();

  // A provider response explicitly linked to another merchant order
  // must never be used to initiate alternative payment discovery.
  if (
    inquiry.found === true &&
    inquiry.merchantOrderId !== null &&
    inquiry.merchantOrderId !== identity.paymentTransactionId
  ) {
    return "unresolved";
  }

  // Explicit retained-funds contradictions require manual review.
  // Never substitute another attempt through automatic fallback.
  if (inquiry.retainedPaymentFailure) {
    return "unresolved";
  }

  let selected = inquiry;

  if (!isMatchingPaidAttempt(inquiry) && deps.inquireOrderAttempts) {
    const other = await deps.inquireOrderAttempts(
      identity.paymentTransactionId,
      null,
    );
    if (isMatchingPaidAttempt(other)) {
      selected = other;
    }
  }

  if (!isMatchingPaidAttempt(selected)) {
    return "unresolved";
  }

  return executeVerifiedPaymobRecovery({
    ...identity,
    paymobTransactionId: selected.paymobTransactionId!,
  }, deps);
}
