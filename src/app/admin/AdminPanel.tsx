"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { Section } from "./types";
import { canAccessAdminSection, getDefaultAdminSection, isAdminRole } from "@/lib/admin-permissions";
import Overview from "./sections/Overview";
import PagesContent from "./sections/PagesContent";
import ChatKnowledge from "./sections/ChatKnowledge";
import Subscriptions from "./sections/Subscriptions";
import Classes from "./sections/Classes";
import Products from "./sections/Products";
import Testimonials from "./sections/Testimonials";
import Balance from "./sections/Balance";
import Customers from "./sections/Customers";
import LiveChat from "./sections/LiveChat";
import Complaints from "./sections/Complaints";

const NAV: { id: Section; label: string; icon: string; badge?: string }[] = [
  { id: "overview", label: "لوحة التحكم", icon: "📊" },
  { id: "pages", label: "الصفحات والمحتوى", icon: "📄" },
  { id: "knowledge", label: "قاعدة معرفة البوت", icon: "KB" },
  { id: "subscriptions", label: "الاشتراكات والعروض", icon: "🎯" },
  { id: "classes", label: "الكلاسات والجدول", icon: "🗓️" },
  { id: "products", label: "المنتجات والطلبات", icon: "🛍️" },
  { id: "reviews", label: "آراء العملاء", icon: "⭐" },
  { id: "balance", label: "الرصيد والنقاط", icon: "💰" },
  { id: "chat", label: "الدردشة المباشرة", icon: "💬" },
  { id: "customers", label: "العملاء", icon: "👥" },
  { id: "complaints", label: "الشكاوى", icon: "📝" },
];

const SECTION_TITLES: Record<Section, string> = {
  overview: "لوحة التحكم",
  pages: "إدارة الصفحات والمحتوى",
  knowledge: "قاعدة معرفة البوت",
  subscriptions: "إدارة الاشتراكات والعروض",
  classes: "إدارة الكلاسات والجدول",
  products: "إدارة المنتجات والطلبات",
  reviews: "إدارة آراء العملاء",
  balance: "إدارة الرصيد والنقاط",
  chat: "الدردشة المباشرة",
  customers: "إدارة العملاء",
  complaints: "إدارة الشكاوى",
};

const SECTIONS: Record<Section, ComponentType> = {
  overview: Overview,
  pages: PagesContent,
  knowledge: ChatKnowledge,
  subscriptions: Subscriptions,
  classes: Classes,
  products: Products,
  reviews: Testimonials,
  balance: Balance,
  chat: LiveChat,
  customers: Customers,
  complaints: Complaints,
};

type AdminSessionUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
};

export default function AdminPanel() {
  const router = useRouter();
  const [session, setSession] = useState<{ user?: AdminSessionUser } | null>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const role = session?.user?.role;
  const defaultSection = getDefaultAdminSection(role);
  const [active, setActive] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const allowedNav = NAV.filter((item) => canAccessAdminSection(role, item.id));
  const safeActive = canAccessAdminSection(role, active) ? active : defaultSection;
  const ActiveSection = SECTIONS[safeActive];

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) {
            setSession(null);
            setStatus("unauthenticated");
          }
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          setSession({ user: data.user });
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
    if (status === "unauthenticated") {
      router.replace("/admin/login?callbackUrl=/admin");
      return;
    }

    if (status === "authenticated" && !isAdminRole(role)) {
      router.replace("/admin/login?callbackUrl=/admin");
    }
  }, [role, router, status]);

  useEffect(() => {
    if (!canAccessAdminSection(role, active)) {
      setActive(defaultSection);
    }
  }, [active, defaultSection, role]);

  if (status === "loading") {
    return (
      <div dir="rtl" className="admin-theme flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8]">
        <div className="text-center">
          <div className="mb-3 text-3xl">⏳</div>
          <div className="text-sm text-gray-400">جارٍ تحميل لوحة الإدارة...</div>
        </div>
      </div>
    );
  }

  if (!session?.user || !isAdminRole(role)) {
    return (
      <div dir="rtl" className="admin-theme flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8]">
        <div className="text-center">
          <div className="mb-3 text-3xl">🔒</div>
          <div className="text-sm text-gray-400">جارٍ التحقق من صلاحيات الدخول...</div>
        </div>
      </div>
    );
  }

  const navigate = (id: Section) => {
    if (!canAccessAdminSection(role, id)) return;
    setActive(id);
    setSidebarOpen(false);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } finally {
      window.location.replace(`/admin/login?logout=${Date.now()}`);
    }
  };

  const adminName = session.user.name ?? "المدير العام";
  const adminEmail = session.user.email ?? "admin@fitzoneland.com";
  const adminInitial = adminName.charAt(0);

  return (
    <div dir="rtl" className="admin-theme flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(255,140,190,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,186,216,0.16),transparent_30%),linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8] lg:h-screen">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-[rgba(255,188,219,0.16)] bg-[rgba(41,13,25,0.78)] backdrop-blur-xl transition-transform duration-300 ease-in-out lg:static ${
          sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[rgba(255,188,219,0.16)] px-5 py-5">
          <div className="flex items-center gap-1.5" dir="ltr">
            <span className="text-xl font-black text-red-600">FIT</span>
            <span className="text-xl font-black text-pink-300">ZONE</span>
            <span className="rounded-full bg-pink-500/12 px-1.5 py-0.5 text-[10px] font-bold text-pink-200">ADMIN</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-500 transition-colors hover:text-white lg:hidden">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="border-b border-[rgba(255,188,219,0.16)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-pink-800 text-sm font-black shadow-[0_18px_40px_rgba(190,24,93,0.35)]">
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
                safeActive === item.id ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-[0_18px_40px_rgba(190,24,93,0.34)]" : "text-[#d7aabd] hover:bg-[rgba(255,130,186,0.14)] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-xs font-black text-black">
                    {item.badge}
                  </span>
                )}
              </span>
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t border-[rgba(255,188,219,0.16)] px-3 py-4">
          <a href="/" className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-[#d7aabd] transition-all hover:bg-[rgba(255,130,186,0.14)] hover:text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 rotate-180">
              <path d="M19 12H5M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            العودة للموقع
          </a>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-red-500 transition-all hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#ffbcdb]/20 bg-[#14060d]/92 px-6 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="text-gray-400 transition-colors hover:text-white lg:hidden">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-black leading-tight text-white">{SECTION_TITLES[safeActive]}</h1>
              <p className="text-xs text-gray-500">فيت زون - بني سويف</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-[#d7aabd] sm:block">
              {new Date().toLocaleDateString("ar-EG", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
            <button
              onClick={() => navigate("complaints")}
              disabled={!canAccessAdminSection(role, "complaints")}
              className="relative rounded-xl bg-[rgba(63,20,38,0.76)] p-2 text-[#d7aabd] transition-colors hover:bg-[rgba(255,130,186,0.14)] hover:text-white disabled:opacity-40"
              title="الشكاوى"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => navigate("customers")}
              className="hidden items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 sm:flex"
            >
              <span>+</span> عضو جديد
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <ActiveSection />
        </main>
      </div>
    </div>
  );
}
