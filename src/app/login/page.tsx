"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function normalizeCallbackUrl(value: string | null) {
  if (!value) return "/account";

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "fitzoneland.com" || url.hostname === "www.fitzoneland.com") {
      return `${url.pathname}${url.search}${url.hash}` || "/account";
    }
  } catch {
    return "/account";
  }

  return "/account";
}

function LoginForm() {
  const params = useSearchParams();
  const callbackUrl = normalizeCallbackUrl(params.get("callbackUrl"));

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const data = contentType.includes("application/json") ? await res.json() : null;

      if (!res.ok) {
        setError(data?.error || "البريد الإلكتروني أو كلمة المرور غير صحيحة");
        return;
      }

      window.location.href = callbackUrl;
    } catch {
      setError("تعذر تسجيل الدخول حاليًا. حاولي مرة أخرى بعد قليل.");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="mb-2 text-2xl font-black text-white">تسجيل الدخول</h1>
          <p className="mb-6 text-sm text-gray-500">أهلًا بك في فيت زون</p>

          {error ? (
            <div className="mb-5 rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm text-gray-400">البريد الإلكتروني</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                placeholder="example@email.com"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-gray-400">كلمة المرور</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
                placeholder="********"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-4 py-3 text-sm text-white placeholder-gray-600 transition-colors focus:border-red-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-red-600 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-500">ليس لديك حساب؟ </span>
            <Link href="/register" className="font-bold text-yellow-400 transition-colors hover:text-yellow-300">
              إنشاء حساب جديد
            </Link>
          </div>

          <div className="mt-4 text-center">
            <Link href="/" className="text-xs text-gray-600 transition-colors hover:text-gray-400">
              العودة إلى الموقع الرئيسي
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-700">
          هل أنت مدير؟{" "}
          <Link href="/admin/login" className="text-gray-500 transition-colors hover:text-gray-300">
            تسجيل دخول الإدارة
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
