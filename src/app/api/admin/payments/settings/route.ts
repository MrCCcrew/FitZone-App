import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

type PaymentSettingsPayload = {
  activeProvider: string;
  merchantId: string;
  publicKey: string;
  integrationId: string;
  iframeId: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  sandboxMode: boolean;
  notes: string;
};

const DEFAULT_SETTINGS: PaymentSettingsPayload = {
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

function normalize(raw: Partial<PaymentSettingsPayload>): PaymentSettingsPayload {
  return {
    activeProvider: String(raw.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
    merchantId: String(raw.merchantId ?? ""),
    publicKey: String(raw.publicKey ?? ""),
    integrationId: String(raw.integrationId ?? raw.iframeId ?? ""),
    iframeId: String(raw.iframeId ?? ""),
    returnUrl: String(raw.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
    cancelUrl: String(raw.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
    webhookUrl: `https://fitzoneland.com/api/payments/webhook/${raw.activeProvider ?? "paymob"}`,
    sandboxMode: Boolean(raw.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
    notes: String(raw.notes ?? ""),
  };
}

function secretsConfigured() {
  return {
    apiKey: !!process.env.PAYMOB_SECRET_KEY?.trim(),
    hmac: !!process.env.PAYMOB_HMAC_SECRET?.trim(),
  };
}

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const record = await db.siteContent.findUnique({ where: { section: "paymentSettings" } });

  let settings = DEFAULT_SETTINGS;
  if (record) {
    try {
      settings = normalize(JSON.parse(record.content) as Partial<PaymentSettingsPayload>);
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  }

  return NextResponse.json({ ...settings, secretsConfigured: secretsConfigured() });
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as Partial<PaymentSettingsPayload>;
    const payload = normalize(body);

    await db.siteContent.upsert({
      where: { section: "paymentSettings" },
      update: { content: JSON.stringify(payload) },
      create: { section: "paymentSettings", content: JSON.stringify(payload) },
    });

    return NextResponse.json({
      success: true,
      settings: { ...payload, secretsConfigured: secretsConfigured() },
    });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ إعدادات الدفع الآن." }, { status: 500 });
  }
}

// POST with action="validate" — tests env secrets and basic DB config
export async function POST(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as { action?: string };
    if (body.action !== "validate") {
      return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
    }

    const secrets = secretsConfigured();
    const record = await db.siteContent.findUnique({ where: { section: "paymentSettings" } });
    let settings = DEFAULT_SETTINGS;
    if (record) {
      try {
        settings = normalize(JSON.parse(record.content) as Partial<PaymentSettingsPayload>);
      } catch {
        /* use default */
      }
    }

    const issues: string[] = [];
    if (!secrets.apiKey) issues.push("PAYMOB_SECRET_KEY غير مُعيَّن في البيئة.");
    if (!secrets.hmac) issues.push("PAYMOB_HMAC_SECRET غير مُعيَّن في البيئة.");
    if (!settings.integrationId && !settings.iframeId) issues.push("Integration ID غير مُعيَّن في الإعدادات.");
    if (!settings.iframeId) issues.push("Iframe ID غير مُعيَّن في الإعدادات.");

    // If secrets are configured, attempt a test authentication
    let authTest: { ok: boolean; message: string } = { ok: true, message: "تخطّي اختبار المصادقة (المفتاح غير موجود)." };
    if (secrets.apiKey) {
      try {
        const apiKey = process.env.PAYMOB_SECRET_KEY!.trim();
        const res = await fetch("https://accept.paymob.com/api/auth/tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = (await res.json()) as { token?: string };
          authTest = data.token
            ? { ok: true, message: "✅ المصادقة مع Paymob نجحت." }
            : { ok: false, message: "❌ لم يُستلم token من Paymob — تحقق من API Key." };
        } else {
          authTest = { ok: false, message: `❌ Paymob رفض المصادقة (${res.status}).` };
        }
      } catch (err) {
        authTest = { ok: false, message: `❌ تعذر الاتصال بـ Paymob: ${err instanceof Error ? err.message : "خطأ"}` };
      }
    }

    return NextResponse.json({
      ok: issues.length === 0 && authTest.ok,
      secrets,
      authTest,
      issues,
      message: issues.length === 0 && authTest.ok ? "✅ جميع الإعدادات صحيحة." : "⚠️ يوجد مشاكل في الإعدادات.",
    });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_VALIDATE]", error);
    return NextResponse.json({ error: "تعذر التحقق من الإعدادات." }, { status: 500 });
  }
}
