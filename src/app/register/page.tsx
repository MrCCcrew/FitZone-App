"use client";

import { useState, useEffect, Suspense } from "react";
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

function SocialButtons({ lang, acceptedTerms }: { lang: string; acceptedTerms: boolean }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  return (
    <div className="space-y-3">
      <div className="relative flex items-center py-2">
        <div className="flex-grow border-t border-white/10" />
        <span className="mx-3 flex-shrink text-xs text-gray-500">{t("أو", "or")}</span>
        <div className="flex-grow border-t border-white/10" />
      </div>
      <a
        href={acceptedTerms ? "/api/auth/oauth/google" : undefined}
        onClick={!acceptedTerms ? (e) => e.preventDefault() : undefined}
        aria-disabled={!acceptedTerms}
        className={`flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 py-3 text-sm font-medium transition-colors ${
          acceptedTerms
            ? "text-white hover:bg-white/10 cursor-pointer"
            : "text-white/40 cursor-not-allowed"
        }`}
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

    if (form.name.trim().split(/\s+/).length < 3) {
      setError(t(
        "يجب إدخال ثلاثة أسماء على الأقل (الاسم الأول والأوسط والأخير).",
        "Please enter at least three names (first, middle, and last name)."
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
              <p className="mb-3 text-sm font-bold text-white">
                📌 {t("التعليمات وشروط إنشاء الحساب", "Account Creation Terms & Instructions")}
              </p>

              <div className="mb-4 max-h-72 overflow-y-auto space-y-4 pe-1 text-sm leading-6 text-gray-300 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20">

                {/* General */}
                <div>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("تأكد إن كل البيانات اللي بتدخلها صحيحة عشان تقدر تستخدم حسابك بسهولة.", "Make sure all the information you enter is accurate so you can use your account easily.")}</li>
                    <li>• {t("رقم الموبايل والبريد الإلكتروني لازم يكونوا شغالين لاستلام كود التفعيل والإشعارات.", "Your mobile number and email must be active to receive the activation code and notifications.")}</li>
                  </ul>
                </div>

                {/* Activation */}
                <div>
                  <p className="mb-1 font-bold text-white">🔐 {t("تفعيل الحساب", "Account Activation")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("هيتم إرسال كود تفعيل على البريد الإلكتروني.", "An activation code will be sent to your email.")}</li>
                    <li>• {t("لازم تفعيل الحساب بالكود قبل استخدام أي خدمة داخل الموقع.", "You must activate your account with the code before using any service on the site.")}</li>
                  </ul>
                </div>

                {/* Loyalty */}
                <div>
                  <p className="mb-1 font-bold text-white">🎁 {t("نقاط الولاء (Loyalty Points)", "Loyalty Points")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("كل 1 جنيه بتدفعه على الموقع (متجر أو اشتراك جيم) = بيتحول لنقاط في حسابك.", "Every 1 EGP you spend on the site (store or gym subscription) = converted to points in your account.")}</li>
                    <li>• {t("تقدر تستخدم النقاط في أي وقت على أي خدمة أو منتج داخل الموقع.", "You can use your points at any time on any service or product on the site.")}</li>
                    <li>• {t("صلاحية استخدام النقاط 6 شهور فقط من تاريخ إضافتها وبعدها بتنتهي تلقائيًا.", "Points are valid for 6 months from the date they were added, after which they expire automatically.")}</li>
                  </ul>
                </div>

                {/* Welcome points */}
                <div>
                  <p className="mb-1 font-bold text-white">🎉 {t("نقاط الترحيب", "Welcome Points")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("بمجرد إنشاء الحساب، هيتم إضافة 100 نقطة هدية في حسابك ترحيبًا بيكي 🎁", "As soon as you create your account, 100 gift points will be added as a welcome bonus 🎁")}</li>
                  </ul>
                </div>

                {/* Referral */}
                <div>
                  <p className="mb-1 font-bold text-white">👥 {t("نظام الإحالة (Referral)", "Referral System")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("هتلاقي كود الإحالة الخاص بيكي داخل حسابك الشخصي بعد التسجيل.", "You'll find your personal referral code inside your profile after registration.")}</li>
                    <li>• {t("تقدري تشاركيه مع أصحابك.", "You can share it with your friends.")}</li>
                    <li>• {t("أول ما حد يسجل باستخدام كودك، هينزل في حسابك 50 جنيه رصيد صافي 💰", "Once someone registers using your code, 50 EGP net balance will be credited to your account 💰")}</li>
                  </ul>
                </div>

                {/* Profile */}
                <div>
                  <p className="mb-1 font-bold text-white">⚙️ {t("استكمال البيانات", "Completing Your Profile")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("بعد التسجيل، لازم تكملي بياناتك داخل الحساب الشخصي.", "After registration, you must complete your profile info inside your personal account.")}</li>
                    <li>• {t("عشان تقدر تظهرلك كل خدمات ومميزات الموقع بشكل كامل.", "So that all services and features of the site are fully shown to you.")}</li>
                  </ul>
                </div>

                {/* Privacy */}
                <div>
                  <p className="mb-1 font-bold text-white">🔒 {t("الأمان والخصوصية", "Security & Privacy")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("بياناتك سرية تمامًا ومش هتتم مشاركتها مع أي طرف تالت.", "Your data is completely confidential and will not be shared with any third party.")}</li>
                    <li>• {t("يُفضل عدم مشاركة كلمة المرور مع أي شخص للحفاظ على أمان حسابك.", "It is recommended not to share your password with anyone to keep your account secure.")}</li>
                  </ul>
                </div>

                {/* Support */}
                <div>
                  <p className="mb-1 font-bold text-white">📞 {t("الدعم", "Support")}</p>
                  <ul className="space-y-1 ps-1">
                    <li>• {t("في حالة وجود أي مشكلة، تقدري تتواصلي مع خدمة العملاء في أي وقت.", "In case of any problem, you can contact customer service at any time.")}</li>
                  </ul>
                </div>

                {/* Footer highlights */}
                <div className="border-t border-white/10 pt-3 space-y-1 text-pink-300 font-medium">
                  <p>✔️ {t("التسجيل سهل وسريع (أقل من 30 ثانية)", "Registration is easy and fast (less than 30 seconds)")}</p>
                  <p>✔️ {t("ابدأي دلوقتي واستفيدي من النقاط والهدايا 🎁", "Start now and benefit from points and gifts 🎁")}</p>
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-3 text-sm text-gray-200">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent accent-red-600"
                />
                <span>{t("قرأت وأوافق على جميع التعليمات والشروط المذكورة أعلاه.", "I have read and agree to all the terms and instructions above.")}</span>
              </label>
            </div>

            <button type="submit" disabled={loading || !acceptedTerms}
              className="mt-2 w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? t("جاري إنشاء الحساب...", "Creating account...") : t("إنشاء الحساب", "Create account")}
            </button>
          </form>

          <SocialButtons lang={lang} acceptedTerms={acceptedTerms} />

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
