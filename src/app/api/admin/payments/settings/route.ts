import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

type PaymentSettingsPayload = {
  activeProvider: string;
  merchantId: string;
  publicKey: string;
  iframeId: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  sandboxMode: boolean;
  notes: string;
};

const DEFAULT_SETTINGS: PaymentSettingsPayload = {
  activeProvider: "manual",
  merchantId: "",
  publicKey: "",
  iframeId: "",
  returnUrl: "https://fitzoneland.com/account",
  cancelUrl: "https://fitzoneland.com/account",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/manual",
  sandboxMode: true,
  notes: "",
};

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const record = await db.siteContent.findUnique({
    where: { section: "paymentSettings" },
  });

  if (!record) {
    return NextResponse.json(DEFAULT_SETTINGS);
  }

  try {
    const parsed = JSON.parse(record.content) as Partial<PaymentSettingsPayload>;
    return NextResponse.json({ ...DEFAULT_SETTINGS, ...parsed });
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as Partial<PaymentSettingsPayload>;

    const payload: PaymentSettingsPayload = {
      activeProvider: String(body.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
      merchantId: String(body.merchantId ?? ""),
      publicKey: String(body.publicKey ?? ""),
      iframeId: String(body.iframeId ?? ""),
      returnUrl: String(body.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
      cancelUrl: String(body.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
      webhookUrl: String(body.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
      sandboxMode: Boolean(body.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
      notes: String(body.notes ?? ""),
    };

    await db.siteContent.upsert({
      where: { section: "paymentSettings" },
      update: { content: JSON.stringify(payload) },
      create: { section: "paymentSettings", content: JSON.stringify(payload) },
    });

    return NextResponse.json({ success: true, settings: payload });
  } catch (error) {
    console.error("[ADMIN_PAYMENT_SETTINGS_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ إعدادات الدفع الآن." }, { status: 500 });
  }
}
