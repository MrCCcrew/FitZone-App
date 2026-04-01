import { manualPaymentProvider } from "@/lib/payments/providers/manual";
import type { PaymentProviderDefinition, PaymentProviderKey } from "@/lib/payments/types";

const PAYMENT_PROVIDERS: Record<PaymentProviderKey, PaymentProviderDefinition> = {
  manual: manualPaymentProvider,
  paymob: {
    key: "paymob",
    label: "Paymob",
    enabled: false,
    supportsCards: true,
    async createCheckout() {
      throw new Error("مزوّد Paymob غير مفعل بعد.");
    },
    async verifyTransaction() {
      return { status: "pending", message: "مزوّد Paymob غير مفعل بعد." };
    },
  },
  paytabs: {
    key: "paytabs",
    label: "PayTabs",
    enabled: false,
    supportsCards: true,
    async createCheckout() {
      throw new Error("مزوّد PayTabs غير مفعل بعد.");
    },
    async verifyTransaction() {
      return { status: "pending", message: "مزوّد PayTabs غير مفعل بعد." };
    },
  },
  custom: {
    key: "custom",
    label: "مزود مخصص",
    enabled: false,
    supportsCards: true,
    async createCheckout() {
      throw new Error("المزوّد المخصص غير مفعل بعد.");
    },
    async verifyTransaction() {
      return { status: "pending", message: "المزوّد المخصص غير مفعل بعد." };
    },
  },
};

export function listPaymentProviders() {
  return Object.values(PAYMENT_PROVIDERS);
}

export function getPaymentProvider(key: string | null | undefined) {
  if (!key) return null;
  return PAYMENT_PROVIDERS[key as PaymentProviderKey] ?? null;
}

export function getDefaultPaymentProvider() {
  const configured = process.env.DEFAULT_PAYMENT_PROVIDER?.trim().toLowerCase();
  const provider = getPaymentProvider(configured);
  if (provider?.enabled) return provider;
  return manualPaymentProvider;
}
