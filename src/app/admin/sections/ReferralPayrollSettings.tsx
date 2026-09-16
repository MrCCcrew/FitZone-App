"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Position = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  isActive: boolean;
};

type PolicyRate = {
  id: string;
  positionId: string;
  newCustomerPct: number;
  longTermPct: number;
  position: Position;
};

type Policy = {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;

  minimumShortTermGapDays: number;
  shortTermMaxMonths: number;

  underMinimumGapPct: number;
  shortTermPct: number;

  isActive: boolean;
  notes: string | null;

  rates: PolicyRate[];
};

type ApiPayload = {
  positions: Position[];
  policies: Policy[];
};

type RateDraft = {
  positionId: string;
  newCustomerPct: string;
  longTermPct: string;
};

function dateValue(value: string | null) {
  if (!value) return "مفتوح";
  return value.slice(0, 10);
}

function percent(value: number) {
  return `${value.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export default function ReferralPayrollSettings({
  canManage,
}: {
  canManage: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [positions, setPositions] = useState<Position[]>([]);

  const [policies, setPolicies] = useState<Policy[]>([]);

  const [effectiveFrom, setEffectiveFrom] = useState("");

  const [minimumShortTermGapDays, setMinimumShortTermGapDays] = useState("");

  const [shortTermMaxMonths, setShortTermMaxMonths] = useState("");

  const [underMinimumGapPct, setUnderMinimumGapPct] = useState("");

  const [shortTermPct, setShortTermPct] = useState("");

  const [notes, setNotes] = useState("");

  const [rates, setRates] = useState<RateDraft[]>([]);

  const todayUtc = new Date().toISOString().slice(0, 10);

  const currentPolicy = useMemo(
    () =>
      policies.find((policy) => {
        if (!policy.isActive) return false;

        const from = policy.effectiveFrom.slice(0, 10);
        const to = policy.effectiveTo?.slice(0, 10) ?? null;

        return from <= todayUtc && (to == null || to >= todayUtc);
      }) ?? null,
    [policies, todayUtc],
  );

  const upcomingPolicy = useMemo(() => {
    const future = policies
      .filter(
        (policy) =>
          policy.isActive &&
          policy.effectiveFrom.slice(0, 10) > todayUtc,
      )
      .sort((a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom),
      );

    return future[0] ?? null;
  }, [policies, todayUtc]);

  /*
   * The latest saved version is only a template for a new version.
   * It must never be presented as the currently effective policy.
   */
  const draftTemplatePolicy = policies[0] ?? null;
  void draftTemplatePolicy;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/referral-commission-policy", {
        cache: "no-store",
      });

      const payload = (await response.json()) as
        ApiPayload | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "تعذر تحميل إعدادات الإحالة.",
        );
      }

      const data = payload as ApiPayload;

      setPositions(data.positions);
      setPolicies(data.policies);

      const template = data.policies[0];

      if (template) {
        setMinimumShortTermGapDays(String(template.minimumShortTermGapDays));

        setShortTermMaxMonths(String(template.shortTermMaxMonths));

        setUnderMinimumGapPct(String(template.underMinimumGapPct));

        setShortTermPct(String(template.shortTermPct));

        setRates(
          data.positions.map((position) => {
            const existing = template.rates.find(
              (rate) => rate.positionId === position.id,
            );

            return {
              positionId: position.id,
              newCustomerPct: existing ? String(existing.newCustomerPct) : "",
              longTermPct: existing ? String(existing.longTermPct) : "",
            };
          }),
        );
      } else {
        setRates(
          data.positions.map((position) => ({
            positionId: position.id,
            newCustomerPct: "",
            longTermPct: "",
          })),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذر تحميل إعدادات الإحالة.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activePositions = useMemo(
    () => positions.filter((p) => p.isActive),
    [positions],
  );

  function updateRate(
    positionId: string,
    field: "newCustomerPct" | "longTermPct",
    value: string,
  ) {
    setRates((current) =>
      current.map((rate) =>
        rate.positionId === positionId
          ? {
              ...rate,
              [field]: value,
            }
          : rate,
      ),
    );
  }

  async function save() {
    if (!canManage || saving) return;

    setError("");
    setSuccess("");

    if (!effectiveFrom) {
      setError("حدد تاريخ بداية السريان.");
      return;
    }

    if (
      !minimumShortTermGapDays.trim() ||
      !shortTermMaxMonths.trim() ||
      !underMinimumGapPct.trim() ||
      !shortTermPct.trim()
    ) {
      setError("أكمل جميع إعدادات تصنيف وعمولة الإحالة.");
      return;
    }

    const incompleteRatePosition = activePositions.find((position) => {
      const rate = rates.find((item) => item.positionId === position.id);
      const newCustomerPct = rate?.newCustomerPct.trim() ?? "";
      const longTermPct = rate?.longTermPct.trim() ?? "";

      return Boolean(newCustomerPct) !== Boolean(longTermPct);
    });

    if (incompleteRatePosition) {
      setError(
        `أكمل نسب العميل الجديد والمنقطع طويلًا للمسمى: ${incompleteRatePosition.name}`,
      );
      return;
    }

    const payload = {
      effectiveFrom,
      minimumShortTermGapDays: Number(minimumShortTermGapDays),

      shortTermMaxMonths: Number(shortTermMaxMonths),

      underMinimumGapPct: Number(underMinimumGapPct),

      shortTermPct: Number(shortTermPct),

      notes,

      rates: activePositions.flatMap((position) => {
        const rate = rates.find((item) => item.positionId === position.id);

        const newCustomerPct = rate?.newCustomerPct.trim() ?? "";
        const longTermPct = rate?.longTermPct.trim() ?? "";

        if (!newCustomerPct && !longTermPct) {
          return [];
        }

        return [{
          positionId: position.id,
          newCustomerPct: Number(newCustomerPct),
          longTermPct: Number(longTermPct),
        }];
      }),
    };

    setSaving(true);

    try {
      const response = await fetch("/api/admin/referral-commission-policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "تعذر حفظ إعدادات الإحالة.");
      }

      setSuccess(
        "تم إنشاء نسخة جديدة من سياسة الإحالة مع الحفاظ على التاريخ السابق.",
      );

      setEffectiveFrom("");
      setNotes("");

      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذر حفظ إعدادات الإحالة.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-pink-500/20 bg-pink-950/10 p-4">
      <div className="mb-4">
        <h3 className="font-black text-white">إعدادات عمولات إحالة الموظفين</h3>

        <p className="mt-1 text-xs leading-6 text-gray-400">
          تحدد تصنيف العميل ونسبة العمولة حسب المسمى الوظيفي. كل تعديل ينشئ نسخة
          مؤرخة جديدة ولا يغير العمولة المجمدة للاشتراكات السابقة.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {success}
        </div>
      )}

      {loading ? (
        <div className="py-5 text-center text-sm text-gray-400">
          جاري تحميل إعدادات الإحالة...
        </div>
      ) : (
        <>
          {currentPolicy && (
            <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-6 text-gray-300">
              <div className="font-bold text-white">السياسة الحالية</div>

              <div>
                من {dateValue(currentPolicy.effectiveFrom)} إلى{" "}
                {dateValue(currentPolicy.effectiveTo)}
              </div>

              <div>
                أقل من {currentPolicy.minimumShortTermGapDays} يوم:{" "}
                {percent(currentPolicy.underMinimumGapPct)}
                {" — "}
                من {currentPolicy.minimumShortTermGapDays} يوم وحتى{" "}
                {currentPolicy.shortTermMaxMonths} أشهر:{" "}
                {percent(currentPolicy.shortTermPct)}
              </div>
            </div>
          )}

          {upcomingPolicy && (
            <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 text-xs leading-6 text-sky-200">
              <div className="font-bold text-white">السياسة القادمة</div>

              <div>
                تبدأ في {dateValue(upcomingPolicy.effectiveFrom)}
              </div>

              <div>
                أقل من {upcomingPolicy.minimumShortTermGapDays} يوم:{" "}
                {percent(upcomingPolicy.underMinimumGapPct)}
                {" — "}
                من {upcomingPolicy.minimumShortTermGapDays} يوم وحتى{" "}
                {upcomingPolicy.shortTermMaxMonths} أشهر:{" "}
                {percent(upcomingPolicy.shortTermPct)}
              </div>
            </div>
          )}

          {canManage && (
            <div className="space-y-4">
              {!currentPolicy && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs leading-6 text-amber-300">
                  لا توجد سياسة إحالة فعالة حاليًا. القيم في النموذج مخصصة لإنشاء
                  نسخة مؤرخة جديدة ولن تصبح فعالة قبل تاريخ بدايتها.
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    يبدأ من
                  </span>

                  <input
                    type="date"
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    الحد الأدنى Short-Term
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={minimumShortTermGapDays}
                    onChange={(e) => setMinimumShortTermGapDays(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    أقصى مدة Short-Term بالشهور
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={shortTermMaxMonths}
                    onChange={(e) => setShortTermMaxMonths(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    النسبة قبل الحد الأدنى
                  </span>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={underMinimumGapPct}
                    onChange={(e) => setUnderMinimumGapPct(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    نسبة Short-Term
                  </span>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={shortTermPct}
                    onChange={(e) => setShortTermPct(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>

              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[650px] text-sm">
                  <thead className="bg-white/[0.03] text-right text-xs text-gray-400">
                    <tr>
                      <th className="px-3 py-2">المسمى الوظيفي</th>
                      <th className="px-3 py-2">عمولة عميل جديد</th>
                      <th className="px-3 py-2">عمولة Long-Term</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/5">
                    {activePositions.map((position) => {
                      const rate = rates.find(
                        (item) => item.positionId === position.id,
                      );

                      return (
                        <tr key={position.id}>
                          <td className="px-3 py-3">
                            <div className="font-bold text-white">
                              {position.name}
                            </div>

                            <div className="font-mono text-xs text-pink-300">
                              {position.code}
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={rate?.newCustomerPct ?? "0"}
                                onChange={(e) =>
                                  updateRate(
                                    position.id,
                                    "newCustomerPct",
                                    e.target.value,
                                  )
                                }
                                className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                              />
                              <span className="text-gray-500">%</span>
                            </div>
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                value={rate?.longTermPct ?? "0"}
                                onChange={(e) =>
                                  updateRate(
                                    position.id,
                                    "longTermPct",
                                    e.target.value,
                                  )
                                }
                                className="w-28 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white"
                              />
                              <span className="text-gray-500">%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-bold text-gray-400">
                  ملاحظات النسخة الجديدة
                </span>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                />
              </label>

              <button
                type="button"
                disabled={saving || activePositions.length === 0}
                onClick={() => void save()}
                className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-500 disabled:opacity-50"
              >
                {saving ? "جاري الحفظ..." : "حفظ نسخة جديدة من السياسة"}
              </button>
            </div>
          )}

          <div className="mt-5">
            <h4 className="mb-2 text-sm font-black text-white">سجل السياسات</h4>

            {policies.length === 0 ? (
              <div className="rounded-xl border border-white/10 px-3 py-5 text-center text-sm text-gray-500">
                لا توجد سياسة إحالة محفوظة حتى الآن.
              </div>
            ) : (
              <div className="space-y-2">
                {policies.map((policy) => (
                  <details
                    key={policy.id}
                    className="rounded-xl border border-white/10 bg-black/10 px-3 py-2"
                  >
                    <summary className="cursor-pointer text-sm font-bold text-white">
                      {dateValue(policy.effectiveFrom)}
                      {" → "}
                      {dateValue(policy.effectiveTo)}
                    </summary>

                    <div className="mt-3 space-y-2 text-xs text-gray-300">
                      <div>
                        قبل {policy.minimumShortTermGapDays} يوم ={" "}
                        {percent(policy.underMinimumGapPct)}
                      </div>

                      <div>
                        من {policy.minimumShortTermGapDays} يوم وحتى{" "}
                        {policy.shortTermMaxMonths} أشهر ={" "}
                        {percent(policy.shortTermPct)}
                      </div>

                      {policy.rates.map((rate) => (
                        <div
                          key={rate.id}
                          className="rounded-lg bg-white/[0.03] px-2 py-1"
                        >
                          {rate.position.name}: جديد{" "}
                          {percent(rate.newCustomerPct)}
                          {" — "}
                          Long-Term {percent(rate.longTermPct)}
                        </div>
                      ))}

                      {policy.notes && (
                        <div className="text-gray-500">{policy.notes}</div>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
