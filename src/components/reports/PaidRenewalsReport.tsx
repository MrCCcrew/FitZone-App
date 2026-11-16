"use client";

import { useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/language";

type RenewalRow = {
  userId: string;
  membershipId: string;
  previousMembershipId: string;
  previousPlanName: string;
  planName: string;
  paymentId: string;
  paidAt: string;
  amount: number;
  currency: string;
  provider: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
};

type RenewalAnomaly = {
  membershipId: string;
  reason: string;
  paymentIds: string[];
};

type RenewalReport = {
  rows: RenewalRow[];
  anomalies: RenewalAnomaly[];
  count: number;
  evidenceLevel: string;
  reconciliationRequired: boolean;
};

function cairoDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (key: string) =>
    parts.find((item) => item.type === key)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function money(value: number, currency: string, lang: string) {
  return `${value.toLocaleString(
    lang === "ar" ? "ar-EG" : "en-GB",
    { maximumFractionDigits: 2 },
  )} ${currency}`;
}

export default function PaidRenewalsReport() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  const [report, setReport] = useState<RenewalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setReport(null);
      setError("");

      try {
        const response = await fetch(
          "/api/admin/accounting/paid-renewals",
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          if (response.status === 422) {
            throw new Error("REPORT_LIMIT");
          }
          if (response.status === 401 ||
              response.status === 403) {
            throw new Error("ACCESS_DENIED");
          }
          throw new Error("REPORT_FAILED");
        }

        const payload: unknown = await response.json();

        if (
          !payload ||
          typeof payload !== "object" ||
          !("rows" in payload) ||
          !Array.isArray(payload.rows) ||
          !("anomalies" in payload) ||
          !Array.isArray(payload.anomalies) ||
          !("evidenceLevel" in payload) ||
          payload.evidenceLevel !== "local_paid_transaction"
        ) {
          throw new Error("INVALID_REPORT");
        }

        if (!controller.signal.aborted) {
          setReport(payload as RenewalReport);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          const code = cause instanceof Error
            ? cause.message
            : "REPORT_FAILED";

          setError(code === "REPORT_LIMIT"
            ? t(
                "حجم البيانات تجاوز حد التقرير. لا يمكن عرض إجماليات ناقصة.",
                "Report size limit reached. Incomplete totals are not shown.",
              )
            : code === "ACCESS_DENIED"
              ? t(
                  "ليس لديك صلاحية عرض التقرير.",
                  "You do not have permission to view this report.",
                )
              : t(
                  "تعذر تحميل التقرير.",
                  "Could not load the report.",
                ));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [reload, lang]);

  const rows = useMemo(() => {
    if (!report) return [];

    const needle = search.trim().toLocaleLowerCase();

    return report.rows.filter((row) => {
      const date = cairoDateKey(row.paidAt);

      if (from && date < from) return false;
      if (to && date > to) return false;

      if (!needle) return true;

      return [
        row.customerName,
        row.customerEmail,
        row.customerPhone,
        row.previousPlanName,
        row.planName,
        row.membershipId,
        row.paymentId,
      ].some((value) =>
        (value ?? "").toLocaleLowerCase().includes(needle),
      );
    });
  }, [report, search, from, to]);

  const totals = useMemo(() => {
    const result = new Map<string, {
      count: number;
      amount: number;
    }>();

    for (const row of rows) {
      const current = result.get(row.currency) ??
        { count: 0, amount: 0 };

      current.count += 1;
      current.amount += row.amount;
      result.set(row.currency, current);
    }

    return [...result.entries()].sort(
      ([a], [b]) => a.localeCompare(b),
    );
  }, [rows]);

  const dateLabel = (value: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";

    return date.toLocaleString(
      lang === "ar" ? "ar-EG" : "en-GB",
      {
        timeZone: "Africa/Cairo",
        dateStyle: "medium",
        timeStyle: "short",
      },
    );
  };

  return (
    <section className="space-y-5 rounded-2xl border border-white/15 bg-gray-950/60 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black">
            {t("تقرير تجديدات الاشتراكات المدفوعة", "Paid subscription renewals")}
          </h2>
          <p className="mt-2 text-sm text-gray-300">
            {t(
              "الأرقام مستندة إلى معاملات مدفوعة مسجلة محليًا، وليست تسوية مالية نهائية أو تحققًا مباشرًا من Paymob.",
              "Figures use locally recorded paid transactions. They are not final financial reconciliation or a fresh Paymob verification.",
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setReload((value) => value + 1)}
          disabled={loading}
          className="rounded-lg border border-white/25 px-4 py-2 text-sm font-bold disabled:opacity-50"
        >
          {t("تحديث التقرير", "Refresh report")}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/40 p-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {loading && (
        <p role="status" className="text-sm text-gray-300">
          {t("جارٍ تحميل البيانات...", "Loading data...")}
        </p>
      )}

      {report && !loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="block text-xs text-gray-300">
                {t("بحث", "Search")}
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("العميلة أو الاشتراك أو رقم الدفع", "Customer, plan or payment ID")}
                className="w-full rounded-lg border border-white/20 bg-gray-900 p-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="block text-xs text-gray-300">
                {t("من تاريخ الدفع", "Paid from")}
              </span>
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="w-full rounded-lg border border-white/20 bg-gray-900 p-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="block text-xs text-gray-300">
                {t("إلى تاريخ الدفع", "Paid to")}
              </span>
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="w-full rounded-lg border border-white/20 bg-gray-900 p-2 text-sm text-white"
              />
            </label>
          </div>

          <div className="rounded-xl border border-white/15 p-3">
            <p className="text-sm font-bold">
              {t("التجديدات المطابقة للفلاتر", "Renewals matching filters")}:{" "}
              {rows.length}
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {totals.length ? totals.map(([currency, total]) => (
                <span key={currency}>
                  {currency}:{" "}
                  <strong>{money(total.amount, currency, lang)}</strong>
                  {" "}({total.count})
                </span>
              )) : (
                <span className="text-gray-300">
                  {t("لا توجد مبالغ مطابقة.", "No matching amounts.")}
                </span>
              )}
            </div>
          </div>

          {report.anomalies.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-500/50 bg-amber-950/30 p-3">
              <h3 className="font-bold text-amber-200">
                {t("معاملات تحتاج تسوية", "Transactions requiring reconciliation")}
                {" "}({report.anomalies.length})
              </h3>
              <p className="mt-1 text-xs text-amber-100">
                {t(
                  "هذه التجديدات مستبعدة من الإجماليات لحين المراجعة، بسبب تكرار معاملات الدفع أو اختلاف المبلغ أو حالة العضوية.",
                  "These renewals are excluded pending review because of duplicate payments, amount mismatches, or membership status.",
                )}
              </p>

              <div className="mt-2 max-h-44 overflow-auto text-xs">
                {report.anomalies.map((item) => (
                  <p key={item.membershipId} className="mt-1 break-all">
                    {item.membershipId}: {item.reason}
                    {" — "}{item.paymentIds.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/15">
            <table className="min-w-full text-sm">
              <thead className="bg-white/10 text-start">
                <tr>
                  <th className="p-3 text-start">{t("العميلة", "Customer")}</th>
                  <th className="p-3 text-start">{t("الاشتراك السابق", "Previous plan")}</th>
                  <th className="p-3 text-start">{t("الاشتراك الجديد", "Renewed plan")}</th>
                  <th className="p-3 text-start">{t("تاريخ الدفع", "Paid at")}</th>
                  <th className="p-3 text-start">{t("المبلغ", "Amount")}</th>
                  <th className="p-3 text-start">{t("المصدر", "Provider")}</th>
                  <th className="p-3 text-start">{t("معاملة الدفع", "Payment ID")}</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.membershipId} className="border-t border-white/10">
                    <td className="p-3">
                      <div className="font-bold">
                        {row.customerName ?? "—"}
                      </div>
                      <div className="text-xs text-gray-300">
                        {row.customerPhone ?? row.customerEmail ?? ""}
                      </div>
                    </td>
                    <td className="p-3">{row.previousPlanName}</td>
                    <td className="p-3">{row.planName}</td>
                    <td className="whitespace-nowrap p-3">
                      {dateLabel(row.paidAt)}
                    </td>
                    <td className="whitespace-nowrap p-3 font-bold">
                      {money(row.amount, row.currency, lang)}
                    </td>
                    <td className="p-3">{row.provider}</td>
                    <td className="max-w-48 break-all p-3 text-xs">
                      {row.paymentId}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length === 0 && (
              <p className="p-4 text-center text-sm text-gray-300">
                {t("لا توجد تجديدات مطابقة.", "No matching renewals.")}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-400">
            {t(
              "تنبيه: الفلاتر تؤثر في الصفوف والإجماليات المعروضة، بينما تنبيهات التسوية تشمل التقرير الكامل. يلزم تدقيق الاستردادات والتحصيل اليدوي قبل الاعتماد النهائي.",
              "Filters apply to displayed rows and totals; reconciliation alerts cover the full report. Refunds and manual collections require review before final approval.",
            )}
          </p>
        </>
      )}
    </section>
  );
}