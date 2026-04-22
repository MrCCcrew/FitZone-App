import { manualPaymentProvider } from "@/lib/payments/providers/manual";
import { paymobPaymentProvider } from "@/lib/payments/providers/paymob";
import type { PaymentProviderDefinition, PaymentProviderKey } from "@/lib/payments/types";

// instapay and vodafone_cash remain in the map for backward-compatibility with
// existing DB records, but are disabled so they never appear in the production
// checkout flow.
const disabledStub = (key: PaymentProviderKey, label: string): PaymentProviderDefinition => ({
  key,
  label,
  enabled: false,
  supportsCards: false,
  async createCheckout() {
    throw new Error(`${label} معطّل. استخدم Paymob للدفع الإلكتروني.`);
  },
  async verifyTransaction() {
    return { status: "pending", message: `${label} معطّل.` };
  },
});

const PAYMENT_PROVIDERS: Record<PaymentProviderKey, PaymentProviderDefinition> = {
  paymob: paymobPaymentProvider,
  manual: manualPaymentProvider,
  instapay: disabledStub("instapay", "InstaPay"),
  vodafone_cash: disabledStub("vodafone_cash", "Vodafone Cash"),
  paytabs: disabledStub("paytabs", "PayTabs"),
  custom: disabledStub("custom", "Custom"),
};

export function listPaymentProviders() {
  return Object.values(PAYMENT_PROVIDERS);
}

export function getPaymentProvider(key: string | null | undefined) {
  if (!key) return null;
  return PAYMENT_PROVIDERS[key as PaymentProviderKey] ?? null;
}

export function getDefaultPaymentProvider() {
  if (paymobPaymentProvider.enabled) return paymobPaymentProvider;
  const configured = process.env.DEFAULT_PAYMENT_PROVIDER?.trim().toLowerCase();
  const provider = getPaymentProvider(configured);
  if (provider?.enabled && provider.key !== "manual") return provider;
  throw new Error("Paymob is not configured. Set the required PAYMOB environment variables before enabling checkout.");
}
