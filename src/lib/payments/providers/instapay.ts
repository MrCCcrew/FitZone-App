import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProviderDefinition,
  PaymentVerificationResult,
  PaymentWebhookResult,
} from "@/lib/payments/types";
import { getPaymentSettings } from "@/lib/payments/settings";

async function createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
  const settings = await getPaymentSettings();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  return {
    provider: "instapay",
    status: "requires_action",
    message: "يرجى إتمام التحويل عبر إنستا باي من هاتفك ثم العودة لتأكيد العملية.",
    checkoutUrl: settings.instapayUrl || null,
    providerReference: `instapay_${input.transactionId}`,
    externalReference: input.transactionId,
    expiresAt,
    payload: {
      mode: "instapay",
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
      label: settings.instapayLabel,
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
    status: "requires_action",
    message: "المعاملة تحتاج تأكيد يدوي من الإدارة بعد التحويل.",
    providerReference: transaction.providerReference ?? `instapay_${transaction.id}`,
    externalReference: transaction.externalReference ?? transaction.id,
    payload: {
      mode: "instapay",
      amount: transaction.amount,
      currency: transaction.currency,
    },
  };
}

async function handleWebhook(): Promise<PaymentWebhookResult> {
  return {
    ok: true,
    status: "requires_action",
    message: "إنستا باي لا يستخدم Webhook هنا. يتم التأكيد يدويًا.",
  };
}

export const instapayPaymentProvider: PaymentProviderDefinition = {
  key: "instapay",
  label: "InstaPay",
  enabled: true,
  supportsCards: false,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
