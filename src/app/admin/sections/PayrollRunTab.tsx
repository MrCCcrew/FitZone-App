"use client";

import { hrPayrollBlockReasonText } from "@/lib/employees/hr-payroll-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

type PayrollRunItem = {
  id: string;
  sourceType: string;
  sourceId: string;
  direction: "earning" | "deduction";
  amountMinor: number;
  currency: string;
  sourceStatusSnapshot: string | null;
  labelSnapshot: string | null;
  metadataSnapshot: string | null;
};

type PayrollRunEmployee = {
  id: string;
  employeeId: string;

  employeeCodeSnapshot: string;
  employeeNameSnapshot: string;

  status: "blocked" | "calculated";
  blockReason: string | null;

  currency: string;

  compensationTermIdSnapshot: string | null;

  fixedSalaryMinor: number;
  fixedClassEarningMinor: number;
  traineeClassEarningMinor: number;
  coachMembershipEarningMinor: number;
  privateSessionEarningMinor: number;
  referralCommissionEarningMinor: number;
  adjustmentEarningMinor: number;

  grossEarningsMinor: number;

  attendanceDeductionMinor: number;
  headCoachHoursDeductionMinor: number;
  loanDeductionMinor: number;
  adjustmentDeductionMinor: number;

  totalDeductionsMinor: number;
  netPayMinor: number;

  employee?: {
    id: string;
    employeeCode: string;
    name: string;
    avatar: string | null;
    employmentStatus: string;
  };

  items: PayrollRunItem[];
};

type PayrollRun = {
  id: string;
  monthKey: string;
  status: "draft" | "blocked" | "calculated" | "finalized";

  currency: string;

  employeeCount: number;
  blockedEmployeeCount: number;

  totalGrossEarningsMinor: number;
  totalDeductionsMinor: number;
  totalNetPayMinor: number;

  calculatedAt: string | null;
  finalizedAt: string | null;

  employees: PayrollRunEmployee[];
};

type Props = {
  canView: boolean;
  canCalculate: boolean;
  canFinalize: boolean;
  initialMonth: string;
  setGlobalError: (message: string | null) => void;
  setGlobalMessage: (message: string | null) => void;
};

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function money(amountMinor: number, currency: string) {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function runStatusLabel(status: PayrollRun["status"]) {
  switch (status) {
    case "draft":
      return "مسودة";
    case "blocked":
      return "يحتاج مراجعة";
    case "calculated":
      return "تم الحساب";
    case "finalized":
      return "معتمد نهائيًا";
  }
}

function sourceLabel(sourceType: string) {
  switch (sourceType) {
    case "fixed_salary":
      return "الراتب الثابت";
    case "fixed_class":
      return "الكلاسات الثابتة";
    case "trainee_class":
      return "عمولة حضور المتدربين";
    case "coach_membership":
      return "اشتراكات المدرب";
    case "private_session":
      return "جلسات البرايفيت";
    case "staff_referral":
      return "عمولة الإحالة";
    case "attendance_deduction":
      return "خصم الحضور";
    case "head_coach_hours_deduction":
      return "خصم ساعات الهيد كوتش";
    case "loan_installment":
      return "قسط سلفة";
    case "payroll_adjustment":
      return "تسوية يدوية";
    default:
      return "بند راتب";
  }
}

function sourceStatusLabel(status: string | null) {
  if (!status) return "—";

  switch (status) {
    case "draft":
      return "مسودة";
    case "pending":
      return "قيد المراجعة";
    case "calculated":
      return "تم الحساب";
    case "approved":
      return "معتمد";
    case "finalized":
      return "معتمد نهائيًا";
    case "applied":
      return "تم التطبيق";
    case "earned":
      return "مستحقة";
    case "settled":
      return "تمت التسوية";
    case "ineligible":
      return "غير مستحقة";
    case "cancelled":
    case "canceled":
      return "ملغي";
    case "blocked":
      return "يحتاج مراجعة";
    case "active":
      return "نشط";
    case "inactive":
      return "غير نشط";
    default:
      return "حالة مسجلة";
  }
}

function parseItemMetadata(
  value: string | null,
): Record<string, unknown> | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function referralClassificationLabel(value: unknown) {
  switch (value) {
    case "new_customer":
      return "عميل جديد";
    case "short_term_under_minimum":
      return "أقل من الحد الأدنى";
    case "short_term":
      return "عودة قصيرة المدة";
    case "long_term":
      return "عودة طويلة المدة";
    default:
      return "—";
  }
}

function referralItemDetails(item: PayrollRunItem) {
  if (item.sourceType !== "staff_referral") {
    return item.labelSnapshot || "-";
  }

  const metadata = parseItemMetadata(item.metadataSnapshot);

  if (!metadata) {
    return "عمولة إحالة";
  }

  const parts: string[] = [];

  const earnedAt =
    typeof metadata.earnedAt === "string"
      ? metadata.earnedAt
      : null;

  if (earnedAt) {
    const date = new Date(earnedAt);

    if (!Number.isNaN(date.getTime())) {
      parts.push(
        `تاريخ الاستحقاق: ${new Intl.DateTimeFormat("ar-EG", {
          dateStyle: "medium",
        }).format(date)}`,
      );
    }
  }

  if (metadata.customerClassification) {
    parts.push(
      `التصنيف: ${referralClassificationLabel(
        metadata.customerClassification,
      )}`,
    );
  }

  if (
    typeof metadata.commissionRateBps === "number" &&
    Number.isFinite(metadata.commissionRateBps)
  ) {
    parts.push(
      `النسبة: ${(metadata.commissionRateBps / 100).toFixed(2)}%`,
    );
  }

  if (
    typeof metadata.commissionBaseMinor === "number" &&
    Number.isFinite(metadata.commissionBaseMinor)
  ) {
    parts.push(
      `أساس العمولة: ${money(
        metadata.commissionBaseMinor,
        item.currency,
      )}`,
    );
  }

  return parts.length
    ? parts.join(" | ")
    : item.labelSnapshot || "عمولة إحالة";
}

function blockReasonLabel(reason: string | null) {
  return hrPayrollBlockReasonText(reason);
}

function errorLabel(code: string) {
  switch (code) {
    case "PAYROLL_RUN_SOURCE_SNAPSHOT_STALE":
      return "تغيرت بنود مالية بعد آخر حساب. أعد حساب رواتب الشهر قبل الاعتماد.";
    case "PAYROLL_RUN_NOT_FINALIZABLE":
      return "كشف الرواتب غير جاهز للاعتماد النهائي.";
    case "PAYROLL_RUN_HAS_BLOCKED_EMPLOYEE":
      return "يوجد موظف يحتاج مراجعة داخل كشف الرواتب. أصلح السبب ثم أعد الحساب.";
    case "PAYROLL_RUN_FINALIZED_IMMUTABLE":
      return "كشف الرواتب معتمد نهائيًا ولا يمكن إعادة حسابه.";
    case "PAYROLL_RUN_NOT_FOUND":
      return "لا يوجد كشف رواتب لهذا الشهر.";
    default:
      return "تعذر تنفيذ عملية الرواتب. راجع البيانات ثم حاول مرة أخرى.";
  }
}

function Metric({
  title,
  value,
  tone = "text-white",
}: {
  title: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-bold text-gray-500">{title}</div>

      <div className={`mt-2 text-lg font-black ${tone}`}>{value}</div>
    </div>
  );
}

export default function PayrollRunTab({
  canView,
  canCalculate,
  canFinalize,
  initialMonth,
  setGlobalError,
  setGlobalMessage,
}: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"calculate" | "finalize" | null>(null);

  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(
    null,
  );

  const run = runs[0] ?? null;

  const load = useCallback(async () => {
    if (!canView || !month) return;

    setLoading(true);
    setGlobalError(null);

    try {
      const params = new URLSearchParams({
        month,
      });

      const response = await fetch(
        `/api/admin/payroll-runs?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(errorLabel(payload.error || "تعذر تحميل كشف الرواتب."));
      }

      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
    } catch (loadError) {
      setGlobalError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل كشف الرواتب.",
      );
    } finally {
      setLoading(false);
    }
  }, [canView, month, setGlobalError]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (nextAction: "calculate" | "finalize") => {
    if (nextAction === "calculate" && !canCalculate) {
      setGlobalError("ليس لديك صلاحية حساب رواتب الشهر.");
      return;
    }

    if (nextAction === "finalize" && !canFinalize) {
      setGlobalError("ليس لديك صلاحية اعتماد كشف الرواتب.");
      return;
    }

    if (nextAction === "finalize" && run?.status !== "calculated") {
      setGlobalError("يمكن اعتماد كشف الرواتب بعد اكتمال الحساب بنجاح فقط.");
      return;
    }

    if (
      nextAction === "finalize" &&
      typeof window !== "undefined" &&
      !window.confirm(
        `اعتماد مسير ${month} نهائيًا؟ بعد الاعتماد يصبح المسير للقراءة فقط.`,
      )
    ) {
      return;
    }

    setAction(nextAction);
    setGlobalError(null);
    setGlobalMessage(null);

    try {
      const response = await fetch("/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: nextAction,
          monthKey: month,
        }),
      });

      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          errorLabel(payload.error || "تعذر تنفيذ عملية كشف الرواتب."),
        );
      }

      setGlobalMessage(
        nextAction === "calculate"
          ? payload.run?.status === "blocked"
            ? "تم الاحتساب، لكن توجد حالات متوقفة تحتاج مراجعة."
            : "تم حساب رواتب الشهر بنجاح."
          : "تم اعتماد كشف الرواتب نهائيًا.",
      );

      await load();
    } catch (actionError) {
      setGlobalError(
        actionError instanceof Error
          ? actionError.message
          : "تعذر تنفيذ عملية كشف الرواتب.",
      );
    } finally {
      setAction(null);
    }
  };

  const sortedEmployees = useMemo(
    () =>
      run
        ? [...run.employees].sort((a, b) =>
            a.employeeCodeSnapshot.localeCompare(b.employeeCodeSnapshot),
          )
        : [],
    [run],
  );

  if (!canView) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-sm font-bold text-red-300">
        ليس لديك صلاحية مشاهدة كشوف الرواتب.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="mb-4">
          <h3 className="font-black text-white">كشف الرواتب الشهري</h3>

          <p className="mt-1 text-xs leading-6 text-gray-500">
            هذه الشاشة تجمع المصادر المالية الرسمية فقط. لا تعيد حساب العمولات
            أو الحضور أو المستحقات داخل الواجهة.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-400">الشهر</span>

            <input
              type="month"
              value={month}
              disabled={action !== null}
              onChange={(event) => {
                setMonth(event.target.value);
                setExpandedEmployeeId(null);
              }}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || action !== null}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {loading ? "جاري التحميل..." : "تحديث"}
          </button>

          {canCalculate && run?.status !== "finalized" && (
            <button
              type="button"
              onClick={() => void runAction("calculate")}
              disabled={action !== null || !month}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {action === "calculate"
                ? "جاري الاحتساب..."
                : run
                  ? "إعادة حساب الرواتب"
                  : "حساب رواتب الشهر"}
            </button>
          )}

          {canFinalize && run?.status === "calculated" && (
            <button
              type="button"
              onClick={() => void runAction("finalize")}
              disabled={action !== null}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {action === "finalize" ? "جاري الاعتماد..." : "اعتماد نهائي"}
            </button>
          )}

          {run?.status === "finalized" && (
            <span className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-2 text-xs font-bold text-emerald-300">
              معتمد نهائيًا - قراءة فقط
            </span>
          )}
        </div>
      </div>

      {loading && !run ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center text-sm text-gray-500">
          جاري تحميل كشف الرواتب...
        </div>
      ) : !run ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center text-sm text-gray-500">
          لا يوجد كشف رواتب للشهر المختار.
          {canCalculate ? " يمكنك بدء الاحتساب من الزر بالأعلى." : ""}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric
              title="الحالة"
              value={runStatusLabel(run.status)}
              tone={
                run.status === "finalized"
                  ? "text-emerald-300"
                  : run.status === "blocked"
                    ? "text-amber-300"
                    : "text-blue-300"
              }
            />

            <Metric title="الموظفون" value={String(run.employeeCount)} />

            <Metric
              title="يحتاج مراجعة"
              value={String(run.blockedEmployeeCount)}
              tone={
                run.blockedEmployeeCount > 0
                  ? "text-amber-300"
                  : "text-emerald-300"
              }
            />

            <Metric
              title="إجمالي المستحقات"
              value={money(run.totalGrossEarningsMinor, run.currency)}
            />

            <Metric
              title="إجمالي الخصومات"
              value={money(run.totalDeductionsMinor, run.currency)}
              tone="text-red-300"
            />

            <Metric
              title="صافي الرواتب"
              value={money(run.totalNetPayMinor, run.currency)}
              tone="text-emerald-300"
            />
          </div>

          {run.status === "blocked" && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-xs leading-6 text-amber-200">
              كشف الرواتب غير قابل للاعتماد حاليًا. راجع الموظفين المتوقفين،
              أصلح المصدر، ثم نفّذ إعادة احتساب.
            </div>
          )}

          <div className="space-y-3">
            {sortedEmployees.map((employee) => {
              const expanded = expandedEmployeeId === employee.id;

              return (
                <div
                  key={employee.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/15"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedEmployeeId(expanded ? null : employee.id)
                    }
                    className="w-full p-4 text-right"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="font-bold text-white">
                          {employee.employeeCodeSnapshot} -{" "}
                          {employee.employeeNameSnapshot}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          {employee.status === "blocked"
                            ? "يحتاج مراجعة"
                            : "تم الحساب"}{" "}
                          • {run.monthKey}
                        </div>
                      </div>

                      <div className="text-left">
                        <div
                          className={`text-lg font-black ${
                            employee.status === "blocked"
                              ? "text-amber-300"
                              : employee.netPayMinor < 0
                                ? "text-red-300"
                                : "text-emerald-300"
                          }`}
                        >
                          {money(employee.netPayMinor, employee.currency)}
                        </div>

                        <div className="mt-1 text-[10px] text-gray-500">
                          صافي المستحق
                        </div>
                      </div>
                    </div>

                    {employee.status === "blocked" ? (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
                        سبب التوقف: {blockReasonLabel(employee.blockReason)}
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-400 md:grid-cols-4">
                        <div>
                          الأساسي:{" "}
                          {money(employee.fixedSalaryMinor, employee.currency)}
                        </div>

                        <div>
                          الإجمالي:{" "}
                          {money(
                            employee.grossEarningsMinor,
                            employee.currency,
                          )}
                        </div>

                        <div>
                          الخصومات:{" "}
                          {money(
                            employee.totalDeductionsMinor,
                            employee.currency,
                          )}
                        </div>

                        {employee.headCoachHoursDeductionMinor > 0 && (
                          <div className="text-red-300">
                            خصم ساعات الهيد كوتش:{" "}
                            {money(
                              employee.headCoachHoursDeductionMinor,
                              employee.currency,
                            )}
                          </div>
                        )}

                        <div className="font-bold text-white">
                          الصافي:{" "}
                          {money(employee.netPayMinor, employee.currency)}
                        </div>
                      </div>
                    )}
                  </button>

                  {expanded && employee.status !== "blocked" && (
                    <div className="border-t border-white/10 p-4">
                      <div className="mb-4 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl bg-white/[0.03] p-3">
                          راتب ثابت:{" "}
                          {money(employee.fixedSalaryMinor, employee.currency)}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          خصم ساعات الهيد كوتش:{" "}
                          {money(
                            employee.headCoachHoursDeductionMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          كلاسات ثابتة:{" "}
                          {money(
                            employee.fixedClassEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          حضور متدربين:{" "}
                          {money(
                            employee.traineeClassEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          اشتراكات مدرب:{" "}
                          {money(
                            employee.coachMembershipEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          برايفيت:{" "}
                          {money(
                            employee.privateSessionEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          عمولات الإحالة:{" "}
                          {money(
                            employee.referralCommissionEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-white/[0.03] p-3">
                          إضافات يدوية:{" "}
                          {money(
                            employee.adjustmentEarningMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-red-950/10 p-3">
                          خصم الحضور:{" "}
                          {money(
                            employee.attendanceDeductionMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-red-950/10 p-3">
                          السلف:{" "}
                          {money(
                            employee.loanDeductionMinor,
                            employee.currency,
                          )}
                        </div>

                        <div className="rounded-xl bg-red-950/10 p-3">
                          خصومات يدوية:{" "}
                          {money(
                            employee.adjustmentDeductionMinor,
                            employee.currency,
                          )}
                        </div>
                      </div>

                      <div className="mb-2 text-sm font-black text-white">
                        بنود الراتب
                      </div>

                      {employee.items.length === 0 ? (
                        <div className="text-xs text-gray-500">
                          لا توجد مصادر تفصيلية.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[850px] text-xs">
                            <thead>
                              <tr className="border-b border-white/10 text-right text-gray-500">
                                <th className="px-3 py-2">المصدر</th>
                                <th className="px-3 py-2">الاتجاه</th>
                                <th className="px-3 py-2">القيمة</th>
                                <th className="px-3 py-2">حالة المصدر</th>
                                <th className="px-3 py-2">البيان</th>
                              </tr>
                            </thead>

                            <tbody>
                              {employee.items.map((item) => (
                                <tr
                                  key={item.id}
                                  className="border-b border-white/5 text-gray-300"
                                >
                                  <td className="px-3 py-3 font-bold text-white">
                                    {sourceLabel(item.sourceType)}
                                  </td>

                                  <td className="px-3 py-3">
                                    {item.direction === "earning"
                                      ? "استحقاق"
                                      : "خصم"}
                                  </td>

                                  <td
                                    className={`whitespace-nowrap px-3 py-3 font-bold ${
                                      item.direction === "earning"
                                        ? "text-emerald-300"
                                        : "text-red-300"
                                    }`}
                                  >
                                    {money(item.amountMinor, item.currency)}
                                  </td>

                                  <td className="px-3 py-3">
                                    {sourceStatusLabel(
                                      item.sourceStatusSnapshot,
                                    )}
                                  </td>

                                  <td className="max-w-[320px] px-3 py-3 text-gray-400">
                                    {referralItemDetails(item)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
