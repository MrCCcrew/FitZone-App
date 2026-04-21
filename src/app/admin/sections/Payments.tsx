"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type SecretsStatus = { apiKey: boolean; hmac: boolean };

type PaymentSettings = {
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
  secretsConfigured?: SecretsStatus;
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
  orderId?: string | null;
  membershipId?: string | null;
  createdAt: string;
  providerReference?: string | null;
  externalReference?: string | null;
};

type ValidationResult = {
  ok: boolean;
  message: string;
  secrets?: SecretsStatus;
  authTest?: { ok: boolean; message: string };
  issues?: string[];
};

const DEFAULT_SETTINGS: PaymentSettings = {
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
  requires_action: "بانتظار إجراء",
  paid: "مدفوعة",
  failed: "فشلت",
  cancelled: "ملغية",
  expired: "منتهية",
};

function getPurposeLabel(p: string) {
  if (p === "membership") return "اشتراك";
  if (p === "order") return "طلب متجر";
  if (p === "wallet_topup") return "شحن محفظة";
  return p;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">{label}</span>
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400 ${readOnly ? "opacity-60 cursor-default" : ""}`}
      />
    </label>
  );
}

function SecretBadge({ configured, label }: { configured: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${configured ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-rose-400/25 bg-rose-500/10 text-rose-200"}`}>
      <span className="text-base">{configured ? "✅" : "❌"}</span>
      <div>
        <div className="font-bold text-xs font-mono">{label}</div>
        <div className="text-xs opacity-75 mt-0.5">{configured ? "مُعيَّن على السيرفر" : "غير مُعيَّن — أضفه في .env"}</div>
      </div>
    </div>
  );
}

export default function Payments() {
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [txRes, settingsRes] = await Promise.all([
          fetch("/api/admin/payments", { cache: "no-store" }),
          fetch("/api/admin/payments/settings", { cache: "no-store" }),
        ]);
        const txData = (await txRes.json()) as PaymentTransactionRow[];
        const settingsData = (await settingsRes.json()) as PaymentSettings;

        if (!cancelled) {
          setTransactions(Array.isArray(txData) ? txData : []);
          setSettings({ ...DEFAULT_SETTINGS, ...settingsData });
        }
      } catch {
        if (!cancelled) {
          setTransactions([]);
          setSettings(DEFAULT_SETTINGS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => {
    const paid = transactions.filter((t) => t.status === "paid");
    const pending = transactions.filter((t) => t.status === "pending" || t.status === "requires_action");
    return {
      total: transactions.length,
      paidCount: paid.length,
      paidAmount: paid.reduce((s, t) => s + Number(t.amount), 0),
      pendingCount: pending.length,
    };
  }, [transactions]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/admin/payments/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await res.json()) as { error?: string; settings?: PaymentSettings };
      if (!res.ok) { window.alert(data.error ?? "تعذر حفظ الإعدادات."); return; }
      setSettings({ ...DEFAULT_SETTINGS, ...(data.settings ?? settings) });
      window.alert("تم حفظ إعدادات الدفع بنجاح.");
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
      const res = await fetch("/api/admin/payments/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const data = (await res.json()) as ValidationResult;
      setValidation(data);
    } catch {
      setValidation({ ok: false, message: "تعذر الاتصال بالسيرفر." });
    } finally {
      setValidating(false);
    }
  }

  async function reVerify(transactionId: string) {
    setActionId(transactionId);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, action: "re-verify" }),
      });
      const data = (await res.json()) as { error?: string; transaction?: { status: string } };
      if (!res.ok) { window.alert(data.error ?? "تعذر التحقق."); return; }
      // Refresh transactions list
      const txRes = await fetch("/api/admin/payments", { cache: "no-store" });
      const txData = (await txRes.json()) as PaymentTransactionRow[];
      setTransactions(Array.isArray(txData) ? txData : []);
    } catch {
      window.alert("حدث خطأ أثناء التحقق.");
    } finally {
      setActionId(null);
    }
  }

  async function cancelTransaction(transactionId: string) {
    if (!window.confirm("هل تريدين إلغاء هذه المعاملة؟")) return;
    setActionId(transactionId);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, action: "cancel" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) { window.alert(data.error ?? "تعذر الإلغاء."); return; }
      setTransactions((prev) => prev.map((t) => t.id === transactionId ? { ...t, status: "cancelled" } : t));
    } catch {
      window.alert("حدث خطأ أثناء الإلغاء.");
    } finally {
      setActionId(null);
    }
  }

  async function deleteTransaction(transactionId: string) {
    if (!window.confirm("هل تريدين حذف هذه المعاملة نهائيًا؟")) return;
    setActionId(transactionId);
    try {
      const res = await fetch(`/api/admin/payments?id=${transactionId}`, { method: "DELETE" });
      if (!res.ok) { window.alert("تعذر الحذف."); return; }
      setTransactions((prev) => prev.filter((t) => t.id !== transactionId));
    } catch {
      window.alert("حدث خطأ أثناء الحذف.");
    } finally {
      setActionId(null);
    }
  }

  const secrets = settings.secretsConfigured ?? { apiKey: false, hmac: false };

  return (
    <AdminSectionShell
      title="المدفوعات"
      subtitle="إدارة Paymob كـ payment gateway تلقائي — الدفع يتم ويتأكد أوتوماتيك بدون تدخل يدوي."
    >
      {/* ── Stats ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">إجمالي المعاملات</div>
          <div className="mt-2 text-3xl font-black text-[#fff4f8]">{summary.total.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">آخر 100 معاملة</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">مدفوعة بنجاح</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{summary.paidCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">إجمالي {summary.paidAmount.toLocaleString("ar-EG")} ج.م</div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">قيد الانتظار</div>
          <div className="mt-2 text-3xl font-black text-amber-300">{summary.pendingCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">
            المزود: <span className={`font-bold ${secrets.apiKey ? "text-emerald-300" : "text-rose-300"}`}>
              {settings.activeProvider} {secrets.apiKey ? "✅" : "⚠️"}
            </span>
          </div>
        </AdminCard>
      </div>

      {/* ── Secrets Status ── */}
      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">حالة الأسرار (env-only)</h3>
          <p className="mt-1 text-sm text-[#d7aabd]">
            هذه القيم تُحفظ فقط في ملف <code className="text-pink-300">.env</code> على السيرفر، ولا تُعرض ولا تُخزن في قاعدة البيانات.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SecretBadge configured={secrets.apiKey} label="PAYMOB_SECRET_KEY" />
          <SecretBadge configured={secrets.hmac} label="PAYMOB_HMAC_SECRET" />
        </div>

        {/* Validate button */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void validateConfig()}
            disabled={validating}
            className="rounded-2xl border border-pink-400/30 bg-pink-500/10 px-5 py-2.5 text-sm font-bold text-pink-200 transition hover:bg-pink-500/20 disabled:opacity-50"
          >
            {validating ? "جارٍ التحقق..." : "🔍 تحقق من الإعدادات"}
          </button>
          {validation && (
            <div className={`rounded-xl border px-4 py-2.5 text-sm ${validation.ok ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200" : "border-amber-400/25 bg-amber-500/10 text-amber-100"}`}>
              <div className="font-bold">{validation.message}</div>
              {validation.authTest && (
                <div className="mt-1 text-xs opacity-80">{validation.authTest.message}</div>
              )}
              {validation.issues && validation.issues.length > 0 && (
                <ul className="mt-1 text-xs space-y-0.5">
                  {validation.issues.map((issue, i) => <li key={i}>• {issue}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </AdminCard>

      {/* ── Paymob Config ── */}
      <AdminCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">إعدادات Paymob العامة</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              هذه البيانات غير حساسة ويمكن تعديلها من هنا. لا تُدخل API Key أو HMAC هنا.
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
          <Field
            label="معرّف التاجر / Profile ID"
            value={settings.merchantId}
            onChange={(v) => setSettings((s) => ({ ...s, merchantId: v }))}
            placeholder="مثال: 123456"
          />
          <Field
            label="المفتاح العام Public Key"
            value={settings.publicKey}
            onChange={(v) => setSettings((s) => ({ ...s, publicKey: v }))}
            placeholder="مثال: egy_pk_test_..."
          />
          <Field
            label="Integration ID (لإنشاء مفتاح الدفع)"
            value={settings.integrationId}
            onChange={(v) => setSettings((s) => ({ ...s, integrationId: v }))}
            placeholder="مثال: 1234567"
          />
          <Field
            label="Iframe ID (للـ hosted checkout URL)"
            value={settings.iframeId}
            onChange={(v) => setSettings((s) => ({ ...s, iframeId: v }))}
            placeholder="مثال: 987654"
          />
          <Field
            label="Return URL (بعد الدفع)"
            value={settings.returnUrl}
            onChange={(v) => setSettings((s) => ({ ...s, returnUrl: v }))}
          />
          <Field
            label="Cancel URL (عند الإلغاء)"
            value={settings.cancelUrl}
            onChange={(v) => setSettings((s) => ({ ...s, cancelUrl: v }))}
          />
          <div className="md:col-span-2">
            <Field
              label="Webhook URL (اضبطه على لوحة Paymob)"
              value={settings.webhookUrl}
              readOnly
            />
            <p className="mt-1 text-xs text-[#d7aabd]">
              أضف هذا الرابط في لوحة تحكم Paymob → Integrations → Webhook URL.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3 text-sm text-[#fff4f8] cursor-pointer">
            <input
              type="checkbox"
              checked={settings.sandboxMode}
              onChange={(e) => setSettings((s) => ({ ...s, sandboxMode: e.target.checked }))}
              className="accent-pink-500"
            />
            <span>
              وضع الاختبار Sandbox
              {settings.sandboxMode && <span className="mr-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200">مفعّل</span>}
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-[#d7aabd]">ملاحظات تشغيلية</span>
            <textarea
              value={settings.notes}
              onChange={(e) => setSettings((s) => ({ ...s, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
              placeholder="ملاحظات داخلية..."
            />
          </label>

          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-100">
            ⚠️ لا تُدخل <strong>PAYMOB_SECRET_KEY</strong> أو <strong>PAYMOB_HMAC_SECRET</strong> في هذه الشاشة.
            أضفهم فقط في ملف <code>.env</code> على السيرفر.
          </div>
        </div>
      </AdminCard>

      {/* ── Transactions ── */}
      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">المعاملات الأخيرة</h3>
          <p className="mt-1 text-sm text-[#d7aabd]">
            تأكيد الدفع يتم أوتوماتيك عبر Paymob webhook. استخدم زر «تحقق» لاستعلام الحالة يدويًا إن لزم.
          </p>
        </div>

        {loading ? (
          <div className="rounded-[22px] border border-[rgba(255,188,219,0.14)] bg-black/10 px-4 py-12 text-center text-sm text-[#d7aabd]">
            جاري تحميل المعاملات...
          </div>
        ) : transactions.length === 0 ? (
          <AdminEmptyState
            title="لا توجد معاملات بعد"
            description="ستظهر هنا المعاملات بمجرد بدء عمليات الدفع عبر Paymob."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-sm">
              <thead>
                <tr className="text-right text-xs text-[#d7aabd]">
                  <th className="px-3 py-2 font-bold">العميل</th>
                  <th className="px-3 py-2 font-bold">الغرض</th>
                  <th className="px-3 py-2 font-bold">القيمة</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">Paymob Ref</th>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="rounded-[18px] border border-[rgba(255,188,219,0.12)] bg-black/10 text-[#fff4f8]">
                    <td className="rounded-r-[18px] px-3 py-3 align-top">
                      <div className="font-bold">{tx.customerName}</div>
                      <div className="mt-0.5 text-xs text-[#d7aabd]">{tx.customerEmail ?? tx.customerPhone ?? "—"}</div>
                    </td>
                    <td className="px-3 py-3 align-top text-xs">
                      <div>{getPurposeLabel(tx.purpose)}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-[#d7aabd] opacity-70">{tx.provider}</div>
                    </td>
                    <td className="px-3 py-3 align-top font-bold">
                      {Number(tx.amount).toLocaleString("ar-EG")} {tx.currency}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${STATUS_STYLES[tx.status]}`}>
                        {STATUS_LABELS[tx.status] ?? tx.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="font-mono text-[10px] text-[#d7aabd]">
                        {tx.providerReference ? `Order: ${tx.providerReference}` : "—"}
                      </div>
                      {tx.externalReference && (
                        <div className="font-mono text-[10px] text-[#d7aabd]">Txn: {tx.externalReference}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-xs text-[#d7aabd]">
                      {new Date(tx.createdAt).toLocaleString("ar-EG", {
                        year: "numeric", month: "short", day: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </td>
                    <td className="rounded-l-[18px] px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {tx.status !== "paid" && (
                          <button
                            type="button"
                            onClick={() => void reVerify(tx.id)}
                            disabled={actionId === tx.id}
                            className="rounded-lg border border-sky-400/30 px-2.5 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                          >
                            {actionId === tx.id ? "..." : "تحقق"}
                          </button>
                        )}
                        {(tx.status === "pending" || tx.status === "requires_action") && (
                          <button
                            type="button"
                            onClick={() => void cancelTransaction(tx.id)}
                            disabled={actionId === tx.id}
                            className="rounded-lg border border-amber-400/30 px-2.5 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
                          >
                            إلغاء
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteTransaction(tx.id)}
                          disabled={actionId === tx.id}
                          className="rounded-lg border border-rose-500/30 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/10 disabled:opacity-40"
                        >
                          حذف
                        </button>
                      </div>
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
