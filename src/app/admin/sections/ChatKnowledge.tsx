"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatKnowledgeEntry } from "../types";

type FormState = {
  id?: string;
  title: string;
  category: string;
  keywords: string;
  answer: string;
  priority: number;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  category: "general",
  keywords: "",
  answer: "",
  priority: 0,
  active: true,
};

const CATEGORY_OPTIONS = [
  { value: "general", label: "عام" },
  { value: "weight-loss", label: "تخسيس" },
  { value: "muscle-gain", label: "بناء عضلات" },
  { value: "nutrition", label: "تغذية" },
  { value: "memberships", label: "اشتراكات" },
  { value: "injuries", label: "إصابات" },
  { value: "classes", label: "كلاسات" },
];

export default function ChatKnowledge() {
  const [entries, setEntries] = useState<ChatKnowledgeEntry[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/chat-knowledge", { cache: "no-store" });
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries().catch(() => setLoading(false));
  }, []);

  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      [entry.title, entry.category, entry.answer, entry.keywords.join(" ")].join(" ").toLowerCase().includes(term),
    );
  }, [entries, search]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const editEntry = (entry: ChatKnowledgeEntry) => {
    setForm({
      id: entry.id,
      title: entry.title,
      category: entry.category,
      keywords: entry.keywords.join(", "),
      answer: entry.answer,
      priority: entry.priority,
      active: entry.active,
    });
  };

  const resetForm = () => setForm(EMPTY_FORM);

  const persist = async () => {
    if (!form.title.trim() || !form.answer.trim()) return;
    setSaving(true);
    setMessage("");

    const payload = {
      title: form.title,
      category: form.category,
      keywords: form.keywords
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      answer: form.answer,
      priority: Number(form.priority || 0),
      active: form.active,
    };

    const res = await fetch("/api/admin/chat-knowledge", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form.id ? { id: form.id, ...payload } : payload),
    });

    if (res.ok) {
      await loadEntries();
      resetForm();
      setMessage(form.id ? "تم تحديث العنصر" : "تم إضافة العنصر");
    } else {
      setMessage("حدث خطأ أثناء الحفظ");
    }

    setSaving(false);
  };

  const removeEntry = async (id: string) => {
    const res = await fetch("/api/admin/chat-knowledge", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (res.ok) {
      await loadEntries();
      if (form.id === id) resetForm();
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="rounded-3xl border border-gray-800 bg-gray-950 p-5">
        <div className="mb-5">
          <h2 className="text-white font-black text-lg">قاعدة معرفة البوت</h2>
          <p className="text-gray-500 text-sm mt-1">أضف أسئلة وأجوبة وكلمات مفتاحية ليستخدمها البوت قبل الـ fallback الداخلي.</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-gray-400 text-xs mb-1.5">العنوان</label>
            <input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              className="w-full rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">التصنيف</label>
              <select
                value={form.category}
                onChange={(e) => setField("category", e.target.value)}
                className="w-full rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-xs mb-1.5">الأولوية</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setField("priority", Number(e.target.value))}
                className="w-full rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-1.5">الكلمات المفتاحية</label>
            <input
              value={form.keywords}
              onChange={(e) => setField("keywords", e.target.value)}
              placeholder="مثال: تخسيس, دهون, رجيم"
              className="w-full rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-xs mb-1.5">الإجابة</label>
            <textarea
              value={form.answer}
              onChange={(e) => setField("answer", e.target.value)}
              rows={8}
              className="w-full rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600 resize-none"
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-gray-300">
            <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />
            العنصر فعال
          </label>

          <div className="flex gap-3">
            <button
              onClick={persist}
              disabled={saving || !form.title.trim() || !form.answer.trim()}
              className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold"
            >
              {saving ? "جارٍ الحفظ..." : form.id ? "تحديث" : "إضافة"}
            </button>
            <button
              onClick={resetForm}
              className="px-5 py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold"
            >
              جديد
            </button>
          </div>

          {message && <div className="text-sm text-emerald-400">{message}</div>}
        </div>
      </section>

      <section className="rounded-3xl border border-gray-800 bg-gray-950 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-black text-lg">الأسئلة والأجوبة الحالية</h3>
            <p className="text-gray-500 text-sm mt-1">يمكنك تعديلها أو تعطيلها وسيقرأها البوت من قاعدة البيانات مباشرة.</p>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث..."
            className="w-full sm:w-72 rounded-2xl bg-black border border-gray-800 text-white px-4 py-3 outline-none focus:border-red-600"
          />
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-gray-500 text-sm">جارٍ تحميل قاعدة المعرفة...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-gray-500 text-sm">لا توجد عناصر مطابقة.</div>
          ) : (
            filteredEntries.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-gray-800 bg-black/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-white font-bold">{entry.title}</h4>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-3">
                      <span>{entry.category}</span>
                      <span>Priority: {entry.priority}</span>
                      <span>{entry.active ? "Active" : "Inactive"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => editEntry(entry)} className="px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm">
                      تعديل
                    </button>
                    <button onClick={() => removeEntry(entry.id)} className="px-3 py-2 rounded-xl bg-red-950/50 hover:bg-red-950 text-red-300 text-sm">
                      حذف
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-yellow-400">{entry.keywords.join(" - ")}</div>
                <p className="mt-3 text-sm leading-7 text-gray-300 whitespace-pre-wrap">{entry.answer}</p>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
