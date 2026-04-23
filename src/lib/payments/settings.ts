import { db } from "@/lib/db";

export type PaymentSettings = {
  activeProvider: string;
  enabled: boolean;
  merchantId: string;
  publicKey: string;
  integrationId: string;
  walletIntegrationId: string;
  iframeId: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  sandboxMode: boolean;
  notes: string;
  displayLabelAr: string;
  displayLabelEn: string;
  lastValidationResult?: {
    ok: boolean;
    message: string;
    validatedAt: string;
    issues?: string[];
  } | null;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  activeProvider: "paymob",
  enabled: true,
  merchantId: "1152714",
  publicKey: "",
  integrationId: "5613515",
  walletIntegrationId: "",
  iframeId: "1032257",
  returnUrl: "https://fitzoneland.com/payment/verify",
  cancelUrl: "https://fitzoneland.com/payment/verify?state=cancel",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
  sandboxMode: true,
  notes: "",
  displayLabelAr: "الدفع الإلكتروني عبر Paymob",
  displayLabelEn: "Paymob online payment",
  lastValidationResult: null,
};

function normalizeValidationResult(raw: unknown): PaymentSettings["lastValidationResult"] {
  if (!raw || typeof raw !== "object") return DEFAULT_SETTINGS.lastValidationResult;
  const value = raw as Record<string, unknown>;
  return {
    ok: Boolean(value.ok),
    message: String(value.message ?? ""),
    validatedAt: String(value.validatedAt ?? ""),
    issues: Array.isArray(value.issues) ? value.issues.map((item) => String(item)) : undefined,
  };
}

function getEnvOverrides() {
  const paymobEnv = String(process.env.PAYMOB_ENV ?? "").trim().toLowerCase();

  return {
    merchantId: process.env.PAYMOB_MERCHANT_ID?.trim() || null,
    publicKey: process.env.PAYMOB_PUBLIC_KEY?.trim() || null,
    integrationId: process.env.PAYMOB_INTEGRATION_ID?.trim() || null,
    walletIntegrationId: process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim() || null,
    iframeId: process.env.PAYMOB_IFRAME_CARD_ID?.trim() || null,
    sandboxMode:
      paymobEnv === "test"
        ? true
        : paymobEnv === "live" || paymobEnv === "production"
          ? false
          : null,
  };
}

function normalizeSettings(raw: Record<string, unknown>): PaymentSettings {
  const env = getEnvOverrides();

  return {
    activeProvider: String(raw.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
    enabled: Boolean(raw.enabled ?? DEFAULT_SETTINGS.enabled),
    merchantId: env.merchantId ?? String(raw.merchantId ?? ""),
    publicKey: env.publicKey ?? String(raw.publicKey ?? ""),
    integrationId: env.integrationId ?? String(raw.integrationId ?? raw.iframeId ?? ""),
    walletIntegrationId: env.walletIntegrationId ?? String(raw.walletIntegrationId ?? ""),
    iframeId: env.iframeId ?? String(raw.iframeId ?? ""),
    returnUrl: String(raw.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
    sandboxMode: env.sandboxMode ?? Boolean(raw.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
    notes: String(raw.notes ?? ""),
    displayLabelAr: String(raw.displayLabelAr ?? DEFAULT_SETTINGS.displayLabelAr),
    displayLabelEn: String(raw.displayLabelEn ?? DEFAULT_SETTINGS.displayLabelEn),
    lastValidationResult: normalizeValidationResult(raw.lastValidationResult),
  };
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const record = await db.siteContent.findUnique({ where: { section: "paymentSettings" } });
  if (!record) return normalizeSettings({});
  try {
    const parsed = JSON.parse(record.content) as Record<string, unknown>;
    return normalizeSettings(parsed);
  } catch {
    return normalizeSettings({});
  }
}

export { DEFAULT_SETTINGS as DEFAULT_PAYMENT_SETTINGS };
