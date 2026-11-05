"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

type PayrollPolicy = {
  id: string;
  positionId: string;

  effectiveFrom: string;
  effectiveTo: string | null;

  fixedSalaryMinor: number | null;
  defaultFixedClassMonthlyMinor:
    | number
    | null;

  traineeClassCommissionBps:
    | number
    | null;

  privateSessionCommissionBps:
    | number
    | null;

  coachMembershipCommissionBps:
    | number
    | null;

  headCoachMonthlyBaseMinutes:
    | number
    | null;

  headCoachWeeklyMinMinutes:
    | number
    | null;

  headCoachWeeklyCapMinutes:
    | number
    | null;

  currency: string;
  isActive: boolean;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
};

type PayrollPosition = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  isActive: boolean;
  policies: PayrollPolicy[];
};

type Props = {
  canManage: boolean;
};

type FormState = {
  positionId: string;

  effectiveFrom: string;
  effectiveTo: string;

  fixedSalary: string;
  defaultFixedClassMonthly: string;

  traineePercent: string;
  privatePercent: string;
  membershipPercent: string;

  headMonthlyBaseHours: string;
  headWeeklyMinHours: string;
  headWeeklyCapHours: string;

  currency: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  positionId: "",
  effectiveFrom: "",
  effectiveTo: "",

  fixedSalary: "",
  defaultFixedClassMonthly: "",

  traineePercent: "",
  privatePercent: "",
  membershipPercent: "",

  headMonthlyBaseHours: "",
  headWeeklyMinHours: "",
  headWeeklyCapHours: "",

  currency: "EGP",
  notes: "",
};

function moneyText(
  minor: number | null,
  currency: string,
) {
  if (minor == null) return "—";

  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function percentText(
  bps: number | null,
) {
  if (bps == null) return "—";

  return `${(bps / 100).toFixed(2)}%`;
}

function hoursText(
  minutes: number | null,
) {
  if (minutes == null) return "—";

  return `${(minutes / 60).toFixed(2)} ساعة`;
}

function optionalMoneyMinor(
  value: string,
) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      "القيمة المالية غير صحيحة.",
    );
  }

  const minor = Math.round(parsed * 100);

  if (!Number.isSafeInteger(minor)) {
    throw new Error(
      "القيمة المالية أكبر من المسموح.",
    );
  }

  return minor;
}

function optionalPercentBps(
  value: string,
) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > 100
  ) {
    throw new Error(
      "النسبة يجب أن تكون بين 0 و100.",
    );
  }

  return Math.round(parsed * 100);
}

function optionalHoursMinutes(
  value: string,
) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const parsed = Number(trimmed);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      "عدد الساعات يجب أن يكون أكبر من صفر.",
    );
  }

  const minutes = Math.round(parsed * 60);

  if (!Number.isSafeInteger(minutes)) {
    throw new Error(
      "عدد الساعات غير صحيح.",
    );
  }

  return minutes;
}

function errorText(code: string) {
  switch (code) {
    case "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP":
      return "يوجد إعداد رواتب آخر متداخل مع نفس الفترة لهذا المسمى الوظيفي.";

    case "POSITION_PAYROLL_POLICY_INCOMPLETE_HEAD_COACH_RULE":
      return "يجب إدخال أساس الساعات الشهري والحد الأسبوعي الأدنى والأقصى معًا.";

    case "POSITION_PAYROLL_POLICY_HEAD_MIN_EXCEEDS_CAP":
      return "الحد الأدنى الأسبوعي لا يمكن أن يكون أكبر من الحد الأقصى.";

    case "POSITION_PAYROLL_POLICY_HEAD_RULE_POSITION_REQUIRED":
      return "قواعد ساعات الهيد كوتش مسموحة فقط لمسمى الهيد كوتش / المالك.";

    case "POSITION_PAYROLL_POLICY_POSITION_NOT_FOUND":
      return "المسمى الوظيفي غير موجود.";

    default:
      return code.startsWith(
        "POSITION_PAYROLL_POLICY_",
      )
        ? "تعذر حفظ إعدادات الرواتب. راجع القيم والتواريخ."
        : code;
  }
}

export default function PayrollSettingsTab({
  canManage,
}: Props) {
  const [positions, setPositions] =
    useState<PayrollPosition[]>([]);

  const [form, setForm] =
    useState<FormState>(EMPTY_FORM);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const selectedPosition =
    useMemo(
      () =>
        positions.find(
          (position) =>
            position.id ===
            form.positionId,
        ) ?? null,
      [
        positions,
        form.positionId,
      ],
    );

  const isHeadCoach =
    selectedPosition?.code ===
    "HEAD_COACH_OWNER";

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/admin/payroll-settings",
        {
          cache: "no-store",
        },
      );

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error ||
            "تعذر تحميل إعدادات الرواتب.",
        );
      }

      const rows =
        (payload.positions ??
          []) as PayrollPosition[];

      setPositions(rows);

      setForm((current) => ({
        ...current,
        positionId:
          current.positionId ||
          rows[0]?.id ||
          "",
      }));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? errorText(cause.message)
          : "تعذر تحميل إعدادات الرواتب.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setField = (
    field: keyof FormState,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetFormForPosition = (
    positionId: string,
  ) => {
    setForm({
      ...EMPTY_FORM,
      positionId,
    });

    setError("");
    setMessage("");
  };

  const submit = async () => {
    if (!canManage) return;

    setError("");
    setMessage("");

    try {
      if (!form.positionId) {
        throw new Error(
          "اختر المسمى الوظيفي.",
        );
      }

      if (!form.effectiveFrom) {
        throw new Error(
          "تاريخ بداية السريان مطلوب.",
        );
      }

      const payload = {
        positionId: form.positionId,

        effectiveFrom:
          form.effectiveFrom,

        effectiveTo:
          form.effectiveTo || null,

        fixedSalaryMinor:
          optionalMoneyMinor(
            form.fixedSalary,
          ),

        defaultFixedClassMonthlyMinor:
          optionalMoneyMinor(
            form.defaultFixedClassMonthly,
          ),

        traineeClassCommissionBps:
          optionalPercentBps(
            form.traineePercent,
          ),

        privateSessionCommissionBps:
          optionalPercentBps(
            form.privatePercent,
          ),

        coachMembershipCommissionBps:
          optionalPercentBps(
            form.membershipPercent,
          ),

        headCoachMonthlyBaseMinutes:
          isHeadCoach
            ? optionalHoursMinutes(
                form.headMonthlyBaseHours,
              )
            : null,

        headCoachWeeklyMinMinutes:
          isHeadCoach
            ? optionalHoursMinutes(
                form.headWeeklyMinHours,
              )
            : null,

        headCoachWeeklyCapMinutes:
          isHeadCoach
            ? optionalHoursMinutes(
                form.headWeeklyCapHours,
              )
            : null,

        currency:
          form.currency
            .trim()
            .toUpperCase() ||
          "EGP",

        notes:
          form.notes.trim() ||
          null,

        isActive: true,
      };

      setSaving(true);

      const response = await fetch(
        "/api/admin/payroll-settings",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "تعذر حفظ إعدادات الرواتب.",
        );
      }

      setMessage(
        "تم إنشاء سياسة رواتب جديدة بالتاريخ المحدد. لم يتم تعديل أي سياسة تاريخية.",
      );

      resetFormForPosition(
        form.positionId,
      );

      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? errorText(cause.message)
          : "تعذر حفظ إعدادات الرواتب.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-400">
        جاري تحميل إعدادات الرواتب...
      </div>
    );
  }

  return (
    <div
      className="space-y-5"
      dir="rtl"
    >
      <div className="rounded-2xl border border-pink-500/20 bg-pink-950/10 p-5">
        <h3 className="font-black text-white">
          إعدادات الرواتب حسب المسمى الوظيفي
        </h3>

        <p className="mt-2 text-xs leading-6 text-gray-400">
          جميع القيم مؤرخة بتاريخ سريان.
          عند تغيير أي قيمة يتم إنشاء
          سياسة جديدة بدل تعديل التاريخ
          السابق.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm font-bold text-red-300">
          {error}
        </div>
      )}

      {message && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 text-sm font-bold text-emerald-300">
          {message}
        </div>
      )}

      {canManage && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="mb-5">
            <h4 className="font-black text-white">
              إنشاء سياسة رواتب جديدة
            </h4>

            <p className="mt-1 text-xs text-gray-500">
              لا تستخدم تاريخًا يتداخل
              مع سياسة فعالة موجودة.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                المسمى الوظيفي
              </span>

              <select
                value={form.positionId}
                onChange={(event) =>
                  resetFormForPosition(
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              >
                {positions.map(
                  (position) => (
                    <option
                      key={position.id}
                      value={position.id}
                    >
                      {position.name} —{" "}
                      {position.code}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                بداية السريان
              </span>

              <input
                type="date"
                value={form.effectiveFrom}
                onChange={(event) =>
                  setField(
                    "effectiveFrom",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                نهاية السريان
              </span>

              <input
                type="date"
                value={form.effectiveTo}
                onChange={(event) =>
                  setField(
                    "effectiveTo",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                العملة
              </span>

              <input
                value={form.currency}
                maxLength={3}
                onChange={(event) =>
                  setField(
                    "currency",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                الراتب الثابت الشهري
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.fixedSalary}
                onChange={(event) =>
                  setField(
                    "fixedSalary",
                    event.target.value,
                  )
                }
                placeholder="مثال: 2500"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                قيمة الكلاس الثابت / شهر
              </span>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  form.defaultFixedClassMonthly
                }
                onChange={(event) =>
                  setField(
                    "defaultFixedClassMonthly",
                    event.target.value,
                  )
                }
                placeholder="القيمة"
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                نسبة كلاسات المتدربين %
              </span>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.traineePercent}
                onChange={(event) =>
                  setField(
                    "traineePercent",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                نسبة الجلسات الخاصة %
              </span>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.privatePercent}
                onChange={(event) =>
                  setField(
                    "privatePercent",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-bold text-gray-400">
                نسبة اشتراكات المدرب %
              </span>

              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.membershipPercent}
                onChange={(event) =>
                  setField(
                    "membershipPercent",
                    event.target.value,
                  )
                }
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          {isHeadCoach && (
            <div className="mt-5 rounded-2xl border border-yellow-500/20 bg-yellow-950/10 p-4">
              <h5 className="mb-4 font-black text-yellow-200">
                قاعدة ساعات الهيد كوتش / المالك
              </h5>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    أساس الخصم الشهري بالساعات
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.headMonthlyBaseHours
                    }
                    onChange={(event) =>
                      setField(
                        "headMonthlyBaseHours",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    الحد الأدنى الأسبوعي
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.headWeeklyMinHours
                    }
                    onChange={(event) =>
                      setField(
                        "headWeeklyMinHours",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-bold text-gray-400">
                    الحد الأقصى الأسبوعي
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      form.headWeeklyCapHours
                    }
                    onChange={(event) =>
                      setField(
                        "headWeeklyCapHours",
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>
            </div>
          )}

          <label className="mt-4 block space-y-1">
            <span className="text-xs font-bold text-gray-400">
              ملاحظات
            </span>

            <textarea
              value={form.notes}
              onChange={(event) =>
                setField(
                  "notes",
                  event.target.value,
                )
              }
              rows={3}
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={
                saving ||
                !form.positionId ||
                !form.effectiveFrom
              }
              onClick={() => void submit()}
              className="rounded-xl bg-pink-600 px-5 py-2.5 text-sm font-black text-white hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving
                ? "جاري الحفظ..."
                : "حفظ سياسة جديدة"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {positions.map((position) => (
          <div
            key={position.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-black text-white">
                  {position.name}
                </h4>

                <div className="mt-1 text-xs text-gray-500">
                  {position.code}
                  {position.nameEn
                    ? ` · ${position.nameEn}`
                    : ""}
                </div>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  position.isActive
                    ? "bg-emerald-950/40 text-emerald-300"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                {position.isActive
                  ? "مسمى نشط"
                  : "مسمى غير نشط"}
              </span>
            </div>

            {position.policies.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-gray-500">
                لا توجد سياسة رواتب مسجلة لهذا المسمى.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1500px] text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-right text-gray-500">
                      <th className="px-3 py-3">
                        السريان
                      </th>
                      <th className="px-3 py-3">
                        الراتب الثابت
                      </th>
                      <th className="px-3 py-3">
                        الكلاس الثابت
                      </th>
                      <th className="px-3 py-3">
                        المتدرب
                      </th>
                      <th className="px-3 py-3">
                        الجلسة الخاصة
                      </th>
                      <th className="px-3 py-3">
                        اشتراك المدرب
                      </th>
                      <th className="px-3 py-3">
                        أساس الهيد
                      </th>
                      <th className="px-3 py-3">
                        حد أدنى
                      </th>
                      <th className="px-3 py-3">
                        حد أقصى
                      </th>
                      <th className="px-3 py-3">
                        الحالة
                      </th>
                      <th className="px-3 py-3">
                        ملاحظات
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {position.policies.map(
                      (policy) => (
                        <tr
                          key={policy.id}
                          className="border-b border-white/5 text-gray-300"
                        >
                          <td className="px-3 py-3">
                            {policy.effectiveFrom}
                            {" → "}
                            {policy.effectiveTo ??
                              "مفتوح"}
                          </td>

                          <td className="px-3 py-3">
                            {moneyText(
                              policy.fixedSalaryMinor,
                              policy.currency,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {moneyText(
                              policy.defaultFixedClassMonthlyMinor,
                              policy.currency,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {percentText(
                              policy.traineeClassCommissionBps,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {percentText(
                              policy.privateSessionCommissionBps,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {percentText(
                              policy.coachMembershipCommissionBps,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {hoursText(
                              policy.headCoachMonthlyBaseMinutes,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {hoursText(
                              policy.headCoachWeeklyMinMinutes,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {hoursText(
                              policy.headCoachWeeklyCapMinutes,
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {policy.isActive
                              ? "فعال"
                              : "غير فعال"}
                          </td>

                          <td className="max-w-[260px] px-3 py-3 text-gray-500">
                            {policy.notes || "—"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
