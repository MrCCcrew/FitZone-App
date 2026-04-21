import { db } from "@/lib/db";

export type PaymentSettings = {
  activeProvider: string;
  merchantId: string;     // Paymob merchant/profile ID
  publicKey: string;      // Paymob public key (display in admin, safe to store)
  integrationId: string;  // Paymob card integration ID (used in payment key request)
  iframeId: string;       // Paymob iframe ID (used in hosted checkout URL)
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;     // Informational — admin sets this on Paymob dashboard
  sandboxMode: boolean;
  notes: string;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  activeProvider: "paymob",
  merchantId: "",
  publicKey: "",
  integrationId: "",
  iframeId: "",
  returnUrl: "https://fitzoneland.com/account",
  cancelUrl: "https://fitzoneland.com/account",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
  sandboxMode: false,
  notes: "",
};

function normalizeSettings(raw: Record<string, unknown>): PaymentSettings {
  return {
    activeProvider: String(raw.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
    merchantId: String(raw.merchantId ?? ""),
    publicKey: String(raw.publicKey ?? ""),
    integrationId: String(raw.integrationId ?? raw.iframeId ?? ""),
    iframeId: String(raw.iframeId ?? ""),
    returnUrl: String(raw.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
    sandboxMode: Boolean(raw.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
    notes: String(raw.notes ?? ""),
  };
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const record = await db.siteContent.findUnique({ where: { section: "paymentSettings" } });
  if (!record) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(record.content) as Record<string, unknown>;
    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export { DEFAULT_SETTINGS as DEFAULT_PAYMENT_SETTINGS };
