import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { DEFAULT_PAYMENT_SETTINGS, type PaymentSettings } from "@/lib/payments/settings";

type PaymentSettingsResponse = PaymentSettings & {
  providerStatus: "enabled" | "disabled";
  providerMode: "sandbox" | "live";
  secretsConfigured: {
    apiKey: boolean;
    secretKey: boolean;
    hmac: boolean;
  };
};

function normalize(raw: Partial<PaymentSettings>): PaymentSettings {
  return {
    ...DEFAULT_PAYMENT_SETTINGS,
    activeProvider: "paymob",
    enabled: Boolean(raw.enabled ?? DEFAULT_PAYMENT_SETTINGS.enabled),
    merchantId: String(raw.merchantId ?? ""),
    publicKey: String(raw.publicKey ?? ""),
    integrationId: String(raw.integrationId ?? raw.iframeId ?? ""),
    iframeId: String(raw.iframeId ?? ""),
    returnUrl: String(raw.returnUrl ?? DEFAULT_PAYMENT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_PAYMENT_SETTINGS.cancelUrl),
    webhookUrl: String(raw.webhookUrl ?? DEFAULT_PAYMENT_SETTINGS.webhookUrl),
    sandboxMode: Boolean(raw.sandboxMode ?? DEFAULT_PAYMENT_SETTINGS.sandboxMode),
    notes: String(raw.notes ?? ""),
    displayLabelAr: String(raw.displayLabelAr ?? DEFAULT_PAYMENT_SETTINGS.displayLabelAr),
    displayLabelEn: String(raw.displayLabelEn ?? DEFAULT_PAYMENT_SETTINGS.displayLabelEn),
    lastValidationResult:
      raw.lastValidationResult && typeof raw.lastValidationResult === "object"
        ? {
            ok: Boolean(raw.lastValidationResult.ok),
            message: String(raw.lastValidationResult.message ?? ""),
            validatedAt: String(raw.lastValidationResult.validatedAt ?? ""),
            issues: Array.isArray(raw.lastValidationResult.issues)
              ? raw.lastValidationResult.issues.map((item) => String(item))
              : undefined,
          }
        : DEFAULT_PAYMENT_SETTINGS.lastValidationResult,
  };
}

function secretsConfigured() {
  return {
    apiKey: Boolean(process.env.PAYMOB_API_KEY?.trim()),
    secretKey: Boolean(process.env.PAYMOB_SECRET_KEY?.trim()),
    hmac: Boolean(process.env.PAYMOB_HMAC_SECRET?.trim()),
  };
}

function toResponse(settings: PaymentSettings): PaymentSettingsResponse {
  return {
    ...settings,
    providerStatus: settings.enabled ? "enabled" : "disabled",
    providerMode: settings.sandboxMode ? "sandbox" : "live",
    secretsConfigured: secretsConfigured(),
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

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const settings = await loadSettings();
  return NextResponse.json(toResponse(settings));
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as Partial<PaymentSettings>;
    const current = await loadSettings();
    const payload = normalize({
      ...current,
      ...body,
      activeProvider: "paymob",
      webhookUrl: DEFAULT_PAYMENT_SETTINGS.webhookUrl,
    });

    await db.siteContent.upsert({
      where: { section: "paymentSettings" },
      update: { content: JSON.stringify(payload) },
      create: { section: "paymentSettings", content: JSON.stringify(payload) },
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

  try {
    const body = (await req.json()) as { action?: string };
    if (body.action !== "validate") {
      return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
    }

    const settings = await loadSettings();
    const secrets = secretsConfigured();
    const issues: string[] = [];

    if (!settings.enabled) issues.push("المزوّد معطّل من لوحة الأدمن.");
    if (!settings.merchantId) issues.push("Merchant ID غير مضبوط.");
    if (!settings.publicKey) issues.push("Public key غير مضبوط.");
    if (!settings.integrationId) issues.push("Integration ID غير مضبوط.");
    if (!settings.returnUrl) issues.push("Return URL غير مضبوط.");
    if (!settings.cancelUrl) issues.push("Cancel URL غير مضبوط.");
    if (!settings.iframeId) issues.push("Iframe ID غير مضبوط.");
    if (!secrets.apiKey) issues.push("PAYMOB_API_KEY غير مضبوط على السيرفر.");
    if (!secrets.hmac) issues.push("PAYMOB_HMAC_SECRET غير مضبوط على السيرفر.");

    let authTest: { ok: boolean; message: string } = {
      ok: false,
      message: "تم تخطي اختبار الاتصال بسبب نقص الإعدادات.",
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
          authTest = { ok: true, message: "نجح اختبار المصادقة مع Paymob Hosted Checkout." };
        } else {
          authTest = { ok: false, message: `رفض Paymob التحقق (${response.status}).` };
        }
      } catch (error) {
        authTest = {
          ok: false,
          message: `تعذر الاتصال بـ Paymob: ${error instanceof Error ? error.message : "خطأ غير معروف"}`,
        };
      }
    }

    const validationResult = {
      ok: issues.length === 0 && authTest.ok,
      message: issues.length === 0 && authTest.ok ? "إعدادات Paymob جاهزة." : "يوجد نقص أو خطأ في إعدادات Paymob.",
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
      settings: toResponse(nextSettings),
    });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_VALIDATE]", error);
    return NextResponse.json({ error: "تعذر التحقق من إعدادات Paymob." }, { status: 500 });
  }
}
