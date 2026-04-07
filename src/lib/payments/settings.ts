import { db } from "@/lib/db";

export type PaymentAccount = {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
};

export type ManualPaymentSettings = {
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
  instapayAccounts: PaymentAccount[];
  vodafoneCashAccounts: PaymentAccount[];
};

const DEFAULT_SETTINGS: ManualPaymentSettings = {
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
  accounts: PaymentAccount[] | null | undefined,
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

function normalizeSettings(raw: Partial<ManualPaymentSettings>) {
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

export async function getPaymentSettings() {
  const record = await db.siteContent.findUnique({
    where: { section: "paymentSettings" },
  });

  if (!record) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(record.content) as Partial<ManualPaymentSettings>;
    return normalizeSettings(parsed);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export { DEFAULT_SETTINGS as DEFAULT_PAYMENT_SETTINGS };
