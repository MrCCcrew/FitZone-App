import { db } from "@/lib/db";

export type PaymentSettings = {
  activeProvider: string;
  enabled: boolean;
  merchantId: string;
  publicKey: string;
  cardIntegrationId: string;
  integrationId: string;
  walletIntegrationId: string;
  valuIntegrationId: string;
  symplIntegrationId: string;
  souhoolaIntegrationId: string;
  iframeCardId: string;
  iframeInstallmentId: string;
  iframeId: string;
  installmentIframeId: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  sandboxMode: boolean;
  enableCards: boolean;
  enableWallets: boolean;
  enableValu: boolean;
  enableSympl: boolean;
  enableSouhoola: boolean;
  enableCod: boolean;
  cashOnDeliveryEnabled: boolean;
  cashOnDeliveryLabelAr: string;
  cashOnDeliveryLabelEn: string;
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
  cardIntegrationId: "5613515",
  integrationId: "5613515",
  walletIntegrationId: "5632185",
  valuIntegrationId: "",
  symplIntegrationId: "",
  souhoolaIntegrationId: "",
  iframeCardId: "1032257",
  iframeInstallmentId: "1032256",
  iframeId: "1032257",
  installmentIframeId: "1032256",
  returnUrl: "https://fitzoneland.com/payment/verify",
  cancelUrl: "https://fitzoneland.com/payment/verify?state=cancel",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
  sandboxMode: true,
  enableCards: true,
  enableWallets: true,
  enableValu: false,
  enableSympl: false,
  enableSouhoola: false,
  enableCod: true,
  cashOnDeliveryEnabled: true,
  cashOnDeliveryLabelAr: "الدفع عند الاستلام",
  cashOnDeliveryLabelEn: "Cash on delivery",
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
    cardIntegrationId:
      process.env.PAYMOB_CARD_INTEGRATION_ID?.trim() ||
      process.env.PAYMOB_INTEGRATION_ID?.trim() ||
      null,
    walletIntegrationId: process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim() || null,
    valuIntegrationId: process.env.PAYMOB_VALU_INTEGRATION_ID?.trim() || null,
    symplIntegrationId: process.env.PAYMOB_SYMPL_INTEGRATION_ID?.trim() || null,
    souhoolaIntegrationId: process.env.PAYMOB_SOUHOOLA_INTEGRATION_ID?.trim() || null,
    iframeCardId: process.env.PAYMOB_IFRAME_CARD_ID?.trim() || null,
    iframeInstallmentId: process.env.PAYMOB_IFRAME_INSTALLMENT_ID?.trim() || null,
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
    cardIntegrationId:
      env.cardIntegrationId ??
      String(raw.cardIntegrationId ?? raw.integrationId ?? raw.iframeId ?? DEFAULT_SETTINGS.cardIntegrationId),
    integrationId:
      env.cardIntegrationId ??
      String(raw.integrationId ?? raw.cardIntegrationId ?? raw.iframeId ?? DEFAULT_SETTINGS.integrationId),
    walletIntegrationId: env.walletIntegrationId ?? String(raw.walletIntegrationId ?? ""),
    valuIntegrationId: env.valuIntegrationId ?? String(raw.valuIntegrationId ?? ""),
    symplIntegrationId: env.symplIntegrationId ?? String(raw.symplIntegrationId ?? ""),
    souhoolaIntegrationId: env.souhoolaIntegrationId ?? String(raw.souhoolaIntegrationId ?? ""),
    iframeCardId:
      env.iframeCardId ??
      String(raw.iframeCardId ?? raw.iframeId ?? DEFAULT_SETTINGS.iframeCardId),
    iframeInstallmentId:
      env.iframeInstallmentId ??
      String(raw.iframeInstallmentId ?? raw.installmentIframeId ?? DEFAULT_SETTINGS.iframeInstallmentId),
    iframeId:
      env.iframeCardId ??
      String(raw.iframeId ?? raw.iframeCardId ?? DEFAULT_SETTINGS.iframeId),
    installmentIframeId:
      env.iframeInstallmentId ??
      String(raw.installmentIframeId ?? raw.iframeInstallmentId ?? DEFAULT_SETTINGS.installmentIframeId),
    returnUrl: String(raw.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
    sandboxMode: env.sandboxMode ?? Boolean(raw.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
    enableCards: Boolean(raw.enableCards ?? String(raw.cardIntegrationId ?? raw.integrationId ?? "").trim() !== ""),
    enableWallets: Boolean(raw.enableWallets ?? String(raw.walletIntegrationId ?? "").trim() !== ""),
    enableValu: Boolean(raw.enableValu ?? String(raw.valuIntegrationId ?? "").trim() !== ""),
    enableSympl: Boolean(raw.enableSympl ?? String(raw.symplIntegrationId ?? "").trim() !== ""),
    enableSouhoola: Boolean(raw.enableSouhoola ?? String(raw.souhoolaIntegrationId ?? "").trim() !== ""),
    enableCod: Boolean(raw.enableCod ?? raw.cashOnDeliveryEnabled ?? DEFAULT_SETTINGS.enableCod),
    cashOnDeliveryEnabled: Boolean(raw.cashOnDeliveryEnabled ?? raw.enableCod ?? DEFAULT_SETTINGS.cashOnDeliveryEnabled),
    cashOnDeliveryLabelAr: String(raw.cashOnDeliveryLabelAr ?? DEFAULT_SETTINGS.cashOnDeliveryLabelAr),
    cashOnDeliveryLabelEn: String(raw.cashOnDeliveryLabelEn ?? DEFAULT_SETTINGS.cashOnDeliveryLabelEn),
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
