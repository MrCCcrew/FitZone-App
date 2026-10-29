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
};

export type PaymobAutoRecoveryDiscoveryDependencies =
  PaymobVerifiedRecoveryDependencies & {
    inquire: (localPaymentId: string) => Promise<PaymobDiscoveryResult>;
  };

export async function discoverAndRecoverPaymobPayment(
  identity: Omit<PaymobRecoveryIdentity, "paymobTransactionId">,
  deps: PaymobAutoRecoveryDiscoveryDependencies,
): Promise<"paid_recovered" | "unresolved"> {
  const inquiry = await deps.inquire(identity.paymentTransactionId);
  const expectedCents = Math.round(identity.expectedAmount * 100);

  if (
    inquiry.found !== true ||
    inquiry.status !== "paid" ||
    inquiry.success !== true ||
    inquiry.pending !== false ||
    inquiry.merchantOrderId !== identity.paymentTransactionId ||
    !inquiry.paymobTransactionId ||
    !/^[1-9][0-9]*$/.test(inquiry.paymobTransactionId) ||
    !Number.isSafeInteger(expectedCents) ||
    expectedCents <= 0 ||
    inquiry.amountCents !== expectedCents ||
    inquiry.currency !== identity.expectedCurrency.toUpperCase()
  ) {
    return "unresolved";
  }

  return executeVerifiedPaymobRecovery({
    ...identity,
    paymobTransactionId: inquiry.paymobTransactionId,
  }, deps);
}
