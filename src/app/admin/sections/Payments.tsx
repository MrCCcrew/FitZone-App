"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type PaymentProviderSummary = {
  key: string;
  label: string;
  enabled: boolean;
  supportsCards: boolean;
};

type PaymentProvidersResponse = {
  providers: PaymentProviderSummary[];
  defaultProvider?: string | null;
};

type PaymentAccount = {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
};

type PaymentSettings = {
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

type PaymentTransactionRow = {
  id: string;
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
  metadata?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

const DEFAULT_SETTINGS: PaymentSettings = {
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

const STATUS_OPTIONS: { value: PaymentTransactionRow["status"]; label: string }[] = [
  { value: "pending", label: "قيد الانتظار" },
  { value: "requires_action", label: "بانتظار إجراء" },
  { value: "paid", label: "مدفوعة" },
  { value: "failed", label: "فشلت" },
  { value: "cancelled", label: "ملغية" },
  { value: "expired", label: "منتهية" },
];

const STATUS_STYLES: Record<PaymentTransactionRow["status"], string> = {
  pending: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  requires_action: "bg-sky-500/15 text-sky-200 border-sky-400/20",
  paid: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20",
  failed: "bg-rose-500/15 text-rose-200 border-rose-400/20",
  cancelled: "bg-slate-500/15 text-slate-200 border-slate-400/20",
  expired: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/20",
};

function getPurposeLabel(purpose: string) {
  if (purpose === "membership") return "اشتراك";
  if (purpose === "order") return "طلب متجر";
  if (purpose === "wallet_topup") return "شحن محفظة";
  return purpose;
}

function getAccountLabel(transaction: PaymentTransactionRow) {
  const payload = transaction.payload || {};
  const label = typeof payload.label === "string" ? payload.label : null;
  return label || "المحفظة الافتراضية";
}

function normalizeAccounts(accounts: PaymentAccount[]) {
  if (accounts.length === 0) return accounts;
  const firstDefaultIndex = accounts.findIndex((item) => item.isDefault);
  if (firstDefaultIndex === -1) {
    return accounts.map((item, index) => ({ ...item, isDefault: index === 0 }));
  }
  return accounts.map((item, index) => ({ ...item, isDefault: index === firstDefaultIndex }));
}

function AccountEditor({
  title,
  accounts,
  onChange,
}: {
  title: string;
  accounts: PaymentAccount[];
  onChange: (next: PaymentAccount[]) => void;
}) {
  const handleUpdate = (id: string, patch: Partial<PaymentAccount>) => {
    onChange(
      normalizeAccounts(
        accounts.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      ),
    );
  };

  const addAccount = () => {
    const next = [
      ...accounts,
      {
        id: `account-${Date.now()}`,
        label: "",
        url: "",
        isDefault: accounts.length === 0,
      },
    ];
    onChange(normalizeAccounts(next));
  };

  const removeAccount = (id: string) => {
    const next = accounts.filter((item) => item.id !== id);
    onChange(normalizeAccounts(next));
  };

  return (
    <div className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/10 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-black text-[#fff4f8]">{title}</h4>
        <button
          type="button"
          onClick={addAccount}
          className="rounded-full border border-pink-300/30 bg-pink-500/10 px-3 py-1 text-xs font-bold text-pink-200"
        >
          إضافة محفظة
        </button>
      </div>
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="text-xs text-[#d7aabd]">لا توجد محافظ مضافة.</div>
        ) : (
          accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-[rgba(255,188,219,0.16)] bg-[rgba(255,255,255,0.03)] p-3"
            >
              <div className="grid gap-3 md:grid-cols-[1fr_1.2fr_120px]">
                <input
                  value={account.label}
                  onChange={(event) => handleUpdate(account.id, { label: event.target.value })}
                  placeholder="اسم المحفظة"
                  className="rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs text-[#fff4f8] outline-none transition focus:border-pink-400"
                />
                <input
                  value={account.url}
                  onChange={(event) => handleUpdate(account.id, { url: event.target.value })}
                  placeholder="رابط الدفع"
                  className="rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-xs text-[#fff4f8] outline-none transition focus:border-pink-400"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-[#d7aabd]">
                    <input
                      type="radio"
                      name={`${title}-default`}
                      checked={Boolean(account.isDefault)}
                      onChange={() => handleUpdate(account.id, { isDefault: true })}
                    />
                    افتراضية
                  </label>
                  <button
                    type="button"
                    onClick={() => removeAccount(account.id)}
                    className="text-xs text-rose-300 hover:text-rose-200"
                  >
                    حذف
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Payments() {
  const [providers, setProviders] = useState<PaymentProviderSummary[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [providersRes, transactionsRes, settingsRes] = await Promise.all([
          fetch("/api/payments/providers", { cache: "no-store" }),
          fetch("/api/admin/payments", { cache: "no-store" }),
          fetch("/api/admin/payments/settings", { cache: "no-store" }),
        ]);

        const providersPayload = (await providersRes.json()) as PaymentProvidersResponse;
        const transactionsPayload = (await transactionsRes.json()) as PaymentTransactionRow[];
        const settingsPayload = (await settingsRes.json()) as PaymentSettings;

        if (!cancelled) {
          setProviders(providersPayload.providers ?? []);
          setDefaultProvider(providersPayload.defaultProvider ?? null);
          setTransactions(Array.isArray(transactionsPayload) ? transactionsPayload : []);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...(settingsPayload ?? {}),
            instapayAccounts: normalizeAccounts(settingsPayload?.instapayAccounts ?? DEFAULT_SETTINGS.instapayAccounts),
            vodafoneCashAccounts: normalizeAccounts(
              settingsPayload?.vodafoneCashAccounts ?? DEFAULT_SETTINGS.vodafoneCashAccounts,
            ),
          });
        }
      } catch {
        if (!cancelled) {
          setProviders([]);
          setDefaultProvider(null);
          setTransactions([]);
          setSettings(DEFAULT_SETTINGS);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => {
    const paidCount = transactions.filter((item) => item.status === "paid").length;
    const pendingCount = transactions.filter((item) => item.status === "pending" || item.status === "requires_action").length;
    const paidAmount = transactions
      .filter((item) => item.status === "paid")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return { paidCount, pendingCount, paidAmount };
  }, [transactions]);

  const providerSummary = useMemo(() => {
    const map = new Map<string, { label: string; total: number; pending: number; paid: number }>();
    transactions.forEach((row) => {
      const key = row.provider;
      const label = providers.find((provider) => provider.key === key)?.label ?? key;
      if (!map.has(key)) {
        map.set(key, { label, total: 0, pending: 0, paid: 0 });
      }
      const entry = map.get(key)!;
      entry.total += 1;
      if (row.status === "paid") entry.paid += 1;
      if (row.status === "pending" || row.status === "requires_action") entry.pending += 1;
    });
    return Array.from(map.values());
  }, [transactions, providers]);

  async function handleDelete(transactionId: string) {
    if (!window.confirm("هل تريدين حذف هذه المعاملة نهائيًا؟ لا يمكن التراجع.")) return;
    setSavingId(transactionId);
    try {
      const response = await fetch(`/api/admin/payments?id=${transactionId}`, { method: "DELETE" });
      if (!response.ok) {
        window.alert("تعذر حذف المعاملة.");
        return;
      }
      setTransactions((current) => current.filter((item) => item.id !== transactionId));
    } catch {
      window.alert("حدث خطأ أثناء الحذف.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusChange(transactionId: string, status: PaymentTransactionRow["status"]) {
    setSavingId(transactionId);
    try {
      const response = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, status }),
      });

      const payload = (await response.json()) as { error?: string; transaction?: PaymentTransactionRow };
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر تحديث حالة المعاملة.");
        return;
      }

      setTransactions((current) =>
        current.map((item) => (item.id === transactionId && payload.transaction ? { ...item, ...payload.transaction } : item)),
      );
    } catch {
      window.alert("حدث خطأ أثناء تحديث حالة المعاملة.");
    } finally {
      setSavingId(null);
    }
  }

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
        window.alert(payload.error ?? "تعذر حفظ إعدادات الدفع.");
        return;
      }

      setSettings({ ...DEFAULT_SETTINGS, ...(payload.settings ?? settings) });
      window.alert("تم حفظ إعدادات الدفع بنجاح.");
    } catch {
      window.alert("حدث خطأ أثناء حفظ إعدادات الدفع.");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <AdminSectionShell
      title="المدفوعات"
      subtitle="لوحة موحدة لإدارة وسائل الدفع، المحافظ، والمتابعة اليدوية للمعاملات."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">إجمالي المعاملات</div>
          <div className="mt-2 text-3xl font-black text-[#fff4f8]">{transactions.length.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">آخر 100 معاملة تم تسجيلها داخل النظام.</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">المعاملات المدفوعة</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{summary.paidCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">بإجمالي {summary.paidAmount.toLocaleString("ar-EG")} ج.م</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">بانتظار المتابعة</div>
          <div className="mt-2 text-3xl font-black text-amber-300">{summary.pendingCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">المزوّد الافتراضي: {defaultProvider ?? "غير محدد"}</div>
        </AdminCard>
      </div>

      {providerSummary.length > 0 && (
        <AdminCard>
          <div className="mb-3 text-sm font-black text-[#fff4f8]">ملخص المحافظ حسب وسيلة الدفع</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {providerSummary.map((entry) => (
              <div
                key={entry.label}
                className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/10 p-4 text-sm text-[#fff4f8]"
              >
                <div className="font-black">{entry.label}</div>
                <div className="mt-2 text-xs text-[#d7aabd]">الإجمالي: {entry.total}</div>
                <div className="mt-1 text-xs text-emerald-300">مدفوعة: {entry.paid}</div>
                <div className="mt-1 text-xs text-amber-300">بانتظار: {entry.pending}</div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      <AdminCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">إعدادات الدفع</h3>
            <p className="mt-1 text-sm leading-6 text-[#d7aabd]">
              اجمع المحافظ لكل وسيلة دفع هنا، وحدد الافتراضي الذي سيظهر للعميل.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={savingSettings}
            className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-pink-500 disabled:opacity-50"
          >
            {savingSettings ? "جارٍ حفظ الإعدادات..." : "حفظ الإعدادات"}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">المزوّد النشط</span>
            <select
              value={settings.activeProvider}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  activeProvider: event.target.value,
                  webhookUrl: `https://fitzoneland.com/api/payments/webhook/${event.target.value}`,
                }))
              }
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            >
              {providers.map((provider) => (
                <option key={provider.key} value={provider.key} className="bg-[#34111f]">
                  {provider.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">معرّف التاجر أو الحساب</span>
            <input
              type="text"
              value={settings.merchantId}
              onChange={(event) => setSettings((current) => ({ ...current, merchantId: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">المفتاح العام Public Key</span>
            <input
              type="text"
              value={settings.publicKey}
              onChange={(event) => setSettings((current) => ({ ...current, publicKey: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">Integration أو Iframe ID</span>
            <input
              type="text"
              value={settings.iframeId}
              onChange={(event) => setSettings((current) => ({ ...current, iframeId: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">رابط الرجوع بعد الدفع</span>
            <input
              type="text"
              value={settings.returnUrl}
              onChange={(event) => setSettings((current) => ({ ...current, returnUrl: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">رابط الإلغاء أو الفشل</span>
            <input
              type="text"
              value={settings.cancelUrl}
              onChange={(event) => setSettings((current) => ({ ...current, cancelUrl: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">رابط Webhook</span>
            <input
              type="text"
              value={settings.webhookUrl}
              onChange={(event) => setSettings((current) => ({ ...current, webhookUrl: event.target.value }))}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
            />
          </label>

          <div className="grid gap-4 lg:grid-cols-2">
            <AccountEditor
              title="محافظ إنستاباي"
              accounts={settings.instapayAccounts}
              onChange={(next) => setSettings((current) => ({ ...current, instapayAccounts: next }))}
            />
            <AccountEditor
              title="محافظ فودافون كاش"
              accounts={settings.vodafoneCashAccounts}
              onChange={(next) => setSettings((current) => ({ ...current, vodafoneCashAccounts: next }))}
            />
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3 text-sm text-[#fff4f8]">
            <input
              type="checkbox"
              checked={settings.sandboxMode}
              onChange={(event) => setSettings((current) => ({ ...current, sandboxMode: event.target.checked }))}
            />
            تشغيل وضع الاختبار Sandbox
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">ملاحظات تشغيلية</span>
            <textarea
              value={settings.notes}
              onChange={(event) => setSettings((current) => ({ ...current, notes: event.target.value }))}
              rows={4}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
              placeholder="مثال: نستخدم Paymob في البداية، بينما المفتاح السري محفوظ فقط داخل .env على السيرفر."
            />
          </label>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-100">
            لا تحفظ المفاتيح السرية مثل Server Key أو Secret Key داخل هذه الشاشة. استخدم هذه الصفحة للتهيئة العامة
            فقط، واحفظ القيم السرية في ملفات البيئة على السيرفر.
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">مزودات الدفع</h3>
          <p className="mt-1 text-sm leading-6 text-[#d7aabd]">
            يمكنك لاحقًا تفعيل أي مزود جديد دون العبث بكود الطلبات أو الاشتراكات.
          </p>
        </div>

        {providers.length === 0 ? (
          <AdminEmptyState
            title="لا توجد مزودات متاحة"
            description="ستظهر هنا مزودات الدفع الجاهزة داخل المشروع عند إضافتها أو تفعيلها."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providers.map((provider) => (
              <div key={provider.key} className="rounded-[22px] border border-[rgba(255,188,219,0.14)] bg-black/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-[#fff4f8]">{provider.label}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#d7aabd]">{provider.key}</div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      provider.enabled ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-[#d7aabd]"
                    }`}
                  >
                    {provider.enabled ? "مفعّل" : "غير مفعّل"}
                  </span>
                </div>
                <div className="mt-4 text-sm text-[#d7aabd]">
                  {provider.supportsCards ? "يدعم البطاقات البنكية" : "دعم البطاقات غير مفعل"}
                </div>
                {defaultProvider === provider.key ? (
                  <div className="mt-4 inline-flex rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">
                    المزود الافتراضي
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">المعاملات الأخيرة</h3>
          <p className="mt-1 text-sm leading-6 text-[#d7aabd]">
            تابع حالة كل معاملة، مع إمكانية تحديث حالتها يدويًا خلال التشغيل التجريبي أو عند مطابقة التحويلات.
          </p>
        </div>

        {loading ? (
          <div className="rounded-[22px] border border-[rgba(255,188,219,0.14)] bg-black/10 px-4 py-12 text-center text-sm text-[#d7aabd]">
            جاري تحميل بيانات المدفوعات...
          </div>
        ) : transactions.length === 0 ? (
          <AdminEmptyState
            title="لا توجد معاملات بعد"
            description="ستظهر هنا المعاملات الخاصة بالطلبات أو الاشتراكات بمجرد بدء استخدام طبقة الدفع الجديدة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-3 text-sm">
              <thead>
                <tr className="text-right text-xs text-[#d7aabd]">
                  <th className="px-3 py-2 font-bold">العميل</th>
                  <th className="px-3 py-2 font-bold">الغرض</th>
                  <th className="px-3 py-2 font-bold">المزود</th>
                  <th className="px-3 py-2 font-bold">المحفظة</th>
                  <th className="px-3 py-2 font-bold">القيمة</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">تحديث الحالة</th>
                  <th className="px-3 py-2 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="rounded-[18px] border border-[rgba(255,188,219,0.12)] bg-black/10 text-[#fff4f8]"
                  >
                    <td className="rounded-r-[18px] px-3 py-3 align-top">
                      <div className="font-bold">{transaction.customerName}</div>
                      <div className="mt-1 text-xs text-[#d7aabd]">
                        {transaction.customerEmail ?? transaction.customerPhone ?? "بدون بيانات إضافية"}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">{getPurposeLabel(transaction.purpose)}</td>
                    <td className="px-3 py-3 align-top font-bold">{transaction.provider}</td>
                    <td className="px-3 py-3 align-top text-xs text-[#d7aabd]">{getAccountLabel(transaction)}</td>
                    <td className="px-3 py-3 align-top font-bold">
                      {Number(transaction.amount).toLocaleString("ar-EG")} {transaction.currency}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[transaction.status]}`}>
                        {STATUS_OPTIONS.find((option) => option.value === transaction.status)?.label ?? transaction.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-[#d7aabd]">
                      {new Date(transaction.createdAt).toLocaleString("ar-EG", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <select
                        value={transaction.status}
                        onChange={(event) =>
                          void handleStatusChange(transaction.id, event.target.value as PaymentTransactionRow["status"])
                        }
                        disabled={savingId === transaction.id}
                        className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} className="bg-[#34111f]">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="rounded-l-[18px] px-3 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => void handleDelete(transaction.id)}
                        disabled={savingId === transaction.id}
                        className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </AdminSectionShell>
  );
}
