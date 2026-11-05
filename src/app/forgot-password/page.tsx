"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/language";

export default function ForgotPasswordPage() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || t("تعذر إرسال رابط إعادة الضبط الآن.", "Unable to send the reset link right now."));
        return;
      }

      setInfo(
        t(
          "إذا كان البريد الإلكتروني مسجلًا، فسيصلك رابط لإعادة ضبط كلمة المرور.",
          "If the email is registered, you will receive a password reset link.",
        ),
      );
    } catch {
      setError(t("تعذر إرسال رابط إعادة الضبط الآن.", "Unable to send the reset link right now."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="fitzone-login-shell flex min-h-screen items-center justify-center p-4">
      <div className="fitzone-login-orb fitzone-login-orb-1" />
      <div className="fitzone-login-orb fitzone-login-orb-2" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <h1 className="mb-2 text-2xl font-black text-white">{t("استعادة كلمة المرور", "Forgot password")}</h1>
        <p className="mb-6 text-sm text-gray-400">
          {t("أدخلي بريدك الإلكتروني وسنرسل لك رابطًا لإعادة ضبط كلمة المرور.", "Enter your email and we will send you a password reset link.")}
        </p>

        {error ? <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div> : null}
        {info ? <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{info}</div> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm text-gray-300">{t("البريد الإلكتروني", "Email")}</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? t("جارٍ الإرسال...", "Sending...") : t("إرسال رابط إعادة الضبط", "Send reset link")}
          </button>
        </form>

        <div className="mt-5 text-center text-sm">
          <Link href="/login" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
            {t("العودة لتسجيل الدخول", "Back to login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
