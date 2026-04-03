"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HealthQuestion } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const EMPTY_QUESTION: Omit<HealthQuestion, "id"> = {
  title: "",
  slug: "",
  prompt: "",
  active: true,
  sortOrder: 0,
  restrictedClassTypes: [],
  restrictions: [],
};

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-[#fff4f8]">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-[#d7aabd] transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-bold text-[#fff4f8]">{label}</div>
        {hint ? <div className="mt-1 text-xs leading-6 text-[#d7aabd]">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}

export default function HealthQuestions() {
  const [questions, setQuestions] = useState<HealthQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<HealthQuestion | Omit<HealthQuestion, "id"> | null>(null);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/health-questions", { cache: "no-store" });
      const payload = await response.json();
      setQuestions(Array.isArray(payload) ? payload : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const saveQuestion = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const isEdit = "id" in modal;
      const restrictions = (modal.restrictedClassTypes ?? [])
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((classType) => ({ classType }));

      const response = await fetch("/api/admin/health-questions", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...modal, restrictions }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(payload?.error ?? "تعذر حفظ السؤال.");
        return;
      }

      await loadQuestions();
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!window.confirm("هل تريد حذف السؤال؟")) return;
    const response = await fetch("/api/admin/health-questions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر حذف السؤال.");
      return;
    }
    await loadQuestions();
  };

  const toggleQuestion = async (question: HealthQuestion) => {
    const response = await fetch("/api/admin/health-questions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: question.id, active: !question.active }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر تحديث حالة السؤال.");
      return;
    }
    await loadQuestions();
  };

  const stats = useMemo(
    () => [
      {
        label: "أسئلة نشطة",
        value: questions.filter((question) => question.active).length.toLocaleString("ar-EG"),
      },
      {
        label: "إجمالي الأسئلة",
        value: questions.length.toLocaleString("ar-EG"),
      },
    ],
    [questions],
  );

  return (
    <AdminSectionShell
      title="استبيان الإصابات"
      subtitle="جهّز أسئلة الاستبيان وربطها بالكلاسات الممنوعة حسب حالة العميل."
      actions={
        <button
          onClick={() => setModal({ ...EMPTY_QUESTION })}
          className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
        >
          + سؤال جديد
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <AdminCard key={stat.label}>
            <div className="text-2xl font-black text-[#fff4f8]">{stat.value}</div>
            <div className="mt-1 text-sm text-[#d7aabd]">{stat.label}</div>
          </AdminCard>
        ))}
      </div>

      {loading ? (
        <AdminCard className="flex h-48 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل الأسئلة...</div>
        </AdminCard>
      ) : questions.length === 0 ? (
        <AdminEmptyState title="لا توجد أسئلة بعد" description="ابدأ بإضافة أسئلة الاستبيان لتوجيه الاشتراكات." />
      ) : (
        <div className="space-y-4">
          {questions.map((question) => (
            <AdminCard key={question.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-black text-[#fff4f8]">{question.title}</div>
                  <div className="mt-1 text-sm text-[#d7aabd]">{question.prompt}</div>
                </div>
                <button
                  onClick={() => void toggleQuestion(question)}
                  className={`relative h-5 w-10 rounded-full transition-colors ${question.active ? "bg-emerald-500" : "bg-white/15"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      question.active ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-[#d7aabd]">
                {(question.restrictedClassTypes ?? []).length > 0 ? (
                  <>
                    <span>كلاسات ممنوعة:</span>
                    {(question.restrictedClassTypes ?? []).map((item) => (
                      <span key={item} className="rounded-full bg-white/10 px-2 py-1">
                        {item}
                      </span>
                    ))}
                  </>
                ) : (
                  <span>لا توجد كلاسات ممنوعة</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setModal(question)}
                  className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                >
                  تعديل
                </button>
                <button
                  onClick={() => void deleteQuestion(question.id)}
                  className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  حذف
                </button>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {modal ? (
        <Modal title={"id" in modal ? "تعديل السؤال" : "إضافة سؤال جديد"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="عنوان السؤال">
              <input
                value={modal.title}
                onChange={(event) => setModal({ ...modal, title: event.target.value })}
                className={INPUT}
              />
            </Field>

            <Field label="الرابط المختصر" hint="يستخدم لتسهيل الربط لاحقًا، ويمكن تركه فارغًا.">
              <input
                value={modal.slug ?? ""}
                onChange={(event) => setModal({ ...modal, slug: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field label="نص السؤال">
              <textarea
                value={modal.prompt}
                onChange={(event) => setModal({ ...modal, prompt: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
              />
            </Field>

            <Field
              label="الكلاسات الممنوعة"
              hint="اكتب أسماء الكلاسات الممنوعة مفصولة بفاصلة، مثال: فيتنس, كارديو, زومبا"
            >
              <input
                value={(modal.restrictedClassTypes ?? []).join(", ")}
                onChange={(event) =>
                  setModal({
                    ...modal,
                    restrictedClassTypes: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  })
                }
                className={INPUT}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ترتيب الظهور">
                <input
                  type="number"
                  value={modal.sortOrder ?? 0}
                  onChange={(event) => setModal({ ...modal, sortOrder: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.active}
                  onChange={(event) => setModal({ ...modal, active: event.target.checked })}
                />
                تفعيل السؤال
              </label>
            </div>

            <button
              onClick={() => void saveQuestion()}
              disabled={saving}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جاري حفظ السؤال..." : "حفظ السؤال"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
