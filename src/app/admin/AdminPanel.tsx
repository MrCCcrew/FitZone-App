"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { Section } from "./types";
import { canAccessAdminSection, getDefaultAdminSection, isAdminRole } from "@/lib/admin-permissions";
import Overview from "./sections/Overview";
import Accounting from "./sections/Accounting";
import PagesContent from "./sections/PagesContent";
import ChatKnowledge from "./sections/ChatKnowledge";
import Subscriptions from "./sections/Subscriptions";
import Packages from "./sections/Packages";
import Goals from "./sections/Goals";
import DeliveryOptions from "./sections/DeliveryOptions";
import HealthQuestions from "./sections/HealthQuestions";
import Payments from "./sections/Payments";
import Classes from "./sections/Classes";
import Trainers from "./sections/Trainers";
import Bookings from "./sections/Bookings";
import Products from "./sections/Products";
import Inventory from "./sections/Inventory";
import Testimonials from "./sections/Testimonials";
import Balance from "./sections/Balance";
import Customers from "./sections/Customers";
import LiveChat from "./sections/LiveChat";
import Complaints from "./sections/Complaints";
import DiscountCodes from "./sections/DiscountCodes";
import RewardSettings from "./sections/RewardSettings";
import DatabaseMaintenance from "./sections/DatabaseMaintenance";
import Settings from "./sections/Settings";
import PushNotifications from "./sections/PushNotifications";
import Partners from "./sections/Partners";

const PROTECTED_SECTIONS = ["payments", "database"] as const;

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "settings", label: "الإعدادات والصلاحيات", icon: "⚙️" },
  { id: "overview", label: "لوحة التحكم", icon: "📊" },
  { id: "accounting", label: "الحسابات والتقارير", icon: "💼" },
  { id: "pages", label: "الصفحات والمحتوى", icon: "📄" },
  { id: "knowledge", label: "قاعدة معرفة البوت", icon: "KB" },
  { id: "subscriptions", label: "الاشتراكات والعروض", icon: "🎟️" },
  { id: "packages", label: "الباقات", icon: "🎁" },
  { id: "goals", label: "الأهداف", icon: "🎯" },
  { id: "delivery", label: "شركات التوصيل", icon: "🚚" },
  { id: "health", label: "استبيان الإصابات", icon: "🩺" },
  { id: "payments", label: "المدفوعات", icon: "💳" },
  { id: "classes", label: "الكلاسات والجدول", icon: "🏋️" },
  { id: "trainers", label: "المدربات", icon: "👩‍🏫" },
  { id: "products", label: "المنتجات والطلبات", icon: "🛍️" },
  { id: "inventory", label: "المخزون والمشتريات", icon: "📦" },
  { id: "reviews", label: "آراء العملاء", icon: "⭐" },
  { id: "balance", label: "الرصيد والنقاط", icon: "💰" },
  { id: "chat", label: "الدردشة المباشرة", icon: "💬" },
  { id: "customers", label: "العملاء", icon: "👥" },
  { id: "complaints", label: "الشكاوى", icon: "📝" },
  { id: "discounts", label: "أكواد الخصم", icon: "🏷️" },
  { id: "rewards", label: "المكافآت والإحالة", icon: "🎁" },
  { id: "partners", label: "الشركاء والعمولات", icon: "🤝" },
  { id: "push",    label: "الإشعارات الفورية",  icon: "🔔" },
];

const BOOKINGS_NAV_ITEM = { id: "bookings", label: "الحجوزات", icon: "📆" } as const;
if (!NAV.find((item) => item.id === "database")) {
  NAV.push({ id: "database", label: "إدارة قاعدة البيانات", icon: "🧰" });
}
const bookingsInsertAt = NAV.findIndex((item) => item.id === "trainers");
if (bookingsInsertAt >= 0) {
  NAV.splice(bookingsInsertAt + 1, 0, BOOKINGS_NAV_ITEM);
} else {
  NAV.push(BOOKINGS_NAV_ITEM);
}

const TITLES: Record<string, string> = {
  settings: "إدارة الإعدادات والصلاحيات",
  overview: "لوحة التحكم",
  accounting: "الحسابات وتقارير المتجر والجيم",
  pages: "إدارة الصفحات والمحتوى",
  knowledge: "قاعدة معرفة البوت",
  subscriptions: "إدارة الاشتراكات والعروض",
  packages: "إدارة الباقات",
  goals: "إدارة الأهداف",
  delivery: "إدارة شركات التوصيل",
  health: "إدارة استبيان الإصابات",
  payments: "المدفوعات",
  classes: "إدارة الكلاسات والجدول",
  trainers: "إدارة المدربات",
  bookings: "إدارة الحجوزات",
  products: "إدارة المنتجات والطلبات",
  inventory: "إدارة المخزون والمشتريات",
  reviews: "إدارة آراء العملاء",
  balance: "إدارة الرصيد والنقاط",
  chat: "الدردشة المباشرة",
  customers: "إدارة العملاء",
  complaints: "إدارة الشكاوى",
  discounts: "أكواد الخصم",
  rewards: "إعدادات المكافآت والإحالة",
  partners: "الشركاء والعمولات",
  database: "إدارة قاعدة البيانات",
  push:     "الإشعارات الفورية (Web Push)",
};

const SECTIONS: Record<string, ComponentType> = {
  settings: Settings,
  overview: Overview,
  accounting: Accounting,
  pages: PagesContent,
  knowledge: ChatKnowledge,
  subscriptions: Subscriptions,
  packages: Packages,
  goals: Goals,
  delivery: DeliveryOptions,
  health: HealthQuestions,
  payments: Payments,
  classes: Classes,
  trainers: Trainers,
  bookings: Bookings,
  products: Products,
  inventory: Inventory,
  reviews: Testimonials,
  balance: Balance,
  chat: LiveChat,
  customers: Customers,
  complaints: Complaints,
  discounts: DiscountCodes,
  rewards: RewardSettings,
  database: DatabaseMaintenance,
  push:     PushNotifications,
};

type AdminSessionUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  jobTitle?: string | null;
  permissions?: string[];
};

function isProtectedSection(section: Section): section is (typeof PROTECTED_SECTIONS)[number] {
  return PROTECTED_SECTIONS.includes(section as (typeof PROTECTED_SECTIONS)[number]);
}

function MasterPasswordGate({
  sectionLabel,
  password,
  error,
  loading,
  onChange,
  onSubmit,
}: {
  sectionLabel: string;
  password: string;
  error: string | null;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex min-h-full items-center justify-center py-10">
      <div className="w-full max-w-md rounded-[28px] border border-[#ffbcdb]/20 bg-[#2a0f1b] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="text-center">
          <div className="mb-3 text-3xl">🔒</div>
          <h2 className="text-xl font-black text-[#fff7fb]">{sectionLabel}</h2>
          <p className="mt-2 text-sm text-[#d7aabd]">
            أدخل كلمة مرور الماستر لعرض بيانات هذا القسم.
          </p>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold text-[#d7aabd]">كلمة مرور الماستر</label>
          <input
            type="password"
            value={password}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            placeholder="اكتب كلمة المرور"
            className="w-full rounded-2xl border border-[rgba(255,188,219,0.18)] bg-[rgba(255,255,255,0.05)] px-4 py-3 text-sm text-[#fff4f8] outline-none transition focus:border-pink-400"
          />
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="mt-5 w-full rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white transition hover:bg-pink-500 disabled:opacity-50"
        >
          {loading ? "جارٍ التحقق..." : "عرض البيانات"}
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const router = useRouter();
  const [session, setSession] = useState<{ user?: AdminSessionUser } | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [active, setActive] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [unlockedSections, setUnlockedSections] = useState<string[]>([]);
  const [loadingMasterAccess, setLoadingMasterAccess] = useState(true);
  const [masterPassword, setMasterPassword] = useState("");
  const [masterError, setMasterError] = useState<string | null>(null);
  const [unlockingSection, setUnlockingSection] = useState<string | null>(null);

  const role = session?.user?.role;
  const permissions = session?.user?.permissions;
  const defaultSection = getDefaultAdminSection(role, permissions);
  const allowedNav = NAV.filter((item) => canAccessAdminSection(role, permissions, item.id));
  const safeActive = canAccessAdminSection(role, permissions, active) ? active : defaultSection;
  const ActiveSection = SECTIONS[safeActive];
  const protectedActive = isProtectedSection(safeActive);
  const isSafeActiveUnlocked = !protectedActive || unlockedSections.includes(safeActive);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setSession(null);
            setStatus("unauthenticated");
          }
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setSession({ user: payload.user });
          setStatus("authenticated");
        }
      } catch {
        if (!cancelled) {
          setSession(null);
          setStatus("unauthenticated");
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isAdminRole(role)) return;

    let cancelled = false;

    async function loadMasterAccess() {
      setLoadingMasterAccess(true);
      try {
        const response = await fetch("/api/admin/master-access", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setUnlockedSections([]);
          return;
        }
        const payload = (await response.json()) as { unlockedSections?: string[] };
        if (!cancelled) {
          setUnlockedSections(Array.isArray(payload.unlockedSections) ? payload.unlockedSections : []);
        }
      } catch {
        if (!cancelled) setUnlockedSections([]);
      } finally {
        if (!cancelled) setLoadingMasterAccess(false);
      }
    }

    void loadMasterAccess();
    return () => {
      cancelled = true;
    };
  }, [role, status]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/admin/login?callbackUrl=/admin");
      return;
    }

    if (status === "authenticated" && !isAdminRole(role)) {
      router.replace("/admin/login?callbackUrl=/admin");
    }
  }, [role, router, status]);

  useEffect(() => {
    if (!canAccessAdminSection(role, permissions, active)) {
      setActive(defaultSection);
    }
  }, [active, defaultSection, permissions, role]);

  const navigate = (section: Section) => {
    if (!canAccessAdminSection(role, permissions, section)) return;
    setMasterError(null);
    setActive(section);
    setSidebarOpen(false);
  };

  const unlockProtectedSection = async () => {
    if (!isProtectedSection(safeActive)) return;
    if (!masterPassword.trim()) {
      setMasterError("أدخل كلمة مرور الماستر أولًا.");
      return;
    }

    setUnlockingSection(safeActive);
    setMasterError(null);
    try {
      const response = await fetch("/api/admin/master-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: masterPassword, section: safeActive }),
      });
      const payload = (await response.json()) as { error?: string; unlockedSections?: string[] };
      if (!response.ok) {
        setMasterError(payload.error ?? "تعذر التحقق من كلمة المرور الرئيسية.");
        return;
      }

      setUnlockedSections(Array.isArray(payload.unlockedSections) ? payload.unlockedSections : []);
      setMasterPassword("");
      setMasterError(null);
    } catch {
      setMasterError("تعذر التحقق من كلمة المرور الرئيسية.");
    } finally {
      setUnlockingSection(null);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } finally {
      window.location.replace(`/admin/login?logout=${Date.now()}`);
    }
  };

  if (status === "loading") {
    return (
      <div
        dir="rtl"
        className="admin-theme flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8]"
      >
        <div className="text-center">
          <div className="mb-3 text-3xl">⌛</div>
          <div className="text-sm text-[#d7aabd]">جارٍ تحميل لوحة الإدارة...</div>
        </div>
      </div>
    );
  }

  if (!session?.user || !isAdminRole(role)) {
    return (
      <div
        dir="rtl"
        className="admin-theme flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8]"
      >
        <div className="text-center">
          <div className="mb-3 text-3xl">🔒</div>
          <div className="text-sm text-[#d7aabd]">جارٍ التحقق من صلاحيات الدخول...</div>
        </div>
      </div>
    );
  }

  const adminName = session.user.name ?? "مدير النظام";
  const adminEmail = session.user.email ?? "admin@fitzoneland.com";
  const adminInitial = adminName.charAt(0);

  return (
    <div
      dir="rtl"
      className="admin-theme flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,140,190,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,186,216,0.16),transparent_30%),linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8] lg:h-screen"
    >
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-[rgba(255,188,219,0.16)] bg-[rgba(41,13,25,0.82)] backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[rgba(255,188,219,0.16)] px-5 py-5">
          <div className="flex items-center gap-1.5" dir="ltr">
            <span className="text-xl font-black text-red-500">FIT</span>
            <span className="text-xl font-black text-pink-300">ZONE</span>
            <span className="rounded-full bg-pink-500/12 px-1.5 py-0.5 text-[10px] font-bold text-pink-200">ADMIN</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-500 transition-colors hover:text-white lg:hidden">
            ×
          </button>
        </div>

        <div className="border-b border-[rgba(255,188,219,0.16)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-pink-800 text-sm font-black shadow-[0_18px_40px_rgba(190,24,93,0.35)]">
              {adminInitial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-[#fff7fb]">{adminName}</div>
              <div className="truncate text-xs text-[#d7aabd]">{adminEmail}</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {allowedNav.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`w-full rounded-xl px-4 py-2.5 text-right text-sm font-medium transition-all ${
                safeActive === item.id
                  ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-[0_18px_40px_rgba(190,24,93,0.34)]"
                  : "text-[#d7aabd] hover:bg-[rgba(255,130,186,0.14)] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t border-[rgba(255,188,219,0.16)] px-3 py-4">
          <a
            href="/api/admin/switch-to-site"
            className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-[#d7aabd] transition-all hover:bg-[rgba(255,130,186,0.14)] hover:text-white"
          >
            <span>↩</span>
            العودة إلى الموقع
          </a>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-red-400 transition-all hover:bg-red-950/40 hover:text-red-300 disabled:opacity-50"
          >
            <span>⇥</span>
            {loggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#ffbcdb]/20 bg-[#14060d]/92 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 transition-colors hover:text-white lg:hidden">
              ☰
            </button>
            <div>
              <div className="text-lg font-black text-[#fff7fb]">{TITLES[safeActive]}</div>
              <div className="text-xs text-[#d7aabd]">فيت زون - بني سويف</div>
            </div>
          </div>
          <div className="text-xs text-[#d7aabd]">
            {new Intl.DateTimeFormat("ar-EG", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-5 lg:px-6">
          {protectedActive && (loadingMasterAccess || !isSafeActiveUnlocked) ? (
            <MasterPasswordGate
              sectionLabel={TITLES[safeActive]}
              password={masterPassword}
              error={masterError}
              loading={loadingMasterAccess || unlockingSection === safeActive}
              onChange={setMasterPassword}
              onSubmit={() => void unlockProtectedSection()}
            />
          ) : safeActive === "partners" ? (
            <Partners viewMode={role === "partner" ? "partner" : "admin"} />
          ) : (
            <ActiveSection />
          )}
        </main>
      </div>
    </div>
  );
}
