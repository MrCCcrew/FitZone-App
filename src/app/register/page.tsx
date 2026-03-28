"use client";

import { useState } from "react";
import Link from "next/link";

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

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }

    if (form.password.length < 6) {
      setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
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
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if (!res.ok) {
        setError(data?.error || "حدث خطأ أثناء إنشاء الحساب");
        return;
      }

      window.location.href = "/";
    } catch {
      setError("تعذر إنشاء الحساب حاليًا. حاول مرة أخرى بعد قليل.");
    } finally {
      setLoading(false);
    }
  };

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value }));

  return (
    <div dir="rtl" className="fitzone-login-shell flex min-h-screen items-center justify-center p-4">
      <div className="fitzone-login-orb fitzone-login-orb-1" />
      <div className="fitzone-login-orb fitzone-login-orb-2" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-1" dir="ltr">
            <span className="text-4xl font-black text-red-600">FIT</span>
            <span className="text-4xl font-black text-pink-300">ZONE</span>
          </div>
          <p className="text-sm text-gray-400">بني سويف - مصر</p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <h1 className="mb-2 text-2xl font-black text-white">إنشاء حساب جديد</h1>
          <p className="mb-6 text-sm text-gray-400">انضمي لعائلة فيت زون اليوم</p>

          {error ? (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-300">الاسم الكامل</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set("name")}
                placeholder="مثال: تمارا أحمد"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="example@email.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">رقم الهاتف</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="01xxxxxxxxx"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={set("password")}
                  placeholder="6 أحرف على الأقل"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-gray-400 transition-colors hover:text-pink-200"
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-300">تأكيد كلمة المرور</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={form.confirm}
                  onChange={set("confirm")}
                  placeholder="********"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-sm text-white placeholder:text-gray-500 transition-colors focus:border-pink-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-gray-400 transition-colors hover:text-pink-200"
                  aria-label={showConfirmPassword ? "إخفاء تأكيد كلمة المرور" : "إظهار تأكيد كلمة المرور"}
                >
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-400">لديك حساب بالفعل؟ </span>
            <Link href="/login" className="font-bold text-pink-300 transition-colors hover:text-pink-200">
              تسجيل الدخول
            </Link>
          </div>

          <div className="mt-3 text-center">
            <Link href="/" className="text-xs text-gray-500 transition-colors hover:text-gray-300">
              العودة إلى الموقع الرئيسي
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
