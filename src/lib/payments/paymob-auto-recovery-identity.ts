import type {
  PaymobRecoveryIdentity,
} from "./paymob-auto-recovery-bridge";

type PaymentIdentityRow = {
  id: string;
  purpose: string;
  provider: string;
  membershipId: string | null;
  amount: number;
  currency: string;
  referenceCode: string | null;
  providerReference: string | null;
};

export function buildPaymobRecoveryIdentity(
  payment: PaymentIdentityRow,
): Omit<PaymobRecoveryIdentity, "paymobTransactionId"> | null {
  if (
    !payment.id.trim() ||
    payment.purpose !== "membership" ||
    payment.provider !== "paymob" ||
    !payment.membershipId?.trim() ||
    !Number.isFinite(payment.amount) ||
    payment.amount <= 0 ||
    !Number.isSafeInteger(Math.round(payment.amount * 100)) ||
    !/^[A-Z]{3}$/.test(payment.currency) ||
    !payment.referenceCode?.startsWith("FZ-") ||
    !/^pi_(test|live)_[a-zA-Z0-9]+$/.test(
      payment.providerReference ?? "",
    )
  ) {
    return null;
  }

  return {
    paymentTransactionId: payment.id,
    expectedAmount: payment.amount,
    expectedCurrency: payment.currency,
    expectedFitZoneReference: payment.referenceCode,
    expectedIntentionId: payment.providerReference!,
  };
}
