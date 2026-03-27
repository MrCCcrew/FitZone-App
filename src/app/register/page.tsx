"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

      window.location.href = "/account";
    } catch {
      setError("تعذر إنشاء الحساب حاليًا. حاولي مرة أخرى بعد قليل.");
    } finally {
      setLoading(false);
    }
  };

  const set =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: e.target.value }));

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 inline-flex items-center gap-1" dir="ltr">
            <span className="text-4xl font-black text-red-600">FIT</span>
            <span className="text-4xl font-black text-yellow-400">ZONE</span>
          </div>
          <p className="text-sm text-gray-500">بني سويف - مصر</p>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8">
          <h1 className="mb-2 text-2xl font-black text-white">إنشاء حساب جديد</h1>
          <p className="mb-6 text-sm text-gray-500">انضمي لعائلة فيت زون اليوم</p>

          {error ? (
            <div className="mb-5 rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">الاسم الكامل</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={set("name")}
                placeholder="مثال: تمارا أحمد"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-400">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={set("email")}
                placeholder="example@email.com"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-400">رقم الهاتف</label>
              <input
                type="tel"
                value={form.phone}
                onChange={set("phone")}
                placeholder="01xxxxxxxxx"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-400">كلمة المرور</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={set("password")}
                placeholder="6 أحرف على الأقل"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-400">تأكيد كلمة المرور</label>
              <input
                type="password"
                required
                value={form.confirm}
                onChange={set("confirm")}
                placeholder="********"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
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
            <span className="text-gray-500">لديك حساب بالفعل؟ </span>
            <Link href="/login" className="font-bold text-yellow-400 transition-colors hover:text-yellow-300">
              تسجيل الدخول
            </Link>
          </div>

          <div className="mt-3 text-center">
            <Link href="/" className="text-xs text-gray-600 transition-colors hover:text-gray-400">
              العودة إلى الموقع الرئيسي
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
