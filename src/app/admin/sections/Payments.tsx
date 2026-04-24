"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type SecretsStatus = {
  apiKey: boolean;
  secretKey: boolean;
  hmac: boolean;
};

type EnvStatus = {
  merchantId?: boolean;
  publicKey?: boolean;
  cardIntegrationId?: boolean;
  walletIntegrationId?: boolean;
  valuIntegrationId?: boolean;
  symplIntegrationId?: boolean;
  souhoolaIntegrationId?: boolean;
  iframeId?: boolean;
  installmentIframeId?: boolean;
  env?: string;
};

type ValidationResult = {
  ok: boolean;
  message: string;
  validatedAt?: string;
  issues?: string[];
  authTest?: { ok: boolean; message: string };
  secrets?: SecretsStatus;
  envConfigured?: EnvStatus;
};

type PaymentSettings = {
  activeProvider: string;
  enabled: boolean;
  merchantId: string;
  publicKey: string;
  integrationId: string;
  walletIntegrationId: string;
  valuIntegrationId: string;
  symplIntegrationId: string;
  souhoolaIntegrationId: string;
  iframeId: string;
  installmentIframeId: string;
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
  sandboxMode: boolean;
  cashOnDeliveryEnabled: boolean;
  cashOnDeliveryLabelAr: string;
  cashOnDeliveryLabelEn: string;
  notes: string;
  displayLabelAr: string;
  displayLabelEn: string;
  providerStatus?: "enabled" | "disabled";
  providerMode?: "sandbox" | "live";
  secretsConfigured?: SecretsStatus;
  envConfigured?: EnvStatus;
  lastValidationResult?: {
    ok: boolean;
    message: string;
    validatedAt: string;
    issues?: string[];
  } | null;
};

type PaymentTransactionRow = {
  id: string;
  referenceCode?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  provider: string;
  purpose: string;
  amount: number;
  currency: string;
  status: "pending" | "requires_action" | "paid" | "failed" | "cancelled" | "expired";
  paymentMethod: string;
  createdAt: string;
  providerReference?: string | null;
  externalReference?: string | null;
  metadata?: Record<string, unknown> | null;
};

const DEFAULT_SETTINGS: PaymentSettings = {
  activeProvider: "paymob",
  enabled: true,
  merchantId: "1152714",
  publicKey: "",
  integrationId: "5613515",
  walletIntegrationId: "5632185",
  valuIntegrationId: "",
  symplIntegrationId: "",
  souhoolaIntegrationId: "",
  iframeId: "1032257",
  installmentIframeId: "1032256",
  returnUrl: "https://fitzoneland.com/payment/verify",
  cancelUrl: "https://fitzoneland.com/payment/verify?state=cancel",
  webhookUrl: "https://fitzoneland.com/api/payments/webhook/paymob",
  sandboxMode: true,
  cashOnDeliveryEnabled: true,
  cashOnDeliveryLabelAr: "الدفع عند الاستلام",
  cashOnDeliveryLabelEn: "Cash on delivery",
  notes: "",
  displayLabelAr: "الدفع الإلكتروني عبر Paymob",
  displayLabelEn: "Paymob online payment",
  providerStatus: "enabled",
  providerMode: "live",
  secretsConfigured: { apiKey: false, secretKey: false, hmac: false },
  envConfigured: {
    merchantId: false,
    publicKey: false,
    cardIntegrationId: false,
    walletIntegrationId: false,
    valuIntegrationId: false,
    symplIntegrationId: false,
    souhoolaIntegrationId: false,
    iframeId: false,
    installmentIframeId: false,
    env: "",
  },
  lastValidationResult: null,
};

const STATUS_STYLES: Record<PaymentTransactionRow["status"], string> = {
  pending: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  requires_action: "bg-sky-500/15 text-sky-200 border-sky-400/20",
  paid: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  failed: "bg-rose-500/15 text-rose-200 border-rose-400/20",
  cancelled: "bg-slate-500/15 text-slate-200 border-slate-400/20",
  expired: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20",
};

const STATUS_LABELS: Record<PaymentTransactionRow["status"], string> = {
  pending: "قيد الانتظار",
  requires_action: "بانتظار استكمال الدفع",
  paid: "مدفوعة",
  failed: "فشلت",
  cancelled: "ملغية",
  expired: "منتهية",
};

function Field({
  label,
  value,
  onChange,
  readOnly,
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">{label}</span>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400 ${readOnly ? "cursor-default opacity-60" : ""}`}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SecretBadge({ configured, label }: { configured: boolean; label: string }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        configured
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
          : "border-rose-400/25 bg-rose-500/10 text-rose-200"
      }`}
    >
      <div className="font-mono text-xs font-bold">{label}</div>
      <div className="mt-1 text-xs opacity-80">{configured ? "Configured on server" : "Missing in server env"}</div>
    </div>
  );
}

function getPurposeLabel(purpose: string) {
  if (purpose === "membership") return "اشتراك";
  if (purpose === "order") return "طلب متجر";
  if (purpose === "wallet_topup") return "شحن محفظة";
  if (purpose === "private_session") return "برايفيت / ميني برايفيت";
  return purpose;
}

export default function Payments() {
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  async function loadData() {
    const [txRes, settingsRes] = await Promise.all([
      fetch("/api/admin/payments", { cache: "no-store" }),
      fetch("/api/admin/payments/settings", { cache: "no-store" }),
    ]);
    const txData = (await txRes.json()) as PaymentTransactionRow[];
    const settingsData = (await settingsRes.json()) as PaymentSettings;
    setTransactions(Array.isArray(txData) ? txData : []);
    setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
  }

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        await loadData();
      } catch {
        if (!cancelled) {
          setTransactions([]);
          setSettings(DEFAULT_SETTINGS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const paid = transactions.filter((transaction) => transaction.status === "paid");
    const pending = transactions.filter(
      (transaction) => transaction.status === "pending" || transaction.status === "requires_action",
    );
    return {
      total: transactions.length,
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, transaction) => sum + Number(transaction.amount), 0),
      pendingCount: pending.length,
    };
  }, [transactions]);

  const filterOptions = useMemo(() => {
    const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean))).sort();
    return {
      purposes: unique(transactions.map((transaction) => transaction.purpose)),
      providers: unique(transactions.map((transaction) => transaction.provider)),
      methods: unique(transactions.map((transaction) => transaction.paymentMethod)),
    };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return transactions.filter((transaction) => {
      if (statusFilter !== "all" && transaction.status !== statusFilter) return false;
      if (purposeFilter !== "all" && transaction.purpose !== purposeFilter) return false;
      if (providerFilter !== "all" && transaction.provider !== providerFilter) return false;
      if (methodFilter !== "all" && transaction.paymentMethod !== methodFilter) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        transaction.customerName,
        transaction.customerEmail,
        transaction.customerPhone,
        transaction.referenceCode,
        transaction.id,
        transaction.providerReference,
        transaction.externalReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [transactions, searchQuery, statusFilter, purposeFilter, providerFilter, methodFilter]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await fetch("/api/admin/payments/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json()) as { error?: string; settings?: PaymentSettings };
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر حفظ الإعدادات.");
        return;
      }
      setSettings({ ...DEFAULT_SETTINGS, ...(payload.settings ?? settings) });
      window.alert("تم حفظ إعدادات Paymob.");
    } catch {
      window.alert("حدث خطأ أثناء حفظ الإعدادات.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function validateConfig() {
    setValidating(true);
    setValidation(null);
    try {
      const response = await fetch("/api/admin/payments/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const payload = (await response.json()) as ValidationResult & { settings?: PaymentSettings };
      setValidation(payload);
      if (payload.settings) setSettings({ ...DEFAULT_SETTINGS, ...payload.settings });
    } catch {
      setValidation({ ok: false, message: "تعذر الاتصال بالسيرفر." });
    } finally {
      setValidating(false);
    }
  }

  async function reVerify(transactionId: string) {
    setActionId(transactionId);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, action: "re-verify" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر إعادة التحقق.");
        return;
      }
      await loadData();
    } catch {
      window.alert("حدث خطأ أثناء إعادة التحقق.");
    } finally {
      setActionId(null);
    }
  }

  async function addNote(transactionId: string) {
    const note = noteDrafts[transactionId]?.trim();
    if (!note) {
      window.alert("اكتب ملاحظة أولًا.");
      return;
    }

    setActionId(transactionId);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, action: "add-note", note }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر حفظ الملاحظة.");
        return;
      }
      setNoteDrafts((current) => ({ ...current, [transactionId]: "" }));
      await loadData();
    } catch {
      window.alert("حدث خطأ أثناء حفظ الملاحظة.");
    } finally {
      setActionId(null);
    }
  }

  async function deleteTransaction(transactionId: string) {
    const confirmed = window.confirm("هل تريد حذف هذه المعاملة من السجل؟ لا يمكن التراجع بعد الحذف.");
    if (!confirmed) return;

    setActionId(transactionId);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر حذف المعاملة.");
        return;
      }
      await loadData();
    } catch {
      window.alert("حدث خطأ أثناء حذف المعاملة.");
    } finally {
      setActionId(null);
    }
  }

  const secrets = settings.secretsConfigured ?? DEFAULT_SETTINGS.secretsConfigured!;
  const envConfigured = settings.envConfigured ?? DEFAULT_SETTINGS.envConfigured!;
  const lastValidation = settings.lastValidationResult;

  return (
    <AdminSectionShell
      title="المدفوعات"
      subtitle="Paymob هو مزود الدفع الإلكتروني الأساسي. التفعيل النهائي للطلبات والاشتراكات يتم فقط بعد webhook + verification."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">إجمالي المعاملات</div>
          <div className="mt-2 text-3xl font-black text-[#fff4f8]">{summary.total.toLocaleString("ar-EG")}</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">المدفوعة</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{summary.paidCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">{summary.paidAmount.toLocaleString("ar-EG")} EGP</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">قيد الانتظار</div>
          <div className="mt-2 text-3xl font-black text-amber-300">{summary.pendingCount.toLocaleString("ar-EG")}</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">حالة المزود</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-bold text-[#fff4f8]">
            <span>{settings.providerStatus === "enabled" ? "Enabled" : "Disabled"}</span>
            <span className="rounded-full bg-white/10 px-2 py-1 text-[11px]">
              {settings.providerMode === "sandbox" ? "Sandbox" : "Live"}
            </span>
          </div>
        </AdminCard>
      </div>

      <AdminCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">تشخيص Paymob</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              الأسرار محفوظة على السيرفر فقط، ولوحة الأدمن تعرض حالتها بدون كشف القيم.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void validateConfig()}
            disabled={validating}
            className="rounded-2xl border border-pink-400/30 bg-pink-500/10 px-5 py-2.5 text-sm font-bold text-pink-200 transition hover:bg-pink-500/20 disabled:opacity-50"
          >
            {validating ? "جارٍ التحقق..." : "Validate configuration"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SecretBadge configured={secrets.apiKey} label="PAYMOB_API_KEY" />
          <SecretBadge configured={secrets.secretKey} label="PAYMOB_SECRET_KEY" />
          <SecretBadge configured={secrets.hmac} label="PAYMOB_HMAC_SECRET" />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SecretBadge configured={Boolean(envConfigured.merchantId)} label="PAYMOB_MERCHANT_ID" />
          <SecretBadge configured={Boolean(envConfigured.publicKey)} label="PAYMOB_PUBLIC_KEY" />
          <SecretBadge configured={Boolean(envConfigured.cardIntegrationId)} label="PAYMOB_CARD_INTEGRATION_ID" />
          <SecretBadge configured={Boolean(envConfigured.walletIntegrationId)} label="PAYMOB_WALLET_INTEGRATION_ID" />
          <SecretBadge configured={Boolean(envConfigured.valuIntegrationId)} label="PAYMOB_VALU_INTEGRATION_ID" />
          <SecretBadge configured={Boolean(envConfigured.symplIntegrationId)} label="PAYMOB_SYMPL_INTEGRATION_ID" />
          <SecretBadge configured={Boolean(envConfigured.souhoolaIntegrationId)} label="PAYMOB_SOUHOOLA_INTEGRATION_ID" />
          <SecretBadge configured={Boolean(envConfigured.iframeId)} label="PAYMOB_IFRAME_CARD_ID" />
          <SecretBadge configured={Boolean(envConfigured.installmentIframeId)} label="PAYMOB_IFRAME_INSTALLMENT_ID" />
          <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 px-4 py-3 text-sm text-pink-100">
            <div className="font-mono text-xs font-bold">PAYMOB_ENV</div>
            <div className="mt-1 text-xs opacity-80">{envConfigured.env || "Not set"}</div>
          </div>
        </div>

        {(validation || lastValidation) && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
              (validation?.ok ?? lastValidation?.ok)
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                : "border-amber-400/25 bg-amber-500/10 text-amber-100"
            }`}
          >
            <div className="font-bold">{validation?.message ?? lastValidation?.message}</div>
            {(validation?.validatedAt ?? lastValidation?.validatedAt) && (
              <div className="mt-1 text-xs opacity-80">
                Last validation: {new Date(validation?.validatedAt ?? lastValidation!.validatedAt).toLocaleString("ar-EG")}
              </div>
            )}
            {validation?.authTest && <div className="mt-1 text-xs opacity-80">{validation.authTest.message}</div>}
            {(validation?.issues ?? lastValidation?.issues)?.length ? (
              <div className="mt-2 space-y-1 text-xs">
                {(validation?.issues ?? lastValidation?.issues ?? []).map((issue) => (
                  <div key={issue}>- {issue}</div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">إعدادات Paymob العامة</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              هذه الشاشة تدير كل integration IDs بشكل مستقل. Unified Checkout هو المسار الأساسي لوسائل الدفع الإلكترونية، بينما الدفع عند الاستلام منفصل عن Paymob.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white transition hover:bg-pink-500 disabled:opacity-50"
          >
            {savingSettings ? "جارٍ الحفظ..." : "حفظ الإعدادات"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Active provider" value={settings.activeProvider} readOnly />
          <Field label="PAYMOB_MERCHANT_ID" value={settings.merchantId} onChange={(value) => setSettings((current) => ({ ...current, merchantId: value }))} />
          <Field label="PAYMOB_PUBLIC_KEY" value={settings.publicKey} onChange={(value) => setSettings((current) => ({ ...current, publicKey: value }))} />
          <Field label="PAYMOB_CARD_INTEGRATION_ID" value={settings.integrationId} onChange={(value) => setSettings((current) => ({ ...current, integrationId: value }))} placeholder="5613515" />
          <Field label="PAYMOB_WALLET_INTEGRATION_ID (محفظة إلكترونية)" value={settings.walletIntegrationId} onChange={(value) => setSettings((current) => ({ ...current, walletIntegrationId: value }))} placeholder="5632185" />
          <Field label="PAYMOB_VALU_INTEGRATION_ID" value={settings.valuIntegrationId} onChange={(value) => setSettings((current) => ({ ...current, valuIntegrationId: value }))} placeholder="Optional" />
          <Field label="PAYMOB_SYMPL_INTEGRATION_ID" value={settings.symplIntegrationId} onChange={(value) => setSettings((current) => ({ ...current, symplIntegrationId: value }))} placeholder="Optional" />
          <Field label="PAYMOB_SOUHOOLA_INTEGRATION_ID" value={settings.souhoolaIntegrationId} onChange={(value) => setSettings((current) => ({ ...current, souhoolaIntegrationId: value }))} placeholder="Optional" />
          <Field label="PAYMOB_IFRAME_CARD_ID (Reference only)" value={settings.iframeId} onChange={(value) => setSettings((current) => ({ ...current, iframeId: value }))} placeholder="1032257" />
          <Field label="PAYMOB_IFRAME_INSTALLMENT_ID (Reference only)" value={settings.installmentIframeId} onChange={(value) => setSettings((current) => ({ ...current, installmentIframeId: value }))} placeholder="1032256" />
          <Field label="Display label AR" value={settings.displayLabelAr} onChange={(value) => setSettings((current) => ({ ...current, displayLabelAr: value }))} />
          <Field label="Display label EN" value={settings.displayLabelEn} onChange={(value) => setSettings((current) => ({ ...current, displayLabelEn: value }))} />
          <Field label="Return URL" value={settings.returnUrl} onChange={(value) => setSettings((current) => ({ ...current, returnUrl: value }))} />
          <Field label="Cancel URL" value={settings.cancelUrl} onChange={(value) => setSettings((current) => ({ ...current, cancelUrl: value }))} />
          <Field label="Webhook URL" value={settings.webhookUrl} readOnly />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3 text-sm text-[#fff4f8]">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
              className="accent-pink-500"
            />
            <span>Enable provider</span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3 text-sm text-[#fff4f8]">
            <input
              type="checkbox"
              checked={settings.sandboxMode}
              onChange={(event) => setSettings((current) => ({ ...current, sandboxMode: event.target.checked }))}
              className="accent-pink-500"
            />
            <span>Sandbox mode</span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3 text-sm text-[#fff4f8]">
            <input
              type="checkbox"
              checked={settings.cashOnDeliveryEnabled}
              onChange={(event) => setSettings((current) => ({ ...current, cashOnDeliveryEnabled: event.target.checked }))}
              className="accent-pink-500"
            />
            <span>Enable Cash on Delivery</span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Cash on Delivery Label AR" value={settings.cashOnDeliveryLabelAr} onChange={(value) => setSettings((current) => ({ ...current, cashOnDeliveryLabelAr: value }))} />
          <Field label="Cash on Delivery Label EN" value={settings.cashOnDeliveryLabelEn} onChange={(value) => setSettings((current) => ({ ...current, cashOnDeliveryLabelEn: value }))} />
        </div>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">Notes</span>
          <textarea
            value={settings.notes}
            onChange={(event) => setSettings((current) => ({ ...current, notes: event.target.value }))}
            rows={3}
            className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
          />
        </label>
      </AdminCard>

      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">المعاملات الأخيرة</h3>
          <p className="mt-1 text-sm text-[#d7aabd]">
            يمكنك الآن البحث في المعاملات وتصفية النتائج وحذف أي معاملة عند الحاجة، مع الإبقاء على إعادة التحقق والملاحظات الداخلية.
          </p>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">بحث</span>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="الاسم أو البريد أو المرجع"
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <SelectField
            label="الحالة"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "كل الحالات" },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />

          <SelectField
            label="النوع"
            value={purposeFilter}
            onChange={setPurposeFilter}
            options={[
              { value: "all", label: "كل الأنواع" },
              ...filterOptions.purposes.map((purpose) => ({ value: purpose, label: getPurposeLabel(purpose) })),
            ]}
          />

          <SelectField
            label="المزوّد"
            value={providerFilter}
            onChange={setProviderFilter}
            options={[
              { value: "all", label: "كل المزوّدين" },
              ...filterOptions.providers.map((provider) => ({ value: provider, label: provider })),
            ]}
          />

          <SelectField
            label="وسيلة الدفع"
            value={methodFilter}
            onChange={setMethodFilter}
            options={[
              { value: "all", label: "كل الوسائل" },
              ...filterOptions.methods.map((method) => ({ value: method, label: method })),
            ]}
          />
        </div>

        {loading ? (
          <div className="rounded-[22px] border border-[rgba(255,188,219,0.14)] bg-black/10 px-4 py-12 text-center text-sm text-[#d7aabd]">
            جارٍ تحميل المعاملات...
          </div>
        ) : transactions.length === 0 ? (
          <AdminEmptyState title="لا توجد معاملات بعد" description="ستظهر هنا المعاملات فور بدء الدفع عبر Paymob." />
        ) : filteredTransactions.length === 0 ? (
          <AdminEmptyState title="لا توجد نتائج" description="غيّر الفلاتر أو ابحث بكلمة مختلفة لعرض المعاملات." />
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="rounded-[22px] border border-[rgba(255,188,219,0.12)] bg-black/10 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-black text-[#fff4f8]">{transaction.customerName}</div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[transaction.status]}`}>
                        {STATUS_LABELS[transaction.status]}
                      </span>
                    </div>
                    <div className="text-sm text-[#d7aabd]">
                      {getPurposeLabel(transaction.purpose)} • {Number(transaction.amount).toLocaleString("ar-EG")} {transaction.currency}
                    </div>
                    <div className="text-xs text-[#d7aabd]">
                      {transaction.customerEmail ?? transaction.customerPhone ?? "No customer contact"}
                    </div>
                    <div className="font-mono text-[11px] text-[#d7aabd]">
                      Ref: {transaction.referenceCode ?? transaction.id}
                      <br />
                      Tx: {transaction.id}
                      <br />
                      Provider ref: {transaction.providerReference ?? "—"}
                      <br />
                      External ref: {transaction.externalReference ?? "—"}
                    </div>
                    {transaction.metadata ? (
                      <details className="text-xs text-[#d7aabd]">
                        <summary className="cursor-pointer select-none">View logs / metadata</summary>
                        <pre className="mt-2 overflow-x-auto rounded-xl bg-black/20 p-3 text-[11px] text-[#fff4f8]">
                          {JSON.stringify(transaction.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>

                  <div className="w-full max-w-md space-y-2">
                    <div className="text-xs text-[#d7aabd]">
                      {new Date(transaction.createdAt).toLocaleString("ar-EG")}
                    </div>
                    {transaction.status !== "paid" ? (
                      <button
                        type="button"
                        onClick={() => void reVerify(transaction.id)}
                        disabled={actionId === transaction.id}
                        className="w-full rounded-xl border border-sky-400/30 px-4 py-2 text-sm font-bold text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                      >
                        {actionId === transaction.id ? "جارٍ التحقق..." : "Re-verify transaction"}
                      </button>
                    ) : null}
                    <textarea
                      value={noteDrafts[transaction.id] ?? ""}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({ ...current, [transaction.id]: event.target.value }))
                      }
                      rows={2}
                      placeholder="Internal note"
                      className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
                    />
                    <button
                      type="button"
                      onClick={() => void addNote(transaction.id)}
                      disabled={actionId === transaction.id}
                      className="w-full rounded-xl border border-pink-400/30 px-4 py-2 text-sm font-bold text-pink-200 hover:bg-pink-500/10 disabled:opacity-40"
                    >
                      Save internal note
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTransaction(transaction.id)}
                      disabled={actionId === transaction.id}
                      className="w-full rounded-xl border border-rose-400/30 px-4 py-2 text-sm font-bold text-rose-200 hover:bg-rose-500/10 disabled:opacity-40"
                    >
                      {actionId === transaction.id ? "جارٍ الحذف..." : "حذف المعاملة"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSectionShell>
  );
}
