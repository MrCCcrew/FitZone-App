import { db } from "@/lib/db";

export type PaymentSettings = {
  activeProvider: string;
  enabled: boolean;
  merchantId: string;
  publicKey: string;
  integrationId: string;
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
  merchantId: "",
  publicKey: "",
  integrationId: "",
  iframeId: "",
  returnUrl: "https://fitzoneland.com/account",
  cancelUrl: "https://fitzoneland.com/account",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
  sandboxMode: false,
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

function normalizeSettings(raw: Record<string, unknown>): PaymentSettings {
  return {
    activeProvider: String(raw.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
    enabled: Boolean(raw.enabled ?? DEFAULT_SETTINGS.enabled),
    merchantId: String(raw.merchantId ?? ""),
    publicKey: String(raw.publicKey ?? ""),
    integrationId: String(raw.integrationId ?? raw.iframeId ?? ""),
    iframeId: String(raw.iframeId ?? ""),
    returnUrl: String(raw.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
    sandboxMode: Boolean(raw.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
    notes: String(raw.notes ?? ""),
    displayLabelAr: String(raw.displayLabelAr ?? DEFAULT_SETTINGS.displayLabelAr),
    displayLabelEn: String(raw.displayLabelEn ?? DEFAULT_SETTINGS.displayLabelEn),
    lastValidationResult: normalizeValidationResult(raw.lastValidationResult),
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
