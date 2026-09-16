"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Customer, CustomerMembershipReport, HealthSurveyResponse } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const STATUS_CONFIG: Record<
  Customer["status"],
  { label: string; badgeClass: string; dotClass: string }
> = {
  active: {
    label: "نشط",
    badgeClass: "bg-emerald-500/15 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  suspended: {
    label: "موقوف",
    badgeClass: "bg-amber-500/15 text-amber-300",
    dotClass: "bg-amber-400",
  },
  pending_payment: {
    label: "قيد الدفع",
    badgeClass: "bg-sky-500/15 text-sky-300",
    dotClass: "bg-sky-400",
  },
  cancelled: {
    label: "ملغي",
    badgeClass: "bg-orange-500/15 text-orange-300",
    dotClass: "bg-orange-400",
  },
  expired: {
    label: "منتهي",
    badgeClass: "bg-rose-500/15 text-rose-300",
    dotClass: "bg-rose-400",
  },
  unsubscribed: {
    label: "غير مشترك",
    badgeClass: "bg-gray-500/15 text-gray-300",
    dotClass: "bg-gray-400",
  },
};

const PLAN_COLORS: Record<string, string> = {
  أساسي: "text-[#d7aabd]",
  بلاتيني: "text-[#ff97bf]",
  VIP: "text-[#ffd166]",
  "سنوي VIP": "text-[#c084fc]",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "كاش",
  free: "مجاني",
  wallet: "محفظة",
  card: "بطاقة",
  instapay: "إنستا باي",
  offer: "عرض خاص",
  manual_pending: "قيد الدفع",
  paymob: "Paymob",
};

function formatPaymentState(membership: CustomerMembershipReport) {
  const status = membership.paymentStatus;
  const provider = membership.paymentProvider ?? membership.paymentMethod;
  const method = formatPaymentMethod(provider);

  if (status === "paid" && membership.paymentPaidAt) {
    return `${method} — مدفوع`;
  }

  if (status === "pending" || status === "requires_action") {
    return `${method} — قيد الدفع`;
  }

  if (status === "cancelled") {
    return `${method} — لم يتم الدفع (ملغاة)`;
  }

  if (status === "failed") {
    return `${method} — فشل الدفع`;
  }

  if (status === "expired") {
    return `${method} — انتهت محاولة الدفع`;
  }

  if (provider === "paymob" || membership.paymentMethod === "paymob") {
    return "Paymob — لا يوجد دفع ناجح مؤكد";
  }

  return formatPaymentMethod(membership.paymentMethod);
}

type NewCustomer = Omit<Customer, "id"> & { password?: string; trainerRefToken?: string };

type ExchangeScheduleOption = {
  id: string;
  date: string;
  time: string;
  availableSpots: number;
  isActive?: boolean;
  class?: {
    id: string;
    name: string;
  } | null;
};

type ExchangeSourceBooking = {
  id: string;
  scheduleId: string;
  date: string;
  time: string;
  className: string;
};

type ExchangeDayBooking = {
  id: string;
  scheduleId: string;
  date: string;
  time: string;
  className: string;
  entitlementUnits: number;
  isMakeup: boolean;
  eligibleAsExchangeSource: boolean;
};

  type ClassExchangeModalState = {
  membership: CustomerMembershipReport;
  scheduleId: string;
    sourceBookingIds: string[];
  reason: string;
};

const EMPTY_CUSTOMER: NewCustomer = {
  name: "",
  phone: "",
  email: "",
  password: "",
  plan: "أساسي",
  status: "active",
  joinDate: new Date().toISOString().slice(0, 10),
  points: 0,
  balance: 0,
  avatar: "ع",
  trainerRefToken: "",
};

function CustomerAvatar({ avatar, name, size = 44 }: { avatar: string; name: string; size?: number }) {
  const isUrl = avatar.startsWith("http");
  const initial = name?.[0]?.toUpperCase() ?? "ع";
  const style: React.CSSProperties = { width: size, height: size, borderRadius: "50%", flexShrink: 0 };
  if (isUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt={name} style={{ ...style, objectFit: "cover", display: "block" }} />
    );
  }
  return (
    <div
      style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#ff4f93,#7a1d47)", color: "#fff", fontWeight: 900, fontSize: Math.round(size * 0.38), boxShadow: "0 8px 24px rgba(190,24,93,0.22)" }}
    >
      {avatar.length === 1 ? avatar : initial}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ar-EG");
}

function formatPaymentMethod(method?: string | null) {
  if (!method) return "غير محدد";
  return PAYMENT_LABELS[method] ?? method;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-[#fff4f8]">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-[#d7aabd] transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs text-[#d7aabd]">{label}</span>
      {children}
    </label>
  );
}

function buildCsv(customers: Customer[]) {
  const rows: string[][] = [];
  rows.push([
    "العميل",
    "البريد الإلكتروني",
    "الهاتف",
    "الباقة/الاشتراك",
    "النوع",
    "الحالة",
    "تاريخ البدء",
    "تاريخ الانتهاء",
    "عدد الحصص",
    "المستخدم",
    "المتبقي",
    "المنتجات المخصومة",
    "قيمة الدفع",
    "طريقة الدفع",
    "عنوان العرض",
  ]);

  customers.forEach((customer) => {
    const memberships = customer.memberships?.length ? customer.memberships : [];
    if (memberships.length === 0) {
      rows.push([
        customer.name,
        customer.email,
        customer.phone,
        "بدون اشتراك",
        "—",
        customer.status,
        "—",
        "—",
        "—",
        "—",
        "—",
        "—",
        "—",
        "—",
        "—",
      ]);
      return;
    }

    memberships.forEach((membership) => {
      const products = (membership.productRewards ?? [])
        .map((item) => `${item.productName ?? item.productId} × ${item.quantity}`)
        .join("، ");

      rows.push([
        customer.name,
        customer.email,
        customer.phone,
        membership.name,
        membership.kind === "package" ? "باقة" : "اشتراك",
        membership.status,
        formatDate(membership.startDate),
        formatDate(membership.endDate),
        membership.sessionsTotal?.toString() ?? "غير محدود",
        membership.sessionsUsed.toString(),
        membership.sessionsRemaining?.toString() ?? "—",
        products || "—",
        membership.paymentAmount.toString(),
        formatPaymentMethod(membership.paymentMethod),
        membership.offerTitle ?? "—",
      ]);
    });
  });

  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return `\uFEFF${csv}`;
}

type MembershipPrintRow = {
  customer: Customer;
  membership: CustomerMembershipReport | null;
  products: string;
};

function openPrintWindow(customers: Customer[]) {
  const membershipsRows: MembershipPrintRow[] = [];
  customers.forEach((customer) => {
    const memberships = customer.memberships?.length ? customer.memberships : [];
    if (memberships.length === 0) {
      membershipsRows.push({
        customer,
        membership: null,
        products: "—",
      });
      return;
    }
    memberships.forEach((membership) => {
      membershipsRows.push({
        customer,
        membership,
        products:
          membership.productRewards?.map((item) => `${item.productName ?? item.productId} × ${item.quantity}`).join("، ") ||
          "—",
      });
    });
  });

  const html = `
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>تقارير العملاء</title>
        <style>
          body { font-family: "Tahoma", "Arial", sans-serif; color: #111; margin: 24px; }
          h1 { font-size: 20px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #ccc; padding: 8px; vertical-align: top; }
          th { background: #f6f6f6; }
          .muted { color: #666; }
        </style>
      </head>
      <body>
        <h1>تقارير العملاء</h1>
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>البريد</th>
              <th>الهاتف</th>
              <th>الباقة/الاشتراك</th>
              <th>الحالة</th>
              <th>البدء</th>
              <th>الانتهاء</th>
              <th>الحصص</th>
              <th>المستخدم</th>
              <th>المتبقي</th>
              <th>المنتجات</th>
              <th>الدفع</th>
              <th>الطريقة</th>
              <th>العرض</th>
            </tr>
          </thead>
          <tbody>
            ${membershipsRows
              .map(({ customer, membership, products }) => {
                if (!membership) {
                  return `
                    <tr>
                      <td>${customer.name}</td>
                      <td>${customer.email}</td>
                      <td>${customer.phone}</td>
                      <td>بدون اشتراك</td>
                      <td>${customer.status}</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                      <td class="muted">—</td>
                    </tr>
                  `;
                }
                return `
                  <tr>
                    <td>${customer.name}</td>
                    <td>${customer.email}</td>
                    <td>${customer.phone}</td>
                    <td>${membership.name}</td>
                    <td>${membership.status}</td>
                    <td>${formatDate(membership.startDate)}</td>
                    <td>${formatDate(membership.endDate)}</td>
                    <td>${membership.sessionsTotal ?? "غير محدود"}</td>
                    <td>${membership.sessionsUsed}</td>
                    <td>${membership.sessionsRemaining ?? "—"}</td>
                    <td>${products}</td>
                    <td>${membership.paymentAmount}</td>
                    <td>${formatPaymentState(membership)}</td>
                    <td>${membership.offerTitle ?? "—"}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("الكل");
  const [statusFilter, setStatusFilter] = useState("الكل");
  const [joinDateFrom, setJoinDateFrom] = useState("");
  const [joinDateTo, setJoinDateTo] = useState("");

  const [canManageMarketing, setCanManageMarketing] = useState(false);
  const [canExecuteClassExchange, setCanExecuteClassExchange] =
    useState(false);

  const [marketingStaff, setMarketingStaff] = useState<
    Array<{
      id: string;
      name: string;
      email: string | null;
      jobTitle?: string | null;
      marketingCommissionRate?: number;
      marketingCommissionType?: string;
    }>
  >([]);

  const [marketingModal, setMarketingModal] = useState<{
    customer: Customer;
    assignedStaffUserId: string;
  } | null>(null);

  const [marketingWorking, setMarketingWorking] = useState(false);
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<(Customer & { password?: string }) | NewCustomer | null>(null);
  const [wpEdit, setWpEdit] = useState<{ userId: string; balance: number; points: number } | null>(null);
  const [savingWP, setSavingWP] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [trainerLinks, setTrainerLinks] = useState<{ id: string; token: string; label: string | null }[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<HealthSurveyResponse[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [classExchangeModal, setClassExchangeModal] =
    useState<ClassExchangeModalState | null>(null);
  const [
    classExchangeSourceBookings,
    setClassExchangeSourceBookings,
  ] = useState<ExchangeSourceBooking[]>([]);

  const [
    classExchangeSourcesLoading,
    setClassExchangeSourcesLoading,
  ] = useState(false);

  const [
    classExchangeDayBookings,
    setClassExchangeDayBookings,
  ] = useState<ExchangeDayBooking[]>([]);

  const [
    classExchangeSourceSearch,
    setClassExchangeSourceSearch,
  ] = useState("");

  const [
    classExchangeScheduleSearch,
    setClassExchangeScheduleSearch,
  ] = useState("");

  const [classExchangeSchedules, setClassExchangeSchedules] =
    useState<ExchangeScheduleOption[]>([]);
  const [classExchangeSchedulesLoading, setClassExchangeSchedulesLoading] =
    useState(false);
  const [classExchangeWorking, setClassExchangeWorking] =
    useState(false);
  const [classExchangeError, setClassExchangeError] =
    useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json();
      if (payload && typeof payload === "object" && "customers" in payload) {
        setCustomers(Array.isArray(payload.customers) ? payload.customers : []);
        if (payload.userRole) setUserRole(payload.userRole);
        setCanManageMarketing(payload.canManageMarketing === true);
        setCanExecuteClassExchange(
          payload.canExecuteClassExchange === true,
        );
      } else {
        setCustomers(Array.isArray(payload) ? payload : []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (userRole !== "trainer") return;
    fetch("/api/admin/trainer-referrals", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const links = Array.isArray(d.links) ? d.links : [];
        setTrainerLinks(links.filter((l: any) => l.isActive).map((l: any) => ({ id: l.id, token: l.token, label: l.label })));
      })
      .catch(() => null);
  }, [userRole]);

  const planOptions = useMemo(() => Array.from(new Set(customers.map((customer) => customer.plan))), [customers]);

  const loadMarketingStaff = useCallback(async () => {
    if (!canManageMarketing) {
      setMarketingStaff([]);
      return;
    }

    try {
      const response = await fetch(
        "/api/admin/marketing-conversions",
        { cache: "no-store" },
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMarketingStaff([]);
        return;
      }

      const rows =
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload.staff)
            ? payload.staff
            : Array.isArray(payload.employees)
              ? payload.employees
              : Array.isArray(payload.marketingStaff)
                ? payload.marketingStaff
                : [];

      setMarketingStaff(
        rows.filter(
          (
            item: unknown,
          ): item is {
            id: string;
            name: string;
            email: string | null;
            jobTitle?: string | null;
            marketingCommissionRate?: number;
            marketingCommissionType?: string;
          } =>
            Boolean(
              item &&
                typeof item === "object" &&
                typeof (item as { id?: unknown }).id === "string" &&
                typeof (item as { name?: unknown }).name === "string",
            ),
        ),
      );
    } catch {
      setMarketingStaff([]);
    }
  }, [canManageMarketing]);

  useEffect(() => {
    void loadMarketingStaff();
  }, [loadMarketingStaff]);

  const openMarketingAssignment = useCallback(
    (customer: Customer) => {
      setMarketingError(null);
      setMarketingModal({
        customer,
        assignedStaffUserId:
          customer.marketingConversion?.assignedStaff.id ?? "",
      });
    },
    [],
  );

  const saveMarketingAssignment = useCallback(async () => {
    if (
      !marketingModal ||
      !marketingModal.assignedStaffUserId
    ) {
      setMarketingError("اختر موظف/موظفة التسويق أولاً.");
      return;
    }

    setMarketingWorking(true);
    setMarketingError(null);

    try {
      const conversion =
        marketingModal.customer.marketingConversion;

      const response = await fetch(
        "/api/admin/marketing-conversions",
        {
          method: conversion ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            conversion
              ? {
                  id: conversion.id,
                  conversionId: conversion.id,
                  action: "reassign",
                  assignedStaffUserId:
                    marketingModal.assignedStaffUserId,
                }
              : {
                  customerId: marketingModal.customer.id,
                  assignedStaffUserId:
                    marketingModal.assignedStaffUserId,
                },
          ),
        },
      );

      const payload = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setMarketingError(
          payload.error ??
            "تعذر حفظ متابعة التسويق.",
        );
        return;
      }

      setMarketingModal(null);
      await loadCustomers();
      await loadMarketingStaff();
    } catch {
      setMarketingError(
        "تعذر الاتصال بخدمة متابعة التسويق.",
      );
    } finally {
      setMarketingWorking(false);
    }
  }, [
    loadCustomers,
    loadMarketingStaff,
    marketingModal,
  ]);

  const cancelMarketingAssignment = useCallback(
    async (customer: Customer) => {
      const conversion =
        customer.marketingConversion;

      if (!conversion) return;

      const confirmed = window.confirm(
        `إلغاء متابعة التسويق الحالية للعميل ${customer.name}؟\n\nلن يتم حذف التاريخ السابق.`,
      );

      if (!confirmed) return;

      setMarketingWorking(true);

      try {
        const response = await fetch(
          "/api/admin/marketing-conversions",
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: conversion.id,
              conversionId: conversion.id,
              action: "cancel",
            }),
          },
        );

        const payload = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          window.alert(
            payload.error ??
              "تعذر إلغاء متابعة التسويق.",
          );
          return;
        }

        if (
          marketingModal?.customer.id ===
          customer.id
        ) {
          setMarketingModal(null);
        }

        await loadCustomers();
      } finally {
        setMarketingWorking(false);
      }
    },
    [loadCustomers, marketingModal],
  );

  const loadClassExchangeSources =
    useCallback(
      async (
        membershipId: string,
      ) => {
        setClassExchangeSourcesLoading(
          true,
        );

        try {
          const response =
            await fetch(
              `/api/admin/class-exchanges?userMembershipId=${encodeURIComponent(
                membershipId,
              )}`,
              {
                cache:
                  "no-store",
              },
            );

          const payload =
            await response
              .json()
              .catch(
                () => ({}),
              );

          if (!response.ok) {
            setClassExchangeSourceBookings(
              [],
            );

            setClassExchangeError(
              payload?.error ??
                "تعذر تحميل الحجوزات المستقبلية.",
            );

            return;
          }

          setClassExchangeSourceBookings(
            Array.isArray(
              payload?.sourceBookings,
            )
              ? payload.sourceBookings
              : [],
          );

          setClassExchangeDayBookings(
            Array.isArray(
              payload?.dayBookings,
            )
              ? payload.dayBookings
              : [],
          );
        } catch {
          setClassExchangeSourceBookings(
            [],
          );

          setClassExchangeError(
            "تعذر تحميل الحجوزات المستقبلية.",
          );
        } finally {
          setClassExchangeSourcesLoading(
            false,
          );
        }
      },
      [],
    );

  const loadClassExchangeSchedules =
    useCallback(async () => {
      setClassExchangeSchedulesLoading(true);
      setClassExchangeError(null);

      try {
        const response = await fetch(
          "/api/admin/schedules",
          {
            cache: "no-store",
          },
        );

        const payload =
          await response.json().catch(() => []);

        if (!response.ok) {
          setClassExchangeSchedules([]);
          setClassExchangeError(
            payload?.error ??
              "تعذر تحميل المواعيد المتاحة.",
          );
          return;
        }

        const list =
          Array.isArray(payload)
            ? payload
            : [];

        setClassExchangeSchedules(
          list
            .filter(
              (
                item,
              ): item is ExchangeScheduleOption =>
                Boolean(
                  item &&
                    typeof item === "object" &&
                    typeof item.id === "string" &&
                    typeof item.date === "string" &&
                    typeof item.time === "string" &&
                    typeof item.availableSpots ===
                      "number",
                ),
            )
            .filter(
              (item) =>
                item.isActive !== false &&
                item.availableSpots > 0,
            ),
        );
      } catch {
        setClassExchangeSchedules([]);
        setClassExchangeError(
          "تعذر تحميل المواعيد المتاحة.",
        );
      } finally {
        setClassExchangeSchedulesLoading(false);
      }
    }, []);

  const openClassExchange =
    useCallback(
      (
        membership:
          CustomerMembershipReport,
      ) => {
        setClassExchangeModal({
          membership,
          scheduleId: "",
          sourceBookingIds: [],
          reason: "",
        });

        setClassExchangeError(null);

        setClassExchangeSourceBookings(
          [],
        );

        setClassExchangeDayBookings([]);
        setClassExchangeSourceSearch("");
        setClassExchangeScheduleSearch("");

        void loadClassExchangeSources(
          membership.id,
        );

        void loadClassExchangeSchedules();
      },
      [
          loadClassExchangeSchedules,
          loadClassExchangeSources,
        ],
    );

  const refreshViewedCustomer =
    useCallback(
      async (customerId: string) => {
        const response = await fetch(
          "/api/admin/customers",
          {
            cache: "no-store",
          },
        );

        const payload =
          await response.json().catch(() => ({}));

        const list: Customer[] =
          Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.customers)
              ? payload.customers
              : [];

        setCustomers(list);

        const refreshed =
          list.find(
            (customer) =>
              customer.id === customerId,
          ) ?? null;

        setViewCustomer(refreshed);
      },
      [],
    );

  const submitClassExchange =
    useCallback(async () => {
      if (
        !classExchangeModal ||
        !viewCustomer
      ) {
        return;
      }

      if (
        !classExchangeModal.scheduleId
      ) {
        setClassExchangeError(
          "يرجى اختيار الموعد.",
        );
        return;
      }

      if (
        classExchangeModal.reason.trim()
          .length < 3
      ) {
        setClassExchangeError(
          "يرجى كتابة سبب الحجز الاستثنائي.",
        );
        return;
      }

      if (
        classExchangeModal
          .sourceBookingIds.length !==
        2
      ) {
        setClassExchangeError(
          "اختر حصتين مستقبليتين بالضبط سيتم استبدالهما.",
        );
        return;
      }

      const confirmed =
        window.confirm(
          `سيتم إلغاء الحصتين المستقبليتين المحددتين وإعادة مقعديهما، ثم حجز كلاس واحد خارج اشتراك "${classExchangeModal.membership.name}" مقابل حصتين. هل تريد المتابعة؟`,
        );

      if (!confirmed) {
        return;
      }

      setClassExchangeWorking(true);
      setClassExchangeError(null);

      try {
        const response = await fetch(
          "/api/admin/class-exchanges",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              userMembershipId:
                classExchangeModal
                  .membership.id,
              scheduleId:
                classExchangeModal
                  .scheduleId,
              sourceBookingIds:
                  classExchangeModal
                    .sourceBookingIds,
                reason:
                classExchangeModal
                  .reason.trim(),
            }),
          },
        );

        const payload =
          await response.json().catch(
            () => ({}),
          );

        if (!response.ok) {
          setClassExchangeError(
            payload?.error ??
              "تعذر إنشاء الحجز الاستثنائي.",
          );
          return;
        }

        const customerId =
          viewCustomer.id;

        setClassExchangeModal(null);

        await refreshViewedCustomer(
          customerId,
        );

        window.alert(
          `تم إنشاء الحجز الاستثنائي بنجاح وخصم حصتين. الرصيد المتبقي: ${payload.remainingUnitsAfter ?? "—"}.`,
        );
      } catch {
        setClassExchangeError(
          "تعذر إنشاء الحجز الاستثنائي. تحقق من الاتصال وحاول مرة أخرى.",
        );
      } finally {
        setClassExchangeWorking(false);
      }
    }, [
      classExchangeModal,
      refreshViewedCustomer,
      viewCustomer,
    ]);


  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const text = `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase();
      const matchesSearch = !search.trim() || text.includes(search.toLowerCase());
      const matchesPlan = planFilter === "الكل" || customer.plan === planFilter;
      const matchesStatus =
        statusFilter === "الكل" ||
        customer.status === statusFilter;

      const matchesFrom =
        !joinDateFrom ||
        customer.joinDate >= joinDateFrom;

      const matchesTo =
        !joinDateTo ||
        customer.joinDate <= joinDateTo;

      return (
        matchesSearch &&
        matchesPlan &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [
    customers,
    joinDateFrom,
    joinDateTo,
    planFilter,
    search,
    statusFilter,
  ]);

  const saveCustomer = async () => {
    if (!editCustomer) return;
    setSaving(true);
    try {
      const isEdit = "id" in editCustomer;
      // When editing an existing customer, never send points/balance in this request.
      // Those fields are managed exclusively by the dedicated wallet/points editor to
      // prevent stale form data from silently overwriting earned reward points.
      const payload = isEdit
        ? { ...editCustomer, points: undefined, balance: undefined }
        : editCustomer;
      const response = await fetch("/api/admin/customers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر حفظ بيانات العميل.");
        return;
      }

      // 202 = pending approval (trainer-created)
      if (response.status === 202) {
        window.alert("تم إرسال طلب إنشاء الحساب. في انتظار موافقة الإدارة.");
      }

      await loadCustomers();
      setEditCustomer(null);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (id: string, status: Customer["status"], plan?: string) => {
    const response = await fetch("/api/admin/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, plan }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر تحديث حالة العميل.");
      return;
    }

    await loadCustomers();
  };

  const saveWalletPoints = async () => {
    if (!wpEdit) return;
    setSavingWP(true);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wpEdit.userId, balance: wpEdit.balance, points: wpEdit.points }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر تحديث الرصيد.");
        return;
      }
      setWpEdit(null);
      await loadCustomers();
    } finally {
      setSavingWP(false);
    }
  };

  const loadSurvey = async (userId: string) => {
    setSurveyLoading(true);
    setSurveyResponses([]);
    try {
      const res = await fetch(`/api/admin/health-survey?userId=${userId}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({ responses: [] }));
      setSurveyResponses(Array.isArray(data.responses) ? data.responses : []);
    } finally {
      setSurveyLoading(false);
    }
  };

  const deleteCustomer = async (id: string) => {
    const response = await fetch("/api/admin/customers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر حذف العميل.");
      return;
    }

    setConfirmDelete(null);
    setViewCustomer(null);
    await loadCustomers();
  };

  const approveCustomer = async (id: string, action: "approve" | "reject") => {
    setApprovingId(id);
    try {
      const response = await fetch("/api/admin/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر تنفيذ الإجراء.");
        return;
      }
      await loadCustomers();
    } finally {
      setApprovingId(null);
    }
  };

  const exportExcel = () => {
    window.location.href = "/api/admin/customers/export";
  };

  const exportPdf = () => {
    openPrintWindow(filteredCustomers);
  };

  const stats = [
    {
      label: "إجمالي العملاء",
      value: customers.length.toLocaleString("ar-EG"),
      accent: "text-[#fff4f8]",
    },
    {
      label: "عملاء نشطون",
      value: customers.filter((customer) => customer.status === "active").length.toLocaleString("ar-EG"),
      accent: "text-emerald-300",
    },
    {
      label: "عملاء موقوفون",
      value: customers.filter((customer) => customer.status === "suspended").length.toLocaleString("ar-EG"),
      accent: "text-amber-300",
    },
    {
      label: "اشتراكات منتهية",
      value: customers.filter((customer) => customer.status === "expired").length.toLocaleString("ar-EG"),
      accent: "text-rose-300",
    },
  ];

  if (loading) {
    return (
      <AdminSectionShell title="العملاء" subtitle="إدارة الحسابات والاشتراكات وحالة كل عميل.">
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جارٍ تحميل بيانات العملاء...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell
      title="العملاء"
      subtitle="راجع البيانات الأساسية والاشتراك والرصيد والفيتزونات لكل عميل."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportExcel}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
          >
            تصدير Excel
          </button>
          <button
            onClick={exportPdf}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
          >
            تصدير PDF
          </button>
          <button
            onClick={() => setEditCustomer(EMPTY_CUSTOMER)}
            className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
          >
            + عميل جديد
          </button>
        </div>
      }
    >
      {/* Pending approvals — visible to admin and head_coach only */}
      {(userRole === "admin" || userRole === "head_coach") && customers.some((c) => c.pendingApproval) && (
        <AdminCard className="border border-amber-500/30 bg-amber-500/5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            <span className="text-sm font-black text-amber-300">
              طلبات بانتظار الموافقة ({customers.filter((c) => c.pendingApproval).length})
            </span>
          </div>
          <div className="space-y-2">
            {customers.filter((c) => c.pendingApproval).map((customer) => (
              <div key={customer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold text-[#fff4f8]">{customer.name}</div>
                  <div className="text-xs text-[#d7aabd]" dir="ltr">{customer.email}</div>
                  <div className="text-xs text-[#d7aabd]" dir="ltr">{customer.phone}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void approveCustomer(customer.id, "approve")}
                    disabled={approvingId === customer.id}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {approvingId === customer.id ? "..." : "موافقة ✓"}
                  </button>
                  <button
                    onClick={() => void approveCustomer(customer.id, "reject")}
                    disabled={approvingId === customer.id}
                    className="rounded-xl bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    رفض ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <AdminCard key={stat.label}>
            <div className={`text-2xl font-black ${stat.accent}`}>{stat.value}</div>
            <div className="mt-1 text-sm text-[#d7aabd]">{stat.label}</div>
          </AdminCard>
        ))}
      </div>

      <AdminCard>
        <div className="flex flex-wrap gap-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث بالاسم أو الهاتف أو البريد الإلكتروني..."
            className="min-w-60 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93] placeholder:text-gray-500"
          />

          <select
            value={planFilter}
            onChange={(event) => setPlanFilter(event.target.value)}
            className={INPUT}
          >
            <option value="الكل">كل الباقات</option>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={INPUT}
          >
            <option value="الكل">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
            <option value="pending_payment">قيد الدفع</option>
            <option value="cancelled">ملغي</option>
            <option value="expired">منتهي</option>
            <option value="unsubscribed">غير مشترك</option>
          </select>

          <label className="flex items-center gap-2 text-xs text-[#d7aabd]">
            <span>من</span>
            <input
              type="date"
              value={joinDateFrom}
              onChange={(event) =>
                setJoinDateFrom(event.target.value)
              }
              className={INPUT}
              aria-label="تاريخ التسجيل من"
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-[#d7aabd]">
            <span>إلى</span>
            <input
              type="date"
              value={joinDateTo}
              onChange={(event) =>
                setJoinDateTo(event.target.value)
              }
              className={INPUT}
              aria-label="تاريخ التسجيل إلى"
            />
          </label>

          {(joinDateFrom || joinDateTo) && (
            <button
              type="button"
              onClick={() => {
                setJoinDateFrom("");
                setJoinDateTo("");
              }}
              className="rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-[#d7aabd] transition-colors hover:bg-gray-700"
            >
              مسح التاريخ
            </button>
          )}
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[rgba(255,188,219,0.14)] px-5 py-4">
          <div className="text-sm text-[#d7aabd]">{filteredCustomers.length.toLocaleString("ar-EG")} عميل</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <span key={key} className={`rounded-full px-3 py-1 text-xs font-bold ${config.badgeClass}`}>
                {customers.filter((customer) => customer.status === key).length.toLocaleString("ar-EG")} {config.label}
              </span>
            ))}
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState
              title="لا يوجد عملاء مطابقون"
              description="جرّب تغيير البحث أو الفلاتر، أو أضف عميلًا جديدًا من الزر العلوي."
            />
          </div>
        ) : (
          <>
            {/* Mobile customer cards — presentation only.
                Uses the same filteredCustomers and existing callbacks as desktop. */}
            <div className="space-y-3 p-3 md:hidden">
              {filteredCustomers.map((customer) => {
                const status = STATUS_CONFIG[customer.status];

                return (
                  <div
                    key={`mobile-${customer.id}`}
                    className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <CustomerAvatar
                        avatar={customer.avatar}
                        name={customer.name}
                        size={46}
                      />

                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => {
                            setViewCustomer(customer);
                            void loadSurvey(customer.id);
                          }}
                          className="block max-w-full truncate text-right font-black text-[#fff4f8] transition-colors hover:text-[#ffd166]"
                        >
                          {customer.name}
                        </button>

                        <div
                          className="mt-1 truncate text-xs text-[#d7aabd]"
                          dir="ltr"
                        >
                          {customer.phone}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-bold ${status.badgeClass}`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${status.dotClass}`}
                            />
                            {status.label}
                          </span>

                          <span
                            className={`text-xs font-bold ${PLAN_COLORS[customer.plan] ?? "text-[#d7aabd]"}`}
                          >
                            {customer.plan}
                          </span>

                          {customer.pendingApproval && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-300">
                              بانتظار الموافقة
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[10px] text-[#d7aabd]">
                          تاريخ الانضمام
                        </div>
                        <div className="mt-1 text-xs font-bold text-[#fff4f8]">
                          {customer.joinDate}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3">
                        <div className="text-[10px] text-[#d7aabd]">
                          المحيل الأصلي
                        </div>

                        {customer.originalReferrer ? (
                          <>
                            <div className="mt-1 truncate text-xs font-bold text-[#ffd166]">
                              {customer.originalReferrer.name}
                            </div>
                            <div className="mt-1 text-[9px] text-[#d7aabd]">
                              {{
                                staff: "موظف",
                                trainer: "مدرب",
                                nutrition: "تغذية",
                                sales_agent: "مندوب مبيعات",
                                sales_user: "مبيعات",
                                partner: "شريك",
                              }[customer.originalReferrer.type]}
                            </div>
                          </>
                        ) : (
                          <div className="mt-1 text-xs text-gray-500">
                            مباشر
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 rounded-xl border border-white/[0.05] bg-white/[0.025] p-3">
                      <div className="mb-2 text-[10px] text-[#d7aabd]">
                        متابعة التسويق
                      </div>

                      {customer.marketingConversion ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-emerald-300">
                              {
                                customer.marketingConversion
                                  .assignedStaff.name
                              }
                            </div>
                            <div className="mt-0.5 text-[9px] text-[#d7aabd]">
                              متابعة مفتوحة
                            </div>
                          </div>

                          {canManageMarketing && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openMarketingAssignment(customer)
                                }
                                className="rounded-lg bg-sky-500/10 px-3 py-2 text-[10px] font-bold text-sky-300 hover:bg-sky-500/20"
                              >
                                إعادة تعيين
                              </button>

                              <button
                                type="button"
                                disabled={marketingWorking}
                                onClick={() =>
                                  void cancelMarketingAssignment(customer)
                                }
                                className="rounded-lg bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                              >
                                إلغاء
                              </button>
                            </div>
                          )}
                        </div>
                      ) : canManageMarketing ? (
                        <button
                          type="button"
                          onClick={() =>
                            openMarketingAssignment(customer)
                          }
                          className="w-full rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                        >
                          تعيين متابعة
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">
                          غير معيّن
                        </span>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white/[0.03] p-3 text-center">
                        <div className="text-[10px] text-[#d7aabd]">
                          الفيتزونات
                        </div>
                        <div className="mt-1 font-black text-[#ffd166]">
                          {customer.points.toLocaleString("ar-EG")}
                        </div>
                      </div>

                      <div className="rounded-xl bg-white/[0.03] p-3 text-center">
                        <div className="text-[10px] text-[#d7aabd]">
                          الرصيد
                        </div>
                        <div className="mt-1 font-black text-[#8bc5ff]">
                          {customer.balance.toLocaleString("ar-EG")} ج.م
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setViewCustomer(customer);
                          void loadSurvey(customer.id);
                        }}
                        className="rounded-xl bg-white/5 px-3 py-2.5 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                      >
                        عرض
                      </button>

                      {userRole !== "trainer" && (
                        <button
                          type="button"
                          onClick={() => setEditCustomer(customer)}
                          className="rounded-xl bg-white/5 px-3 py-2.5 text-xs font-bold text-[#ffd166] transition-colors hover:bg-white/10"
                        >
                          تعديل
                        </button>
                      )}

                      {userRole !== "trainer" &&
                        (customer.status === "active" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void updateStatus(
                                customer.id,
                                "suspended",
                                customer.plan,
                              )
                            }
                            className="rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                          >
                            إيقاف
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void updateStatus(
                                customer.id,
                                "active",
                                customer.plan,
                              )
                            }
                            className="rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                          >
                            تفعيل
                          </button>
                        ))}

                      {userRole !== "trainer" && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(customer)}
                          className="rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Existing desktop table — unchanged */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1320px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-right text-xs text-[#d7aabd]">
                  {[
                    "العميل",
                    "الهاتف",
                    "الباقة",
                    "الحالة",
                    "تاريخ الانضمام",
                    "المحيل الأصلي",
                    "متابعة التسويق",
                    "الفيتزونات",
                    "الرصيد",
                    "الإجراءات",
                  ].map((header) => (
                    <th key={header} className="px-5 py-4 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => {
                  const status = STATUS_CONFIG[customer.status];

                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-[rgba(255,188,219,0.08)] transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <CustomerAvatar avatar={customer.avatar} name={customer.name} size={44} />
                          <div>
                            <button
                              onClick={() => { setViewCustomer(customer); void loadSurvey(customer.id); }}
                              className="font-bold text-[#fff4f8] transition-colors hover:text-[#ffd166]"
                            >
                              {customer.name}
                            </button>
                            {customer.pendingApproval && (
                              <span className="mt-1 inline-block rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                                بانتظار الموافقة
                              </span>
                            )}
                            <div className="mt-1 text-xs text-[#d7aabd]">{customer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-[#d7aabd]" dir="ltr">
                        {customer.phone}
                      </td>
                      <td className={`px-5 py-4 font-bold ${PLAN_COLORS[customer.plan] ?? "text-[#d7aabd]"}`}>
                        {customer.plan}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${status.badgeClass}`}>
                          <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-[#d7aabd]">
                        {customer.joinDate}
                      </td>

                      <td className="px-5 py-4">
                        {customer.originalReferrer ? (
                          <div>
                            <div className="font-bold text-[#fff4f8]">
                              {customer.originalReferrer.name}
                            </div>
                            <div className="mt-1 text-[10px] text-[#d7aabd]">
                              {{
                                staff: "موظف",
                                trainer: "مدرب",
                                nutrition: "تغذية",
                                sales_agent: "مندوب مبيعات",
                                sales_user: "مبيعات",
                                partner: "شريك",
                              }[customer.originalReferrer.type]}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">
                            مباشر
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {customer.marketingConversion ? (
                          <div className="space-y-2">
                            <div>
                              <div className="font-bold text-emerald-300">
                                {
                                  customer.marketingConversion
                                    .assignedStaff.name
                                }
                              </div>
                              <div className="mt-1 text-[10px] text-[#d7aabd]">
                                متابعة مفتوحة
                              </div>
                            </div>

                            {canManageMarketing && (
                              <div className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openMarketingAssignment(
                                      customer,
                                    )
                                  }
                                  className="rounded-lg bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300 hover:bg-sky-500/20"
                                >
                                  إعادة تعيين
                                </button>

                                <button
                                  type="button"
                                  disabled={marketingWorking}
                                  onClick={() =>
                                    void cancelMarketingAssignment(
                                      customer,
                                    )
                                  }
                                  className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
                                >
                                  إلغاء
                                </button>
                              </div>
                            )}
                          </div>
                        ) : canManageMarketing ? (
                          <button
                            type="button"
                            onClick={() =>
                              openMarketingAssignment(customer)
                            }
                            className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20"
                          >
                            تعيين متابعة
                          </button>
                        ) : (
                          <span className="text-xs text-gray-500">
                            غير معيّن
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 font-bold text-[#ffd166]">
                        {customer.points.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-5 py-4 font-bold text-[#8bc5ff]">
                        {customer.balance.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { setViewCustomer(customer); void loadSurvey(customer.id); }}
                            className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[#fff4f8] transition-colors hover:bg-white/10"
                          >
                            عرض
                          </button>
                          {userRole !== "trainer" && (
                            <button
                              onClick={() => setEditCustomer(customer)}
                              className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[#ffd166] transition-colors hover:bg-white/10"
                            >
                              تعديل
                            </button>
                          )}
                          {userRole !== "trainer" && (customer.status === "active" ? (
                            <button
                              onClick={() => void updateStatus(customer.id, "suspended", customer.plan)}
                              className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 transition-colors hover:bg-amber-500/20"
                            >
                              إيقاف
                            </button>
                          ) : (
                            <button
                              onClick={() => void updateStatus(customer.id, "active", customer.plan)}
                              className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20"
                            >
                              تفعيل
                            </button>
                          ))}
                          {userRole !== "trainer" && (
                          <button
                            onClick={() => setConfirmDelete(customer)}
                            className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 transition-colors hover:bg-rose-500/20"
                          >
                            حذف
                          </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
          </>
        )}
      </AdminCard>

      {marketingModal && canManageMarketing && (
        <Modal
          title={
            marketingModal.customer.marketingConversion
              ? "إعادة تعيين متابعة التسويق"
              : "تعيين متابعة التسويق"
          }
          onClose={() => {
            if (!marketingWorking) {
              setMarketingModal(null);
              setMarketingError(null);
            }
          }}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 p-4">
              <div className="text-xs text-[#d7aabd]">
                العميل
              </div>
              <div className="mt-1 font-black text-[#fff4f8]">
                {marketingModal.customer.name}
              </div>

              {marketingModal.customer.originalReferrer && (
                <div className="mt-3 text-xs text-[#d7aabd]">
                  المحيل الأصلي:
                  {" "}
                  <span className="font-bold text-[#ffd166]">
                    {
                      marketingModal.customer
                        .originalReferrer.name
                    }
                  </span>
                </div>
              )}

              <div className="mt-2 text-[11px] text-gray-500">
                تعيين موظف التسويق لا يغيّر المحيل الأصلي أو
                عمولته.
              </div>
            </div>

            <label className="block">
              <div className="mb-2 text-sm font-bold text-[#fff4f8]">
                موظف/موظفة التسويق
              </div>

              <select
                value={
                  marketingModal.assignedStaffUserId
                }
                disabled={marketingWorking}
                onChange={(event) =>
                  setMarketingModal((current) =>
                    current
                      ? {
                          ...current,
                          assignedStaffUserId:
                            event.target.value,
                        }
                      : current,
                  )
                }
                className={`${INPUT} w-full`}
              >
                <option value="">
                  اختر الموظف
                </option>

                {marketingStaff.map((staff) => (
                  <option
                    key={staff.id}
                    value={staff.id}
                  >
                    {staff.name}
                    {staff.jobTitle
                      ? ` — ${staff.jobTitle}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            {marketingStaff.length === 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
                لا يوجد موظفون متاحون للتعيين حاليًا.
              </div>
            )}

            {marketingError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">
                {marketingError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={marketingWorking}
                onClick={() => {
                  setMarketingModal(null);
                  setMarketingError(null);
                }}
                className="rounded-xl bg-white/5 px-4 py-2 text-sm text-[#d7aabd] hover:bg-white/10 disabled:opacity-50"
              >
                إلغاء
              </button>

              <button
                type="button"
                disabled={
                  marketingWorking ||
                  !marketingModal.assignedStaffUserId
                }
                onClick={() =>
                  void saveMarketingAssignment()
                }
                className="rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-bold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {marketingWorking
                  ? "جارٍ الحفظ..."
                  : "حفظ"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {viewCustomer && (
        <Modal title="ملف العميل" onClose={() => setViewCustomer(null)}>
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <CustomerAvatar avatar={viewCustomer.avatar} name={viewCustomer.name} size={64} />
              <div>
                <div className="text-xl font-black text-[#fff4f8]">{viewCustomer.name}</div>
                <div className="mt-1 flex items-center gap-2">
                  {(() => {
                    const activeMem = viewCustomer.memberships?.find((m: CustomerMembershipReport) => m.status === "active");
                    if (activeMem) {
                      return (
                        <>
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                          <span className="text-sm font-bold text-emerald-400">{activeMem.name}</span>
                        </>
                      );
                    }
                    const expiredMem = viewCustomer.memberships?.find((m: CustomerMembershipReport) => m.status === "expired");
                    if (expiredMem) {
                      return (
                        <>
                          <span className="h-2 w-2 rounded-full bg-rose-400" />
                          <span className="text-sm font-bold text-rose-400">منتهي — {expiredMem.name}</span>
                        </>
                      );
                    }
                    return (
                      <>
                        <span className="h-2 w-2 rounded-full bg-gray-500" />
                        <span className="text-sm font-bold text-gray-400">غير مشترك</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "الفيتزونات", value: viewCustomer.points.toLocaleString("ar-EG"), accent: "text-[#ffd166]" },
                { label: "الرصيد", value: `${viewCustomer.balance.toLocaleString("ar-EG")} ج.م`, accent: "text-[#8bc5ff]" },
                { label: "الانضمام", value: viewCustomer.joinDate, accent: "text-[#fff4f8]" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 p-4 text-center">
                  <div className={`text-lg font-black ${item.accent}`}>{item.value}</div>
                  <div className="mt-1 text-xs text-[#d7aabd]">{item.label}</div>
                </div>
              ))}
            </div>

            {/* Quick wallet/points edit */}
            {wpEdit && wpEdit.userId === viewCustomer.id ? (
              <div className="rounded-2xl border border-[rgba(255,188,219,0.2)] bg-black/20 p-4 space-y-3">
                <div className="text-sm font-bold text-[#fff4f8]">تعديل الرصيد والفيتزونات</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-[#d7aabd]">الرصيد (ج.م)</label>
                    <input
                      type="number"
                      min={0}
                      value={wpEdit.balance}
                      onChange={(e) => setWpEdit({ ...wpEdit, balance: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-[#d7aabd]">الفيتزونات</label>
                    <input
                      type="number"
                      min={0}
                      value={wpEdit.points}
                      onChange={(e) => setWpEdit({ ...wpEdit, points: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => void saveWalletPoints()}
                    disabled={savingWP}
                    className="flex-1 rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >{savingWP ? "جارٍ الحفظ..." : "حفظ"}</button>
                  <button onClick={() => setWpEdit(null)} className="flex-1 rounded-xl bg-white/5 py-2 text-sm text-gray-400 hover:bg-white/10">إلغاء</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setWpEdit({ userId: viewCustomer.id, balance: viewCustomer.balance, points: viewCustomer.points })}
                className="w-full rounded-xl border border-[rgba(255,188,219,0.15)] bg-black/10 py-2 text-sm text-[#d7aabd] hover:bg-black/20"
              >
                تعديل الرصيد والفيتزونات
              </button>
            )}

            <div className="space-y-3">
              {[
                { label: "الهاتف", value: viewCustomer.phone, dir: "ltr" as const },
                { label: "البريد الإلكتروني", value: viewCustomer.email, dir: "ltr" as const },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3"
                >
                  <span className="text-sm text-[#d7aabd]">{row.label}</span>
                  <span className="text-sm font-medium text-[#fff4f8]" dir={row.dir}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 p-4">
              <div className="mb-3 text-sm font-bold text-[#fff4f8]">تقارير الاشتراك</div>
              {viewCustomer.memberships?.length ? (
                <div className="space-y-4">
                  {viewCustomer.memberships.map((membership: CustomerMembershipReport) => (
                    <div key={membership.id} className="rounded-2xl border border-[rgba(255,188,219,0.16)] bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.name}</div>
                          <div className="mt-1 text-xs text-[#d7aabd]">
                            {membership.kind === "package" ? "باقة" : "اشتراك"} •{" "}
                            <span className={
                              membership.status === "active" ? "text-emerald-400" :
                              membership.status === "expired" ? "text-rose-400" :
                              membership.status === "cancelled" ? "text-amber-400" : "text-[#d7aabd]"
                            }>
                              {membership.status === "active" ? "نشط" :
                               membership.status === "expired" ? "منتهي" :
                               membership.status === "cancelled" ? "ملغي" :
                               membership.status === "pending" ? "معلق" : membership.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-xs text-[#d7aabd]">
                          {formatDate(membership.startDate)} → {formatDate(membership.endDate)}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-4">
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#ffd166]">{membership.sessionsTotal ?? "غير محدود"}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">الحصص المتاحة</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#8bc5ff]">{membership.sessionsUsed}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">تم الحضور</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#8bc5ff]">{membership.sessionsReserved}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">محجوزة</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.sessionsRemaining ?? "—"}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">متاح للحجز</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.paymentAmount.toLocaleString("ar-EG")} ج.م</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">قيمة الدفع</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{formatPaymentState(membership)}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">حالة وطريقة الدفع</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.offerTitle ?? "—"}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">العرض الخاص</div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl bg-black/25 px-3 py-2 text-xs text-[#d7aabd]">
                        المنتجات المخصومة:{" "}
                        {membership.productRewards?.length
                          ? membership.productRewards
                              .map((item) => `${item.productName ?? item.productId} × ${item.quantity}`)
                              .join("، ")
                          : "—"}
                      </div>

                      {canExecuteClassExchange &&
                       membership.status === "active" &&
                      membership.sessionsTotal !== null ? (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() =>
                              openClassExchange(
                                membership,
                              )
                            }
                            disabled={false}
                            className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-black text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            استبدال كلاس — مقابل حصتين
                          </button>

                          <div className="mt-2 text-center text-[11px] text-[#d7aabd]">
                            يمكن استبدال حصتين مستقبليتين بكلاس واحد خارج الاشتراك
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-gray-700/50 bg-black/20 px-4 py-3">
                  <span className="h-2 w-2 rounded-full bg-gray-500" />
                  <span className="text-sm font-bold text-gray-400">غير مشترك</span>
                </div>
              )}
            </div>

            {classExchangeModal ? (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                <button
                  type="button"
                  aria-label="إغلاق"
                  className="absolute inset-0 bg-black/75 backdrop-blur-sm"
                  onClick={() => {
                    if (!classExchangeWorking) {
                      setClassExchangeModal(null);
                    }
                  }}
                />

                <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.18)] bg-[rgba(56,18,34,0.98)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.48)]">
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-[#fff4f8]">
                        حجز استثنائي
                      </h3>

                      <div className="mt-1 text-xs text-[#d7aabd]">
                        {classExchangeModal.membership.name}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={classExchangeWorking}
                      onClick={() =>
                        setClassExchangeModal(null)
                      }
                      className="text-2xl leading-none text-[#d7aabd] hover:text-white disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                    {(() => {
                      const required = 2;

                      return (
                        <>
                          <div className="text-sm font-black text-amber-200">
                            اختر الحصتين المستقبليتين اللتين سيتم استبدالهما
                          </div>

                          <div className="mt-2 text-xs text-[#d7aabd]">
                            الحجوزات السابقة أو المحضورة لا تتأثر.
                          </div>

                          <div className="mt-3">
                            <input
                              type="search"
                              value={classExchangeSourceSearch}
                              onChange={(event) =>
                                setClassExchangeSourceSearch(
                                  event.target.value,
                                )
                              }
                              placeholder="بحث باسم الكلاس أو التاريخ أو الموعد..."
                              className={`${INPUT} mb-3`}
                            />

                            <div className="max-h-64 space-y-2 overflow-y-auto">
                              {classExchangeSourcesLoading ? (
                                <div className="text-xs text-[#d7aabd]">
                                  جاري تحميل الحجوزات المستقبلية...
                                </div>
                              ) : classExchangeSourceBookings.length === 0 ? (
                                <div className="text-xs text-rose-300">
                                  لا توجد حجوزات مستقبلية صالحة للاستبدال.
                                </div>
                              ) : (
                                classExchangeSourceBookings
                                  .filter((booking) => {
                                    const query =
                                      classExchangeSourceSearch
                                        .trim()
                                        .toLowerCase();

                                    if (!query) return true;

                                    return [
                                      booking.className,
                                      booking.date,
                                      formatDate(booking.date),
                                      booking.time,
                                    ]
                                      .join(" ")
                                      .toLowerCase()
                                      .includes(query);
                                  })
                                  .map((booking) => {
                                    const selected =
                                      classExchangeModal
                                        .sourceBookingIds
                                        .includes(booking.id);

                                    const targetSchedule =
                                      classExchangeSchedules.find(
                                        (schedule) =>
                                          schedule.id ===
                                          classExchangeModal.scheduleId,
                                      );

                                    const sourceDay =
                                      new Intl.DateTimeFormat(
                                        "en-CA",
                                        {
                                          timeZone: "Africa/Cairo",
                                          year: "numeric",
                                          month: "2-digit",
                                          day: "2-digit",
                                        },
                                      ).format(new Date(booking.date));

                                    const targetDay =
                                      targetSchedule
                                        ? new Intl.DateTimeFormat(
                                            "en-CA",
                                            {
                                              timeZone: "Africa/Cairo",
                                              year: "numeric",
                                              month: "2-digit",
                                              day: "2-digit",
                                            },
                                          ).format(
                                            new Date(
                                              targetSchedule.date,
                                            ),
                                          )
                                        : null;

                                    const sameTargetDay =
                                      Boolean(
                                        targetDay &&
                                        sourceDay === targetDay,
                                      );

                                    return (
                                      <button
                                        key={booking.id}
                                        type="button"
                                        disabled={
                                          classExchangeWorking ||
                                          (
                                            !selected &&
                                            classExchangeModal
                                              .sourceBookingIds
                                              .length >=
                                              required
                                          )
                                        }
                                        onClick={() =>
                                          setClassExchangeModal(
                                            (current) => {
                                              if (!current) {
                                                return current;
                                              }

                                              return {
                                                ...current,
                                                sourceBookingIds:
                                                  selected
                                                    ? current
                                                        .sourceBookingIds
                                                        .filter(
                                                          (id: string) =>
                                                            id !==
                                                            booking.id,
                                                        )
                                                    : [
                                                        ...current
                                                          .sourceBookingIds,
                                                        booking.id,
                                                      ],
                                              };
                                            },
                                          )
                                        }
                                        className={`w-full rounded-xl border px-3 py-3 text-right text-sm ${
                                          selected
                                            ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                                            : sameTargetDay
                                              ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                                              : "border-white/10 bg-black/20 text-[#f6dbe7]"
                                        } disabled:cursor-not-allowed disabled:opacity-40`}
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <div className="font-black">
                                            {selected ? "✓ " : ""}
                                            {booking.className}
                                          </div>

                                          {sameTargetDay ? (
                                            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black text-amber-200">
                                              نفس يوم الكلاس المطلوب
                                            </span>
                                          ) : null}
                                        </div>

                                        <div className="mt-1 text-xs opacity-80">
                                          {formatDate(
                                            booking.date,
                                          )}
                                          {" • "}
                                          {booking.time}
                                        </div>
                                      </button>
                                    );
                                  })
                              )}
                            </div>
                          </div>

                          <div className="mt-3 text-xs font-bold text-amber-100">
                            تم اختيار{" "}
                            {
                              classExchangeModal
                                .sourceBookingIds
                                .length
                            }
                            {" من "}
                            {required}
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-bold text-[#d7aabd]">
                        اختيار الكلاس والموعد
                      </label>

                      <input
                        type="search"
                        value={classExchangeScheduleSearch}
                        onChange={(event) =>
                          setClassExchangeScheduleSearch(
                            event.target.value,
                          )
                        }
                        placeholder="بحث باسم الكلاس أو التاريخ أو الموعد..."
                        className={`${INPUT} mb-3`}
                      />

                      {classExchangeSchedulesLoading ? (
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-6 text-center text-xs text-[#d7aabd]">
                          جاري تحميل المواعيد...
                        </div>
                      ) : (
                        <div className="max-h-80 space-y-2 overflow-y-auto">
                          {classExchangeSchedules
                            .filter((schedule) => {
                              const query =
                                classExchangeScheduleSearch
                                  .trim()
                                  .toLowerCase();

                              if (!query) return true;

                              return [
                                schedule.class?.name ?? "",
                                schedule.date,
                                formatDate(schedule.date),
                                schedule.time,
                              ]
                                .join(" ")
                                .toLowerCase()
                                .includes(query);
                            })
                            .map((schedule) => {
                              const targetDay =
                                new Intl.DateTimeFormat(
                                  "en-CA",
                                  {
                                    timeZone: "Africa/Cairo",
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                  },
                                ).format(
                                  new Date(schedule.date),
                                );

                              const sameDayBookings =
                                classExchangeDayBookings.filter(
                                  (booking) =>
                                    new Intl.DateTimeFormat(
                                      "en-CA",
                                      {
                                        timeZone:
                                          "Africa/Cairo",
                                        year: "numeric",
                                        month: "2-digit",
                                        day: "2-digit",
                                      },
                                    ).format(
                                      new Date(booking.date),
                                    ) === targetDay,
                                );

                              const selected =
                                classExchangeModal.scheduleId ===
                                schedule.id;

                              return (
                                <button
                                  key={schedule.id}
                                  type="button"
                                  disabled={classExchangeWorking}
                                  onClick={() =>
                                    setClassExchangeModal(
                                      (current) =>
                                        current
                                          ? {
                                              ...current,
                                              scheduleId:
                                                schedule.id,
                                            }
                                          : current,
                                    )
                                  }
                                  className={`w-full rounded-xl border p-3 text-right transition-colors ${
                                    selected
                                      ? "border-pink-400 bg-pink-500/15"
                                      : sameDayBookings.length >= 2
                                        ? "border-amber-400/30 bg-amber-500/10"
                                        : "border-white/10 bg-black/20 hover:bg-white/5"
                                  }`}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="font-black text-white">
                                        {schedule.class?.name ??
                                          "كلاس"}
                                      </div>

                                      <div className="mt-1 text-xs text-[#d7aabd]">
                                        {formatDate(
                                          schedule.date,
                                        )}{" "}
                                        • {schedule.time} •{" "}
                                        {schedule.availableSpots}{" "}
                                        مقاعد
                                      </div>
                                    </div>

                                    <span
                                      className={`rounded-full px-2.5 py-1 text-[11px] font-black ${
                                        sameDayBookings.length >= 2
                                          ? "bg-amber-500/20 text-amber-200"
                                          : sameDayBookings.length === 1
                                            ? "bg-sky-500/15 text-sky-200"
                                            : "bg-emerald-500/15 text-emerald-200"
                                      }`}
                                    >
                                      {sameDayBookings.length} حصة في اليوم
                                    </span>
                                  </div>

                                  {sameDayBookings.length > 0 ? (
                                    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-[#d7aabd]">
                                      {sameDayBookings.map(
                                        (booking) => (
                                          <div key={booking.id}>
                                            {booking.className} —{" "}
                                            {booking.time}
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  ) : null}

                                  {sameDayBookings.length >= 2 ? (
                                    <div className="mt-2 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2 text-xs font-bold leading-5 text-amber-200">
                                      هذا اليوم فيه حصتان بالفعل.
                                      إذا أرادت العميلة هذا الكلاس،
                                      اختاري الحصتين الموجودتين في
                                      نفس اليوم من القائمة بالأعلى.
                                    </div>
                                  ) : null}
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-bold text-[#d7aabd]">
                        سبب الحجز الاستثنائي
                      </label>

                      <textarea
                        rows={4}
                        maxLength={1000}
                        value={classExchangeModal.reason}
                        onChange={(event) =>
                          setClassExchangeModal(
                            (current) =>
                              current
                                ? {
                                    ...current,
                                    reason:
                                      event.target.value,
                                  }
                                : current,
                          )
                        }
                        disabled={classExchangeWorking}
                        placeholder="مثال: طلبت العميلة كلاسًا غير مشمول في اشتراكها مقابل خصم حصتين."
                        className={`${INPUT} min-h-[110px] resize-y`}
                      />

                      <div className="mt-1 text-left text-[10px] text-[#d7aabd]">
                        {classExchangeModal.reason.length}/1000
                      </div>
                    </div>

                    {classExchangeError ? (
                      <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200">
                        {classExchangeError}
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-6 text-[#d7aabd]">
                      النظام سيمنع العملية إذا كان الكلاس مشمولًا أصلًا،
                      أو يوجد اشتراك آخر يسمح بالحجز الطبيعي وله رصيد،
                      أو لا يوجد رصيد حصتين، أو الموعد غير صالح أو ممتلئ.
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          void submitClassExchange()
                        }
                        disabled={
                          classExchangeWorking ||
                          classExchangeSchedulesLoading ||
                          !classExchangeModal.scheduleId ||
                          classExchangeModal.reason.trim().length < 3
                        }
                        className="flex-1 rounded-xl bg-[#ff4f93] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {classExchangeWorking
                          ? "جارٍ تنفيذ الحجز..."
                          : "تأكيد الاستبدال"}
                      </button>

                      <button
                        type="button"
                        disabled={classExchangeWorking}
                        onClick={() =>
                          setClassExchangeModal(null)
                        }
                        className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-gray-300 hover:bg-white/10 disabled:opacity-40"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Health Survey Results */}
            <div className="rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-[#fff4f8]">الاستبيان الصحي</div>
                <button
                  onClick={() => {
                    const win = window.open("", "_blank");
                    if (!win) return;
                    const rows = surveyResponses.map((r) => `
                      <div style="margin-bottom:16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px">
                        <div style="font-weight:700;margin-bottom:4px">${r.questionTitle}</div>
                        <div style="color:${r.answer ? "#dc2626" : "#16a34a"};font-weight:600">${r.answer ? "نعم ✓" : "لا ✗"}</div>
                        ${r.reason ? `<div style="margin-top:6px;color:#6b7280;font-size:13px">السبب: ${r.reason}</div>` : ""}
                      </div>`).join("");
                    win.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>الاستبيان الصحي - ${viewCustomer.name}</title><style>body{font-family:Arial,sans-serif;padding:32px;direction:rtl}</style></head><body>
                      <h2 style="margin-bottom:4px">الاستبيان الصحي</h2>
                      <div style="color:#6b7280;margin-bottom:24px">العميل: ${viewCustomer.name} | ${viewCustomer.email}</div>
                      ${rows || "<p>لا توجد إجابات مسجلة</p>"}
                    </body></html>`);
                    win.document.close();
                    win.print();
                  }}
                  className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-[#d7aabd] hover:bg-white/10"
                >
                  🖨 طباعة
                </button>
              </div>
              {surveyLoading ? (
                <div className="py-4 text-center text-xs text-[#d7aabd]">جارٍ التحميل...</div>
              ) : surveyResponses.length === 0 ? (
                <div className="py-4 text-center text-xs text-[#d7aabd]">لم يُجب العميل على الاستبيان بعد</div>
              ) : (
                <div className="space-y-3">
                  {surveyResponses.map((r) => (
                    <div key={r.questionId} className="rounded-xl border border-[rgba(255,188,219,0.1)] bg-black/20 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm text-[#fff4f8]">{r.questionTitle}</div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${r.answer ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}>
                          {r.answer ? "نعم" : "لا"}
                        </span>
                      </div>
                      {r.reason && (
                        <div className="mt-2 text-xs text-[#d7aabd]">السبب: {r.reason}</div>
                      )}
                      <div className="mt-1 text-[11px] text-gray-600">{r.answeredAt.slice(0, 10)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {userRole !== "trainer" && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => {
                      setEditCustomer(viewCustomer);
                      setViewCustomer(null);
                    }}
                    className="rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                  >
                    تعديل البيانات
                  </button>
                  <button
                    onClick={() => {
                      setConfirmDelete(viewCustomer);
                      setViewCustomer(null);
                    }}
                    className="rounded-xl bg-rose-500/15 py-3 text-sm font-bold text-rose-300 transition-colors hover:bg-rose-500/25"
                  >
                    حذف العميل
                  </button>
                </div>

                {viewCustomer.status === "active" ? (
                  <button
                    onClick={() => {
                      void updateStatus(viewCustomer.id, "suspended", viewCustomer.plan);
                      setViewCustomer(null);
                    }}
                    className="w-full rounded-xl bg-amber-500/12 py-3 text-sm font-bold text-amber-300 transition-colors hover:bg-amber-500/20"
                  >
                    إيقاف العضوية
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      void updateStatus(viewCustomer.id, "active", viewCustomer.plan);
                      setViewCustomer(null);
                    }}
                    className="w-full rounded-xl bg-emerald-500/12 py-3 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
                  >
                    تفعيل العضوية
                  </button>
                )}
              </>
            )}
          </div>
        </Modal>
      )}

      {editCustomer && (
        <Modal title={"id" in editCustomer ? "تعديل بيانات العميل" : "إضافة عميل جديد"} onClose={() => setEditCustomer(null)}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل">
                <input
                  value={editCustomer.name}
                  onChange={(event) => setEditCustomer({ ...editCustomer, name: event.target.value })}
                  className={INPUT}
                />
              </Field>
              <Field label="رقم الهاتف">
                <input
                  value={editCustomer.phone}
                  onChange={(event) => setEditCustomer({ ...editCustomer, phone: event.target.value })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
            </div>

            <Field label="البريد الإلكتروني">
              <input
                type="email"
                value={editCustomer.email}
                onChange={(event) => setEditCustomer({ ...editCustomer, email: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field label={"id" in editCustomer ? "كلمة المرور الجديدة (اتركها فارغة للإبقاء على الحالية)" : "كلمة المرور (اتركها فارغة لاستخدام FitZone123! كافتراضي)"}>
              <input
                type="password"
                value={"password" in editCustomer ? (editCustomer.password ?? "") : ""}
                onChange={(event) => setEditCustomer({ ...editCustomer, password: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            {/* Trainer referral link — only shown for new customers created by a trainer */}
            {userRole === "trainer" && !("id" in editCustomer) && (
              <Field label="ربط لينك الإحالة (اختياري — لتلقي عمولة عند اشتراك العميل)">
                {trainerLinks.length === 0 ? (
                  <div className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-400">
                    لا توجد لينكات إحالة نشطة — أنشئ واحدًا من قسم الإعدادات أولاً
                  </div>
                ) : (
                  <select
                    value={"trainerRefToken" in editCustomer ? (editCustomer.trainerRefToken ?? "") : ""}
                    onChange={(event) => setEditCustomer({ ...editCustomer, trainerRefToken: event.target.value })}
                    className={INPUT}
                  >
                    <option value="">بدون ربط لينك إحالة</option>
                    {trainerLinks.map((l) => (
                      <option key={l.id} value={l.token}>
                        {l.label ? `${l.label} — ${l.token}` : l.token}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="الباقة">
                <select
                  value={editCustomer.plan}
                  onChange={(event) => setEditCustomer({ ...editCustomer, plan: event.target.value })}
                  className={INPUT}
                >
                  <option value="أساسي">أساسي</option>
                  <option value="بلاتيني">بلاتيني</option>
                  <option value="VIP">VIP</option>
                  <option value="سنوي VIP">سنوي VIP</option>
                </select>
              </Field>
              <Field label="الحالة">
                <select
                  value={editCustomer.status}
                  onChange={(event) =>
                    setEditCustomer({ ...editCustomer, status: event.target.value as Customer["status"] })
                  }
                  className={INPUT}
                >
                  <option value="active">نشط</option>
                  <option value="suspended">موقوف</option>
                  <option value="pending_payment" disabled>قيد الدفع — تلقائي</option>
                  <option value="cancelled" disabled>ملغي — تلقائي</option>
                  <option value="expired" disabled>منتهي — تلقائي</option>
                  <option value="unsubscribed" disabled>غير مشترك — تلقائي</option>
                </select>
              </Field>
              {/* Points & balance: only editable for NEW customers here.
                  For existing customers, use the dedicated wallet/points editor
                  (the ✏️ button in the customer view) to avoid accidentally
                  overwriting earned points with stale form data. */}
              {!("id" in editCustomer) && (
                <>
                  <Field label="الفيتزونات الابتدائية">
                    <input
                      type="number"
                      value={editCustomer.points}
                      onChange={(event) => setEditCustomer({ ...editCustomer, points: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                  <Field label="الرصيد الابتدائي">
                    <input
                      type="number"
                      value={editCustomer.balance}
                      onChange={(event) => setEditCustomer({ ...editCustomer, balance: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                </>
              )}
            </div>

            <button
              onClick={() => void saveCustomer()}
              disabled={saving}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جارٍ حفظ البيانات..." : "حفظ بيانات العميل"}
            </button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal title="تأكيد الحذف" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-5 text-center">
            <div className="text-5xl">⚠️</div>
            <div>
              <div className="text-lg font-black text-[#fff4f8]">هل تريد حذف هذا العميل؟</div>
              <p className="mt-2 text-sm leading-7 text-[#d7aabd]">
                سيتم حذف <span className="font-bold text-rose-300">{confirmDelete.name}</span> من قاعدة البيانات، ولا يمكن
                التراجع عن هذه الخطوة.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-xl bg-white/5 py-3 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
              >
                إلغاء
              </button>
              <button
                onClick={() => void deleteCustomer(confirmDelete.id)}
                className="rounded-xl bg-rose-500 py-3 text-sm font-black text-white transition-colors hover:bg-rose-400"
              >
                نعم، احذف العميل
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AdminSectionShell>
  );
}
