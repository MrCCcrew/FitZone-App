"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/language";

function VerifyEmailForm() {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const router = useRouter();
  const params = useSearchParams();
  const defaultEmail = params.get("email") ?? "";
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const sentFlag = params.get("sent");
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(
    sentFlag === "0"
      ? t("تعذر إرسال رسالة التفعيل تلقائيًا. يمكنك طلب إعادة الإرسال من الأسفل.", "Automatic verification email could not be sent. You can request a resend below.")
      : defaultEmail
        ? (lang === "ar" ? `أدخل رمز التفعيل الذي أرسلناه إلى ${defaultEmail}` : `Enter the verification code we sent to ${defaultEmail}`)
        : "",
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const redirectTarget = useMemo(
    () => `/login?verified=1&email=${encodeURIComponent(email || defaultEmail)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
    [callbackUrl, defaultEmail, email],
  );

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || t("تعذر تفعيل البريد الإلكتروني.", "Unable to verify your email."));
        return;
      }

      router.push(redirectTarget);
    } catch {
      setError(t("تعذر تفعيل البريد الإلكتروني حاليًا. حاول مرة أخرى.", "Unable to verify your email right now. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    setResending(true);

    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error || t("تعذر إعادة إرسال رمز التفعيل.", "Unable to resend the verification code."));
        return;
      }

      setInfo(lang === "ar" ? `تم إرسال رمز تفعيل جديد إلى ${email}` : `A new verification code has been sent to ${email}`);
    } catch {
      setError(t("تعذر إعادة إرسال رمز التفعيل الآن.", "Unable to resend the verification code right now."));
    } finally {
      setResending(false);
    }
  };

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="fitzone-login-shell flex min-h-screen items-center justify-center p-4">
      <div className="fitzone-login-orb fitzone-login-orb-1" />
      <div className="fitzone-login-orb fitzone-login-orb-2" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-1" dir="ltr">
            <span className="text-4xl font-black text-red-600">FIT</span>
            <span className="text-4xl font-black text-pink-300">ZONE</span>
          </div>
          <p className="text-sm text-gray-400">{t("بني سويف - مصر", "Beni Suef - Egypt")}</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <h1 className="mb-2 text-2xl font-black text-white">{t("تفعيل البريد الإلكتروني", "Verify email")}</h1>
          <p className="mb-6 text-sm text-gray-400">{t("أدخلي الرمز المكوّن من 6 أرقام لإكمال إنشاء الحساب", "Enter the 6-digit code to finish creating your account")}</p>

          {info ? (
            <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
              {info}
            </div>
          ) : null}

          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleVerify} className="space-y-4">
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

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("رمز التفعيل", "Verification code")}</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.35em] text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? t("جارٍ التفعيل...", "Verifying...") : t("تفعيل الحساب", "Verify account")}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || !email}
            className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 py-3 font-bold text-pink-200 transition-colors hover:border-pink-400 hover:text-pink-100 disabled:opacity-50"
          >
            {resending ? t("جارٍ إعادة الإرسال...", "Resending...") : t("إعادة إرسال رمز التفعيل", "Resend verification code")}
          </button>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-400">{t("لديك حساب مفعل بالفعل؟", "Already have a verified account?")} </span>
            <Link href="/login" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
              {t("تسجيل الدخول", "Log in")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailForm />
    </Suspense>
  );
}
