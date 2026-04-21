import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";

async function createCheckout(_input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  throw new Error("InstaPay معطّل. استخدم Paymob للدفع الإلكتروني.");
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
    providerReference: transaction.providerReference ?? `instapay_${transaction.id}`,
    externalReference: transaction.externalReference ?? transaction.id,
  };
}

async function handleWebhook(): Promise<PaymentWebhookResult> {
  return { ok: false, message: "InstaPay لا يدعم Webhook." };
}

export const instapayPaymentProvider: PaymentProviderDefinition = {
  key: "instapay",
  label: "InstaPay",
  enabled: false,
  supportsCards: false,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
