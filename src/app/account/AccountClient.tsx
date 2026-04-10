"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { format, differenceInDays } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useLang } from "@/lib/language";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface AccountData {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
    createdAt: string;
    emailVerified: string | null;
  };
  membership: {
    plan: string;
    startDate: string;
    endDate: string;
    status: string;
    features: string[];
    maxClasses: number;
    classesUsed: number;
  } | null;
  wallet: {
    balance: number;
    transactions: { id: string; amount: number; type: string; description: string; createdAt: string }[];
  };
  rewards: {
    points: number;
    tier: string;
    history: { id: string; points: number; reason: string; createdAt: string }[];
  };
  referral: { code: string; totalEarned: number } | null;
  bookings: {
    id: string;
    scheduleId: string;
    classId: string;
    className: string;
    trainerName: string;
    date: string;
    time: string;
    status: string;
    type: string;
  }[];
  orders: {
    id: string;
    total: number;
    status: string;
    createdAt: string;
    items: { name: string; quantity: number; price: number }[];
  }[];
  notifications: {
    id: string;
    title: string;
    body: string;
    type: string;
    isRead: boolean;
    createdAt: string;
  }[];
}

// ─── Config ────────────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  bronze:   { label: "برونزي",  color: "text-amber-700",  bg: "bg-amber-900/20",  border: "border-amber-700/30",  next: 1000 },
  silver:   { label: "فضي",    color: "text-gray-300",   bg: "bg-gray-700/30",   border: "border-gray-500/30",   next: 2000 },
  gold:     { label: "ذهبي",   color: "text-yellow-400", bg: "bg-yellow-900/20", border: "border-yellow-500/30", next: 3000 },
  platinum: { label: "بلاتيني", color: "text-purple-400", bg: "bg-purple-900/20", border: "border-purple-500/30", next: null },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  confirmed: { label: "مؤكد",         color: "bg-blue-500/20 text-blue-400" },
  attended:  { label: "حضرت",         color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "ملغي",         color: "bg-red-500/20 text-red-400" },
  noshow:    { label: "لم تحضر",      color: "bg-gray-500/20 text-gray-400" },
  pending:   { label: "معلق",         color: "bg-yellow-500/20 text-yellow-400" },
  delivered: { label: "تم التسليم",   color: "bg-green-500/20 text-green-400" },
  active:    { label: "نشط",          color: "bg-green-500/20 text-green-400" },
  expired:   { label: "منتهي",        color: "bg-red-500/20 text-red-400" },
};

const NOTIF_ICONS: Record<string, string> = {
  success: "\u2705",
  info: "\u2139\uFE0F",
  warning: "\u26A0\uFE0F",
  error: "\u274C",
};

const TABS = [
  { id: "profile", label: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a", icon: "\u25CE" },
  { id: "membership", label: "\u0627\u0644\u0627\u0634\u062a\u0631\u0627\u0643", icon: "\u25C8" },
  { id: "bookings", label: "\u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a", icon: "\u25A3" },
  { id: "orders", label: "\u0627\u0644\u0637\u0644\u0628\u0627\u062a", icon: "\u25A4" },
  { id: "wallet", label: "\u0627\u0644\u0645\u062d\u0641\u0638\u0629", icon: "\u00A4" },
  { id: "reviews", label: "\u0622\u0631\u0627\u0626\u064a", icon: "\u270E" },
  { id: "notifications", label: "\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a", icon: "\u2731" },
  { id: "complaints", label: "\u0627\u0644\u0634\u0643\u0627\u0648\u0649", icon: "\u2612" },
] as const;
type TabId = typeof TABS[number]["id"];

function formatMoney(value: number, lang: "ar" | "en") {
  return new Intl.NumberFormat(lang === "en" ? "en-US" : "ar-EG").format(value);
}

function getTierLabel(tier: string, lang: "ar" | "en") {
  const labels: Record<string, { ar: string; en: string }> = {
    bronze: { ar: "برونزي", en: "Bronze" },
    silver: { ar: "فضي", en: "Silver" },
    gold: { ar: "ذهبي", en: "Gold" },
    platinum: { ar: "بلاتيني", en: "Platinum" },
  };
  return labels[tier]?.[lang] ?? tier;
}

function getTabLabel(tabId: TabId, lang: "ar" | "en") {
  const labels: Record<TabId, { ar: string; en: string }> = {
    profile: { ar: "الملف الشخصي", en: "Profile" },
    membership: { ar: "الاشتراك", en: "Membership" },
    bookings: { ar: "الحجوزات", en: "Bookings" },
    orders: { ar: "الطلبات", en: "Orders" },
    wallet: { ar: "المحفظة", en: "Wallet" },
    reviews: { ar: "آرائي", en: "My reviews" },
    notifications: { ar: "الإشعارات", en: "Notifications" },
    complaints: { ar: "الشكاوى", en: "Complaints" },
  };
  return labels[tabId][lang];
}

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

// ─── Shared UI helpers ─────────────────────────────────────────────────────────
const INPUT = "w-full rounded-xl border border-[#ffbcdb]/20 bg-[#3f1426]/85 px-4 py-2.5 text-sm text-[#fff4f8] outline-none transition-colors placeholder:text-[#caa0b0] focus:border-pink-400";
const CARD  = "rounded-2xl border border-[#ffbcdb]/20 bg-[#3f1426]/85 p-5 text-[#fff4f8] shadow-[0_24px_70px_rgba(17,5,10,0.28)] backdrop-blur-xl";

function StatCard({ icon, label, value, sub, color = "text-white" }: { icon: string; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={CARD + " text-center"}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-gray-400 text-xs font-medium mt-0.5">{label}</div>
      {sub && <div className="text-gray-600 text-xs mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────
function ProfileTab({ user }: { user: AccountData["user"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [form, setForm] = useState({ name: user.name, phone: user.phone || "" });
  const [passForm, setPassForm] = useState({ current: "", next: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok?: boolean; msg?: string } | null>(null);
  const [isVerified, setIsVerified] = useState(!!user.emailVerified);
  const [resendLoading, setResendLoading] = useState(false);
  const loggingOut = false;
  const handleLogout = () => {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const joined = format(new Date(user.createdAt), "d MMMM yyyy", { locale: lang === "en" ? enUS : ar });

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyLoading(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsVerified(true);
        setVerifyResult({ ok: true, msg: "✅ تم تفعيل بريدك الإلكتروني بنجاح!" });
      } else {
        setVerifyResult({ ok: false, msg: data.error ?? "كود غير صحيح" });
      }
    } catch {
      setVerifyResult({ ok: false, msg: "حدث خطأ، حاولي مرة أخرى" });
    } finally {
      setVerifyLoading(false);
    }
  };

  const resendCode = async () => {
    setResendLoading(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST" });
      setVerifyResult({ ok: true, msg: "📧 تم إرسال كود جديد على بريدك الإلكتروني" });
    } catch {
      setVerifyResult({ ok: false, msg: "تعذر إرسال الكود" });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {saved && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-xl">
          {t("✅ تم حفظ البيانات بنجاح", "✅ Profile updated successfully")}
        </div>
      )}

      {/* Email verification banner */}
      {!isVerified && (
        <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">📧</span>
            <div>
              <div className="text-yellow-400 font-black text-sm">{t("بريدك الإلكتروني غير مفعّل", "Your email is not verified")}</div>
              <div className="text-gray-400 text-xs mt-0.5">{t("أدخلي كود التفعيل الذي أُرسل إلى", "Enter the verification code sent to")} {user.email}</div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
              <a
                href="/"
                className="flex items-center gap-1.5 rounded-xl border border-[#ffbcdb]/20 bg-white/5 px-3 py-2 text-sm text-[#d7aabd] transition-colors hover:text-white"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("الرئيسية", "Home")}
              </a>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-1.5 rounded-xl border border-pink-300/20 bg-pink-500/10 px-3 py-2 text-sm text-[#ffd6e7] transition-colors hover:bg-pink-500/15 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {loggingOut ? t("جاري الخروج...", "Logging out...") : t("تسجيل الخروج", "Log out")}
              </button>
            </div>
          </div>
          <form onSubmit={submitVerify} className="flex gap-2">
            <input
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              dir="ltr"
              maxLength={6}
              className="flex-1 bg-gray-800 border border-gray-700 focus:border-yellow-500 rounded-xl px-4 py-2.5 text-white text-center text-lg font-black tracking-widest outline-none"
            />
            <button
              type="submit"
              disabled={verifyLoading || verifyCode.length !== 6}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white font-black px-5 py-2.5 rounded-xl transition-colors text-sm whitespace-nowrap"
            >
              {verifyLoading ? "..." : t("تفعيل", "Verify")}
            </button>
          </form>
          {verifyResult && (
            <div className={`mt-2 text-sm font-bold ${verifyResult.ok ? "text-green-400" : "text-red-400"}`}>
              {verifyResult.msg}
            </div>
          )}
          <button onClick={resendCode} disabled={resendLoading} className="mt-2 text-xs text-gray-500 hover:text-yellow-400 transition-colors">
            {resendLoading ? t("جاري الإرسال...", "Sending...") : t("لم يصلك الكود؟ أعيدي الإرسال", "Didn't get the code? Resend")}
          </button>
        </div>
      )}

      {/* Profile card */}
      <div className={CARD + " flex items-center gap-5"}>
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white font-black text-3xl shrink-0">
          {user.name?.[0] ?? "ع"}
        </div>
        <div className="flex-1">
          <div className="text-white font-black text-xl">{user.name}</div>
          <div className="flex items-center gap-2 text-gray-400 text-sm" dir="ltr">
            {user.email}
            {isVerified
              ? <span className="text-green-400 text-xs">{t("✅ مفعّل", "✅ Verified")}</span>
              : <span className="text-yellow-500 text-xs">{t("⚠️ غير مفعّل", "⚠️ Unverified")}</span>
            }
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs bg-red-600/20 text-red-400 border border-red-600/30 px-2 py-0.5 rounded-full font-bold">
              {user.role === "admin" ? t("مدير", "Admin") : user.role === "staff" ? t("إدارة", "Staff") : user.role === "trainer" ? t("مدرب", "Trainer") : t("عضو", "Member")}
            </span>
            <span className="text-gray-600 text-xs">{t("عضو منذ", "Member since")} {joined}</span>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("تعديل البيانات الشخصية", "Edit personal information")}</h3>
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">{t("الاسم الكامل", "Full name")}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT} />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">{t("رقم الهاتف", "Phone number")}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={INPUT} dir="ltr" placeholder="01XXXXXXXXX" />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1.5">{t("البريد الإلكتروني", "Email")}</label>
            <input value={user.email} disabled className={INPUT + " opacity-50 cursor-not-allowed"} dir="ltr" />
          </div>
          <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-2.5 rounded-xl transition-colors text-sm">
            {t("💾 حفظ التغييرات", "💾 Save changes")}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("تغيير كلمة المرور", "Change password")}</h3>
        <form onSubmit={(e) => { e.preventDefault(); setSaved(true); setTimeout(() => setSaved(false), 2000); }} className="space-y-4">
          <div>
            <label className="block text-gray-500 text-xs mb-1.5">{t("كلمة المرور الحالية", "Current password")}</label>
            <input type="password" value={passForm.current} onChange={(e) => setPassForm({ ...passForm, current: e.target.value })} className={INPUT} placeholder="••••••••" dir="ltr" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">{t("كلمة المرور الجديدة", "New password")}</label>
              <input type="password" value={passForm.next} onChange={(e) => setPassForm({ ...passForm, next: e.target.value })} className={INPUT} placeholder="••••••••" dir="ltr" />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">{t("تأكيد كلمة المرور", "Confirm password")}</label>
              <input type="password" value={passForm.confirm} onChange={(e) => setPassForm({ ...passForm, confirm: e.target.value })} className={INPUT} placeholder="••••••••" dir="ltr" />
            </div>
          </div>
          <button type="submit" className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-2.5 rounded-xl transition-colors text-sm">
            {t("🔒 تحديث كلمة المرور", "🔒 Update password")}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Tab: Membership ──────────────────────────────────────────────────────────
function MembershipTab({ membership }: { membership: AccountData["membership"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  if (!membership) {
    return (
      <div className={CARD + " text-center py-12"}>
        <div className="text-5xl mb-4">💳</div>
        <h3 className="text-white font-black text-xl mb-2">{t("لا يوجد اشتراك نشط", "No active membership")}</h3>
        <p className="text-gray-400 mb-6">{t("اشترك الآن وابدأ رحلتك الرياضية", "Subscribe now and start your fitness journey")}</p>
        <a href="/#plans" className="inline-block bg-red-600 hover:bg-red-700 text-white font-black px-8 py-3 rounded-xl transition-colors">
          {t("🔥 اشترك الآن", "🔥 Subscribe now")}
        </a>
      </div>
    );
  }

  const start = new Date(membership.startDate);
  const end   = new Date(membership.endDate);
  const today = new Date();
  const totalDays   = differenceInDays(end, start);
  const remaining   = Math.max(0, differenceInDays(end, today));
  const elapsed     = totalDays - remaining;
  const progress    = Math.min(100, Math.round((elapsed / totalDays) * 100));
  const classesLeft = membership.maxClasses === -1 ? null : membership.maxClasses - membership.classesUsed;

  return (
    <div className="space-y-5">
      {/* Main plan card */}
      <div className="bg-gradient-to-br from-red-950/40 to-black border border-red-600/40 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-gray-400 text-xs mb-1">{t("باقتك الحالية", "Your current plan")}</div>
            <div className="text-3xl font-black text-white">{membership.plan}</div>
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full font-black ${STATUS_MAP[membership.status]?.color ?? "text-white bg-gray-700"}`}>
            {lang === "en"
              ? ({
                  active: "Active",
                  expired: "Expired",
                  cancelled: "Cancelled",
                  pending: "Pending",
                  confirmed: "Confirmed",
                } as Record<string, string>)[membership.status] ?? membership.status
              : STATUS_MAP[membership.status]?.label ?? membership.status}
          </span>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>{t("بدأت", "Started")} {format(start, "d MMM yyyy", { locale: lang === "en" ? enUS : ar })}</span>
            <span>{t("تنتهي", "Ends")} {format(end, "d MMM yyyy", { locale: lang === "en" ? enUS : ar })}</span>
          </div>
          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${remaining <= 7 ? "bg-red-500" : "bg-gradient-to-r from-red-600 to-yellow-500"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-500">{formatMoney(elapsed, lang)} {t("يوم مضى", "days passed")}</span>
            <span className={remaining <= 7 ? "text-red-400 font-bold" : "text-green-400 font-bold"}>{formatMoney(remaining, lang)} {t("يوم متبقٍ", "days left")}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-black/40 rounded-xl p-3 text-center">
            <div className="text-yellow-400 font-black text-lg">{remaining}</div>
            <div className="text-gray-500 text-xs">{t("يوم متبقي", "Days left")}</div>
          </div>
          <div className="bg-black/40 rounded-xl p-3 text-center">
            <div className="text-white font-black text-lg">{membership.classesUsed}</div>
            <div className="text-gray-500 text-xs">{t("كلاسات حضرتها", "Classes attended")}</div>
          </div>
          <div className="bg-black/40 rounded-xl p-3 text-center">
            <div className="text-green-400 font-black text-lg">{classesLeft === null ? "∞" : classesLeft}</div>
            <div className="text-gray-500 text-xs">{t("كلاسات متبقية", "Classes left")}</div>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("مميزات باقتك", "Plan features")}</h3>
        <div className="space-y-2.5">
          {membership.features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 text-gray-300 text-sm">
              <span className="text-red-500 font-black shrink-0">✓</span>
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Renewal CTA */}
      {remaining <= 10 && (
        <div className="bg-red-950/30 border border-red-600/40 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-red-400 font-black">{t("⚠️ اشتراكك ينتهي قريباً", "⚠️ Your membership is ending soon")}</div>
            <div className="text-gray-400 text-sm mt-1">{t("جدد الآن واحصل على 100 جنيه في محفظتك", "Renew now and get 100 EGP in your wallet")}</div>
          </div>
          <a href="/#plans" className="shrink-0 bg-red-600 hover:bg-red-700 text-white font-black px-5 py-2.5 rounded-xl transition-colors text-sm">
            {t("جدد الآن", "Renew now")}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Bookings ────────────────────────────────────────────────────────────
function BookingsTabLegacy({ bookings }: { bookings: AccountData["bookings"] }) {
  const [items, setItems] = useState(bookings);
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const today = new Date();
  const upcoming = items.filter((b) => new Date(b.date) >= today && b.status === "confirmed");
  const past     = items.filter((b) => new Date(b.date) < today  || b.status === "attended" || b.status === "cancelled");
  const shown    = filter === "upcoming" ? upcoming : past;
  const TYPE_EMOJI: Record<string, string> = { cardio: "🏃", strength: "🏋️", yoga: "🧘", boxing: "🥊", swimming: "🏊", dance: "💃" };
  const cancelBooking = async (bookingId: string) => {
    if (cancellingId) return;
    setCancellingId(bookingId);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "تعذر إلغاء الحجز حاليًا.");
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === bookingId ? { ...item, status: "cancelled" } : item,
        ),
      );
    } catch {
      alert("حدث خطأ أثناء إلغاء الحجز.");
    } finally {
      setCancellingId(null);
    }
  };
  return (
    <div className="space-y-4">
      <div className="bg-pink-500/10 border border-pink-400/20 rounded-2xl p-4 text-xs text-pink-100">
        لتعديل الموعد: ألغِ الحجز الحالي ثم احجزي موعدًا آخر من صفحة الجدول الأسبوعي عبر القائمة الرئيسية.
      </div>
      {/* Tabs */}
      <div className="flex gap-2">
        {[["upcoming", `القادمة (${upcoming.length})`], ["past", `السابقة (${past.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v as typeof filter)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors ${filter === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {l}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className={CARD + " text-center py-10"}>
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-400">{filter === "upcoming" ? "لا توجد حجوزات قادمة حاليًا." : "لا توجد حجوزات سابقة حتى الآن."}</p>
          {filter === "upcoming" && (
            <a href="/#classes" className="mt-4 inline-block bg-red-600 text-white font-bold px-5 py-2 rounded-xl text-sm">استعرضي الكلاسات</a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((b) => (
            <div key={b.id} className={CARD + " flex items-center gap-4"}>
              <div className="text-3xl shrink-0">{TYPE_EMOJI[b.type] ?? ""}</div>
              <div className="flex-1 min-w-0">
                <div className="text-white font-black">{b.className}</div>
                <div className="text-gray-400 text-xs">مع {b.trainerName}</div>
                <div className="text-gray-500 text-xs mt-1">
                  {format(new Date(b.date), "EEEE d MMMM", { locale: ar })}  {b.time}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${STATUS_MAP[b.status]?.color ?? "bg-gray-700 text-gray-300"}`}>
                  {STATUS_MAP[b.status]?.label ?? b.status}
                </span>
                {b.status === "confirmed" && (
                  <button
                    onClick={() => cancelBooking(b.id)}
                    disabled={cancellingId === b.id}
                    className="text-red-500 hover:text-red-400 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {cancellingId === b.id ? "جارٍ الإلغاء..." : "إلغاء الحجز"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Orders ──────────────────────────────────────────────────────────────
function BookingsTab({ bookings }: { bookings: AccountData["bookings"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [items, setItems] = useState(bookings);
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [editingBooking, setEditingBooking] = useState<AccountData["bookings"][number] | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleEntries, setScheduleEntries] = useState<Array<{
    id: string;
    classId: string;
    className: string;
    trainer: string;
    type: string;
    subType: string | null;
    date: string;
    time: string;
    day: string;
    availableSpots: number;
  }>>([]);

  const today = new Date();
  const upcoming = items.filter((b) => new Date(b.date) >= today && b.status === "confirmed");
  const past = items.filter((b) => new Date(b.date) < today || b.status === "attended" || b.status === "cancelled");
  const shown = filter === "upcoming" ? upcoming : past;
  const TYPE_EMOJI: Record<string, string> = { cardio: "🏃", strength: "🏋️", yoga: "🧘", boxing: "🥊", swimming: "🏊", dance: "💃" };

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setScheduleLoading(true);
      try {
        const res = await fetch(`/api/public?ts=${Date.now()}`, { cache: "no-store" });
        const data = await res.json();
        if (!mounted || !data?.classes) return;
        const entries = (data.classes as Array<{
          id: string;
          name: string;
          trainer: string;
          type: string;
          subType?: string | null;
          schedules: { id: string; date: string; time: string; availableSpots: number }[];
        }>).flatMap((cls) =>
          cls.schedules.map((s) => ({
            id: s.id,
            classId: cls.id,
            className: cls.name,
            trainer: cls.trainer,
            type: cls.type,
            subType: cls.subType ?? null,
            date: s.date,
            time: s.time,
            day: format(new Date(s.date), "EEEE", { locale: lang === "en" ? enUS : ar }),
            availableSpots: s.availableSpots,
          })),
        );
        setScheduleEntries(entries);
      } catch {
        if (mounted) setScheduleEntries([]);
      } finally {
        if (mounted) setScheduleLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [lang]);

  const parseScheduleTime = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    return (h || 0) * 60 + (m || 0);
  };

  const formatScheduleTimeLabel = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    const hour = Number.isNaN(h) ? 0 : h;
    const minute = Number.isNaN(m) ? 0 : m;
    const period = lang === "en" ? (hour < 12 ? "AM" : hour < 16 ? "PM" : "PM") : hour < 12 ? "صباحًا" : hour < 16 ? "ظهرًا" : "مساءً";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(displayHour).padStart(2, "0")}.${String(minute).padStart(2, "0")} ${period}`;
  };

  const scheduleSlots = useMemo(() => {
    const times = Array.from(new Set(scheduleEntries.map((item) => item.time)));
    return times.sort((a, b) => parseScheduleTime(a) - parseScheduleTime(b));
  }, [scheduleEntries]);

  const scheduleSplit = useMemo(() => {
    const cutoff = 15 * 60;
    const morning = scheduleSlots.filter((slot) => parseScheduleTime(slot) < cutoff);
    const evening = scheduleSlots.filter((slot) => parseScheduleTime(slot) >= cutoff);
    return { morning, evening };
  }, [scheduleSlots]);

  const scheduleDays = useMemo(() => {
    const daySet = new Set(scheduleEntries.map((item) => item.day));
    const order = lang === "en" ? ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] : ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    return order.filter((day) => daySet.has(day));
  }, [scheduleEntries, lang]);

  const toScheduleDateTime = (dateIso: string, time: string) => {
    const date = new Date(dateIso);
    const [h, m] = time.split(":").map((n) => Number(n));
    date.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
    return date;
  };

  const canEditBooking = (booking: AccountData["bookings"][number]) => {
    const scheduleDate = toScheduleDateTime(booking.date, booking.time);
    const now = new Date();
    if (scheduleDate <= now) return false;
    const sameDay = scheduleDate.toDateString() === now.toDateString();
    if (sameDay && scheduleDate.getTime() - now.getTime() < 60 * 60 * 1000) return false;
    return true;
  };

  const cancelBooking = async (bookingId: string) => {
    if (cancellingId) return;
    setCancellingId(bookingId);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? t("تعذر إلغاء الحجز حاليًا.", "Unable to cancel the booking right now."));
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === bookingId ? { ...item, status: "cancelled" } : item,
        ),
      );
    } catch {
      alert(t("حدث خطأ أثناء إلغاء الحجز.", "An error occurred while cancelling the booking."));
    } finally {
      setCancellingId(null);
    }
  };

  const openEditModal = (booking: AccountData["bookings"][number]) => {
    setEditingBooking(booking);
    setSelectedScheduleId(booking.scheduleId);
    setUpdateError(null);
    setUpdateSuccess(null);
  };

  const saveScheduleChange = async () => {
    if (!editingBooking || !selectedScheduleId) return;
    setUpdating(true);
    setUpdateError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: editingBooking.id, scheduleId: selectedScheduleId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setUpdateError(data.error ?? t("تعذر تعديل الموعد حاليًا.", "Unable to update the booking right now."));
        return;
      }

      const selected = scheduleEntries.find((entry) => entry.id === selectedScheduleId);
      if (selected) {
        setItems((current) =>
          current.map((item) =>
            item.id === editingBooking.id
              ? {
                  ...item,
                  scheduleId: selected.id,
                  classId: selected.classId,
                  className: selected.className,
                  trainerName: selected.trainer,
                  date: selected.date,
                  time: selected.time,
                  type: selected.type,
                }
              : item,
          ),
        );
      }
      setUpdateSuccess(t("تم تحديث الموعد بنجاح.", "Booking updated successfully."));
      setTimeout(() => {
        setEditingBooking(null);
        setUpdateSuccess(null);
      }, 1200);
    } catch {
      setUpdateError(t("حدث خطأ أثناء تعديل الموعد.", "An error occurred while updating the booking."));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-pink-500/10 border border-pink-400/20 rounded-2xl p-4 text-xs text-pink-100">
        {t("يمكنك تعديل موعد الحجز من هنا. لا يمكنك التعديل على نفس اليوم قبل الموعد بأقل من ساعة.", "You can update your booking time from here. Same-day bookings cannot be edited less than one hour before the class.")}
      </div>

      <div className="flex gap-2">
        {[["upcoming", `${t("القادمة", "Upcoming")} (${upcoming.length})`], ["past", `${t("السابقة", "Past")} (${past.length})`]].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v as typeof filter)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors ${filter === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {l}
          </button>
        ))}
      </div>

      {upcoming.length === 0 && (
        <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-4 text-xs text-pink-100">
          {t("لا توجد حجوزات قادمة حالياً لتعديلها. احجزي موعداً جديداً أولاً ثم يمكنك تعديل الموعد من هنا.", "There are no upcoming bookings to edit right now. Book a class first, then you can update it from here.")}
        </div>
      )}

      {shown.length === 0 ? (
        <div className={CARD + " text-center py-10"}>
          <div className="text-4xl mb-3">📅</div>
          <p className="text-gray-400">{filter === "upcoming" ? t("لا توجد حجوزات قادمة حاليًا.", "No upcoming bookings right now.") : t("لا توجد حجوزات سابقة حتى الآن.", "No past bookings yet.")}</p>
          {filter === "upcoming" && (
            <a href="/#schedule" className="mt-4 inline-block bg-red-600 text-white font-bold px-5 py-2 rounded-xl text-sm">{t("اعرضي الجدول الأسبوعي", "View weekly schedule")}</a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((b) => {
            const editable = b.status === "confirmed" && canEditBooking(b);
            return (
              <div key={b.id} className={CARD + " flex items-center gap-4"}>
                <div className="text-3xl shrink-0">{TYPE_EMOJI[b.type] ?? ""}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-black">{b.className}</div>
                  <div className="text-gray-400 text-xs">{t("مع", "With")} {b.trainerName}</div>
                  <div className="text-gray-500 text-xs mt-1">
                    {format(new Date(b.date), "EEEE d MMMM", { locale: lang === "en" ? enUS : ar })} {b.time}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${STATUS_MAP[b.status]?.color ?? "bg-gray-700 text-gray-300"}`}>
                    {lang === "en"
                      ? ({
                          confirmed: "Confirmed",
                          attended: "Attended",
                          cancelled: "Cancelled",
                          noshow: "No show",
                          pending: "Pending",
                        } as Record<string, string>)[b.status] ?? b.status
                      : STATUS_MAP[b.status]?.label ?? b.status}
                  </span>
                  {b.status === "confirmed" && (
                    <>
                      <button
                        onClick={() => cancelBooking(b.id)}
                        disabled={cancellingId === b.id}
                        className="text-red-500 hover:text-red-400 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {cancellingId === b.id ? t("جاري الإلغاء...", "Cancelling...") : t("إلغاء الحجز", "Cancel booking")}
                      </button>
                      <button
                        onClick={() => openEditModal(b)}
                        disabled={!editable}
                        className="text-xs font-medium text-pink-200 hover:text-white transition-colors disabled:opacity-40"
                      >
                        {t("تعديل الموعد", "Edit booking")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={CARD + " schedule-shell"}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-black">{t("الجدول الأسبوعي", "Weekly schedule")}</h3>
            <p className="text-gray-400 text-xs mt-1">{t("يمكنك اختيار موعد جديد بعد تحديد الحجز من الأعلى.", "You can choose a new slot after selecting a booking above.")}</p>
          </div>
          {editingBooking ? (
            <span className="text-xs text-pink-200">{t("تعديل", "Editing")}: {editingBooking.className}</span>
          ) : (
            <span className="text-xs text-gray-500">{t("اختر حجزًا أولًا", "Select a booking first")}</span>
          )}
        </div>

        {scheduleLoading ? (
          <div className="text-center text-gray-400 py-10">{t("جاري تحميل الجدول...", "Loading schedule...")}</div>
        ) : scheduleEntries.length === 0 ? (
          <div className="text-center text-gray-400 py-10">{t("لا توجد مواعيد متاحة حاليًا.", "No schedule slots available right now.")}</div>
        ) : (
          <>
            {scheduleSplit.morning.length > 0 && (
              <div className="schedule-block">
                <div className="schedule-block-title">{t("الجدول الصباحي", "Morning schedule")}</div>
                <div className="schedule-scroll" style={{ direction: "ltr" }}>
                  <div
                    className="schedule-grid"
                    style={{
                      gridTemplateColumns: `${scheduleSplit.morning
                        .map(() => "minmax(150px, 1fr)")
                        .join(" ")} 120px`,
                    }}
                  >
                    {scheduleSplit.morning.map((slot) => (
                      <div key={`morning-head-${slot}`} className="schedule-cell time sticky">
                        {formatScheduleTimeLabel(slot)}
                      </div>
                    ))}
                    <div className="schedule-cell sticky day-head">{t("اليوم", "Day")}</div>
                    {scheduleDays.map((day) => (
                      <div key={`morning-row-${day}`} style={{ display: "contents" }}>
                        {scheduleSplit.morning.map((slot) => {
                          const cellEntries = scheduleEntries.filter(
                            (entry) => entry.day === day && entry.time === slot,
                          );
                          return (
                            <div key={`${day}-morning-${slot}`} className="schedule-cell">
                              {cellEntries.length === 0 ? (
                                <div className="schedule-empty">—</div>
                              ) : (
                                <div className="schedule-slot-box">
                                  {cellEntries.map((entry) => {
                                    const entryDate = toScheduleDateTime(entry.date, entry.time);
                                    const now = new Date();
                                    const sameDay = entryDate.toDateString() === now.toDateString();
                                    const tooSoon = sameDay && entryDate.getTime() - now.getTime() < 60 * 60 * 1000;
                                    const disabled = entry.availableSpots <= 0 || entryDate <= now || tooSoon || !editingBooking;
                                    const selected = selectedScheduleId === entry.id;
                                    const current = editingBooking?.scheduleId === entry.id;
                                    return (
                                      <button
                                        key={entry.id}
                                        onClick={() => !disabled && setSelectedScheduleId(entry.id)}
                                        className={`schedule-slot-item${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}
                                        disabled={disabled}
                                      >
                                        <div className="schedule-item-title">{entry.className}</div>
                                        <div className="schedule-item-sub" style={{ color: "#fff" }}>
                                          {entry.trainer}
                                        </div>
                                        <div className="schedule-item-tag">
                                          {entry.type}
                                          {entry.subType ? ` - ${entry.subType}` : ""}
                                        </div>
                                        {current && <div className="schedule-item-tag">{t("موعدك الحالي", "Current slot")}</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="schedule-cell day">{day}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {scheduleSplit.evening.length > 0 && (
              <div className="schedule-block">
                <div className="schedule-block-title">{t("الجدول المسائي", "Evening schedule")}</div>
                <div className="schedule-scroll" style={{ direction: "ltr" }}>
                  <div
                    className="schedule-grid"
                    style={{
                      gridTemplateColumns: `${scheduleSplit.evening
                        .map(() => "minmax(150px, 1fr)")
                        .join(" ")} 120px`,
                    }}
                  >
                    {scheduleSplit.evening.map((slot) => (
                      <div key={`evening-head-${slot}`} className="schedule-cell time sticky">
                        {formatScheduleTimeLabel(slot)}
                      </div>
                    ))}
                    <div className="schedule-cell sticky day-head">{t("اليوم", "Day")}</div>
                    {scheduleDays.map((day) => (
                      <div key={`evening-row-${day}`} style={{ display: "contents" }}>
                        {scheduleSplit.evening.map((slot) => {
                          const cellEntries = scheduleEntries.filter(
                            (entry) => entry.day === day && entry.time === slot,
                          );
                          return (
                            <div key={`${day}-evening-${slot}`} className="schedule-cell">
                              {cellEntries.length === 0 ? (
                                <div className="schedule-empty">—</div>
                              ) : (
                                <div className="schedule-slot-box">
                                  {cellEntries.map((entry) => {
                                    const entryDate = toScheduleDateTime(entry.date, entry.time);
                                    const now = new Date();
                                    const sameDay = entryDate.toDateString() === now.toDateString();
                                    const tooSoon = sameDay && entryDate.getTime() - now.getTime() < 60 * 60 * 1000;
                                    const disabled = entry.availableSpots <= 0 || entryDate <= now || tooSoon || !editingBooking;
                                    const selected = selectedScheduleId === entry.id;
                                    const current = editingBooking?.scheduleId === entry.id;
                                    return (
                                      <button
                                        key={entry.id}
                                        onClick={() => !disabled && setSelectedScheduleId(entry.id)}
                                        className={`schedule-slot-item${selected ? " selected" : ""}${disabled ? " disabled" : ""}`}
                                        disabled={disabled}
                                      >
                                        <div className="schedule-item-title">{entry.className}</div>
                                        <div className="schedule-item-sub" style={{ color: "#fff" }}>
                                          {entry.trainer}
                                        </div>
                                        <div className="schedule-item-tag">
                                          {entry.type}
                                          {entry.subType ? ` - ${entry.subType}` : ""}
                                        </div>
                                        {current && <div className="schedule-item-tag">{t("موعدك الحالي", "Current slot")}</div>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="schedule-cell day">{day}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {updateError && <div className="mt-3 text-sm text-red-400 font-bold">{updateError}</div>}
        {updateSuccess && <div className="mt-3 text-sm text-green-400 font-bold">{updateSuccess}</div>}

        <div className="mt-4 flex gap-3">
          <button
            className="rounded-xl bg-red-600 text-white font-bold px-5 py-2 text-sm transition-colors hover:bg-red-700 disabled:opacity-50"
            onClick={() => void saveScheduleChange()}
            disabled={!editingBooking || !selectedScheduleId || updating || selectedScheduleId === editingBooking?.scheduleId}
            style={{ opacity: !editingBooking ? 0.6 : 1 }}
          >
            {updating ? t("جارٍ الحفظ...", "Saving...") : t("تحديث الموعد", "Update booking")}
          </button>
          <button
            className="rounded-xl border border-pink-300/40 text-pink-200 px-5 py-2 text-sm font-bold transition-colors hover:bg-pink-500/10"
            onClick={() => {
              setEditingBooking(null);
              setSelectedScheduleId(null);
              setUpdateError(null);
              setUpdateSuccess(null);
            }}
          >
            {t("إلغاء", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrdersTab({ orders }: { orders: AccountData["orders"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [items, setItems] = useState(orders);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const cancelOrder = async (orderId: string) => {
    if (cancellingId) return;
    setCancellingId(orderId);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        alert(data.error ?? t("تعذر إلغاء الطلب حاليًا.", "Unable to cancel the order right now."));
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === orderId ? { ...item, status: "cancelled" } : item,
        ),
      );
    } catch {
      alert(t("حدث خطأ أثناء إلغاء الطلب.", "An error occurred while cancelling the order."));
    } finally {
      setCancellingId(null);
    }
  };
  if (items.length === 0) {
    return (
        <div className={CARD + " text-center py-10"}>
          <div className="text-4xl mb-3">🛍️</div>
        <p className="text-gray-400 mb-4">{t("لا توجد طلبات حتى الآن.", "No orders yet.")}</p>
        <a href="/#shop" className="inline-block bg-red-600 text-white font-bold px-5 py-2 rounded-xl text-sm">{t("اذهبي إلى المتجر", "Go to shop")}</a>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((o) => (
        <div key={o.id} className={CARD}>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-500 text-xs font-mono">#{o.id.slice(-6).toUpperCase()}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${STATUS_MAP[o.status]?.color ?? "bg-gray-700 text-gray-300"}`}>
                  {lang === "en"
                    ? ({
                        pending: "Pending",
                        confirmed: "Confirmed",
                        delivered: "Delivered",
                        cancelled: "Cancelled",
                        active: "Active",
                      } as Record<string, string>)[o.status] ?? o.status
                    : STATUS_MAP[o.status]?.label ?? o.status}
                </span>
              </div>
              <div className="text-gray-500 text-xs">
                {format(new Date(o.createdAt), "d MMMM yyyy", { locale: lang === "en" ? enUS : ar })} · {formatMoney(o.items.length, lang)} {t("منتج", "items")}
              </div>
            </div>
            <div className="text-yellow-400 font-black">{formatMoney(o.total, lang)} {lang === "en" ? "EGP" : "ج.م"}</div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`w-4 h-4 text-gray-500 transition-transform ${expanded === o.id ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {expanded === o.id && (
            <div className="mt-4 pt-4 border-t border-gray-800 space-y-2">
              {o.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-300">{item.name} × {item.quantity}</span>
                  <span className="text-gray-400">{formatMoney(item.price * item.quantity, lang)} {lang === "en" ? "EGP" : "ج.م"}</span>
                </div>
              ))}
              <div className="flex justify-between font-black text-sm pt-2 border-t border-gray-800">
                <span className="text-white">{t("الإجمالي", "Total")}</span>
                <span className="text-yellow-400">{formatMoney(o.total, lang)} {lang === "en" ? "EGP" : "ج.م"}</span>
              </div>
              {['pending', 'confirmed'].includes(o.status) && (
                <button
                  onClick={() => cancelOrder(o.id)}
                  disabled={cancellingId === o.id}
                  className="mt-3 text-red-500 hover:text-red-400 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {cancellingId === o.id ? t("جارٍ الإلغاء...", "Cancelling...") : t("إلغاء الطلب", "Cancel order")}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Tab: Wallet & Points ─────────────────────────────────────────────────────
function WalletTab({
  wallet, rewards, referral,
}: { wallet: AccountData["wallet"]; rewards: AccountData["rewards"]; referral: AccountData["referral"] | null }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [activeSection, setActiveSection] = useState<"wallet" | "points">("wallet");
  const [copied, setCopied]   = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ id: string; url?: string | null } | null>(null);

  const tier = TIER_CONFIG[rewards.tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;

  const copyCode = () => {
    if (referral) { navigator.clipboard.writeText(referral.code); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const TOPUP_AMOUNTS = [50, 100, 200, 500, 1000];
  const effectiveAmount = selectedAmount ?? (customAmount ? Number(customAmount) : 0);

  const startTopup = async (provider: "instapay" | "vodafone_cash") => {
    if (!Number.isFinite(effectiveAmount) || effectiveAmount <= 0) {
      setPayError(t("يرجى اختيار مبلغ صالح للشحن.", "Please choose a valid top-up amount."));
      return;
    }
    setPayError(null);
    setPaying(true);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purpose: "wallet_topup",
          provider,
          amount: effectiveAmount,
          currency: "EGP",
          paymentMethod: provider,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? t("تعذر بدء عملية الشحن.", "Unable to start the top-up process."));
      }
      const tx = payload.transaction;
      setLastTx({ id: tx?.id, url: tx?.checkoutUrl });
      if (tx?.checkoutUrl) {
        window.open(tx.checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : t("تعذر بدء عملية الشحن.", "Unable to start the top-up process."));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toggle */}
      <div className="flex gap-2">
        {[["wallet", t("💳 المحفظة", "💳 Wallet")], ["points", t("🏅 النقاط", "🏅 Points")]].map(([v, l]) => (
          <button key={v} onClick={() => setActiveSection(v as typeof activeSection)} className={`px-5 py-2 rounded-xl text-sm font-bold transition-colors ${activeSection === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {l}
          </button>
        ))}
      </div>

      {activeSection === "wallet" && (
        <>
          {/* Balance card */}
          <div className="bg-gradient-to-br from-blue-950/40 to-black border border-blue-500/30 rounded-2xl p-6 text-center">
            <div className="text-gray-400 text-sm mb-1">{t("رصيد المحفظة", "Wallet balance")}</div>
            <div className="text-4xl font-black text-white mb-1">{formatMoney(wallet.balance, lang)}</div>
            <div className="text-gray-400">{lang === "en" ? "EGP" : "جنيه مصري"}</div>
          </div>

          {/* Quick top-up */}
          <div className={CARD}>
            <h4 className="text-white font-black mb-3">{t("شحن سريع", "Quick top-up")}</h4>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {TOPUP_AMOUNTS.map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setSelectedAmount(v);
                    setCustomAmount("");
                    setLastTx(null);
                    setPayError(null);
                  }}
                  className={`text-white font-bold py-2 rounded-xl text-sm transition-colors ${selectedAmount === v ? "bg-blue-600" : "bg-gray-800 hover:bg-blue-600"}`}
                >
                  {formatMoney(v, lang)} {lang === "en" ? "EGP" : "ج.م"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="number" placeholder={t("مبلغ مخصص...", "Custom amount...")} className={INPUT} dir="ltr" />
              <button className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 rounded-xl transition-colors text-sm whitespace-nowrap">{t("شحن", "Top up")}</button>
            </div>
          </div>

          <div className={CARD}>
            <h4 className="text-white font-black mb-3">{t("الدفع لشحن المحفظة", "Pay to top up wallet")}</h4>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                placeholder={t("مبلغ مخصص...", "Custom amount...")}
                className={INPUT}
                dir="ltr"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setSelectedAmount(null);
                  setLastTx(null);
                  setPayError(null);
                }}
              />
              <button
                onClick={() => {
                  if (!customAmount) return;
                  setSelectedAmount(Number(customAmount));
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-black px-5 rounded-xl transition-colors text-sm whitespace-nowrap"
              >
                {t("تثبيت", "Set")}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => startTopup("instapay")}
                disabled={paying}
                className="bg-pink-600 hover:bg-pink-700 disabled:opacity-60 text-white font-black px-4 py-2 rounded-xl text-sm"
              >
                {t("الدفع عبر إنستاباي", "Pay with InstaPay")}
              </button>
              <button
                onClick={() => startTopup("vodafone_cash")}
                disabled={paying}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black px-4 py-2 rounded-xl text-sm"
              >
                {t("الدفع عبر فودافون كاش", "Pay with Vodafone Cash")}
              </button>
            </div>
            {payError && <div className="mt-2 text-xs text-red-400">{payError}</div>}
            {lastTx?.id && (
              <div className="mt-2 text-xs text-gray-400">
                {t("تم إنشاء معاملة الشحن. يمكنك متابعة التأكيد من هنا:", "Top-up transaction created. You can continue verification here:")}{" "}
                <a className="text-pink-300 underline" href={`/payment/verify?transactionId=${lastTx.id}`}>
                  {t("صفحة التحقق من الدفع", "Payment verification page")}
                </a>
              </div>
            )}
          </div>

          {/* Transactions */}
          <div className={CARD}>
            <h4 className="text-white font-black mb-4">{t("سجل المعاملات", "Transaction history")}</h4>
            <div className="space-y-3">
              {wallet.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black ${tx.type === "credit" ? "bg-green-900/40 text-green-400" : "bg-red-900/40 text-red-400"}`}>
                    {tx.type === "credit" ? "+" : "-"}
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-300 text-sm">{tx.description}</div>
                    <div className="text-gray-600 text-xs">{format(new Date(tx.createdAt), "d MMM yyyy", { locale: lang === "en" ? enUS : ar })}</div>
                  </div>
                  <span className={`font-black text-sm ${tx.type === "credit" ? "text-green-400" : "text-red-400"}`}>
                    {tx.type === "credit" ? "+" : "-"}{formatMoney(Math.abs(tx.amount), lang)} {lang === "en" ? "EGP" : "ج.م"}
                  </span>
                </div>
              ))}
              {wallet.transactions.length === 0 && <p className="text-gray-600 text-sm text-center py-4">{t("لا يوجد معاملات", "No transactions")}</p>}
            </div>
          </div>
        </>
      )}

      {activeSection === "points" && (
        <>
          {/* Points & tier card */}
          <div className={`${tier.bg} border ${tier.border} rounded-2xl p-6`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-gray-400 text-xs mb-1">{t("مستواك", "Your tier")}</div>
                <div className={`text-2xl font-black ${tier.color}`}>
                  {getTierLabel(rewards.tier, lang)}
                  {rewards.tier === "platinum" && " 👑"}
                  {rewards.tier === "gold"     && " 🥇"}
                  {rewards.tier === "silver"   && " 🥈"}
                  {rewards.tier === "bronze"   && " 🥉"}
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-black text-white">{rewards.points.toLocaleString("ar-EG")}</div>
                <div className="text-gray-400 text-xs">{t("نقطة", "points")}</div>
              </div>
            </div>

            {tier.next && (
              <>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{t("تقدمك للمستوى التالي", "Progress to next tier")}</span>
                  <span>{formatMoney(tier.next - rewards.points, lang)} {t("نقطة متبقية", "points left")}</span>
                </div>
                <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${tier.color.replace("text-", "bg-")}`} style={{ width: `${Math.min(100, (rewards.points / tier.next) * 100)}%` }} />
                </div>
              </>
            )}

            <div className="mt-4 pt-4 border-t border-white/10 text-center">
              <div className="text-gray-400 text-xs">{t("قيمة نقاطك", "Points value")}</div>
              <div className="text-yellow-400 font-black text-xl">{formatMoney(Math.floor(rewards.points / 10), lang)} {lang === "en" ? "EGP" : "ج.م"}</div>
            </div>
          </div>

          {/* Points history */}
          <div className={CARD}>
            <h4 className="text-white font-black mb-4">{t("تاريخ النقاط", "Points history")}</h4>
            <div className="space-y-3">
              {rewards.history.map((h) => (
                <div key={h.id} className="flex items-center gap-3 py-2 border-b border-gray-800/60 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${h.points >= 0 ? "bg-yellow-900/40 text-yellow-400" : "bg-gray-800 text-gray-400"}`}>
                    {h.points >= 0 ? "+" : ""}
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-300 text-sm">{h.reason}</div>
                    <div className="text-gray-600 text-xs">{format(new Date(h.createdAt), "d MMM yyyy", { locale: lang === "en" ? enUS : ar })}</div>
                  </div>
                  <span className={`font-black text-sm ${h.points >= 0 ? "text-yellow-400" : "text-gray-500"}`}>
                    {h.points >= 0 ? "+" : ""}{h.points}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Referral */}
          {referral && (
            <div className="bg-yellow-950/20 border border-yellow-500/30 rounded-2xl p-5">
              <h4 className="text-white font-black mb-2">{t("🎁 كود الإحالة الخاص بك", "🎁 Your referral code")}</h4>
              <p className="text-gray-400 text-sm mb-4">{t("شارك كودك مع أصدقائك واحصل على 50 جنيه لكل عضو جديد", "Share your code with friends and get 50 EGP for each new member")}</p>
              <div className="flex gap-2">
                <div className="flex-1 bg-black border border-yellow-500/30 rounded-xl px-4 py-2.5 text-yellow-400 font-black text-center tracking-widest" dir="ltr">
                  {referral.code}
                </div>
                <button onClick={copyCode} className={`px-4 rounded-xl font-bold text-sm transition-colors ${copied ? "bg-green-600 text-white" : "bg-yellow-500 hover:bg-yellow-400 text-black"}`}>
                  {copied ? t("تم النسخ", "Copied") : t("نسخ", "Copy")}
                </button>
              </div>
              <div className="mt-3 text-center text-gray-400 text-xs">
                {t("إجمالي ما كسبته", "Total earned")}: <span className="text-yellow-400 font-black">{formatMoney(referral.totalEarned, lang)} {lang === "en" ? "EGP" : "ج.م"}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab: Complaints ──────────────────────────────────────────────────────────
type ReviewItem = {
  id: string;
  displayName: string | null;
  content: string;
  rating: number;
  status: "pending" | "approved" | "rejected";
  adminNote?: string | null;
  createdAt: string;
};

function ReviewsTab({ user }: { user: AccountData["user"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ id: "", displayName: user.name, content: "", rating: 5 });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/testimonials", { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/testimonials", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ id: "", displayName: user.name, content: "", rating: 5 });
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("أضيفي رأيك ليظهر بعد مراجعة الإدارة على الصفحة الرئيسية", "Add your review to appear on the homepage after admin approval")}</h3>
        <form onSubmit={submit} className="space-y-4">
          <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={INPUT} placeholder={t("الاسم المعروض", "Display name")} />
          <select value={form.rating} onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })} className={INPUT}>
            {[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} {t("نجوم", "stars")}</option>)}
          </select>
          <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} className={`${INPUT} resize-none`} placeholder={t("اكتبي تجربتك...", "Write your review...")} />
          <button type="submit" disabled={saving} className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl transition-colors text-sm">
            {saving ? t("جارٍ الحفظ...", "Saving...") : form.id ? t("تحديث الرأي", "Update review") : t("إضافة الرأي", "Add review")}
          </button>
        </form>
      </div>

      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("آرائي السابقة", "My previous reviews")}</h3>
        {loading ? (
          <p className="text-gray-500 text-sm text-center py-6">{t("جارٍ تحميل الآراء...", "Loading reviews...")}</p>
        ) : items.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t("لا توجد آراء بعد", "No reviews yet")}</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-white font-bold">{item.displayName || user.name}</div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.status === "approved" ? "bg-green-500/20 text-green-400" : item.status === "rejected" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {item.status === "approved" ? t("منشور", "Published") : item.status === "rejected" ? t("مرفوض", "Rejected") : t("مراجعة", "Pending")}
                  </span>
                </div>
                <div className="mb-2 text-yellow-400">{"★".repeat(item.rating)}</div>
                <p className="text-sm leading-relaxed text-gray-300">{item.content}</p>
                {item.adminNote && <div className="mt-3 text-xs text-red-300">{t("ملاحظة الإدارة:", "Admin note:")} {item.adminNote}</div>}
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={() => setForm({ id: item.id, displayName: item.displayName || user.name, content: item.content, rating: item.rating })} className="text-sm font-bold text-yellow-400">{t("تعديل", "Edit")}</button>
                  <button type="button" onClick={async () => { await fetch("/api/testimonials", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); await load(); }} className="text-sm font-bold text-red-400">{t("حذف", "Delete")}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  "open": "مفتوحة", "in-progress": "قيد المعالجة", "resolved": "تم الحل", "closed": "مغلقة",
};
const COMPLAINT_STATUS_COLORS: Record<string, string> = {
  "open": "bg-red-900/30 text-red-400", "in-progress": "bg-yellow-900/30 text-yellow-400",
  "resolved": "bg-green-900/30 text-green-400", "closed": "bg-gray-800 text-gray-500",
};

interface ComplaintItem {
  id: string; subject: string; message: string; status: string;
  adminNote?: string | null; createdAt: string;
}

function ComplaintsTab() {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [form, setForm]             = useState({ subject: "", message: "" });
  const [sending, setSending]       = useState(false);
  const [toast, setToast]           = useState("");
  const [expanded, setExpanded]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/complaints");
      if (res.ok) setComplaints(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.message.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/complaints", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ subject: "", message: "" });
        setToast(t("✅ تم إرسال شكواك بنجاح، سيتم الرد قريباً", "✅ Your complaint was sent successfully. We will respond soon."));
        setTimeout(() => setToast(""), 4000);
        await load();
      } else {
        setToast(t("❌ حدث خطأ، حاول مرة أخرى", "❌ Something went wrong. Please try again."));
        setTimeout(() => setToast(""), 3000);
      }
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}

      {/* Submit form */}
        <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("📩 إرسال شكوى أو اقتراح", "📩 Send a complaint or suggestion")}</h3>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-gray-500 text-xs mb-1.5">{t("الموضوع", "Subject")}</label>
            <input
              value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder={t("اكتب موضوع شكواك...", "Write the complaint subject...")}
              className={INPUT} required
            />
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1.5">{t("تفاصيل الشكوى", "Complaint details")}</label>
            <textarea
              value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder={t("اشرح شكواك بالتفصيل...", "Describe your complaint in detail...")}
              rows={4} required
              className="w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder-gray-600 resize-none"
            />
          </div>
          <button type="submit" disabled={sending}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black px-6 py-2.5 rounded-xl transition-colors text-sm">
            {sending ? t("جارٍ الإرسال...", "Sending...") : t("إرسال الشكوى", "Send complaint")}
          </button>
        </form>
      </div>

      {/* Past complaints */}
      <div className={CARD}>
        <h3 className="text-white font-black mb-4">{t("شكاواي السابقة", "My previous complaints")}</h3>
        {loading ? (
          <p className="text-gray-500 text-sm text-center py-6">{t("جارٍ التحميل...", "Loading...")}</p>
        ) : complaints.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">📭</div>
            <p className="text-gray-500 text-sm">{t("لا يوجد شكاوى بعد", "No complaints yet")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-3 p-4 cursor-pointer"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-bold text-sm truncate">{c.subject}</div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {format(new Date(c.createdAt), "d MMMM yyyy", { locale: lang === "en" ? enUS : ar })}
                    </div>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-bold shrink-0 ${COMPLAINT_STATUS_COLORS[c.status] ?? "bg-gray-800 text-gray-500"}`}>
                    {lang === "en"
                      ? ({ open: "Open", "in-progress": "In progress", resolved: "Resolved", closed: "Closed" } as Record<string, string>)[c.status] ?? c.status
                      : COMPLAINT_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    className={`w-4 h-4 text-gray-500 transition-transform shrink-0 ${expanded === c.id ? "rotate-180" : ""}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {expanded === c.id && (
                  <div className="px-4 pb-4 border-t border-gray-700 pt-3 space-y-3">
                    <p className="text-gray-300 text-sm leading-relaxed">{c.message}</p>
                    {c.adminNote && (
                      <div className="bg-blue-950/30 border border-blue-800/50 rounded-xl p-3">
                        <div className="text-blue-400 text-xs font-bold mb-1">{t("💬 رد الإدارة:", "💬 Admin reply:")}</div>
                        <p className="text-gray-300 text-sm">{c.adminNote}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Notifications ───────────────────────────────────────────────────────
function NotificationsTab({ notifications: init }: { notifications: AccountData["notifications"] }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const [notifs, setNotifs] = useState(init);
  const unread = notifs.filter((n) => !n.isRead).length;

  const markAll = async () => {
    setNotifs((ns) => ns.map((n) => ({ ...n, isRead: true })));
    await fetch("/api/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
  };
  const markOne = async (id: string) => {
    setNotifs((ns) => ns.map((n) => n.id === id ? { ...n, isRead: true } : n));
    await fetch("/api/notifications", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: id }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-gray-400 text-sm">{formatMoney(unread, lang)} {t("غير مقروءة", "unread")}</span>
        {unread > 0 && (
          <button onClick={markAll} className="text-red-500 hover:text-red-400 text-sm font-medium transition-colors">
            {t("تحديد الكل كمقروء", "Mark all as read")}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifs.map((n) => (
          <div
            key={n.id}
            onClick={() => markOne(n.id)}
            className={`${CARD} flex items-start gap-4 cursor-pointer transition-all hover:border-gray-700 ${!n.isRead ? "border-red-600/30 bg-red-950/10" : ""}`}
          >
            <span className="text-xl shrink-0 mt-0.5">{NOTIF_ICONS[n.type] ?? ""}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-black ${n.isRead ? "text-gray-300" : "text-white"}`}>{n.title}</span>
                {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
              </div>
              <p className="text-gray-400 text-xs leading-relaxed">{n.body}</p>
              <span className="text-gray-600 text-xs mt-1 block">
                {format(new Date(n.createdAt), "d MMM yyyy", { locale: lang === "en" ? enUS : ar })}
              </span>
            </div>
          </div>
        ))}
        {notifs.length === 0 && (
          <div className={CARD + " text-center py-10"}>
            <div className="text-4xl mb-2">🔔</div>
            <p className="text-gray-400">{t("لا يوجد إشعارات", "No notifications")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function AccountClient({ data }: { data: AccountData }) {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab]     = useState<TabId>(isTabId(requestedTab) ? requestedTab : "profile");
  const [loggingOut, setLoggingOut]   = useState(false);

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (isTabId(nextTab)) {
      setActiveTab(nextTab);
    }
  }, [searchParams]);

  const unreadCount = data.notifications.filter((n) => !n.isRead).length;

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
    } finally {
      window.location.replace(`/?logout=${Date.now()}`);
    }
  };

  const membershipDaysLeft = data.membership
    ? Math.max(0, differenceInDays(new Date(data.membership.endDate), new Date()))
    : 0;

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="account-theme min-h-screen bg-[radial-gradient(circle_at_top,rgba(255,140,190,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,186,216,0.16),transparent_30%),linear-gradient(180deg,#2a0f1b_0%,#391320_48%,#4a1b2d_100%)] text-[#fff4f8]">
      {/* ── Header ── */}
      <div className="border-b border-[#ffbcdb]/20 bg-[#14060d]/92 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-pink-800 text-xl font-black text-white shadow-[0_18px_40px_rgba(190,24,93,0.35)]">
              {data.user.name?.[0] ?? "ع"}
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-black text-[#fff7fb]">{data.user.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {data.membership && (
                  <span className="rounded-full border border-pink-300/20 bg-pink-500/15 px-2.5 py-0.5 text-xs font-bold text-pink-200">
                    {data.membership.plan}
                  </span>
                )}
                {data.rewards && (
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${TIER_CONFIG[data.rewards.tier as keyof typeof TIER_CONFIG]?.bg ?? ""} ${TIER_CONFIG[data.rewards.tier as keyof typeof TIER_CONFIG]?.color ?? "text-gray-400"}`}>
                    {getTierLabel(data.rewards.tier, lang)}
                  </span>
                )}
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <a href="/" className="flex items-center gap-1.5 text-[#d7aabd] transition-colors text-sm hover:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("الرئيسية", "Home")}
              </a>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="flex items-center gap-1.5 text-[#c896aa] transition-colors text-sm hover:text-pink-300 disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {loggingOut ? t("جارٍ الخروج...", "Logging out...") : t("تسجيل الخروج", "Log out")}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
            <a
              href="/"
              className="flex items-center gap-1.5 rounded-xl border border-[#ffbcdb]/20 bg-white/5 px-3 py-2 text-sm text-[#d7aabd] transition-colors hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("الرئيسية", "Home")}
            </a>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex items-center gap-1.5 rounded-xl border border-pink-300/20 bg-pink-500/10 px-3 py-2 text-sm text-[#ffd6e7] transition-colors hover:bg-pink-500/15 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {loggingOut ? t("جاري الخروج...", "Logging out...") : t("تسجيل الخروج", "Log out")}
            </button>
          </div>

          {/* Quick stats */}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon="💳" label={t("رصيد المحفظة", "Wallet balance")} value={`${formatMoney(data.wallet.balance, lang)} ${lang === "en" ? "EGP" : "ج.م"}`} color="text-blue-400" />
            <StatCard icon="🏅" label={t("نقاط الولاء", "Reward points")} value={formatMoney(data.rewards.points, lang)} color="text-yellow-400" />
            <StatCard icon="📅" label={t("أيام الاشتراك", "Membership days")} value={membershipDaysLeft > 0 ? `${formatMoney(membershipDaysLeft, lang)} ${t("يوم", "days")}` : t("منتهي", "Expired")} color={membershipDaysLeft > 7 ? "text-green-400" : "text-red-400"} />
            <StatCard icon="🔔" label={t("إشعارات جديدة", "New notifications")} value={unreadCount.toString()} color={unreadCount > 0 ? "text-red-400" : "text-gray-400"} />
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-7xl mx-auto px-4 py-6 w-full">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Sidebar tabs */}
          <aside className="shrink-0 lg:w-56">
            <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-w-max items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium transition-all lg:w-full ${lang === "ar" ? "text-right" : "text-left"} ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-pink-600 to-pink-500 text-white shadow-[0_18px_40px_rgba(190,24,93,0.34)]"
                      : "text-[#d7aabd] hover:bg-[rgba(255,130,186,0.14)] hover:text-white"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{getTabLabel(tab.id, lang)}</span>
                  {tab.id === "notifications" && unreadCount > 0 && (
                    <span className={`${lang === "ar" ? "mr-auto" : "ml-auto"} flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-black text-white`}>
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {activeTab === "profile"       && <ProfileTab       user={data.user} />}
            {activeTab === "membership"    && <MembershipTab    membership={data.membership} />}
            {activeTab === "bookings"      && <BookingsTab      bookings={data.bookings} />}
            {activeTab === "orders"        && <OrdersTab        orders={data.orders} />}
            {activeTab === "wallet"        && <WalletTab        wallet={data.wallet} rewards={data.rewards} referral={data.referral} />}
            {activeTab === "reviews"       && <ReviewsTab      user={data.user} />}
            {activeTab === "notifications" && <NotificationsTab notifications={data.notifications} />}
            {activeTab === "complaints"    && <ComplaintsTab />}
          </main>
        </div>
      </div>
    </div>
  );
}

