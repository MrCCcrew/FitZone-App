"use client";

import { useEffect, useMemo, useState } from "react";

import { hrPayrollBlockReasonText } from "@/lib/employees/hr-payroll-ui";
import HROperationalReports from "./HROperationalReports";

type PayrollItem = {
  id: string;
  sourceType: string;
  direction: "earning" | "deduction";
  amountMinor: number;
  currency: string;
  sourceStatusSnapshot: string | null;
  labelSnapshot: string | null;
  metadataSnapshot: string | null;
};

type PayrollEmployee = {
  id: string;
  employeeId: string;
  employeeCodeSnapshot: string;
  employeeNameSnapshot: string;
  status: "blocked" | "calculated" | "finalized";
  blockReason: string | null;
  currency: string;

  fixedSalaryMinor: number;
  fixedClassEarningMinor: number;
  traineeClassEarningMinor: number;
  coachMembershipEarningMinor: number;
  privateSessionEarningMinor: number;
  referralCommissionEarningMinor: number;
  adjustmentEarningMinor: number;

  attendanceDeductionMinor: number;
  headCoachHoursDeductionMinor: number;
  loanDeductionMinor: number;
  adjustmentDeductionMinor: number;

  grossEarningsMinor: number;
  totalDeductionsMinor: number;
  netPayMinor: number;

  employee: {
    id: string;
    employeeCode: string;
    name: string;
    avatar: string | null;
    employmentStatus: string;
    department: {
      id: string;
      code: string;
      name: string;
    } | null;
    position: {
      id: string;
      code: string;
      name: string;
    } | null;
  } | null;

  items: PayrollItem[];
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
  employees: PayrollEmployee[];
};

type Props = {
  canViewPayroll: boolean;
  canViewEmployees: boolean;
  canViewAttendance: boolean;
  canViewCoachAttendance: boolean;
};

function money(amountMinor: number, currency: string) {
  return `${(amountMinor / 100).toFixed(2)} ${currency}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  if (!year || !month) return monthKey;

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
  }).format(new Date(year, month - 1, 1));
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
    default:
      return "حالة غير محددة";
  }
}

function employeePayrollStatusLabel(status: PayrollEmployee["status"]) {
  switch (status) {
    case "blocked":
      return "يحتاج مراجعة";
    case "calculated":
      return "تم الحساب";
    case "finalized":
      return "معتمد نهائيًا";
    default:
      return "حالة غير محددة";
  }
}

function sourceLabel(type: string) {
  switch (type) {
    case "fixed_salary":
      return "الراتب الثابت";
    case "fixed_class":
      return "الكلاسات الثابتة";
    case "trainee_class":
      return "مستحقات حضور المتدربين";
    case "coach_membership":
      return "اشتراكات المدرب";
    case "private_session":
      return "الجلسات الخاصة";
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

function parsePayrollItemMetadata(
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

function payrollItemDescription(item: PayrollItem) {
  if (item.sourceType !== "staff_referral") {
    return item.labelSnapshot || "—";
  }

  const metadata = parsePayrollItemMetadata(
    item.metadataSnapshot,
  );

  if (!metadata) {
    return item.labelSnapshot || "عمولة إحالة";
  }

  const parts: string[] = [];

  if (typeof metadata.earnedAt === "string") {
    const date = new Date(metadata.earnedAt);

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

function dateTimeLabel(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printDocument(title: string, body: string) {
  const printWindow = window.open("", "_blank", "width=1100,height=850");
  const logoUrl = `${window.location.origin}/fitzone-logo.jpeg`;

  if (!printWindow) {
    window.alert(
      "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.",
    );
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>

        <style>
          * { box-sizing: border-box; }

          body {
            margin: 0;
            padding: 28px;
            font-family: Arial, Tahoma, sans-serif;
            color: #24151d;
            background: white;
            direction: rtl;
          }

          .page {
            max-width: 1050px;
            margin: 0 auto;
          }

          .brand {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
            border-bottom: 3px solid #e76b9a;
            padding-bottom: 16px;
            margin-bottom: 22px;
          }

          .brand-logo {
            display: block;
            width: 118px;
            max-height: 72px;
            object-fit: contain;
          }

          .brand-subtitle {
            margin-top: 6px;
            color: #765464;
            font-size: 11px;
            font-weight: 700;
          }

          h1 {
            font-size: 22px;
            margin: 0;
          }

          .muted {
            color: #765464;
            font-size: 12px;
          }

          .info-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
            margin: 16px 0;
          }

          .box {
            border: 1px solid #ead5df;
            border-radius: 10px;
            padding: 10px;
          }

          .box-label {
            font-size: 11px;
            color: #886575;
            margin-bottom: 6px;
          }

          .box-value {
            font-size: 14px;
            font-weight: 700;
          }

          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin: 18px 0;
          }

          .summary .box {
            text-align: center;
          }

          .net {
            border: 2px solid #d84d84;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 12px;
          }

          th, td {
            border: 1px solid #ead5df;
            padding: 8px;
            text-align: right;
            vertical-align: top;
          }

          th {
            background: #fff1f6;
            color: #7d3453;
          }

          .section-title {
            margin-top: 22px;
            font-size: 15px;
            font-weight: 800;
          }

          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 80px;
            margin-top: 55px;
          }

          .signature {
            text-align: center;
            border-top: 1px solid #8d7280;
            padding-top: 8px;
            font-size: 12px;
          }

          .footer {
            margin-top: 32px;
            padding-top: 12px;
            border-top: 1px solid #ead5df;
            text-align: center;
            font-size: 10px;
            color: #967989;
          }

          @page {
            size: A4;
            margin: 12mm;
          }

          @media print {
            body { padding: 0; }
            .page { max-width: none; }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="brand">
            <div>
              <img
                class="brand-logo"
                src="${escapeHtml(logoUrl)}"
                alt="FitZone"
              />
              <div class="brand-subtitle">الموارد البشرية ونظام الرواتب</div>
            </div>

            <div style="text-align:left">
              <h1>${escapeHtml(title)}</h1>
              <div class="muted">fitzoneland.com</div>
            </div>
          </div>

          ${body}

          <div class="footer">
            تم إنشاء هذا التقرير من نظام FitZone للموارد البشرية والرواتب
          </div>
        </div>

        <script>
          window.onload = () => {
            const images = Array.from(document.images);

            Promise.all(
              images.map(
                (image) =>
                  image.complete
                    ? Promise.resolve()
                    : new Promise((resolve) => {
                        image.addEventListener("load", resolve, { once: true });
                        image.addEventListener("error", resolve, { once: true });
                      }),
              ),
            ).finally(() => {
              setTimeout(() => window.print(), 150);
            });
          };
        </script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

export default function HRReportsTab({
  canViewPayroll,
  canViewEmployees,
  canViewAttendance,
  canViewCoachAttendance,
}: Props) {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [month, setMonth] = useState(currentMonth);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [employeeSearch, setEmployeeSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");

  const loadPayroll = async () => {
    if (!canViewPayroll) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/payroll-runs?month=${encodeURIComponent(month)}`,
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "تعذر تحميل تقرير الرواتب.",
        );
      }

      const nextRun =
        Array.isArray(payload.runs) && payload.runs.length > 0
          ? (payload.runs[0] as PayrollRun)
          : null;

      setRun(nextRun);

      if (
        selectedEmployeeId &&
        !nextRun?.employees.some(
          (employee) => employee.employeeId === selectedEmployeeId,
        )
      ) {
        setSelectedEmployeeId("");
      }
    } catch (loadError) {
      setRun(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل تقرير الرواتب.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, canViewPayroll]);

  const departments = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();

    for (const employee of run?.employees ?? []) {
      const department = employee.employee?.department;

      if (department) {
        map.set(department.id, {
          id: department.id,
          name: department.name,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "ar"),
    );
  }, [run]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();

    return (run?.employees ?? []).filter((employee) => {
      if (departmentId && employee.employee?.department?.id !== departmentId) {
        return false;
      }

      if (!query) return true;

      const haystack = [
        employee.employeeCodeSnapshot,
        employee.employeeNameSnapshot,
        employee.employee?.department?.name ?? "",
        employee.employee?.position?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [run, employeeSearch, departmentId]);

  const selectedEmployee =
    run?.employees.find(
      (employee) => employee.employeeId === selectedEmployeeId,
    ) ?? null;

  const printMonthlyPayroll = () => {
    if (!run) return;

    const rows = filteredEmployees
      .map(
        (employee, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(employee.employeeCodeSnapshot)}</td>
            <td>${escapeHtml(employee.employeeNameSnapshot)}</td>
            <td>${escapeHtml(employee.employee?.department?.name ?? "—")}</td>
            <td>${escapeHtml(money(employee.fixedSalaryMinor, employee.currency))}</td>
            <td>${escapeHtml(money(employee.grossEarningsMinor, employee.currency))}</td>
            <td>${escapeHtml(money(employee.headCoachHoursDeductionMinor, employee.currency))}</td>
            <td>${escapeHtml(money(employee.totalDeductionsMinor, employee.currency))}</td>
            <td><strong>${escapeHtml(money(employee.netPayMinor, employee.currency))}</strong></td>
            <td>${escapeHtml(employeePayrollStatusLabel(employee.status))}</td>
          </tr>
        `,
      )
      .join("");

    printDocument(
      `تقرير الرواتب - ${monthLabel(run.monthKey)}`,
      `
        <div class="info-grid">
          <div class="box">
            <div class="box-label">الشهر</div>
            <div class="box-value">${escapeHtml(monthLabel(run.monthKey))}</div>
          </div>

          <div class="box">
            <div class="box-label">حالة الكشف</div>
            <div class="box-value">${escapeHtml(runStatusLabel(run.status))}</div>
          </div>

          <div class="box">
            <div class="box-label">عدد الموظفين</div>
            <div class="box-value">${filteredEmployees.length}</div>
          </div>

          <div class="box">
            <div class="box-label">آخر حساب</div>
            <div class="box-value">${escapeHtml(dateTimeLabel(run.calculatedAt))}</div>
          </div>
        </div>

        <div class="summary">
          <div class="box">
            <div class="box-label">إجمالي المستحقات</div>
            <div class="box-value">${escapeHtml(money(run.totalGrossEarningsMinor, run.currency))}</div>
          </div>

          <div class="box">
            <div class="box-label">إجمالي الخصومات</div>
            <div class="box-value">${escapeHtml(money(run.totalDeductionsMinor, run.currency))}</div>
          </div>

          <div class="box net">
            <div class="box-label">صافي الرواتب</div>
            <div class="box-value">${escapeHtml(money(run.totalNetPayMinor, run.currency))}</div>
          </div>
        </div>

        <div class="section-title">تفاصيل الموظفين</div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الكود</th>
              <th>الموظف</th>
              <th>القسم</th>
              <th>الراتب الأساسي</th>
              <th>المستحقات</th>
              <th>خصم ساعات الهيد كوتش</th>
              <th>الخصومات</th>
              <th>الصافي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `,
    );
  };

  const printPayslip = (employee: PayrollEmployee) => {
    if (!run) return;

    const items = employee.items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(sourceLabel(item.sourceType))}</td>
            <td>${item.direction === "earning" ? "استحقاق" : "خصم"}</td>
            <td>${escapeHtml(money(item.amountMinor, item.currency))}</td>
            <td>${escapeHtml(sourceStatusLabel(item.sourceStatusSnapshot))}</td>
            <td>${escapeHtml(payrollItemDescription(item))}</td>
          </tr>
        `,
      )
      .join("");

    printDocument(
      `كشف راتب ${employee.employeeNameSnapshot}`,
      `
        <div class="info-grid">
          <div class="box">
            <div class="box-label">اسم الموظف</div>
            <div class="box-value">${escapeHtml(employee.employeeNameSnapshot)}</div>
          </div>

          <div class="box">
            <div class="box-label">كود الموظف</div>
            <div class="box-value">${escapeHtml(employee.employeeCodeSnapshot)}</div>
          </div>

          <div class="box">
            <div class="box-label">القسم</div>
            <div class="box-value">${escapeHtml(employee.employee?.department?.name ?? "—")}</div>
          </div>

          <div class="box">
            <div class="box-label">المسمى الوظيفي</div>
            <div class="box-value">${escapeHtml(employee.employee?.position?.name ?? "—")}</div>
          </div>

          <div class="box">
            <div class="box-label">شهر الراتب</div>
            <div class="box-value">${escapeHtml(monthLabel(run.monthKey))}</div>
          </div>

          <div class="box">
            <div class="box-label">حالة الموظف في الكشف</div>
            <div class="box-value">${escapeHtml(employeePayrollStatusLabel(employee.status))}</div>
          </div>

          <div class="box">
            <div class="box-label">تاريخ الحساب</div>
            <div class="box-value">${escapeHtml(dateTimeLabel(run.calculatedAt))}</div>
          </div>

          <div class="box">
            <div class="box-label">تاريخ الاعتماد</div>
            <div class="box-value">${escapeHtml(dateTimeLabel(run.finalizedAt))}</div>
          </div>
        </div>

        ${
          employee.status === "blocked"
            ? `
              <div class="box" style="border-color:#e9b45c;background:#fff9ed">
                <div class="box-label">سبب التوقف</div>
                <div class="box-value">${escapeHtml(hrPayrollBlockReasonText(employee.blockReason))}</div>
              </div>
            `
            : ""
        }

        <div class="section-title">ملخص المستحقات</div>

        <table>
          <tbody>
            <tr><th>الراتب الثابت</th><td>${escapeHtml(money(employee.fixedSalaryMinor, employee.currency))}</td></tr>
            <tr><th>الكلاسات الثابتة</th><td>${escapeHtml(money(employee.fixedClassEarningMinor, employee.currency))}</td></tr>
            <tr><th>مستحقات حضور المتدربين</th><td>${escapeHtml(money(employee.traineeClassEarningMinor, employee.currency))}</td></tr>
            <tr><th>اشتراكات المدرب</th><td>${escapeHtml(money(employee.coachMembershipEarningMinor, employee.currency))}</td></tr>
            <tr><th>الجلسات الخاصة</th><td>${escapeHtml(money(employee.privateSessionEarningMinor, employee.currency))}</td></tr>
            <tr><th>عمولات الإحالة</th><td>${escapeHtml(money(employee.referralCommissionEarningMinor, employee.currency))}</td></tr>
            <tr><th>إضافات يدوية</th><td>${escapeHtml(money(employee.adjustmentEarningMinor, employee.currency))}</td></tr>
          </tbody>
        </table>

        <div class="section-title">الخصومات</div>

        <table>
          <tbody>
            <tr><th>خصم الحضور</th><td>${escapeHtml(money(employee.attendanceDeductionMinor, employee.currency))}</td></tr>
            <tr><th>خصم ساعات الهيد كوتش</th><td>${escapeHtml(money(employee.headCoachHoursDeductionMinor, employee.currency))}</td></tr>
            <tr><th>أقساط السلف</th><td>${escapeHtml(money(employee.loanDeductionMinor, employee.currency))}</td></tr>
            <tr><th>خصومات يدوية</th><td>${escapeHtml(money(employee.adjustmentDeductionMinor, employee.currency))}</td></tr>
          </tbody>
        </table>

        <div class="summary">
          <div class="box">
            <div class="box-label">إجمالي المستحقات</div>
            <div class="box-value">${escapeHtml(money(employee.grossEarningsMinor, employee.currency))}</div>
          </div>

          <div class="box">
            <div class="box-label">إجمالي الخصومات</div>
            <div class="box-value">${escapeHtml(money(employee.totalDeductionsMinor, employee.currency))}</div>
          </div>

          <div class="box net">
            <div class="box-label">صافي الراتب</div>
            <div class="box-value">${escapeHtml(money(employee.netPayMinor, employee.currency))}</div>
          </div>
        </div>

        <div class="section-title">بنود الراتب التفصيلية</div>

        ${
          employee.items.length === 0
            ? `<div class="muted">لا توجد بنود تفصيلية مسجلة.</div>`
            : `
              <table>
                <thead>
                  <tr>
                    <th>المصدر</th>
                    <th>الاتجاه</th>
                    <th>القيمة</th>
                    <th>حالة المصدر</th>
                    <th>البيان</th>
                  </tr>
                </thead>
                <tbody>${items}</tbody>
              </table>
            `
        }

        <div class="signatures">
          <div class="signature">توقيع الموظف</div>
          <div class="signature">اعتماد الإدارة</div>
        </div>
      `,
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="rounded-3xl border border-pink-500/20 bg-gradient-to-br from-pink-950/20 to-black/20 p-5">
        <div className="text-xl font-black text-white">
          📊 تقارير الموارد البشرية والرواتب
        </div>

        <div className="mt-2 text-sm leading-7 text-gray-400">
          التقارير تقرأ البيانات الرسمية المحفوظة في دورة الرواتب ولا تعيد
          احتساب أو تعديل أي مستحقات.
        </div>
      </div>

      {(canViewEmployees || canViewAttendance || canViewCoachAttendance) && (
        <HROperationalReports
          canViewEmployees={canViewEmployees}
          canViewAttendance={canViewAttendance}
          canViewCoachAttendance={canViewCoachAttendance}
        />
      )}

      {!canViewPayroll && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-gray-500">
          تقارير الموظفين والحضور متاحة حسب صلاحياتك، ولا توجد لديك صلاحية
          مشاهدة تقرير الرواتب.
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="mb-4 text-sm font-black text-white">
          تقرير الرواتب الشهري
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-500">الشهر</span>

            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-500">بحث عن موظف</span>

            <input
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              placeholder="الاسم أو الكود"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-bold text-gray-500">القسم</span>

            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              <option value="">كل الأقسام</option>

              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => void loadPayroll()}
              disabled={loading}
              className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? "جارٍ التحميل..." : "تحديث"}
            </button>

            <button
              type="button"
              onClick={printMonthlyPayroll}
              disabled={!run || filteredEmployees.length === 0}
              className="flex-1 rounded-xl bg-pink-500/20 px-4 py-2 text-sm font-bold text-pink-100 disabled:opacity-40"
            >
              طباعة / PDF
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {!loading && !run && !error && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-gray-500">
          لا يوجد كشف رواتب محفوظ لهذا الشهر.
        </div>
      )}

      {run && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-gray-500">حالة الكشف</div>
              <div className="mt-2 font-black text-white">
                {runStatusLabel(run.status)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-gray-500">إجمالي المستحقات</div>
              <div className="mt-2 font-black text-white">
                {money(run.totalGrossEarningsMinor, run.currency)}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-gray-500">إجمالي الخصومات</div>
              <div className="mt-2 font-black text-red-300">
                {money(run.totalDeductionsMinor, run.currency)}
              </div>
            </div>

            <div className="rounded-2xl border border-pink-500/20 bg-pink-950/10 p-4">
              <div className="text-xs text-gray-500">صافي الرواتب</div>
              <div className="mt-2 font-black text-emerald-300">
                {money(run.totalNetPayMinor, run.currency)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[950px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-right text-gray-500">
                  <th className="px-3 py-3">الكود</th>
                  <th className="px-3 py-3">الموظف</th>
                  <th className="px-3 py-3">القسم</th>
                  <th className="px-3 py-3">المسمى</th>
                  <th className="px-3 py-3">الأساسي</th>
                  <th className="px-3 py-3">المستحقات</th>
                  <th className="px-3 py-3">الخصومات</th>
                  <th className="px-3 py-3">الصافي</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">كشف الراتب</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-3">
                      {employee.employeeCodeSnapshot}
                    </td>

                    <td className="px-3 py-3 font-bold text-white">
                      {employee.employeeNameSnapshot}
                    </td>

                    <td className="px-3 py-3">
                      {employee.employee?.department?.name ?? "—"}
                    </td>

                    <td className="px-3 py-3">
                      {employee.employee?.position?.name ?? "—"}
                    </td>

                    <td className="px-3 py-3">
                      {money(employee.fixedSalaryMinor, employee.currency)}
                    </td>

                    <td className="px-3 py-3">
                      {money(employee.grossEarningsMinor, employee.currency)}
                    </td>

                    <td className="px-3 py-3 text-red-300">
                      {money(employee.totalDeductionsMinor, employee.currency)}
                    </td>

                    <td className="px-3 py-3 font-black text-emerald-300">
                      {money(employee.netPayMinor, employee.currency)}
                    </td>

                    <td className="px-3 py-3">
                      {employeePayrollStatusLabel(employee.status)}
                    </td>

                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployeeId(employee.employeeId);
                          printPayslip(employee);
                        }}
                        className="rounded-lg bg-pink-500/15 px-3 py-2 font-bold text-pink-100"
                      >
                        طباعة / PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredEmployees.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-500">
                لا توجد نتائج مطابقة للفلاتر.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3 text-sm font-black text-white">
              كشف راتب موظف
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={selectedEmployeeId}
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              >
                <option value="">اختر الموظف</option>

                {run.employees.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.employeeCodeSnapshot} -{" "}
                    {employee.employeeNameSnapshot}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!selectedEmployee}
                onClick={() => {
                  if (selectedEmployee) printPayslip(selectedEmployee);
                }}
                className="rounded-xl bg-pink-500/20 px-5 py-2 text-sm font-black text-pink-100 disabled:opacity-40"
              >
                عرض وطباعة كشف الراتب
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
