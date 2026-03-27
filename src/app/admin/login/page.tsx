"use client";

import { Suspense, useState } from "react";
import Link from "next/link";

function AdminLoginForm() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
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

      window.location.href = "/admin";
    } catch {
      setError("تعذر تسجيل دخول الإدارة حاليًا. حاولي مرة أخرى بعد قليل.");
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
          <div className="mt-1 inline-flex items-center gap-2">
            <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-bold text-gray-500">ADMIN PANEL</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-700 to-red-900 text-lg">
              🔐
            </div>
            <div>
              <h1 className="text-xl font-black text-white">دخول لوحة الإدارة</h1>
              <p className="text-xs text-gray-500">لحسابات الإدارة وموظفي المتابعة فقط</p>
            </div>
          </div>

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
                placeholder="admin@fitzoneland.com"
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
              {loading ? "جارٍ التحقق..." : "دخول لوحة التحكم"}
            </button>
          </form>

          <div className="mt-5 text-center">
            <Link href="/" className="text-xs text-gray-600 transition-colors hover:text-gray-400">
              العودة إلى الموقع الرئيسي
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <AdminLoginForm />
    </Suspense>
  );
}
