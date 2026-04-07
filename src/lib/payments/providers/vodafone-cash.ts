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
  const defaultAccount =
    settings.vodafoneCashAccounts.find((account) => account.isDefault) ?? settings.vodafoneCashAccounts[0] ?? null;
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30);

  return {
    provider: "vodafone_cash",
    status: "requires_action",
    message: "يرجى إتمام التحويل عبر فودافون كاش من هاتفك ثم العودة لتأكيد العملية.",
    checkoutUrl: defaultAccount?.url || settings.vodafoneCashUrl || null,
    providerReference: `vodafone_${input.transactionId}`,
    externalReference: input.transactionId,
    expiresAt,
    payload: {
      mode: "vodafone_cash",
      amount: input.amount,
      currency: input.currency,
      purpose: input.purpose,
      label: defaultAccount?.label ?? settings.vodafoneCashLabel,
      accountId: defaultAccount?.id ?? null,
      accountUrl: defaultAccount?.url ?? settings.vodafoneCashUrl ?? null,
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
    providerReference: transaction.providerReference ?? `vodafone_${transaction.id}`,
    externalReference: transaction.externalReference ?? transaction.id,
    payload: {
      mode: "vodafone_cash",
      amount: transaction.amount,
      currency: transaction.currency,
    },
  };
}

async function handleWebhook(): Promise<PaymentWebhookResult> {
  return {
    ok: true,
    status: "requires_action",
    message: "فودافون كاش لا يستخدم Webhook هنا. يتم التأكيد يدويًا.",
  };
}

export const vodafoneCashPaymentProvider: PaymentProviderDefinition = {
  key: "vodafone_cash",
  label: "Vodafone Cash",
  enabled: true,
  supportsCards: false,
  createCheckout,
  verifyTransaction,
  handleWebhook,
};
