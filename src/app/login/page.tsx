"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/language";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073c0 6.027 4.388 11.02 10.125 11.927v-8.437H7.078v-3.49h3.047V9.414c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.929-1.956 1.881v2.269h3.328l-.532 3.49h-2.796v8.437C19.612 23.093 24 18.1 24 12.073z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function SocialButtons({ lang }: { lang: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <div className="space-y-3">
      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-white/10" />
        <span className="mx-3 flex-shrink text-xs text-gray-500">{t("أو", "or")}</span>
        <div className="flex-grow border-t border-white/10" />
      </div>
      <a
        href="/api/auth/oauth/google"
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        <GoogleIcon />
        {t("المتابعة بحساب جوجل", "Continue with Google")}
      </a>
      <div className="relative flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/40 cursor-not-allowed select-none">
        <FacebookIcon />
        {t("المتابعة بحساب فيسبوك", "Continue with Facebook")}
        <span className="absolute end-3 rounded-md bg-white/10 px-2 py-0.5 text-xs text-gray-400">{t("قريباً", "Soon")}</span>
      </div>
      <div className="relative flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium text-white/40 cursor-not-allowed select-none">
        <AppleIcon />
        {t("المتابعة بحساب أبل", "Continue with Apple")}
        <span className="absolute end-3 rounded-md bg-white/10 px-2 py-0.5 text-xs text-gray-400">{t("قريباً", "Soon")}</span>
      </div>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
      <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.6 10.6A2 2 0 0012 16a2 2 0 001.4-.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 4.2A10.9 10.9 0 0112 4c5.4 0 9.4 3.8 10 8-.2 1.4-.8 2.7-1.7 3.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.2 6.3A11.1 11.1 0 002 12c.6 4.2 4.6 8 10 8 1.8 0 3.4-.4 4.8-1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} className="h-5 w-5">
      <path d="M2 12c.6-4.2 4.6-8 10-8s9.4 3.8 10 8c-.6 4.2-4.6 8-10 8S2.6 16.2 2 12z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function normalizeCallbackUrl(value: string | null) {
  if (!value) return "/";
  if (value.startsWith("/")) return value;

  try {
    const url = new URL(value);
    if (url.hostname === "fitzoneland.com" || url.hostname === "www.fitzoneland.com") {
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
  } catch {}

  return "/";
}

function LoginForm() {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const params = useSearchParams();
  const router = useRouter();
  const callbackUrl = useMemo(() => normalizeCallbackUrl(params.get("callbackUrl")), [params]);
  const verified = params.get("verified");
  const verifiedEmail = params.get("email");

  const [form, setForm] = useState({ email: verifiedEmail ?? "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(form),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if (!res.ok) {
        if (data?.requiresVerification && data?.email) {
          router.push(`/verify-email?email=${encodeURIComponent(data.email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
          return;
        }

        setError(data?.error || t("البريد الإلكتروني أو كلمة المرور غير صحيحة.", "Incorrect email or password."));
        return;
      }

      window.location.href = callbackUrl;
    } catch {
      setError(t("تعذر تسجيل الدخول حاليًا. حاول مرة أخرى بعد قليل.", "Unable to log in right now. Please try again later."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="fitzone-login-shell flex min-h-screen items-center justify-center p-4">
      <div className="fitzone-login-orb fitzone-login-orb-1" />
      <div className="fitzone-login-orb fitzone-login-orb-2" />

      {/* Fixed back button */}
      <a
        href="/"
        aria-label={t("العودة للرئيسية", "Back to home")}
        className="fixed top-4 z-50"
        style={{ [lang === "ar" ? "right" : "left"]: "16px" }}
      >
        <span className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-bold text-white backdrop-blur-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" style={{ transform: lang === "ar" ? "scaleX(-1)" : undefined }}>
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          {t("الرئيسية", "Home")}
        </span>
      </a>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-1" dir="ltr">
            <span className="text-4xl font-black text-red-600">FIT</span>
            <span className="text-4xl font-black text-pink-300">ZONE</span>
          </div>
          <p className="text-sm text-gray-400">{t("بني سويف - مصر", "Beni Suef - Egypt")}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <h1 className="mb-2 text-2xl font-black text-white">{t("تسجيل الدخول", "Log in")}</h1>
          <p className="mb-6 text-sm text-gray-400">{t("أهلًا بك في فيت زون", "Welcome to Fit Zone")}</p>

          {verified ? (
            <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
              {t("تم تفعيل بريدك الإلكتروني بنجاح. يمكنك تسجيل الدخول الآن.", "Your email was verified successfully. You can log in now.")}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("البريد الإلكتروني", "Email")}</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                placeholder="example@email.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("كلمة المرور", "Password")}</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                  placeholder="********"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-gray-400 transition-colors hover:text-pink-200"
                  aria-label={showPassword ? t("إخفاء كلمة المرور", "Hide password") : t("إظهار كلمة المرور", "Show password")}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <div className="text-end">
              <Link href="/forgot-password" className="text-xs text-pink-300 transition-colors hover:text-pink-200">
                {t("نسيت كلمة المرور؟", "Forgot password?")}
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? t("جاري تسجيل الدخول...", "Logging in...") : t("تسجيل الدخول", "Log in")}
            </button>
          </form>

          <SocialButtons lang={lang} />

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-400">{t("ليس لديك حساب؟", "Don't have an account?")} </span>
            <Link href="/register" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
              {t("إنشاء حساب جديد", "Create a new account")}
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-xs text-gray-500 transition-colors hover:text-gray-300">
              {t("العودة إلى الموقع الرئيسي", "Back to main site")}
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          {t("هل أنت من فريق الإدارة؟", "Are you part of the admin team?")}{" "}
          <Link href="/admin/login" className="text-pink-200 transition-colors hover:text-pink-100">
            {t("تسجيل دخول الإدارة", "Admin login")}
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
