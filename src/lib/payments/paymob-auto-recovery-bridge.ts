export type PaymobRecoveryIdentity = {
  paymentTransactionId: string;
  paymobTransactionId: string;
  expectedAmount: number;
  expectedCurrency: string;
  expectedFitZoneReference: string;
  expectedIntentionId: string;
};

export type PaymobVerifiedRecoveryDependencies = {
  recoverVerified: (input: PaymobRecoveryIdentity) => Promise<{
    status: string;
  }>;
};

export async function executeVerifiedPaymobRecovery(
  identity: PaymobRecoveryIdentity,
  dependencies: PaymobVerifiedRecoveryDependencies,
): Promise<"paid_recovered" | "unresolved"> {
  if (
    !identity.paymentTransactionId.trim() ||
    !/^[1-9][0-9]*$/.test(identity.paymobTransactionId) ||
    !Number.isSafeInteger(Math.round(identity.expectedAmount * 100)) ||
    !Number.isFinite(identity.expectedAmount) ||
    identity.expectedAmount <= 0 ||
    !/^[A-Z]{3}$/.test(identity.expectedCurrency) ||
    !identity.expectedFitZoneReference.trim() ||
    !identity.expectedIntentionId.trim()
  ) {
    return "unresolved";
  }

  // The dependency MUST independently verify live Paymob Acceptance
  // and Order evidence, including merchant linkage and amount.
  // Identity validation here is not proof of payment.
  const result = await dependencies.recoverVerified(identity);

  return result.status === "paid"
    ? "paid_recovered"
    : "unresolved";
}
