"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/language";

function ResetPasswordForm() {
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const tokenValid = useMemo(() => token.trim().length > 0, [token]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (password.length < 6) {
      setError(t("كلمة المرور يجب أن تكون 6 أحرف على الأقل.", "Password must be at least 6 characters."));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("كلمتا المرور غير متطابقتين.", "Passwords do not match."));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || t("تعذر إعادة ضبط كلمة المرور.", "Unable to reset the password."));
        return;
      }

      setInfo(t("تم تحديث كلمة المرور بنجاح. سيتم تحويلك إلى صفحة الدخول.", "Your password has been updated successfully. Redirecting to login."));
      setTimeout(() => {
        const search = new URLSearchParams({ reset: "1" });
        if (email) search.set("email", email);
        router.push(`/login?${search.toString()}`);
      }, 1000);
    } catch {
      setError(t("تعذر إعادة ضبط كلمة المرور الآن.", "Unable to reset the password right now."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="fitzone-login-shell flex min-h-screen items-center justify-center p-4">
      <div className="fitzone-login-orb fitzone-login-orb-1" />
      <div className="fitzone-login-orb fitzone-login-orb-2" />

      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <h1 className="mb-2 text-2xl font-black text-white">{t("إعادة ضبط كلمة المرور", "Reset password")}</h1>
        <p className="mb-6 text-sm text-gray-400">
          {t("اختاري كلمة مرور جديدة لحسابك.", "Choose a new password for your account.")}
        </p>

        {!tokenValid ? (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {t("رابط إعادة الضبط غير صالح.", "The password reset link is invalid.")}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div> : null}
            {info ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{info}</div> : null}

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("كلمة المرور الجديدة", "New password")}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("تأكيد كلمة المرور", "Confirm password")}</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="******"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? t("جارٍ الحفظ...", "Saving...") : t("حفظ كلمة المرور الجديدة", "Save new password")}
            </button>
          </form>
        )}

        <div className="mt-5 text-center text-sm">
          <Link href="/login" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
            {t("العودة لتسجيل الدخول", "Back to login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
