"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trainer } from "../types";
import { TranslateButton } from "./TranslateButton";

type Application = {
  id: string;
  type: "private" | "mini_private";
  status: string;
  trainerPrice: number | null;
  trainerNote: string | null;
  sessionsCount: number | null;
  durationDays: number | null;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  goals: string[];
  injuries: string | null;
  notes: string | null;
  formData: Record<string, unknown> | null;
  user: { id: string; name: string | null; email: string | null; phone: string | null; avatar: string | null };
  trainer: { id: string; name: string; specialty: string };
};

// ── Private session form labels ────────────────────────────────────────────────
const SECTION_LABELS: Record<string, string> = {
  basicInfo: "المعلومات الأساسية",
  goals: "الأهداف",
  medical: "الحالة الصحية",
  injuries: "الإصابات والعمليات",
  sportsExperience: "الخبرة الرياضية",
  lifestyle: "نمط الحياة",
  nutrition: "التغذية",
  currentActivity: "النشاط الحالي",
  womensHealth: "الصحة النسائية",
  commitment: "الالتزام",
  notes: "ملاحظات إضافية",
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  basicInfo: { fullName: "الاسم الكامل", age: "العمر", height: "الطول (سم)", weight: "الوزن (كجم)", phone: "رقم الهاتف", jobType: "طبيعة العمل" },
  medical: { conditions: "الحالات الطبية", takesMeds: "تتناول أدوية", medsDetail: "تفاصيل الأدوية" },
  injuries: { hasInjuries: "لديها إصابات", detail: "تفاصيل الإصابات", hasSurgeries: "أجرت عمليات", surgeryDetail: "تفاصيل العمليات" },
  lifestyle: { sleepHours: "ساعات النوم", sleepQuality: "جودة النوم", stressLevel: "مستوى الضغط", waterLiters: "شرب الماء (لتر)" },
  nutrition: { mealsCount: "عدد الوجبات", followsDiet: "تتبع نظام غذائي", foodAllergies: "حساسية الطعام", supplements: "المكملات الغذائية" },
  currentActivity: { trainingDays: "أيام التمرين أسبوعياً", trainingType: "نوع التمرين", trainingDuration: "مدة التمرين" },
  womensHealth: { pregnant: "حامل", gaveBirth: "أنجبت", lastBirth: "آخر ولادة", hasHormonalIssues: "مشاكل هرمونية", hormonalIssuesDetail: "تفاصيل المشاكل الهرمونية" },
  commitment: { goalTimeline: "المدة المستهدفة", commitDays: "أيام الالتزام أسبوعياً", dietReady: "مستعدة لنظام غذائي" },
};

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "نعم" : "لا";
  if (Array.isArray(val)) return (val as unknown[]).map(String).join("، ") || "—";
  return String(val);
}

function PrivateSessionFormDetails({ formData }: { formData: Record<string, unknown> }) {
  return (
    <div className="mt-4 space-y-4 rounded-xl border border-gray-700 bg-black/20 p-4">
      {Object.entries(formData).map(([section, value]) => {
        const label = SECTION_LABELS[section] ?? section;

        if (section === "notes" || section === "sportsExperience") {
          const text = fmtVal(value);
          if (text === "—") return null;
          return (
            <div key={section}>
              <p className="text-[11px] font-bold text-pink-400 mb-0.5">{label}</p>
              <p className="text-xs text-gray-300">{text}</p>
            </div>
          );
        }

        if (section === "goals") {
          const text = fmtVal(value);
          return (
            <div key={section}>
              <p className="text-[11px] font-bold text-pink-400 mb-0.5">{label}</p>
              <p className="text-xs text-gray-300">{text}</p>
            </div>
          );
        }

        if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const fieldMap = FIELD_LABELS[section] ?? {};
          const rows = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== "" && v !== null && v !== undefined);
          if (rows.length === 0) return null;
          return (
            <div key={section}>
              <p className="text-[11px] font-bold text-pink-400 mb-1">{label}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                {rows.map(([field, fieldVal]) => (
                  <div key={field} className="flex gap-1.5 text-xs">
                    <span className="text-gray-500 shrink-0">{fieldMap[field] ?? field}:</span>
                    <span className="text-gray-300 font-medium">{fmtVal(fieldVal)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

type Member = { id: string; name: string | null; email: string | null };
type DiscountCode = {
  id: string; code: string; trainerName: string; trainerId: string;
  clientName: string | null; clientEmail: string | null; clientId: string;
  discountType: string; discountValue: number; maxDiscount: number | null;
  note: string | null; isUsed: boolean; usedAt: string | null; createdAt: string;
};

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-pink-500";

type EditableTrainer = Omit<Trainer, "id" | "classesCount"> & { id?: string };
type TrainerAccountOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const EMPTY_TRAINER: EditableTrainer = {
  name: "",
  nameEn: "",
  specialty: "",
  specialtyEn: "",
  bio: "",
  bioEn: "",
  certifications: [],
  certificationsEn: [],
  certificateFiles: [],
  rating: 5,
  sessionsCount: 0,
  image: "",
  userId: null,
  linkedUser: null,
  active: true,
  showOnHome: true,
  sortOrder: 0,
  canSendGifts: false,
  giftMonthlyLimit: 4,
};

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldHint({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-1 text-xs leading-6 text-gray-400">{hint}</div>
      </div>
      {children}
    </label>
  );
}

export default function Trainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [trainerAccounts, setTrainerAccounts] = useState<TrainerAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<EditableTrainer | null>(null);
  const [linkedUserDiscount, setLinkedUserDiscount] = useState<{ discountType: string; discountValue: number; maxDiscount: number | null } | null>(null);
  const [activeTab, setActiveTab] = useState<"trainers" | "applications" | "discounts">("trainers");

  // Applications
  const [applications, setApplications] = useState<Application[]>([]);
  const [appStatusFilter, setAppStatusFilter] = useState("all");
  const [appLoading, setAppLoading] = useState(false);
  const [approveModal, setApproveModal] = useState<Application | null>(null);
  const [rejectModal, setRejectModal] = useState<Application | null>(null);
  const [approvePrice, setApprovePrice] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [approveSessionsCount, setApproveSessionsCount] = useState("");
  const [approveDurationDays, setApproveDurationDays] = useState("");
  const [approveSlots, setApproveSlots] = useState<string[]>([]);
  const [approveSlotInput, setApproveSlotInput] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  // Discount codes
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountModal, setDiscountModal] = useState<Trainer | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [dcTargetUser, setDcTargetUser] = useState("");
  const [dcType, setDcType] = useState("percentage");
  const [dcValue, setDcValue] = useState("");
  const [dcMax, setDcMax] = useState("");
  const [dcNote, setDcNote] = useState("");
  const [dcSaving, setDcSaving] = useState(false);
  const [dcError, setDcError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [trainersResponse, employeesResponse] = await Promise.all([
        fetch("/api/admin/trainers", { cache: "no-store" }),
        fetch("/api/admin/settings/staff", { cache: "no-store" }),
      ]);
      const trainersPayload = await trainersResponse.json().catch(() => []);
      const employeesPayload = await employeesResponse.json().catch(() => ({ employees: [] }));
      setTrainers(Array.isArray(trainersPayload) ? trainersPayload : []);
      setTrainerAccounts(
        Array.isArray(employeesPayload.employees)
          ? employeesPayload.employees.filter(
              (employee: { id?: string; name?: string; email?: string; role?: string }) =>
                employee.role === "trainer" && employee.id && employee.email,
            )
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadApplications = useCallback(async () => {
    setAppLoading(true);
    try {
      const res = await fetch(`/api/admin/private-sessions?status=${appStatusFilter}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({ applications: [] }));
      setApplications(Array.isArray(data.applications) ? data.applications : []);
    } finally {
      setAppLoading(false);
    }
  }, [appStatusFilter]);

  const loadDiscounts = useCallback(async () => {
    setDiscountLoading(true);
    try {
      const res = await fetch("/api/admin/trainer-discount-codes", { cache: "no-store" });
      const data = await res.json().catch(() => ({ codes: [] }));
      setDiscountCodes(Array.isArray(data.codes) ? data.codes : []);
    } finally {
      setDiscountLoading(false);
    }
  }, []);

  const loadMembers = useCallback(async () => {
    const res = await fetch("/api/admin/customers", { cache: "no-store" });
    const data = (await res.json().catch(() => [])) as Array<{ id: string; name: string; email: string }>;
    setMembers(Array.isArray(data) ? data.map((m) => ({ id: m.id, name: m.name, email: m.email })) : []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeTab === "applications") void loadApplications();
    if (activeTab === "discounts") void loadDiscounts();
  }, [activeTab, loadApplications, loadDiscounts]);

  const handleApprove = async () => {
    if (!approveModal || !approvePrice || Number(approvePrice) <= 0) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/private-sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: approveModal.id,
          action: "approve",
          trainerPrice: Number(approvePrice),
          trainerNote: approveNote,
          sessionsCount: approveSessionsCount ? Number(approveSessionsCount) : null,
          durationDays: approveDurationDays ? Number(approveDurationDays) : null,
          trainerSlots: approveSlots,
        }),
      });
      if (res.ok) {
        setApproveModal(null); setApprovePrice(""); setApproveNote("");
        setApproveSessionsCount(""); setApproveDurationDays("");
        setApproveSlots([]); setApproveSlotInput("");
        void loadApplications();
      }
      else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setActionLoading(false); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/private-sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: rejectModal.id, action: "reject", trainerNote: rejectNote }),
      });
      if (res.ok) { setRejectModal(null); setRejectNote(""); void loadApplications(); }
      else { const d = await res.json().catch(() => ({})); window.alert((d as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setActionLoading(false); }
  };

  const handleCreateDiscount = async () => {
    if (!discountModal || !dcTargetUser || !dcValue) return;
    setDcSaving(true); setDcError("");
    try {
      const res = await fetch("/api/admin/trainer-discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId: discountModal.id, targetUserId: dcTargetUser, discountType: dcType, discountValue: Number(dcValue), maxDiscount: dcMax ? Number(dcMax) : undefined, note: dcNote }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        window.alert(`✅ تم إنشاء الكود: ${(data as { code?: string }).code}`);
        setDiscountModal(null); setDcTargetUser(""); setDcValue(""); setDcMax(""); setDcNote(""); setDcType("percentage");
        void loadDiscounts();
      } else { setDcError((data as { error?: string }).error ?? "حدث خطأ."); }
    } finally { setDcSaving(false); }
  };

  const filtered = useMemo(() => {
    const query = search.trim();
    if (!query) return trainers;

    return trainers.filter(
      (trainer) =>
        trainer.name.includes(query) ||
        (trainer.nameEn ?? "").includes(query) ||
        trainer.specialty.includes(query) ||
        (trainer.specialtyEn ?? "").includes(query) ||
        (trainer.bio ?? "").includes(query),
    );
  }, [search, trainers]);

  const linkedUserOptions = useMemo(() => {
    const currentUserId = modal?.userId ?? null;
    const takenUserIds = new Set(
      trainers
        .map((trainer) => trainer.userId)
        .filter((userId): userId is string => Boolean(userId) && userId !== currentUserId),
    );

    return trainerAccounts.filter((account) => !takenUserIds.has(account.id));
  }, [modal?.userId, trainerAccounts, trainers]);

  const saveTrainer = async () => {
    if (!modal) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/trainers", {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.alert(payload.error ?? "تعذر حفظ بيانات المدربة الآن.");
        return;
      }

      // Save discount config to linked user account
      if (modal.linkedUser?.id && linkedUserDiscount) {
        await fetch("/api/admin/settings/staff", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: modal.linkedUser.id,
            discountType: linkedUserDiscount.discountType,
            discountValue: linkedUserDiscount.discountValue,
            maxDiscount: linkedUserDiscount.maxDiscount,
          }),
        });
      }

      await load();
      setModal(null);
      setLinkedUserDiscount(null);
      setUploadError(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (trainer: Trainer) => {
    await fetch("/api/admin/trainers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trainer.id, active: !trainer.active }),
    });
    await load();
  };

  const toggleHome = async (trainer: Trainer) => {
    await fetch("/api/admin/trainers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trainer.id, showOnHome: !trainer.showOnHome }),
    });
    await load();
  };

  const removeTrainer = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذه المدربة؟")) return;

    await fetch("/api/admin/trainers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "trainers");

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "تعذر رفع صورة المدربة الآن.");
      }

      setModal((current) => (current ? { ...current, image: payload.url } : current));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع صورة المدربة الآن.");
    } finally {
      setUploading(false);
    }
  };

  const uploadCertificate = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "trainers");

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "تعذر رفع صورة الشهادة الآن.");
      }

      const label =
        typeof payload.fileName === "string"
          ? payload.fileName.replace(/\.[^.]+$/, "")
          : file.name.replace(/\.[^.]+$/, "");

      setModal((current) =>
        current
          ? {
              ...current,
              certificateFiles: [...(current.certificateFiles ?? []), { url: payload.url as string, label }],
            }
          : current,
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع صورة الشهادة الآن.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-gray-500">جارٍ تحميل بيانات المدربات...</div>;
  }

  const activeCount = trainers.filter((trainer) => trainer.active).length;
  const visibleOnHomeCount = trainers.filter((trainer) => trainer.showOnHome && trainer.active).length;
  const totalClasses = trainers.reduce((sum, trainer) => sum + trainer.classesCount, 0);
  const totalSessions = trainers.reduce((sum, trainer) => sum + trainer.sessionsCount, 0);

  const STATUS_LABELS: Record<string, string> = {
    pending: "قيد الانتظار", approved: "موافق عليه", rejected: "مرفوض",
    paid: "مدفوع", cancelled: "ملغي",
  };
  const STATUS_COLORS: Record<string, string> = {
    pending: "text-yellow-300 bg-yellow-900/30",
    approved: "text-emerald-300 bg-emerald-900/30",
    rejected: "text-red-300 bg-red-900/30",
    paid: "text-sky-300 bg-sky-900/30",
    cancelled: "text-gray-400 bg-gray-800",
  };

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-2 border-b border-gray-800 pb-1">
        {([["trainers","المدربات"],["applications","طلبات البرايفيت"],["discounts","أكواد خصم المدربات"]] as const).map(([key,label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`rounded-t-lg px-4 py-2 text-sm font-bold transition-colors ${activeTab === key ? "bg-pink-600 text-white" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Applications Tab ── */}
      {activeTab === "applications" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-black text-white">طلبات البرايفيت والميني برايفيت</h3>
            <div className="flex gap-2">
              {["all","pending","approved","rejected","paid"].map((s) => (
                <button key={s} onClick={() => setAppStatusFilter(s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${appStatusFilter === s ? "bg-pink-600 text-white" : "bg-gray-800 text-gray-400"}`}>
                  {s === "all" ? "الكل" : STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            <button onClick={() => void loadApplications()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-300">🔄 تحديث</button>
          </div>

          {appLoading ? (
            <div className="py-10 text-center text-sm text-gray-500">جارٍ التحميل...</div>
          ) : applications.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">لا توجد طلبات{appStatusFilter !== "all" ? ` بحالة "${STATUS_LABELS[appStatusFilter] ?? appStatusFilter}"` : ""}</div>
          ) : (
            <div className="space-y-3">
              {applications.map((app) => (
                <div key={app.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-white">{app.user.name ?? "—"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${app.type === "private" ? "bg-pink-900/40 text-pink-300" : "bg-purple-900/40 text-purple-300"}`}>
                          {app.type === "private" ? "برايفيت" : "ميني برايفيت"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_COLORS[app.status] ?? "text-gray-400"}`}>
                          {STATUS_LABELS[app.status] ?? app.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">مع: <span className="text-pink-300">{app.trainer.name}</span> · {app.user.email} · {app.user.phone ?? "—"}</div>
                      <div className="text-xs text-gray-500">{new Date(app.createdAt).toLocaleDateString("ar-EG", { year:"numeric", month:"long", day:"numeric" })}</div>
                      {app.goals.length > 0 && <div className="text-xs text-gray-400">الأهداف: {app.goals.join("، ")}</div>}
                      {app.trainerPrice && <div className="text-xs font-bold text-emerald-300">السعر المحدد: {app.trainerPrice} ج.م</div>}
                      {(app.sessionsCount || app.durationDays) && (
                        <div className="text-xs text-blue-300">
                          {app.sessionsCount ? `${app.sessionsCount} حصة` : ""}
                          {app.sessionsCount && app.durationDays ? " · " : ""}
                          {app.durationDays ? `${app.durationDays} يوم` : ""}
                          {app.expiresAt ? ` · تنتهي ${new Date(app.expiresAt).toLocaleDateString("ar-EG")}` : ""}
                        </div>
                      )}
                      {app.trainerNote && <div className="text-xs text-gray-400">ملاحظة: {app.trainerNote}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setExpandedApp(expandedApp === app.id ? null : app.id)}
                        className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-300">
                        {expandedApp === app.id ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                      </button>
                      {app.status === "pending" && (
                        <>
                          <button onClick={() => { setApproveModal(app); setApprovePrice(""); setApproveNote(""); }}
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white">✓ موافقة</button>
                          <button onClick={() => { setRejectModal(app); setRejectNote(""); }}
                            className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-bold text-red-300">✕ رفض</button>
                        </>
                      )}
                    </div>
                  </div>
                  {expandedApp === app.id && app.formData && (
                    <PrivateSessionFormDetails formData={app.formData} />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Discounts Tab ── */}
      {activeTab === "discounts" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">أكواد خصم المدربات للعملاء المميزين</h3>
            <button onClick={() => void loadDiscounts()} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-300">🔄 تحديث</button>
          </div>
          {discountLoading ? (
            <div className="py-10 text-center text-sm text-gray-500">جارٍ التحميل...</div>
          ) : discountCodes.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">لا توجد أكواد خصم حتى الآن</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-800 text-right text-xs text-gray-500">
                  <th className="pb-2 pr-2">الكود</th><th className="pb-2">المدربة</th><th className="pb-2">العميل</th>
                  <th className="pb-2">الخصم</th><th className="pb-2">الحالة</th><th className="pb-2">التاريخ</th><th className="pb-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-800">
                  {discountCodes.map((c) => (
                    <tr key={c.id} className="text-xs">
                      <td className="py-2 pr-2 font-mono font-bold text-pink-300">{c.code}</td>
                      <td className="py-2 text-white">{c.trainerName}</td>
                      <td className="py-2 text-gray-300">{c.clientName ?? "—"}<br /><span className="text-gray-500">{c.clientEmail}</span></td>
                      <td className="py-2 font-bold text-emerald-300">{c.discountType === "percentage" ? `${c.discountValue}%` : `${c.discountValue} ج.م`}{c.maxDiscount ? ` (حد أقصى ${c.maxDiscount})` : ""}</td>
                      <td className="py-2"><span className={`rounded-full px-2 py-0.5 font-bold ${c.isUsed ? "bg-gray-800 text-gray-400" : "bg-emerald-900/30 text-emerald-300"}`}>{c.isUsed ? "مستخدم" : "متاح"}</span></td>
                      <td className="py-2 text-gray-500">{c.createdAt.slice(0,10)}</td>
                      <td className="py-2"><button onClick={async () => { if (!confirm("حذف الكود؟")) return; await fetch(`/api/admin/trainer-discount-codes?id=${c.id}`, { method:"DELETE" }); void loadDiscounts(); }} className="text-red-400 hover:text-red-300">حذف</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Trainers Tab ── */}
      {activeTab === "trainers" && <>
      <section className="grid gap-4 lg:grid-cols-[1.4fr,1fr,1fr,1fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">قسم المدربات</div>
          <div className="mt-2 text-3xl font-black text-white">{trainers.length}</div>
          <div className="mt-3 text-xs leading-6 text-gray-500">
            من هنا تدير بيانات المدربات كاملة: الصورة، التخصص، النبذة، الشهادات، ترتيب الظهور،
            والحالة. أما نصوص صفحة المدربات العامة فستجدها داخل قسم
            <span className="px-1 font-bold text-pink-300">الصفحات والمحتوى → صفحة المدربات</span>.
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">مدربات نشطات</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{activeCount}</div>
          <div className="mt-3 text-xs text-gray-500">المدربات المتاحات حاليًا داخل الموقع ولوحة الإدارة.</div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">ظاهرة في الرئيسية</div>
          <div className="mt-2 text-3xl font-black text-pink-300">{visibleOnHomeCount}</div>
          <div className="mt-3 text-xs text-gray-500">عدد المدربات المعروضات في الصفحة الرئيسية.</div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">تقارير سريعة</div>
          <div className="mt-2 text-sm font-bold text-white">جلسات: {totalSessions}</div>
          <div className="mt-1 text-sm font-bold text-white">كلاسات: {totalClasses}</div>
          <div className="mt-3 text-xs text-gray-500">مؤشرات سريعة لمتابعة حجم عمل فريق المدربات.</div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-black text-white">إدارة المدربات</h3>
            <p className="mt-1 text-xs leading-6 text-gray-500">
              مقاس صورة المدربة الموصى به:
              <span className="px-1 font-bold text-pink-300">1000 × 1250</span>
              بنسبة
              <span className="px-1 font-bold text-pink-300">4:5</span>
              ، بخلفية نظيفة وقص يركز على الوجه والكتفين لتظهر بشكل أنيق في صفحة المدربات والرئيسية.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحثي عن مدربة..."
              className={`${INPUT} min-w-[240px]`}
            />
            <button
              onClick={() => {
                setUploadError(null);
                setLinkedUserDiscount(null);
                setModal({ ...EMPTY_TRAINER, sortOrder: trainers.length });
              }}
              className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white"
            >
              + إضافة مدربة
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((trainer) => (
            <div key={trainer.id} className="rounded-2xl border border-gray-800 bg-black/20 p-4">
              <div className="flex gap-4">
                <div className="h-28 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
                  {trainer.image ? (
                    <img src={trainer.image} alt={trainer.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">👩‍🏫</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black text-white">{trainer.name}</div>
                      <div className="text-xs text-gray-500">{trainer.nameEn || "—"}</div>
                      <div className="text-sm font-semibold text-pink-300">{trainer.specialty}</div>
                      {trainer.specialtyEn ? <div className="text-xs text-gray-500">{trainer.specialtyEn}</div> : null}
                      {trainer.linkedUser ? (
                        <div className="mt-1 text-xs text-emerald-300">
                          {trainer.linkedUser.name || "حساب مدربة"} · {trainer.linkedUser.email}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-amber-300">غير مرتبطة بحساب</div>
                      )}
                    </div>
                    <div className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                      ترتيب {trainer.sortOrder}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.rating.toFixed(1)}</div>
                      <div>التقييم</div>
                    </div>
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.sessionsCount}</div>
                      <div>الجلسات</div>
                    </div>
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.classesCount}</div>
                      <div>الكلاسات</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void toggleStatus(trainer)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${
                        trainer.active ? "bg-emerald-950/40 text-emerald-300" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {trainer.active ? "نشطة" : "مخفية"}
                    </button>
                    <button
                      onClick={() => void toggleHome(trainer)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${
                        trainer.showOnHome ? "bg-pink-600/20 text-pink-200" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {trainer.showOnHome ? "تظهر في الرئيسية" : "لا تظهر في الرئيسية"}
                    </button>
                  </div>
                </div>
              </div>

              {trainer.bio ? <div className="mt-4 text-sm leading-7 text-gray-400">{trainer.bio}</div> : null}

              {trainer.certifications.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {trainer.certifications.map((certification) => (
                    <span
                      key={certification}
                      className="rounded-full border border-pink-500/30 bg-pink-500/10 px-3 py-1 text-xs text-pink-200"
                    >
                      {certification}
                    </span>
                  ))}
                </div>
              ) : null}

              {trainer.certificateFiles && trainer.certificateFiles.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {trainer.certificateFiles.map((file, index) => (
                    <a
                      key={`${file.url}-${index}`}
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200"
                    >
                      {file.label || `شهادة ${index + 1}`}
                    </a>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setUploadError(null);
                    setLinkedUserDiscount(trainer.linkedUser ? {
                      discountType: trainer.linkedUser.discountType,
                      discountValue: trainer.linkedUser.discountValue,
                      maxDiscount: trainer.linkedUser.maxDiscount,
                    } : null);
                    setModal({ ...trainer });
                  }}
                  className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs font-bold text-white"
                >
                  تعديل
                </button>
                <button
                  onClick={() => {
                    setDiscountModal(trainer);
                    setDcTargetUser(""); setDcNote(""); setDcError("");
                    setDcType(trainer.linkedUser?.discountType ?? "percentage");
                    setDcValue(trainer.linkedUser?.discountValue ? String(trainer.linkedUser.discountValue) : "");
                    setDcMax(trainer.linkedUser?.maxDiscount ? String(trainer.linkedUser.maxDiscount) : "");
                    void loadMembers();
                  }}
                  className="rounded-lg bg-purple-900/50 px-3 py-2 text-xs font-bold text-purple-300"
                >
                  🎁 منح خصم
                </button>
                <button
                  onClick={() => void removeTrainer(trainer.id)}
                  className="rounded-lg bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modal ? (
        <Modal title={modal.id ? "تعديل بيانات المدربة" : "إضافة مدربة جديدة"} onClose={() => setModal(null)}>

          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-black/20 p-4 text-xs leading-7 text-gray-400">
              أدخلي البيانات كما ستظهر للعميلة داخل صفحة المدربات والصفحة الرئيسية. يفضل أن تكون
              الصورة شخصية أو نصفية، وأن تكتب الشهادات كل شهادة في سطر مستقل لتظهر بشكل مرتب.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldHint title="ربط الحساب" hint="اختاري حساب المدربة حتى تتمكن من تعديل ملفها من داخل حسابها.">
                <select
                  value={modal.userId ?? ""}
                  onChange={(event) => setModal({ ...modal, userId: event.target.value || null })}
                  className={INPUT}
                >
                  <option value="">بدون ربط حاليًا</option>
                  {linkedUserOptions.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} - {account.email}
                    </option>
                  ))}
                </select>
              </FieldHint>
              <FieldHint title="اسم المدربة" hint="الاسم الظاهر للعميلات داخل صفحة المدربات.">
                <input
                  value={modal.name}
                  onChange={(event) => setModal({ ...modal, name: event.target.value })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="اسم المدربة بالإنجليزية" hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية.">
                <div className="flex gap-2">
                  <input
                    value={modal.nameEn ?? ""}
                    onChange={(event) => setModal({ ...modal, nameEn: event.target.value })}
                    className={`${INPUT} flex-1`}
                    dir="ltr"
                  />
                  <TranslateButton from={modal.name} onTranslated={(t) => setModal({ ...modal, nameEn: t })} />
                </div>
              </FieldHint>

              <FieldHint title="التخصص" hint="مثال: يوجا وتأهيل بدني أو زومبا وكارديو.">
                <input
                  value={modal.specialty}
                  onChange={(event) => setModal({ ...modal, specialty: event.target.value })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="التخصص بالإنجليزية" hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية.">
                <div className="flex gap-2">
                  <input
                    value={modal.specialtyEn ?? ""}
                    onChange={(event) => setModal({ ...modal, specialtyEn: event.target.value })}
                    className={`${INPUT} flex-1`}
                    dir="ltr"
                  />
                  <TranslateButton from={modal.specialty} onTranslated={(t) => setModal({ ...modal, specialtyEn: t })} />
                </div>
              </FieldHint>

              <FieldHint title="التقييم" hint="يظهر على شكل 4.9 أو 5.0 داخل البطاقة.">
                <input
                  type="number"
                  step="0.1"
                  value={modal.rating}
                  onChange={(event) => setModal({ ...modal, rating: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="عدد الجلسات" hint="إحصائية تعريفية تظهر للعميلة داخل صفحة المدربات.">
                <input
                  type="number"
                  value={modal.sessionsCount}
                  onChange={(event) => setModal({ ...modal, sessionsCount: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="ترتيب الظهور" hint="الأقل يظهر أولًا في الصفحة الرئيسية وصفحة المدربات.">
                <input
                  type="number"
                  value={modal.sortOrder}
                  onChange={(event) => setModal({ ...modal, sortOrder: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white">
                  <div className="mb-2 font-bold">الحالة</div>
                  <select
                    value={modal.active ? "active" : "inactive"}
                    onChange={(event) => setModal({ ...modal, active: event.target.value === "active" })}
                    className={INPUT}
                  >
                    <option value="active">نشطة</option>
                    <option value="inactive">مخفية</option>
                  </select>
                </label>

                <label className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white">
                  <div className="mb-2 font-bold">الصفحة الرئيسية</div>
                  <select
                    value={modal.showOnHome ? "show" : "hide"}
                    onChange={(event) => setModal({ ...modal, showOnHome: event.target.value === "show" })}
                    className={INPUT}
                  >
                    <option value="show">تظهر</option>
                    <option value="hide">لا تظهر</option>
                  </select>
                </label>
              </div>
            </div>

            <FieldHint
              title="نبذة عن المدربة"
              hint="من سطرين إلى أربعة أسطر تشرح خبرتها وأسلوبها التدريبي بشكل مختصر."
            >
              <textarea
                value={modal.bio ?? ""}
                onChange={(event) => setModal({ ...modal, bio: event.target.value })}
                rows={4}
                className={`${INPUT} resize-none`}
              />
            </FieldHint>

            <FieldHint
              title="نبذة عن المدربة بالإنجليزية"
              hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية."
            >
              <div className="space-y-1">
                <textarea
                  value={modal.bioEn ?? ""}
                  onChange={(event) => setModal({ ...modal, bioEn: event.target.value })}
                  rows={4}
                  className={`${INPUT} resize-none`}
                  dir="ltr"
                />
                <TranslateButton from={modal.bio ?? ""} onTranslated={(t) => setModal({ ...modal, bioEn: t })} />
              </div>
            </FieldHint>

            <FieldHint
              title="الشهادات والاعتمادات"
              hint="اكتبي كل شهادة في سطر منفصل، وستظهر على شكل شارات داخل صفحة المدربات."
            >
              <textarea
                value={listToText(modal.certifications)}
                onChange={(event) => setModal({ ...modal, certifications: textToList(event.target.value) })}
                rows={4}
                className={`${INPUT} resize-none`}
              />
            </FieldHint>

            <FieldHint
              title="الشهادات والاعتمادات بالإنجليزية"
              hint="اكتب كل شهادة في سطر منفصل لتظهر عند اختيار اللغة الإنجليزية."
            >
              <div className="space-y-1">
                <textarea
                  value={listToText(modal.certificationsEn ?? [])}
                  onChange={(event) => setModal({ ...modal, certificationsEn: textToList(event.target.value) })}
                  rows={4}
                  className={`${INPUT} resize-none`}
                  dir="ltr"
                />
                <TranslateButton
                  from={listToText(modal.certifications)}
                  onTranslated={(t) => setModal({ ...modal, certificationsEn: textToList(t) })}
                />
              </div>
            </FieldHint>

            <div className="space-y-3">
              <FieldHint
                title="صورة المدربة"
                hint="المقاس الأفضل: 1000 × 1250 بنسبة 4:5، وقص رأسي يركز على الوجه والكتفين."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }}
                  className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
              </FieldHint>

              <FieldHint
                title="أو رابط الصورة"
                hint="إذا كانت الصورة مرفوعة مسبقًا، ضعي الرابط المباشر هنا."
              >
                <input
                  value={modal.image ?? ""}
                  onChange={(event) => setModal({ ...modal, image: event.target.value })}
                  placeholder="https://example.com/trainer.jpg"
                  className={INPUT}
                  dir="ltr"
                />
              </FieldHint>

              {uploading ? <div className="text-xs text-yellow-400">جارٍ رفع صورة المدربة...</div> : null}
              {uploadError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-200">
                  {uploadError}
                </div>
              ) : null}

              {modal.image ? (
                <div className="max-w-[220px] overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
                  <img src={modal.image} alt={modal.name || "trainer-preview"} className="h-[280px] w-full object-cover" />
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              <FieldHint
                title="صور الشهادات"
                hint="ارفعي صور الشهادات واحدة تلو الأخرى، ويمكن تعديل اسم كل شهادة بعد الرفع."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadCertificate(file);
                    event.currentTarget.value = "";
                  }}
                  className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
              </FieldHint>

              {modal.certificateFiles && modal.certificateFiles.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {modal.certificateFiles.map((file, index) => (
                    <div key={`${file.url}-${index}`} className="rounded-2xl border border-gray-700 bg-gray-800/60 p-3">
                      <div className="mb-3 overflow-hidden rounded-xl border border-gray-700 bg-black/20">
                        <img src={file.url} alt={file.label || `certificate-${index + 1}`} className="h-40 w-full object-cover" />
                      </div>
                      <input
                        value={file.label}
                        onChange={(event) =>
                          setModal({
                            ...modal,
                            certificateFiles: (modal.certificateFiles ?? []).map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, label: event.target.value } : entry,
                            ),
                          })
                        }
                        placeholder={`شهادة ${index + 1}`}
                        className={INPUT}
                      />
                      <div className="mt-3 flex justify-between gap-2">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-200"
                        >
                          فتح الصورة
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              ...modal,
                              certificateFiles: (modal.certificateFiles ?? []).filter((_, entryIndex) => entryIndex !== index),
                            })
                          }
                          className="rounded-lg bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300"
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 space-y-3">
              <div className="text-sm font-black text-amber-300">صلاحيات الكلاسات الهدية</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white">
                  <div className="mb-2 font-bold">إرسال كلاسات هدية</div>
                  <select
                    value={modal.canSendGifts ? "yes" : "no"}
                    onChange={(event) => setModal({ ...modal, canSendGifts: event.target.value === "yes" })}
                    className={INPUT}
                  >
                    <option value="no">غير مسموح</option>
                    <option value="yes">مسموح</option>
                  </select>
                </label>

                {modal.canSendGifts && (
                  <FieldHint title="الحد الشهري للهدايا" hint="أقصى عدد كلاسات هدية يمكن للمدربة إرسالها شهريًا.">
                    <input
                      type="number"
                      min={0}
                      value={modal.giftMonthlyLimit}
                      onChange={(event) => setModal({ ...modal, giftMonthlyLimit: Math.max(0, Number(event.target.value) || 0) })}
                      className={INPUT}
                    />
                  </FieldHint>
                )}
              </div>
            </div>

            {modal?.linkedUser && linkedUserDiscount && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 space-y-3">
                <div className="text-sm font-black text-emerald-300">إعداد خصم أكواد المدربة</div>
                <p className="text-xs text-gray-400">القيمة التي تستخدمها المدربة عند إنشاء أكواد خصم لعملائها — لا تستطيع المدربة تغييرها.</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">نوع الخصم</label>
                    <select
                      value={linkedUserDiscount.discountType}
                      onChange={(e) => setLinkedUserDiscount({ ...linkedUserDiscount, discountType: e.target.value })}
                      className={INPUT}
                    >
                      <option value="percentage">نسبة مئوية %</option>
                      <option value="fixed">مبلغ ثابت ج.م</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">
                      {linkedUserDiscount.discountType === "fixed" ? "مبلغ الخصم ج.م" : "نسبة الخصم %"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={linkedUserDiscount.discountType === "percentage" ? 1 : 10}
                      value={linkedUserDiscount.discountValue}
                      onChange={(e) => setLinkedUserDiscount({ ...linkedUserDiscount, discountValue: Number(e.target.value) })}
                      className={INPUT}
                    />
                  </div>
                  {linkedUserDiscount.discountType === "percentage" && (
                    <div className="space-y-1">
                      <label className="text-xs text-gray-400">الحد الأقصى للخصم ج.م (اختياري)</label>
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={linkedUserDiscount.maxDiscount ?? ""}
                        placeholder="بدون حد أقصى"
                        onChange={(e) => setLinkedUserDiscount({ ...linkedUserDiscount, maxDiscount: e.target.value === "" ? null : Number(e.target.value) })}
                        className={INPUT}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => void saveTrainer()}
              disabled={saving || uploading}
              className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50"
            >
              {saving ? "جارٍ حفظ بيانات المدربة..." : "حفظ بيانات المدربة"}
            </button>
          </div>
        </Modal>
      ) : null}
      </> }

      {/* ── Approve Modal ── */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => { setApproveModal(null); setApproveSessionsCount(""); setApproveDurationDays(""); setApproveSlots([]); setApproveSlotInput(""); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">✅ الموافقة على الطلب</h3>
            <div className="text-sm text-gray-400">
              العميل: <span className="text-white">{approveModal.user.name}</span> — {approveModal.type === "private" ? "برايفيت" : "ميني برايفيت"} مع <span className="text-pink-300">{approveModal.trainer.name}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">السعر (ج.م) *</label>
              <input type="number" value={approvePrice} onChange={(e) => setApprovePrice(e.target.value)} className={INPUT} placeholder="مثال: 800" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">عدد الحصص (اختياري)</label>
                <input type="number" value={approveSessionsCount} onChange={(e) => setApproveSessionsCount(e.target.value)} className={INPUT} placeholder="مثال: 12" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">المدة بالأيام (اختياري)</label>
                <input type="number" value={approveDurationDays} onChange={(e) => setApproveDurationDays(e.target.value)} className={INPUT} placeholder="مثال: 30" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">المواعيد المتاحة (اختياري)</label>
              <p className="text-xs text-gray-500 mb-2">أضف المواعيد التي تناسبك — العميل سيختار منها قبل الدفع</p>
              <div className="flex gap-2 mb-2">
                <input
                  value={approveSlotInput}
                  onChange={(e) => setApproveSlotInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = approveSlotInput.trim();
                      if (v && !approveSlots.includes(v)) { setApproveSlots([...approveSlots, v]); setApproveSlotInput(""); }
                    }
                  }}
                  className={INPUT}
                  placeholder="مثال: الأحد الساعة 10 صباحاً"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = approveSlotInput.trim();
                    if (v && !approveSlots.includes(v)) { setApproveSlots([...approveSlots, v]); setApproveSlotInput(""); }
                  }}
                  className="rounded-xl bg-gray-700 px-3 py-2 text-sm font-bold text-white hover:bg-gray-600"
                >+</button>
              </div>
              {approveSlots.length > 0 && (
                <div className="space-y-1">
                  {approveSlots.map((slot) => (
                    <div key={slot} className="flex items-center justify-between rounded-lg bg-gray-800 px-3 py-2 text-sm text-white">
                      <span>{slot}</span>
                      <button type="button" onClick={() => setApproveSlots(approveSlots.filter((s) => s !== slot))} className="text-gray-400 hover:text-red-400">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">ملاحظة للعميل (اختياري)</label>
              <textarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)} rows={2} className={`${INPUT} resize-none`} placeholder="مثال: موعد البداية الأحد القادم..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleApprove()} disabled={actionLoading || !approvePrice}
                className="flex-1 rounded-xl bg-emerald-700 py-2.5 font-black text-white disabled:opacity-50">
                {actionLoading ? "جارٍ..." : "تأكيد الموافقة"}
              </button>
              <button onClick={() => { setApproveModal(null); setApproveSessionsCount(""); setApproveDurationDays(""); setApproveSlots([]); setApproveSlotInput(""); }} className="rounded-xl bg-gray-800 px-4 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ── */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setRejectModal(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">✕ رفض الطلب</h3>
            <div className="text-sm text-gray-400">
              العميل: <span className="text-white">{rejectModal.user.name}</span> — {rejectModal.type === "private" ? "برايفيت" : "ميني برايفيت"} مع <span className="text-pink-300">{rejectModal.trainer.name}</span>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">سبب الرفض (اختياري)</label>
              <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} className={`${INPUT} resize-none`} placeholder="اكتب سبب الرفض للعميل..." />
            </div>
            <div className="flex gap-2">
              <button onClick={() => void handleReject()} disabled={actionLoading}
                className="flex-1 rounded-xl bg-red-700 py-2.5 font-black text-white disabled:opacity-50">
                {actionLoading ? "جارٍ..." : "تأكيد الرفض"}
              </button>
              <button onClick={() => setRejectModal(null)} className="rounded-xl bg-gray-800 px-4 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Discount Modal ── */}
      {discountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setDiscountModal(null)}>
          <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-white">🎁 منح خصم — {discountModal.name}</h3>
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">العميل *</label>
              <select value={dcTargetUser} onChange={(e) => setDcTargetUser(e.target.value)} className={INPUT}>
                <option value="">اختر العميل...</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name ?? "—"} — {m.email}</option>
                ))}
              </select>
            </div>
            {discountModal.linkedUser && discountModal.linkedUser.discountValue > 0 ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3 space-y-2">
                <div className="text-xs font-bold text-gray-400">قيم الخصم المعتمدة للمدربة (غير قابلة للتعديل)</div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-bold text-emerald-300">
                    {discountModal.linkedUser.discountType === "percentage" ? "نسبة مئوية %" : "مبلغ ثابت ج.م"}
                  </span>
                  <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-xs font-bold text-emerald-300">
                    {discountModal.linkedUser.discountType === "percentage"
                      ? `${discountModal.linkedUser.discountValue}%`
                      : `${discountModal.linkedUser.discountValue} ج.م`}
                  </span>
                  {discountModal.linkedUser.maxDiscount && (
                    <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-400">
                      حد أقصى: {discountModal.linkedUser.maxDiscount} ج.م
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 px-4 py-3 text-xs text-amber-300">
                ⚠️ لم يتم تعيين قيم خصم لهذه المدربة. يرجى تعديل بيانات المدربة أولًا وتحديد نوع وقيمة الخصم.
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">ملاحظة — اختياري</label>
              <input value={dcNote} onChange={(e) => setDcNote(e.target.value)} className={INPUT} placeholder="مثال: خصم شهر رمضان..." />
            </div>
            {dcError && <div className="rounded-xl bg-red-950/40 border border-red-500/30 px-4 py-2 text-xs text-red-300">{dcError}</div>}
            <div className="flex gap-2">
              <button onClick={() => void handleCreateDiscount()} disabled={dcSaving || !dcTargetUser || !dcValue}
                className="flex-1 rounded-xl bg-purple-700 py-2.5 font-black text-white disabled:opacity-50">
                {dcSaving ? "جارٍ الإنشاء..." : "إنشاء كود الخصم"}
              </button>
              <button onClick={() => setDiscountModal(null)} className="rounded-xl bg-gray-800 px-4 py-2.5 font-bold text-gray-300">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
