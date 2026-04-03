"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Goal } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const EMPTY_GOAL: Omit<Goal, "id"> = {
  name: "",
  slug: "",
  description: "",
  image: "",
  kind: "standard",
  parentId: null,
  sortOrder: 0,
  active: true,
};

const KIND_LABELS: Record<string, string> = {
  standard: "هدف عادي",
  games_root: "قسم الألعاب (جذر)",
  games_adults: "ألعاب للكبار",
  games_children: "ألعاب للأطفال",
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
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
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

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [goalModal, setGoalModal] = useState<Goal | Omit<Goal, "id"> | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/goals", { cache: "no-store" });
      const payload = await response.json();
      setGoals(Array.isArray(payload) ? payload : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const parentOptions = useMemo(() => goals.filter((goal) => !goal.parentId), [goals]);

  const saveGoal = async () => {
    if (!goalModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in goalModal;
      const response = await fetch("/api/admin/goals", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(goalModal),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(payload?.error ?? "تعذر حفظ الهدف.");
        return;
      }

      await loadGoals();
      setGoalModal(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الهدف؟")) return;
    const response = await fetch("/api/admin/goals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر حذف الهدف.");
      return;
    }

    await loadGoals();
  };

  const toggleGoal = async (goal: Goal) => {
    const response = await fetch("/api/admin/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: goal.id, active: !goal.active }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر تحديث حالة الهدف.");
      return;
    }

    await loadGoals();
  };

  const uploadGoalImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        window.alert(payload?.error ?? "تعذر رفع الصورة.");
        return;
      }
      setGoalModal((current) => (current ? { ...current, image: payload.url } : current));
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <AdminSectionShell
      title="الأهداف"
      subtitle="حددي أهداف العميل الرئيسية والفرعية (مثل الألعاب للكبار أو الأطفال) مع صور توضيحية."
      actions={
        <button
          onClick={() => setGoalModal({ ...EMPTY_GOAL })}
          className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
        >
          + هدف جديد
        </button>
      }
    >
      {loading ? (
        <AdminCard className="flex h-48 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل الأهداف...</div>
        </AdminCard>
      ) : goals.length === 0 ? (
        <AdminEmptyState title="لا توجد أهداف بعد" description="ابدئي بإضافة الأهداف حتى تظهر في رحلة الاشتراك." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((goal) => (
            <AdminCard key={goal.id} className="space-y-4">
              <div className="flex items-start gap-4">
                {goal.image ? (
                  <img
                    src={goal.image}
                    alt={goal.name}
                    className="h-20 w-20 rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-[rgba(255,188,219,0.18)] bg-white/5 text-xs text-[#d7aabd]">
                    بدون صورة
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-black text-[#fff4f8]">{goal.name}</h4>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-[#d7aabd]">
                      {KIND_LABELS[goal.kind] ?? goal.kind}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#d7aabd]">الرابط: {goal.slug}</div>
                  {goal.parent ? <div className="mt-1 text-xs text-[#d7aabd]">تابع: {goal.parent.name}</div> : null}
                </div>
                <button
                  onClick={() => void toggleGoal(goal)}
                  className={`relative h-5 w-10 rounded-full transition-colors ${goal.active ? "bg-emerald-500" : "bg-white/15"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      goal.active ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {goal.description ? <p className="text-sm leading-6 text-[#d7aabd]">{goal.description}</p> : null}

              <div className="flex flex-wrap gap-2 text-xs text-[#d7aabd]">
                <span>أهداف فرعية: {goal.childrenCount?.toLocaleString("ar-EG") ?? 0}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setGoalModal(goal)}
                  className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                >
                  تعديل
                </button>
                <button
                  onClick={() => void deleteGoal(goal.id)}
                  className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                >
                  حذف
                </button>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {goalModal ? (
        <Modal title={"id" in goalModal ? "تعديل الهدف" : "إضافة هدف جديد"} onClose={() => setGoalModal(null)}>
          <div className="space-y-4">
            <Field label="اسم الهدف">
              <input value={goalModal.name} onChange={(event) => setGoalModal({ ...goalModal, name: event.target.value })} className={INPUT} />
            </Field>

            <Field label="الرابط المختصر" hint="يُستخدم داخل الروابط، اتركه فارغًا ليتم توليده تلقائيًا.">
              <input
                value={goalModal.slug ?? ""}
                onChange={(event) => setGoalModal({ ...goalModal, slug: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field label="نوع الهدف">
              <select value={goalModal.kind} onChange={(event) => setGoalModal({ ...goalModal, kind: event.target.value })} className={INPUT}>
                <option value="standard">هدف عادي</option>
                <option value="games_root">قسم الألعاب (جذر)</option>
                <option value="games_adults">ألعاب للكبار</option>
                <option value="games_children">ألعاب للأطفال</option>
              </select>
            </Field>

            <Field label="هدف تابع" hint="اختياري. يُستخدم عند تقسيم هدف الألعاب إلى كبار وأطفال.">
              <select
                value={goalModal.parentId ?? ""}
                onChange={(event) => setGoalModal({ ...goalModal, parentId: event.target.value || null })}
                className={INPUT}
              >
                <option value="">بدون</option>
                {parentOptions.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="الوصف المختصر">
              <textarea
                value={goalModal.description ?? ""}
                onChange={(event) => setGoalModal({ ...goalModal, description: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
              />
            </Field>

            <Field label="صورة الهدف" hint="المقاس الموصى به 900×900 ليظهر بشكل مربع واضح.">
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadGoalImage(file);
                  }}
                  className={INPUT}
                />
                <input
                  value={goalModal.image ?? ""}
                  onChange={(event) => setGoalModal({ ...goalModal, image: event.target.value })}
                  className={INPUT}
                  placeholder="أو ضع رابط الصورة"
                  dir="ltr"
                />
                {uploadingImage ? <div className="text-xs text-[#d7aabd]">جاري رفع الصورة...</div> : null}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ترتيب الظهور">
                <input
                  type="number"
                  value={goalModal.sortOrder ?? 0}
                  onChange={(event) => setGoalModal({ ...goalModal, sortOrder: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={goalModal.active}
                  onChange={(event) => setGoalModal({ ...goalModal, active: event.target.checked })}
                />
                تفعيل الهدف
              </label>
            </div>

            <button
              onClick={() => void saveGoal()}
              disabled={saving || uploadingImage}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جاري حفظ الهدف..." : "حفظ الهدف"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
