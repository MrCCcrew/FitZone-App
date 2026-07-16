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
  expired: {
    label: "منتهي",
    badgeClass: "bg-rose-500/15 text-rose-300",
    dotClass: "bg-rose-400",
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
};

type NewCustomer = Omit<Customer, "id"> & { password?: string; trainerRefToken?: string };

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
                    <td>${formatPaymentMethod(membership.paymentMethod)}</td>
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
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<(Customer & { password?: string }) | NewCustomer | null>(null);
  const [wpEdit, setWpEdit] = useState<{ userId: string; balance: number; points: number } | null>(null);
  const [savingWP, setSavingWP] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [trainerLinks, setTrainerLinks] = useState<{ id: string; token: string; label: string | null }[]>([]);
  const [surveyResponses, setSurveyResponses] = useState<HealthSurveyResponse[]>([]);
  const [surveyLoading, setSurveyLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/customers", { cache: "no-store" });
      const payload = await response.json();
      if (payload && typeof payload === "object" && "customers" in payload) {
        setCustomers(Array.isArray(payload.customers) ? payload.customers : []);
        if (payload.userRole) setUserRole(payload.userRole);
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

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      const text = `${customer.name} ${customer.phone} ${customer.email}`.toLowerCase();
      const matchesSearch = !search.trim() || text.includes(search.toLowerCase());
      const matchesPlan = planFilter === "الكل" || customer.plan === planFilter;
      const matchesStatus = statusFilter === "الكل" || customer.status === statusFilter;
      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [customers, planFilter, search, statusFilter]);

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

  const exportCsv = () => {
    const csv = buildCsv(filteredCustomers);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `customers-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
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
            onClick={exportCsv}
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
            <option value="expired">منتهي</option>
          </select>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-right text-xs text-[#d7aabd]">
                  {[
                    "العميل",
                    "الهاتف",
                    "الباقة",
                    "الحالة",
                    "تاريخ الانضمام",
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
                      <td className="px-5 py-4 text-[#d7aabd]">{customer.joinDate}</td>
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
        )}
      </AdminCard>

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

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#ffd166]">{membership.sessionsTotal ?? "غير محدود"}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">الحصص المتاحة</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#8bc5ff]">{membership.sessionsUsed}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">الحصص المستخدمة</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.sessionsRemaining ?? "—"}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">المتبقي</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{membership.paymentAmount.toLocaleString("ar-EG")} ج.م</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">قيمة الدفع</div>
                        </div>
                        <div className="rounded-xl bg-black/30 px-3 py-2 text-center">
                          <div className="text-sm font-bold text-[#fff4f8]">{formatPaymentMethod(membership.paymentMethod)}</div>
                          <div className="mt-1 text-[11px] text-[#d7aabd]">طريقة الدفع</div>
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
                  <option value="expired">منتهي</option>
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
