"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/lib/language";

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

function RegisterForm() {
  const { lang } = useLang();
  const t = (arText: string, enText: string) => (lang === "ar" ? arText : enText);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [referralCode, setReferralCode] = useState("");
  const [referralFromUrl, setReferralFromUrl] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setReferralCode(ref.toUpperCase());
      setReferralFromUrl(true);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!acceptedTerms) {
      setError(t(
        "يجب الموافقة على التعليمات أولاً قبل الضغط على زر التسجيل.",
        "You must accept the instructions before submitting the registration."
      ));
      return;
    }

    if (form.password !== form.confirm) {
      setError(t("كلمتا المرور غير متطابقتين.", "Passwords do not match."));
      return;
    }

    if (form.password.length < 6) {
      setError(t("كلمة المرور يجب أن تكون 6 أحرف على الأقل.", "Password must be at least 6 characters."));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          referralCode: referralCode.trim().toUpperCase() || null,
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if ((res.ok || res.status === 409) && data?.requiresVerification && data?.email) {
        const search = new URLSearchParams({ email: data.email });
        if (data.emailSent === false) search.set("sent", "0");
        router.push(`/verify-email?${search.toString()}`);
        return;
      }

      if (!res.ok) {
        setError(data?.error || t("حدث خطأ أثناء إنشاء الحساب.", "An error occurred while creating the account."));
        return;
      }

      setInfo(t("تم إنشاء الحساب. جاري تحويلك إلى صفحة التفعيل...", "Account created. Redirecting you to verification..."));
    } catch {
      setError(t("تعذر إنشاء الحساب حاليًا. حاول مرة أخرى بعد قليل.", "Unable to create the account right now. Please try again later."));
    } finally {
      setLoading(false);
    }
  };

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value }));

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
          <h1 className="mb-2 text-2xl font-black text-white">{t("إنشاء حساب جديد", "Create a new account")}</h1>
          <p className="mb-6 text-sm text-gray-400">{t("انضمي لعائلة فيت زون اليوم", "Join the Fit Zone family today")}</p>

          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>
          ) : null}

          {info ? (
            <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{info}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("الاسم الكامل", "Full name")}</label>
              <input type="text" required value={form.name} onChange={set("name")}
                placeholder={t("مثال: تمارا أحمد", "Example: Tamara Ahmed")}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("البريد الإلكتروني", "Email")}</label>
              <input type="email" required value={form.email} onChange={set("email")}
                placeholder="example@email.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("رقم الهاتف", "Phone number")}</label>
              <input type="tel" value={form.phone} onChange={set("phone")}
                placeholder="01xxxxxxxxx"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("كلمة المرور", "Password")}</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} required value={form.password} onChange={set("password")}
                  placeholder={t("6 أحرف على الأقل", "At least 6 characters")}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-gray-400 transition-colors hover:text-pink-200">
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">{t("تأكيد كلمة المرور", "Confirm password")}</label>
              <div className="relative">
                <input type={showConfirmPassword ? "text" : "password"} required value={form.confirm} onChange={set("confirm")}
                  placeholder="********"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
                />
                <button type="button" onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-gray-400 transition-colors hover:text-pink-200">
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>

            {/* Referral Code */}
            <div>
              <label className="mb-1.5 block text-sm text-gray-300">
                {t("كود الإحالة", "Referral code")}{" "}
                <span className="text-gray-500">{t("(اختياري)", "(optional)")}</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    if (!referralFromUrl) setReferralCode(e.target.value.toUpperCase());
                  }}
                  readOnly={referralFromUrl}
                  placeholder={t("مثال: FZ-ABC123", "e.g. FZ-ABC123")}
                  className={`w-full rounded-xl border px-4 py-3 text-sm placeholder:text-gray-500 transition-colors focus:outline-none ${
                    referralFromUrl
                      ? "border-pink-500/40 bg-pink-950/20 text-pink-300 cursor-default"
                      : "border-white/10 bg-white/5 text-white focus:border-pink-400"
                  }`}
                />
                {referralFromUrl && (
                  <span className="absolute inset-y-0 end-3 flex items-center text-xs text-pink-400">
                    {t("تمت الإضافة تلقائياً", "Auto-filled")}
                  </span>
                )}
              </div>
              {referralCode && !referralFromUrl && (
                <p className="mt-1 text-xs text-pink-300">
                  {t("سيتم مكافأة صاحب هذا الكود عند تفعيل حسابك.", "The referrer will be rewarded when your account is activated.")}
                </p>
              )}
            </div>

            {/* Terms */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 text-sm font-bold text-white">{t("تعليمات مهمة قبل التسجيل", "Important instructions before registration")}</p>
              <ul className="mb-4 space-y-2 text-sm leading-6 text-gray-300">
                <li>{t("البطاقة غير قابلة للتحويل أو الاستبدال تحت أي ظرف من الظروف.", "The card is non-transferable and non-exchangeable under any circumstances.")}</li>
                <li>{t("سيتم تطبيق رسوم بقيمة 10 د.ك لإصدار بدل فاقد عند الإبلاغ عن فقدان أي بطاقة.", "A fee of 10 KWD will be charged for issuing a replacement card after reporting any lost card.")}</li>
                <li>{t("في حالة الاسترداد، سيتم استرداد 90% فقط من إجمالي المبلغ المدفوع للبطاقات غير المستخدمة في غضون 14 يوماً فقط من تاريخ الشراء.", "In case of refund, only 90% of the total amount paid will be refunded for unused cards within 14 days from the purchase date.")}</li>
                <li>{t("للمرضى الذين لديهم تأمين صحي، سوف تطبق الامتيازات المذكورة أعلاه على الخدمات الغير مغطاة بالتأمين الصحي.", "For patients with health insurance, the above benefits will apply to services not covered by health insurance.")}</li>
              </ul>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-200">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent accent-red-600"
                />
                <span>{t("أوافق على التعليمات المذكورة أعلاه.", "I agree to the instructions above.")}</span>
              </label>
            </div>

            <button type="submit" disabled={loading || !acceptedTerms}
              className="mt-2 w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? t("جاري إنشاء الحساب...", "Creating account...") : t("إنشاء الحساب", "Create account")}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-400">{t("لديك حساب بالفعل؟", "Already have an account?")} </span>
            <Link href="/login" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
              {t("تسجيل الدخول", "Log in")}
            </Link>
          </div>

          <div className="mt-3 text-center">
            <Link href="/" className="text-xs text-gray-500 transition-colors hover:text-gray-300">
              {t("العودة إلى الموقع الرئيسي", "Back to main site")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
