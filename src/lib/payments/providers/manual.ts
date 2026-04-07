import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  return {
    provider: "manual",
    status: "pending",
    message: "تم إنشاء معاملة الدفع بنجاح. يمكن ربط هذا المزوّد لاحقًا ببوابة دفع فعلية.",
    providerReference: `manual_${input.transactionId}`,
    externalReference: input.transactionId,
    expiresAt,
    payload: {
      mode: "manual",
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
    },
  };
}

async function verifyTransaction(transaction: {
  id: string;
  providerReference?: string | null;
  externalReference?: string | null;
  amount: number;
  currency: string;
  metadata?: string | null;
}): Promise<PaymentVerificationResult> {
  return {
    status: "pending",
    message: "المعاملة ما زالت في وضع يدوي ولم يتم تأكيدها من بوابة دفع خارجية بعد.",
    providerReference: transaction.providerReference ?? `manual_${transaction.id}`,
    externalReference: transaction.externalReference ?? transaction.id,
    payload: {
      mode: "manual",
      amount: transaction.amount,
      currency: transaction.currency,
    },
  };
}

async function handleWebhook(): Promise<PaymentWebhookResult> {
  return {
    ok: true,
    status: "pending",
    message: "المزوّد اليدوي لا يستخدم Webhook فعلي.",
  };
}

export const manualPaymentProvider: PaymentProviderDefinition = {
  key: "manual",
  label: "دفع يدوي / تجريبي",
  enabled: true,
  supportsCards: false,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
