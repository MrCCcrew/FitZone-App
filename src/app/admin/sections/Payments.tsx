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

export default function Payments() {
  const [providers, setProviders] = useState<PaymentProviderSummary[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [providersRes, transactionsRes] = await Promise.all([
          fetch("/api/payments/providers", { cache: "no-store" }),
          fetch("/api/admin/payments", { cache: "no-store" }),
        ]);

        const providersPayload = (await providersRes.json()) as PaymentProvidersResponse;
        const transactionsPayload = (await transactionsRes.json()) as PaymentTransactionRow[];

        if (!cancelled) {
          setProviders(providersPayload.providers ?? []);
          setDefaultProvider(providersPayload.defaultProvider ?? null);
          setTransactions(Array.isArray(transactionsPayload) ? transactionsPayload : []);
        }
      } catch {
        if (!cancelled) {
          setProviders([]);
          setTransactions([]);
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

    return {
      paidCount,
      pendingCount,
      paidAmount,
    };
  }, [transactions]);

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
        current.map((item) =>
          item.id === transactionId && payload.transaction ? { ...item, ...payload.transaction } : item,
        ),
      );
    } catch {
      window.alert("حدث خطأ أثناء تحديث حالة المعاملة.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminSectionShell
      title="المدفوعات"
      subtitle="قسم مستقل يجهز المشروع لربط بوابات الدفع لاحقًا، دون أي تضارب مع الطلبات أو الاشتراكات الحالية."
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
          <div className="mt-2 text-xs text-[#d7aabd]">
            بإجمالي {summary.paidAmount.toLocaleString("ar-EG")} ج.م
          </div>
        </AdminCard>
        <AdminCard>
          <div className="text-sm text-[#d7aabd]">بانتظار المتابعة</div>
          <div className="mt-2 text-3xl font-black text-amber-300">{summary.pendingCount.toLocaleString("ar-EG")}</div>
          <div className="mt-2 text-xs text-[#d7aabd]">
            المزوّد الافتراضي: {defaultProvider ?? "غير محدد"}
          </div>
        </AdminCard>
      </div>

      <AdminCard>
        <div className="mb-4">
          <h3 className="text-lg font-black text-[#fff4f8]">مزوّدات الدفع</h3>
          <p className="mt-1 text-sm leading-6 text-[#d7aabd]">
            يمكنك لاحقًا تفعيل أي مزوّد جديد دون العبث بكود الطلبات أو الاشتراكات، لأن طبقة الدفع أصبحت منفصلة بالكامل.
          </p>
        </div>

        {providers.length === 0 ? (
          <AdminEmptyState
            title="لا توجد مزوّدات متاحة"
            description="ستظهر هنا مزوّدات الدفع الجاهزة داخل المشروع عند إضافتها أو تفعيلها."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {providers.map((provider) => (
              <div
                key={provider.key}
                className="rounded-[22px] border border-[rgba(255,188,219,0.14)] bg-black/10 p-4"
              >
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
                  {provider.supportsCards ? "يدعم البطاقات البنكية" : "دعم البطاقات غير مفعّل"}
                </div>
                {defaultProvider === provider.key ? (
                  <div className="mt-4 inline-flex rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">
                    المزوّد الافتراضي
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
            جارٍ تحميل بيانات المدفوعات...
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
                  <th className="px-3 py-2 font-bold">المزوّد</th>
                  <th className="px-3 py-2 font-bold">القيمة</th>
                  <th className="px-3 py-2 font-bold">الحالة</th>
                  <th className="px-3 py-2 font-bold">التاريخ</th>
                  <th className="px-3 py-2 font-bold">تحديث الحالة</th>
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
                    <td className="px-3 py-3 align-top">
                      {transaction.purpose === "membership"
                        ? "اشتراك"
                        : transaction.purpose === "order"
                          ? "طلب متجر"
                          : "شحن محفظة"}
                    </td>
                    <td className="px-3 py-3 align-top font-bold">{transaction.provider}</td>
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
                    <td className="rounded-l-[18px] px-3 py-3 align-top">
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
