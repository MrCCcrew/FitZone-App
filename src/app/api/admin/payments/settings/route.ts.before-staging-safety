import { NextResponse } from "next/server";
import { requireAdminFeature, requireAdminMasterAccess } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/payments/settings";
import { logAudit } from "@/lib/audit-context";

type PaymentSettingsResponse = PaymentSettings & {
  providerStatus: "enabled" | "disabled";
  providerMode: "sandbox" | "live";
  secretsConfigured: {
    apiKey: boolean;
    secretKey: boolean;
    hmac: boolean;
  };
  envConfigured: {
    merchantId: boolean;
    publicKey: boolean;
    cardIntegrationId: boolean;
    walletIntegrationId: boolean;
    valuIntegrationId: boolean;
    symplIntegrationId: boolean;
    souhoolaIntegrationId: boolean;
    iframeCardId: boolean;
    iframeInstallmentId: boolean;
    env: string;
  };
};

function normalizeValidationResult(raw: PaymentSettings["lastValidationResult"] | unknown) {
  if (!raw || typeof raw !== "object") return DEFAULT_PAYMENT_SETTINGS.lastValidationResult;
  const value = raw as Record<string, unknown>;
  return {
    ok: Boolean(value.ok),
    message: String(value.message ?? ""),
    validatedAt: String(value.validatedAt ?? ""),
    issues: Array.isArray(value.issues) ? value.issues.map((item) => String(item)) : undefined,
  };
}

function normalize(raw: Partial<PaymentSettings>): PaymentSettings {
  return {
    ...DEFAULT_PAYMENT_SETTINGS,
    activeProvider: "paymob",
    enabled: Boolean(raw.enabled ?? DEFAULT_PAYMENT_SETTINGS.enabled),
    merchantId: String(raw.merchantId ?? DEFAULT_PAYMENT_SETTINGS.merchantId),
    publicKey: String(raw.publicKey ?? DEFAULT_PAYMENT_SETTINGS.publicKey),
    cardIntegrationId: String(raw.cardIntegrationId ?? raw.integrationId ?? DEFAULT_PAYMENT_SETTINGS.cardIntegrationId),
    integrationId: String(raw.integrationId ?? raw.cardIntegrationId ?? DEFAULT_PAYMENT_SETTINGS.integrationId),
    walletIntegrationId: String(raw.walletIntegrationId ?? DEFAULT_PAYMENT_SETTINGS.walletIntegrationId),
    valuIntegrationId: String(raw.valuIntegrationId ?? DEFAULT_PAYMENT_SETTINGS.valuIntegrationId),
    symplIntegrationId: String(raw.symplIntegrationId ?? DEFAULT_PAYMENT_SETTINGS.symplIntegrationId),
    souhoolaIntegrationId: String(raw.souhoolaIntegrationId ?? DEFAULT_PAYMENT_SETTINGS.souhoolaIntegrationId),
    iframeCardId: String(raw.iframeCardId ?? raw.iframeId ?? DEFAULT_PAYMENT_SETTINGS.iframeCardId),
    iframeInstallmentId: String(
      raw.iframeInstallmentId ?? raw.installmentIframeId ?? DEFAULT_PAYMENT_SETTINGS.iframeInstallmentId,
    ),
    iframeId: String(raw.iframeId ?? raw.iframeCardId ?? DEFAULT_PAYMENT_SETTINGS.iframeId),
    installmentIframeId: String(
      raw.installmentIframeId ?? raw.iframeInstallmentId ?? DEFAULT_PAYMENT_SETTINGS.installmentIframeId,
    ),
    returnUrl: String(raw.returnUrl ?? DEFAULT_PAYMENT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_PAYMENT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_PAYMENT_SETTINGS.webhookUrl),
    sandboxMode: Boolean(raw.sandboxMode ?? DEFAULT_PAYMENT_SETTINGS.sandboxMode),
    enableCards: Boolean(raw.enableCards ?? DEFAULT_PAYMENT_SETTINGS.enableCards),
    enableWallets: Boolean(raw.enableWallets ?? DEFAULT_PAYMENT_SETTINGS.enableWallets),
    enableValu: Boolean(raw.enableValu ?? DEFAULT_PAYMENT_SETTINGS.enableValu),
    enableSympl: Boolean(raw.enableSympl ?? DEFAULT_PAYMENT_SETTINGS.enableSympl),
    enableSouhoola: Boolean(raw.enableSouhoola ?? DEFAULT_PAYMENT_SETTINGS.enableSouhoola),
    enableCod: Boolean(raw.enableCod ?? raw.cashOnDeliveryEnabled ?? DEFAULT_PAYMENT_SETTINGS.enableCod),
    cashOnDeliveryEnabled: Boolean(
      raw.cashOnDeliveryEnabled ?? raw.enableCod ?? DEFAULT_PAYMENT_SETTINGS.cashOnDeliveryEnabled,
    ),
    cashOnDeliveryLabelAr: String(raw.cashOnDeliveryLabelAr ?? DEFAULT_PAYMENT_SETTINGS.cashOnDeliveryLabelAr),
    cashOnDeliveryLabelEn: String(raw.cashOnDeliveryLabelEn ?? DEFAULT_PAYMENT_SETTINGS.cashOnDeliveryLabelEn),
    notes: String(raw.notes ?? DEFAULT_PAYMENT_SETTINGS.notes),
    displayLabelAr: String(raw.displayLabelAr ?? DEFAULT_PAYMENT_SETTINGS.displayLabelAr),
    displayLabelEn: String(raw.displayLabelEn ?? DEFAULT_PAYMENT_SETTINGS.displayLabelEn),
    lastValidationResult: normalizeValidationResult(raw.lastValidationResult),
  };
}

function secretsConfigured() {
  return {
    apiKey: Boolean(process.env.PAYMOB_API_KEY?.trim()),
    secretKey: Boolean(process.env.PAYMOB_SECRET_KEY?.trim()),
    hmac: Boolean(process.env.PAYMOB_HMAC_SECRET?.trim()),
  };
}

function envConfigured() {
  return {
    merchantId: Boolean(process.env.PAYMOB_MERCHANT_ID?.trim()),
    publicKey: Boolean(process.env.PAYMOB_PUBLIC_KEY?.trim()),
    cardIntegrationId: Boolean(
      process.env.PAYMOB_CARD_INTEGRATION_ID?.trim() || process.env.PAYMOB_INTEGRATION_ID?.trim(),
    ),
    walletIntegrationId: Boolean(process.env.PAYMOB_WALLET_INTEGRATION_ID?.trim()),
    valuIntegrationId: Boolean(process.env.PAYMOB_VALU_INTEGRATION_ID?.trim()),
    symplIntegrationId: Boolean(process.env.PAYMOB_SYMPL_INTEGRATION_ID?.trim()),
    souhoolaIntegrationId: Boolean(process.env.PAYMOB_SOUHOOLA_INTEGRATION_ID?.trim()),
    iframeCardId: Boolean(process.env.PAYMOB_IFRAME_CARD_ID?.trim()),
    iframeInstallmentId: Boolean(process.env.PAYMOB_IFRAME_INSTALLMENT_ID?.trim()),
    env: String(process.env.PAYMOB_ENV ?? "").trim().toLowerCase(),
  };
}

function toResponse(settings: PaymentSettings): PaymentSettingsResponse {
  return {
    ...settings,
    providerStatus: settings.enabled ? "enabled" : "disabled",
    providerMode: settings.sandboxMode ? "sandbox" : "live",
    secretsConfigured: secretsConfigured(),
    envConfigured: envConfigured(),
  };
}

async function loadSettings() {
  const record = await db.siteContent.findUnique({ where: { section: "paymentSettings" } });
  if (!record) return DEFAULT_PAYMENT_SETTINGS;
  try {
    return normalize(JSON.parse(record.content) as Partial<PaymentSettings>);
  } catch {
    return DEFAULT_PAYMENT_SETTINGS;
  }
}

function getEnabledElectronicMethods(settings: PaymentSettings) {
  return [
    settings.enableCards && String(settings.cardIntegrationId || settings.integrationId).trim() ? "cards" : null,
    settings.enableWallets && String(settings.walletIntegrationId).trim() ? "wallets" : null,
    settings.enableValu && String(settings.valuIntegrationId).trim() ? "valu" : null,
    settings.enableSympl && String(settings.symplIntegrationId).trim() ? "sympl" : null,
    settings.enableSouhoola && String(settings.souhoolaIntegrationId).trim() ? "souhoola" : null,
  ].filter(Boolean);
}

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  const settings = await loadSettings();
  return NextResponse.json(toResponse(settings));
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  try {
    const body = (await req.json()) as Partial<PaymentSettings>;
    const current = await loadSettings();
    const payload = normalize({
      ...current,
      ...body,
      activeProvider: "paymob",
      cardIntegrationId: body.cardIntegrationId ?? body.integrationId ?? current.cardIntegrationId,
      integrationId: body.integrationId ?? body.cardIntegrationId ?? current.integrationId,
      iframeCardId: body.iframeCardId ?? body.iframeId ?? current.iframeCardId,
      iframeId: body.iframeId ?? body.iframeCardId ?? current.iframeId,
      iframeInstallmentId: body.iframeInstallmentId ?? body.installmentIframeId ?? current.iframeInstallmentId,
      installmentIframeId: body.installmentIframeId ?? body.iframeInstallmentId ?? current.installmentIframeId,
      enableCod: body.enableCod ?? body.cashOnDeliveryEnabled ?? current.enableCod,
      cashOnDeliveryEnabled: body.cashOnDeliveryEnabled ?? body.enableCod ?? current.cashOnDeliveryEnabled,
      webhookUrl: DEFAULT_PAYMENT_SETTINGS.webhookUrl,
    });

    await db.siteContent.upsert({
      where: { section: "paymentSettings" },
      update: { content: JSON.stringify(payload) },
      create: { section: "paymentSettings", content: JSON.stringify(payload) },
    });

    void logAudit({
      action: "update",
      targetType: "payment_settings",
      details: {
        sandboxMode: payload.sandboxMode,
        cardIntegrationId: payload.cardIntegrationId,
        walletIntegrationId: payload.walletIntegrationId,
        enableCards: payload.enableCards,
        enableWallets: payload.enableWallets,
        enableValu: payload.enableValu,
        enableSympl: payload.enableSympl,
        enableSouhoola: payload.enableSouhoola,
        enableCod: payload.enableCod,
      },
    });

    return NextResponse.json({
      success: true,
      settings: toResponse(payload),
    });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ إعدادات Paymob الآن." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;
  const masterGuard = await requireAdminMasterAccess("payments");
  if ("error" in masterGuard) return masterGuard.error;

  try {
    const body = (await req.json()) as { action?: string };
    if (body.action !== "validate") {
      return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
    }

    const settings = await loadSettings();
    const secrets = secretsConfigured();
    const issues: string[] = [];
    const enabledMethods = getEnabledElectronicMethods(settings);

    if (!settings.enabled) issues.push("Paymob is disabled in admin settings.");
    if (!settings.merchantId) issues.push("Merchant ID is missing.");
    if (!settings.publicKey) issues.push("Public key is missing.");
    if (enabledMethods.length === 0) issues.push("No electronic Paymob payment methods are enabled.");
    if (!settings.returnUrl) issues.push("Return URL is missing.");
    if (!settings.cancelUrl) issues.push("Cancel URL is missing.");
    if (!secrets.apiKey) issues.push("PAYMOB_API_KEY is missing on the server.");
    if (!secrets.secretKey) issues.push("PAYMOB_SECRET_KEY is missing on the server.");
    if (!secrets.hmac) issues.push("PAYMOB_HMAC_SECRET is missing on the server.");

    let authTest: { ok: boolean; message: string } = {
      ok: false,
      message: "Skipped Paymob auth test because required settings are incomplete.",
    };

    if (issues.length === 0) {
      try {
        const response = await fetch("https://accept.paymob.com/api/auth/tokens", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ api_key: process.env.PAYMOB_API_KEY!.trim() }),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.ok) {
          authTest = { ok: true, message: "Paymob authentication test succeeded." };
        } else {
          authTest = { ok: false, message: `Paymob authentication test was rejected (${response.status}).` };
        }
      } catch (error) {
        authTest = {
          ok: false,
          message: `Could not reach Paymob: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    }

    const validationResult = {
      ok: issues.length === 0 && authTest.ok,
      message: issues.length === 0 && authTest.ok ? "Paymob settings are ready." : "Paymob settings still need attention.",
      validatedAt: new Date().toISOString(),
      issues,
    };

    const nextSettings = normalize({
      ...settings,
      lastValidationResult: validationResult,
    });

    await db.siteContent.upsert({
      where: { section: "paymentSettings" },
      update: { content: JSON.stringify(nextSettings) },
      create: { section: "paymentSettings", content: JSON.stringify(nextSettings) },
    });

    return NextResponse.json({
      ...validationResult,
      authTest,
      secrets,
      envConfigured: envConfigured(),
      settings: toResponse(nextSettings),
    });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_VALIDATE]", error);
    return NextResponse.json({ error: "تعذر التحقق من إعدادات Paymob." }, { status: 500 });
  }
}
