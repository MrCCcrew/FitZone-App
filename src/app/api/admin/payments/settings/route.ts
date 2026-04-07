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
  instapayUrl: string;
  instapayLabel: string;
  vodafoneCashUrl: string;
  vodafoneCashLabel: string;
  instapayAccounts: { id: string; label: string; url: string; isDefault?: boolean }[];
  vodafoneCashAccounts: { id: string; label: string; url: string; isDefault?: boolean }[];
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
  instapayUrl: "https://ipn.eg/S/rotanaqnb/instapay/34D04q",
  instapayLabel: "InstaPay",
  vodafoneCashUrl: "http://vf.eg/vfcash?id=mt&qrId=gn6qLY",
  vodafoneCashLabel: "Vodafone Cash",
  instapayAccounts: [
    { id: "instapay-1", label: "InstaPay", url: "https://ipn.eg/S/rotanaqnb/instapay/34D04q", isDefault: true },
  ],
  vodafoneCashAccounts: [
    { id: "vodafone-1", label: "Vodafone Cash", url: "http://vf.eg/vfcash?id=mt&qrId=gn6qLY", isDefault: true },
  ],
};

function normalizeAccounts(
  accounts: PaymentSettingsPayload["instapayAccounts"] | null | undefined,
  fallbackLabel: string,
  fallbackUrl: string,
  idPrefix: string,
) {
  const list = Array.isArray(accounts) ? accounts.filter((item) => item && item.url) : [];
  const normalized = list.map((item, index) => ({
    id: item.id || `${idPrefix}-${index + 1}`,
    label: item.label || fallbackLabel,
    url: item.url,
    isDefault: Boolean(item.isDefault),
  }));

  if (normalized.length === 0 && fallbackUrl) {
    return [{ id: `${idPrefix}-1`, label: fallbackLabel, url: fallbackUrl, isDefault: true }];
  }

  const hasDefault = normalized.some((item) => item.isDefault);
  if (!hasDefault && normalized.length > 0) {
    normalized[0].isDefault = true;
  }

  const firstDefault = normalized.findIndex((item) => item.isDefault);
  if (firstDefault > 0) {
    return normalized.map((item, index) => ({ ...item, isDefault: index === firstDefault }));
  }

  return normalized;
}

function normalizeSettings(raw: Partial<PaymentSettingsPayload>) {
  const instapayAccounts = normalizeAccounts(
    raw.instapayAccounts,
    raw.instapayLabel ?? DEFAULT_SETTINGS.instapayLabel,
    raw.instapayUrl ?? DEFAULT_SETTINGS.instapayUrl,
    "instapay",
  );
  const vodafoneCashAccounts = normalizeAccounts(
    raw.vodafoneCashAccounts,
    raw.vodafoneCashLabel ?? DEFAULT_SETTINGS.vodafoneCashLabel,
    raw.vodafoneCashUrl ?? DEFAULT_SETTINGS.vodafoneCashUrl,
    "vodafone",
  );

  const defaultInstapay = instapayAccounts.find((item) => item.isDefault) ?? instapayAccounts[0];
  const defaultVodafone = vodafoneCashAccounts.find((item) => item.isDefault) ?? vodafoneCashAccounts[0];

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    instapayAccounts,
    vodafoneCashAccounts,
    instapayUrl: defaultInstapay?.url ?? raw.instapayUrl ?? DEFAULT_SETTINGS.instapayUrl,
    instapayLabel: defaultInstapay?.label ?? raw.instapayLabel ?? DEFAULT_SETTINGS.instapayLabel,
    vodafoneCashUrl: defaultVodafone?.url ?? raw.vodafoneCashUrl ?? DEFAULT_SETTINGS.vodafoneCashUrl,
    vodafoneCashLabel: defaultVodafone?.label ?? raw.vodafoneCashLabel ?? DEFAULT_SETTINGS.vodafoneCashLabel,
  };
}

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
    return NextResponse.json(normalizeSettings(parsed));
  } catch {
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

export async function PUT(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  try {
    const body = (await req.json()) as Partial<PaymentSettingsPayload>;

    const payload: PaymentSettingsPayload = normalizeSettings({
      activeProvider: String(body.activeProvider ?? DEFAULT_SETTINGS.activeProvider),
      merchantId: String(body.merchantId ?? ""),
      publicKey: String(body.publicKey ?? ""),
      iframeId: String(body.iframeId ?? ""),
      returnUrl: String(body.returnUrl ?? DEFAULT_SETTINGS.returnUrl),
      cancelUrl: String(body.cancelUrl ?? DEFAULT_SETTINGS.cancelUrl),
      webhookUrl: String(body.webhookUrl ?? DEFAULT_SETTINGS.webhookUrl),
      sandboxMode: Boolean(body.sandboxMode ?? DEFAULT_SETTINGS.sandboxMode),
      notes: String(body.notes ?? ""),
      instapayUrl: String(body.instapayUrl ?? DEFAULT_SETTINGS.instapayUrl),
      instapayLabel: String(body.instapayLabel ?? DEFAULT_SETTINGS.instapayLabel),
      vodafoneCashUrl: String(body.vodafoneCashUrl ?? DEFAULT_SETTINGS.vodafoneCashUrl),
      vodafoneCashLabel: String(body.vodafoneCashLabel ?? DEFAULT_SETTINGS.vodafoneCashLabel),
      instapayAccounts: Array.isArray(body.instapayAccounts) ? body.instapayAccounts : DEFAULT_SETTINGS.instapayAccounts,
      vodafoneCashAccounts: Array.isArray(body.vodafoneCashAccounts)
        ? body.vodafoneCashAccounts
        : DEFAULT_SETTINGS.vodafoneCashAccounts,
    });

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
