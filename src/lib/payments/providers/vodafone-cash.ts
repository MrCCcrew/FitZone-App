import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";

async function createCheckout(_input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  throw new Error("Vodafone Cash معطّل. استخدم Paymob للدفع الإلكتروني.");
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
    status: "requires_action",
    message: "المعاملة تحتاج تأكيد يدوي من الإدارة.",
    providerReference: transaction.providerReference ?? `vodafone_${transaction.id}`,
    externalReference: transaction.externalReference ?? transaction.id,
  };
}

async function handleWebhook(): Promise<PaymentWebhookResult> {
  return { ok: false, message: "Vodafone Cash لا يدعم Webhook." };
}

export const vodafoneCashPaymentProvider: PaymentProviderDefinition = {
  key: "vodafone_cash",
  label: "Vodafone Cash",
  enabled: false,
  supportsCards: false,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
