"use client";

import { useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import type { Section } from "./types";
import { canAccessAdminSection, getDefaultAdminSection, isAdminRole } from "@/lib/admin-permissions";
import Overview from "./sections/Overview";
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
import Products from "./sections/Products";
import Testimonials from "./sections/Testimonials";
import Balance from "./sections/Balance";
import Customers from "./sections/Customers";
import LiveChat from "./sections/LiveChat";
import Complaints from "./sections/Complaints";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "لوحة التحكم", icon: "📊" },
  { id: "pages", label: "الصفحات والمحتوى", icon: "📝" },
  { id: "knowledge", label: "قاعدة معرفة البوت", icon: "KB" },
  { id: "subscriptions", label: "الاشتراكات والعروض", icon: "🏷️" },
  { id: "packages", label: "الباقات", icon: "🎁" },
  { id: "goals", label: "الأهداف", icon: "🎯" },
  { id: "delivery", label: "شركات التوصيل", icon: "🚚" },
  { id: "health", label: "استبيان الإصابات", icon: "🩺" },
  { id: "payments", label: "المدفوعات", icon: "💳" },
  { id: "classes", label: "الكلاسات والجدول", icon: "📅" },
  { id: "trainers", label: "المدربات", icon: "👩‍🏫" },
  { id: "products", label: "المنتجات والطلبات", icon: "🛒" },
  { id: "reviews", label: "آراء العملاء", icon: "⭐" },
  { id: "balance", label: "الرصيد والنقاط", icon: "💰" },
  { id: "chat", label: "الدردشة المباشرة", icon: "💬" },
  { id: "customers", label: "العملاء", icon: "👥" },
  { id: "complaints", label: "الشكاوى", icon: "📣" },
];

const TITLES: Record<Section, string> = {
  overview: "لوحة التحكم",
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
  packages: Packages,
  goals: Goals,
  delivery: DeliveryOptions,
  health: HealthQuestions,
  payments: Payments,
  classes: Classes,
  trainers: Trainers,
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
  const [active, setActive] = useState<Section>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const role = session?.user?.role;
  const defaultSection = getDefaultAdminSection(role);
  const allowedNav = NAV.filter((item) => canAccessAdminSection(role, item.id));
  const safeActive = canAccessAdminSection(role, active) ? active : defaultSection;
  const ActiveSection = SECTIONS[safeActive];

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

  const navigate = (section: Section) => {
    if (!canAccessAdminSection(role, section)) return;
    setActive(section);
    setSidebarOpen(false);
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
          <div className="text-sm text-[#d7aabd]">جاري تحميل لوحة الإدارة...</div>
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
          <div className="mb-3 text-3xl">🚫</div>
          <div className="text-sm text-[#d7aabd]">جاري التحقق من صلاحيات الدخول...</div>
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
            href="/"
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
            {loggingOut ? "جاري تسجيل الخروج..." : "تسجيل الخروج"}
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
          <ActiveSection />
        </main>
      </div>
    </div>
  );
}
