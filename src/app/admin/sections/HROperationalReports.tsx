"use client";

import { useEffect, useMemo, useState } from "react";

type ReportKind = "employees" | "attendance" | "coach-attendance";

type Employee = {
  id: string;
  employeeCode: string;
  name: string;
  phone: string | null;
  avatar: string | null;
  hireDate: string | null;
  employmentEndDate: string | null;
  employmentStatus: string;
  payrollEnabled: boolean;
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
};

type AttendanceRow = {
  id: string;
  employeeId: string;
  attendanceDate: string;
  status: string;
  scheduledStartTime: string | null;
  scheduledEndTime: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  notes: string | null;
  employee: {
    id: string;
    employeeCode: string;
    name: string;
    phone: string | null;
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
  };
};

type CoachOccurrence = {
  id?: string;
  scheduleId?: string;

  date?: string;
  scheduleDate?: string;

  time?: string;
  scheduleTime?: string;

  classId?: string;
  className?: string;

  classType?: {
    key?: string;
    nameAr?: string;
  } | null;

  isActive?: boolean;

  scheduledTrainer?: {
    id?: string;
    name?: string;
    employee?: {
      id?: string;
      employeeCode?: string;
      name?: string;
      payrollEnabled?: boolean;
      employmentStatus?: string;
    } | null;
  } | null;

  attendance?: {
    id?: string;
    status?: string;
    actualTrainerId?: string | null;
    actualTrainerNameSnapshot?: string | null;
    actualEmployeeId?: string | null;
    actualEmployeeCodeSnapshot?: string | null;
    actualEmployeeNameSnapshot?: string | null;
    notes?: string | null;
  } | null;
};

type Props = {
  canViewEmployees: boolean;
  canViewAttendance: boolean;
  canViewCoachAttendance: boolean;
};

function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function employmentStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "على رأس العمل";
    case "inactive":
      return "غير نشط";
    case "on_leave":
      return "في إجازة";
    case "terminated":
      return "منتهي الخدمة";
    case "suspended":
      return "موقوف";
    default:
      return "حالة غير محددة";
  }
}

function attendanceStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "present":
      return "حاضر";
    case "absent":
      return "غائب";
    case "late":
      return "متأخر";
    case "excused":
      return "غياب بعذر";
    case "sick_leave":
      return "إجازة مرضية";
    case "vacation":
      return "إجازة";
    case "official_holiday":
      return "عطلة رسمية";
    case "day_off":
      return "يوم راحة";
    default:
      return "غير مسجل";
  }
}

function coachAttendanceStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "present":
      return "حضر المدرب المجدول";
    case "substitute":
      return "حضر مدرب بديل";
    case "absent":
      return "غياب";
    case "cancelled":
    case "canceled":
      return "الحصة ملغاة";
    default:
      return "لم يسجل الحضور";
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10) || "—";
  }

  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function occurrenceDate(row: CoachOccurrence) {
  return row.date || row.scheduleDate || "";
}

function occurrenceTime(row: CoachOccurrence) {
  return row.time || row.scheduleTime || "—";
}

function actualCoachName(row: CoachOccurrence) {
  return (
    row.attendance?.actualEmployeeNameSnapshot ||
    row.attendance?.actualTrainerNameSnapshot ||
    (row.attendance?.status === "present"
      ? row.scheduledTrainer?.employee?.name || row.scheduledTrainer?.name
      : null) ||
    "—"
  );
}

function printReport(title: string, subtitle: string, body: string) {
  const popup = window.open("", "_blank", "width=1200,height=850");
  const logoUrl = `${window.location.origin}/fitzone-logo.jpeg`;

  if (!popup) {
    window.alert(
      "تعذر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.",
    );
    return;
  }

  popup.document.write(`
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
*{box-sizing:border-box}
body{
  margin:0;
  padding:24px;
  background:#fff;
  color:#291820;
  direction:rtl;
  font-family:Arial,Tahoma,sans-serif;
}
.page{max-width:1120px;margin:auto}
.brand{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:20px;
  padding-bottom:14px;
  border-bottom:3px solid #e75d93;
}
.brand-logo{
  display:block;
  width:118px;
  max-height:72px;
  object-fit:contain;
}
.brand-small{
  font-size:11px;
  font-weight:700;
  color:#8c6a79;
  margin-top:6px
}
h1{font-size:21px;margin:0}
.subtitle{font-size:12px;color:#826270;margin-top:5px}
.summary{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:10px;
  margin:18px 0;
}
.metric{
  border:1px solid #ead3dd;
  border-radius:10px;
  padding:10px;
}
.metric small{display:block;color:#987180;margin-bottom:6px}
.metric strong{font-size:15px}
table{
  width:100%;
  border-collapse:collapse;
  font-size:11px;
  margin-top:14px;
}
th,td{
  border:1px solid #ead3dd;
  padding:7px;
  text-align:right;
  vertical-align:top;
}
th{background:#fff0f6;color:#7a3550}
.footer{
  border-top:1px solid #ead3dd;
  margin-top:26px;
  padding-top:9px;
  text-align:center;
  color:#997887;
  font-size:9px;
}
@page{size:A4 landscape;margin:10mm}
@media print{body{padding:0}.page{max-width:none}}
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
      <div class="brand-small">الموارد البشرية ونظام الرواتب</div>
    </div>
    <div style="text-align:left">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">${escapeHtml(subtitle)}</div>
    </div>
  </div>

  ${body}

  <div class="footer">
    تم إنشاء التقرير من نظام FitZone للموارد البشرية والرواتب
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

  popup.document.close();
}

function reportButtonClass(active: boolean) {
  return `rounded-xl border px-4 py-2 text-sm font-bold transition ${
    active
      ? "border-pink-400/40 bg-pink-500/20 text-pink-100"
      : "border-white/10 bg-white/[0.03] text-gray-400 hover:text-white"
  }`;
}

function inputClass() {
  return "w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";
}

export default function HROperationalReports({
  canViewEmployees,
  canViewAttendance,
  canViewCoachAttendance,
}: Props) {
  const firstTab: ReportKind = canViewEmployees
    ? "employees"
    : canViewAttendance
      ? "attendance"
      : "coach-attendance";

  const [activeReport, setActiveReport] = useState<ReportKind>(firstTab);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState("");

  const [attendanceMonth, setAttendanceMonth] = useState(currentMonthKey());
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceEmployee, setAttendanceEmployee] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("");
  const [attendanceDepartment, setAttendanceDepartment] = useState("");

  const [coachMonth, setCoachMonth] = useState(currentMonthKey());
  const [coachRows, setCoachRows] = useState<CoachOccurrence[]>([]);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachStatus, setCoachStatus] = useState("");
  const [coachSearch, setCoachSearch] = useState("");

  const [error, setError] = useState<string | null>(null);

  const loadEmployees = async () => {
    if (!canViewEmployees && !canViewAttendance) return;

    setEmployeesLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/employees", {
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "تعذر تحميل بيانات الموظفين.",
        );
      }

      setEmployees(Array.isArray(payload.employees) ? payload.employees : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل بيانات الموظفين.",
      );
    } finally {
      setEmployeesLoading(false);
    }
  };

  const loadAttendance = async () => {
    if (!canViewAttendance) return;

    setAttendanceLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      params.set("month", attendanceMonth);

      if (attendanceEmployee) {
        params.set("employeeId", attendanceEmployee);
      }

      if (attendanceStatus) {
        params.set("status", attendanceStatus);
      }

      const response = await fetch(
        `/api/admin/employee-attendance?${params.toString()}`,
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "تعذر تحميل تقرير الحضور والانصراف.",
        );
      }

      setAttendanceRows(Array.isArray(payload.rows) ? payload.rows : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل تقرير الحضور والانصراف.",
      );
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadCoachAttendance = async () => {
    if (!canViewCoachAttendance) return;

    setCoachLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      params.set("month", coachMonth);

      if (coachStatus) {
        params.set("status", coachStatus);
      }

      const response = await fetch(
        `/api/admin/coach-class-attendance?${params.toString()}`,
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : "تعذر تحميل تقرير حضور المدربين.",
        );
      }

      setCoachRows(
        Array.isArray(payload.occurrences) ? payload.occurrences : [],
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "تعذر تحميل تقرير حضور المدربين.",
      );
    } finally {
      setCoachLoading(false);
    }
  };

  useEffect(() => {
    if (canViewEmployees || canViewAttendance) {
      void loadEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewEmployees, canViewAttendance]);

  useEffect(() => {
    if (activeReport === "attendance" && canViewAttendance) {
      void loadAttendance();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeReport,
    attendanceMonth,
    attendanceEmployee,
    attendanceStatus,
    canViewAttendance,
  ]);

  useEffect(() => {
    if (activeReport === "coach-attendance" && canViewCoachAttendance) {
      void loadCoachAttendance();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, coachMonth, coachStatus, canViewCoachAttendance]);

  const departments = useMemo(() => {
    const map = new Map<string, string>();

    for (const employee of employees) {
      if (employee.department) {
        map.set(employee.department.id, employee.department.name);
      }
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();

    return employees.filter((employee) => {
      if (employeeStatus && employee.employmentStatus !== employeeStatus) {
        return false;
      }

      if (
        employeeDepartment &&
        employee.department?.id !== employeeDepartment
      ) {
        return false;
      }

      if (!query) return true;

      return [
        employee.employeeCode,
        employee.name,
        employee.phone ?? "",
        employee.department?.name ?? "",
        employee.position?.name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [employees, employeeSearch, employeeStatus, employeeDepartment]);

  const filteredAttendanceRows = useMemo(() => {
    if (!attendanceDepartment) return attendanceRows;

    return attendanceRows.filter(
      (row) => row.employee.department?.id === attendanceDepartment,
    );
  }, [attendanceRows, attendanceDepartment]);

  const filteredCoachRows = useMemo(() => {
    const query = coachSearch.trim().toLowerCase();

    if (!query) return coachRows;

    return coachRows.filter((row) =>
      [
        row.className ?? "",
        row.classType?.nameAr ?? "",
        row.scheduledTrainer?.name ?? "",
        row.scheduledTrainer?.employee?.name ?? "",
        row.scheduledTrainer?.employee?.employeeCode ?? "",
        actualCoachName(row),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [coachRows, coachSearch]);

  const employeeStats = useMemo(
    () => ({
      total: filteredEmployees.length,
      active: filteredEmployees.filter(
        (employee) => employee.employmentStatus === "active",
      ).length,
      payroll: filteredEmployees.filter((employee) => employee.payrollEnabled)
        .length,
      terminated: filteredEmployees.filter(
        (employee) => employee.employmentStatus === "terminated",
      ).length,
    }),
    [filteredEmployees],
  );

  const attendanceStats = useMemo(
    () => ({
      total: filteredAttendanceRows.length,
      present: filteredAttendanceRows.filter((row) => row.status === "present")
        .length,
      absent: filteredAttendanceRows.filter((row) => row.status === "absent")
        .length,
      late: filteredAttendanceRows.filter((row) => row.status === "late")
        .length,
      lateMinutes: filteredAttendanceRows.reduce(
        (sum, row) => sum + (Number(row.lateMinutes) || 0),
        0,
      ),
    }),
    [filteredAttendanceRows],
  );

  const coachStats = useMemo(
    () => ({
      total: filteredCoachRows.length,
      present: filteredCoachRows.filter(
        (row) => row.attendance?.status === "present",
      ).length,
      substitute: filteredCoachRows.filter(
        (row) => row.attendance?.status === "substitute",
      ).length,
      absent: filteredCoachRows.filter(
        (row) => row.attendance?.status === "absent",
      ).length,
      unrecorded: filteredCoachRows.filter((row) => !row.attendance).length,
    }),
    [filteredCoachRows],
  );

  const printEmployees = () => {
    const rows = filteredEmployees
      .map(
        (employee, index) => `
<tr>
<td>${index + 1}</td>
<td>${escapeHtml(employee.employeeCode)}</td>
<td>${escapeHtml(employee.name)}</td>
<td>${escapeHtml(employee.phone || "—")}</td>
<td>${escapeHtml(employee.department?.name ?? "—")}</td>
<td>${escapeHtml(employee.position?.name ?? "—")}</td>
<td>${escapeHtml(formatDate(employee.hireDate))}</td>
<td>${escapeHtml(employmentStatusLabel(employee.employmentStatus))}</td>
<td>${employee.payrollEnabled ? "داخل الرواتب" : "خارج الرواتب"}</td>
</tr>`,
      )
      .join("");

    printReport(
      "تقرير الموظفين",
      `عدد النتائج: ${filteredEmployees.length}`,
      `
<div class="summary">
  <div class="metric"><small>إجمالي الموظفين</small><strong>${employeeStats.total}</strong></div>
  <div class="metric"><small>على رأس العمل</small><strong>${employeeStats.active}</strong></div>
  <div class="metric"><small>داخل الرواتب</small><strong>${employeeStats.payroll}</strong></div>
  <div class="metric"><small>منتهي الخدمة</small><strong>${employeeStats.terminated}</strong></div>
</div>

<table>
<thead>
<tr>
<th>#</th>
<th>الكود</th>
<th>الموظف</th>
<th>الهاتف</th>
<th>القسم</th>
<th>المسمى الوظيفي</th>
<th>تاريخ التعيين</th>
<th>الحالة</th>
<th>الرواتب</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>`,
    );
  };

  const printAttendance = () => {
    const rows = filteredAttendanceRows
      .map(
        (row, index) => `
<tr>
<td>${index + 1}</td>
<td>${escapeHtml(formatDate(row.attendanceDate))}</td>
<td>${escapeHtml(row.employee.employeeCode)}</td>
<td>${escapeHtml(row.employee.name)}</td>
<td>${escapeHtml(row.employee.department?.name ?? "—")}</td>
<td>${escapeHtml(attendanceStatusLabel(row.status))}</td>
<td>${escapeHtml(row.scheduledStartTime || "—")}</td>
<td>${escapeHtml(formatDateTime(row.checkInAt))}</td>
<td>${escapeHtml(formatDateTime(row.checkOutAt))}</td>
<td>${escapeHtml(row.lateMinutes || 0)}</td>
<td>${escapeHtml(row.notes || "—")}</td>
</tr>`,
      )
      .join("");

    printReport(
      "تقرير الحضور والانصراف",
      `الشهر: ${attendanceMonth}`,
      `
<div class="summary">
  <div class="metric"><small>إجمالي السجلات</small><strong>${attendanceStats.total}</strong></div>
  <div class="metric"><small>حضور</small><strong>${attendanceStats.present}</strong></div>
  <div class="metric"><small>غياب</small><strong>${attendanceStats.absent}</strong></div>
  <div class="metric"><small>إجمالي دقائق التأخير</small><strong>${attendanceStats.lateMinutes}</strong></div>
</div>

<table>
<thead>
<tr>
<th>#</th>
<th>التاريخ</th>
<th>الكود</th>
<th>الموظف</th>
<th>القسم</th>
<th>الحالة</th>
<th>موعد البداية</th>
<th>الحضور</th>
<th>الانصراف</th>
<th>دقائق التأخير</th>
<th>ملاحظات</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>`,
    );
  };

  const printCoachAttendance = () => {
    const rows = filteredCoachRows
      .map(
        (row, index) => `
<tr>
<td>${index + 1}</td>
<td>${escapeHtml(formatDate(occurrenceDate(row)))}</td>
<td>${escapeHtml(occurrenceTime(row))}</td>
<td>${escapeHtml(row.className || "—")}</td>
<td>${escapeHtml(row.classType?.nameAr || "—")}</td>
<td>${escapeHtml(
          row.scheduledTrainer?.employee?.name ||
            row.scheduledTrainer?.name ||
            "—",
        )}</td>
<td>${escapeHtml(actualCoachName(row))}</td>
<td>${escapeHtml(coachAttendanceStatusLabel(row.attendance?.status))}</td>
<td>${escapeHtml(row.attendance?.notes || "—")}</td>
</tr>`,
      )
      .join("");

    printReport(
      "تقرير حضور المدربين",
      `الشهر: ${coachMonth}`,
      `
<div class="summary">
  <div class="metric"><small>إجمالي الحصص</small><strong>${coachStats.total}</strong></div>
  <div class="metric"><small>حضور المدرب المجدول</small><strong>${coachStats.present}</strong></div>
  <div class="metric"><small>مدرب بديل</small><strong>${coachStats.substitute}</strong></div>
  <div class="metric"><small>لم يسجل الحضور</small><strong>${coachStats.unrecorded}</strong></div>
</div>

<table>
<thead>
<tr>
<th>#</th>
<th>التاريخ</th>
<th>الوقت</th>
<th>الكلاس</th>
<th>نوع الكلاس</th>
<th>المدرب المجدول</th>
<th>المدرب الفعلي</th>
<th>الحالة</th>
<th>ملاحظات</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>`,
    );
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap gap-2">
        {canViewEmployees && (
          <button
            type="button"
            onClick={() => setActiveReport("employees")}
            className={reportButtonClass(activeReport === "employees")}
          >
            👥 تقرير الموظفين
          </button>
        )}

        {canViewAttendance && (
          <button
            type="button"
            onClick={() => setActiveReport("attendance")}
            className={reportButtonClass(activeReport === "attendance")}
          >
            🕐 الحضور والانصراف
          </button>
        )}

        {canViewCoachAttendance && (
          <button
            type="button"
            onClick={() => setActiveReport("coach-attendance")}
            className={reportButtonClass(activeReport === "coach-attendance")}
          >
            🏋️ حضور المدربين
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      {activeReport === "employees" && canViewEmployees && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 text-base font-black text-white">
              تقرير الموظفين
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <input
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
                placeholder="بحث بالاسم أو الكود أو الهاتف"
                className={inputClass()}
              />

              <select
                value={employeeStatus}
                onChange={(event) => setEmployeeStatus(event.target.value)}
                className={inputClass()}
              >
                <option value="">كل الحالات</option>
                <option value="active">على رأس العمل</option>
                <option value="inactive">غير نشط</option>
                <option value="on_leave">في إجازة</option>
                <option value="terminated">منتهي الخدمة</option>
                <option value="suspended">موقوف</option>
              </select>

              <select
                value={employeeDepartment}
                onChange={(event) => setEmployeeDepartment(event.target.value)}
                className={inputClass()}
              >
                <option value="">كل الأقسام</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadEmployees()}
                  disabled={employeesLoading}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {employeesLoading ? "جارٍ التحميل..." : "تحديث"}
                </button>

                <button
                  type="button"
                  onClick={printEmployees}
                  disabled={filteredEmployees.length === 0}
                  className="flex-1 rounded-xl bg-pink-500/20 px-3 py-2 text-sm font-bold text-pink-100 disabled:opacity-40"
                >
                  طباعة / PDF
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="إجمالي النتائج" value={employeeStats.total} />
            <Metric label="على رأس العمل" value={employeeStats.active} />
            <Metric label="داخل الرواتب" value={employeeStats.payroll} />
            <Metric label="منتهي الخدمة" value={employeeStats.terminated} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[1000px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-right text-gray-500">
                  <th className="px-3 py-3">الكود</th>
                  <th className="px-3 py-3">الموظف</th>
                  <th className="px-3 py-3">الهاتف</th>
                  <th className="px-3 py-3">القسم</th>
                  <th className="px-3 py-3">المسمى</th>
                  <th className="px-3 py-3">تاريخ التعيين</th>
                  <th className="px-3 py-3">نهاية الخدمة</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">الرواتب</th>
                </tr>
              </thead>

              <tbody>
                {filteredEmployees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-3">{employee.employeeCode}</td>
                    <td className="px-3 py-3 font-bold text-white">
                      {employee.name}
                    </td>
                    <td className="px-3 py-3">{employee.phone || "—"}</td>
                    <td className="px-3 py-3">
                      {employee.department?.name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {employee.position?.name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {formatDate(employee.hireDate)}
                    </td>
                    <td className="px-3 py-3">
                      {formatDate(employee.employmentEndDate)}
                    </td>
                    <td className="px-3 py-3">
                      {employmentStatusLabel(employee.employmentStatus)}
                    </td>
                    <td className="px-3 py-3">
                      {employee.payrollEnabled
                        ? "داخل الرواتب"
                        : "خارج الرواتب"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "attendance" && canViewAttendance && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 text-base font-black text-white">
              تقرير الحضور والانصراف
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <input
                type="month"
                value={attendanceMonth}
                onChange={(event) => setAttendanceMonth(event.target.value)}
                className={inputClass()}
              />

              <select
                value={attendanceEmployee}
                onChange={(event) => setAttendanceEmployee(event.target.value)}
                className={inputClass()}
              >
                <option value="">كل الموظفين</option>

                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.employeeCode} - {employee.name}
                  </option>
                ))}
              </select>

              <select
                value={attendanceDepartment}
                onChange={(event) =>
                  setAttendanceDepartment(event.target.value)
                }
                className={inputClass()}
              >
                <option value="">كل الأقسام</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>

              <select
                value={attendanceStatus}
                onChange={(event) => setAttendanceStatus(event.target.value)}
                className={inputClass()}
              >
                <option value="">كل الحالات</option>
                <option value="present">حاضر</option>
                <option value="absent">غائب</option>
                <option value="late">متأخر</option>
                <option value="excused">غياب بعذر</option>
                <option value="sick_leave">إجازة مرضية</option>
                <option value="vacation">إجازة</option>
                <option value="official_holiday">عطلة رسمية</option>
                <option value="day_off">يوم راحة</option>
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadAttendance()}
                  disabled={attendanceLoading}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {attendanceLoading ? "جارٍ التحميل..." : "تحديث"}
                </button>

                <button
                  type="button"
                  onClick={printAttendance}
                  disabled={filteredAttendanceRows.length === 0}
                  className="flex-1 rounded-xl bg-pink-500/20 px-3 py-2 text-sm font-bold text-pink-100 disabled:opacity-40"
                >
                  طباعة / PDF
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="إجمالي السجلات" value={attendanceStats.total} />
            <Metric label="حضور" value={attendanceStats.present} />
            <Metric label="غياب" value={attendanceStats.absent} />
            <Metric label="تأخير" value={attendanceStats.late} />
            <Metric label="دقائق التأخير" value={attendanceStats.lateMinutes} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[1150px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-right text-gray-500">
                  <th className="px-3 py-3">التاريخ</th>
                  <th className="px-3 py-3">الكود</th>
                  <th className="px-3 py-3">الموظف</th>
                  <th className="px-3 py-3">القسم</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">موعد البداية</th>
                  <th className="px-3 py-3">وقت الحضور</th>
                  <th className="px-3 py-3">وقت الانصراف</th>
                  <th className="px-3 py-3">التأخير</th>
                  <th className="px-3 py-3">ملاحظات</th>
                </tr>
              </thead>

              <tbody>
                {filteredAttendanceRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-3">
                      {formatDate(row.attendanceDate)}
                    </td>
                    <td className="px-3 py-3">{row.employee.employeeCode}</td>
                    <td className="px-3 py-3 font-bold text-white">
                      {row.employee.name}
                    </td>
                    <td className="px-3 py-3">
                      {row.employee.department?.name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      {attendanceStatusLabel(row.status)}
                    </td>
                    <td className="px-3 py-3">
                      {row.scheduledStartTime || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {formatDateTime(row.checkInAt)}
                    </td>
                    <td className="px-3 py-3">
                      {formatDateTime(row.checkOutAt)}
                    </td>
                    <td className="px-3 py-3">
                      {row.lateMinutes > 0 ? `${row.lateMinutes} دقيقة` : "—"}
                    </td>
                    <td className="px-3 py-3">{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === "coach-attendance" && canViewCoachAttendance && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 text-base font-black text-white">
              تقرير حضور المدربين
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <input
                type="month"
                value={coachMonth}
                onChange={(event) => setCoachMonth(event.target.value)}
                className={inputClass()}
              />

              <input
                value={coachSearch}
                onChange={(event) => setCoachSearch(event.target.value)}
                placeholder="بحث بالمدرب أو الكلاس"
                className={inputClass()}
              />

              <select
                value={coachStatus}
                onChange={(event) => setCoachStatus(event.target.value)}
                className={inputClass()}
              >
                <option value="">كل الحالات</option>
                <option value="present">حضر المدرب المجدول</option>
                <option value="substitute">حضر مدرب بديل</option>
                <option value="absent">غياب</option>
                <option value="cancelled">الحصة ملغاة</option>
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void loadCoachAttendance()}
                  disabled={coachLoading}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {coachLoading ? "جارٍ التحميل..." : "تحديث"}
                </button>

                <button
                  type="button"
                  onClick={printCoachAttendance}
                  disabled={filteredCoachRows.length === 0}
                  className="flex-1 rounded-xl bg-pink-500/20 px-3 py-2 text-sm font-bold text-pink-100 disabled:opacity-40"
                >
                  طباعة / PDF
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="إجمالي الحصص" value={coachStats.total} />
            <Metric label="حضور المجدول" value={coachStats.present} />
            <Metric label="مدرب بديل" value={coachStats.substitute} />
            <Metric label="غياب" value={coachStats.absent} />
            <Metric label="غير مسجل" value={coachStats.unrecorded} />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
            <table className="w-full min-w-[1050px] text-xs">
              <thead>
                <tr className="border-b border-white/10 text-right text-gray-500">
                  <th className="px-3 py-3">التاريخ</th>
                  <th className="px-3 py-3">الوقت</th>
                  <th className="px-3 py-3">الكلاس</th>
                  <th className="px-3 py-3">نوع الكلاس</th>
                  <th className="px-3 py-3">المدرب المجدول</th>
                  <th className="px-3 py-3">المدرب الفعلي</th>
                  <th className="px-3 py-3">الحالة</th>
                  <th className="px-3 py-3">ملاحظات</th>
                </tr>
              </thead>

              <tbody>
                {filteredCoachRows.map((row, index) => (
                  <tr
                    key={
                      row.scheduleId ||
                      row.id ||
                      `${occurrenceDate(row)}-${index}`
                    }
                    className="border-b border-white/5 text-gray-300"
                  >
                    <td className="px-3 py-3">
                      {formatDate(occurrenceDate(row))}
                    </td>
                    <td className="px-3 py-3">{occurrenceTime(row)}</td>
                    <td className="px-3 py-3 font-bold text-white">
                      {row.className || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.classType?.nameAr || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.scheduledTrainer?.employee?.name ||
                        row.scheduledTrainer?.name ||
                        "—"}
                    </td>
                    <td className="px-3 py-3">{actualCoachName(row)}</td>
                    <td className="px-3 py-3">
                      {coachAttendanceStatusLabel(row.attendance?.status)}
                    </td>
                    <td className="px-3 py-3">
                      {row.attendance?.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs font-bold text-gray-500">{label}</div>
      <div className="mt-2 text-xl font-black text-white">
        {value.toLocaleString("ar-EG")}
      </div>
    </div>
  );
}
