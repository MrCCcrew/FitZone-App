import { db } from "@/lib/db";

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
};

export async function getPaymentSettings() {
  const record = await db.siteContent.findUnique({
    where: { section: "paymentSettings" },
  });

  if (!record) return DEFAULT_SETTINGS;

  try {
    const parsed = JSON.parse(record.content) as Partial<ManualPaymentSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export { DEFAULT_SETTINGS as DEFAULT_PAYMENT_SETTINGS };
