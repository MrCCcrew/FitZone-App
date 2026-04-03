"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Goal, Product, Program } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

type EditableProgram = Omit<Program, "id"> & { id?: string };

const EMPTY_PROGRAM: EditableProgram = {
  title: "",
  slug: "",
  type: "subscription",
  audience: "women",
  billingCycle: "monthly",
  sessionsCount: 0,
  durationDays: 30,
  validityDays: 30,
  basePrice: 0,
  salePrice: null,
  compareAtPrice: null,
  classSessionPrice: null,
  description: "",
  image: "",
  active: true,
  showOnHome: false,
  sortOrder: 0,
  surveyEnabled: true,
  scheduleManagedByAdmin: true,
  features: [],
  goals: [],
  consumables: [],
  schedules: [],
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
        className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
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

export default function Programs() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [featureInput, setFeatureInput] = useState("");
  const [modal, setModal] = useState<EditableProgram | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [programsResponse, goalsResponse, productsResponse] = await Promise.all([
        fetch("/api/admin/programs", { cache: "no-store" }),
        fetch("/api/admin/goals", { cache: "no-store" }),
        fetch("/api/admin/products", { cache: "no-store" }),
      ]);

      const programsPayload = await programsResponse.json();
      const goalsPayload = await goalsResponse.json();
      const productsPayload = await productsResponse.json();

      setPrograms(Array.isArray(programsPayload) ? programsPayload : []);
      setGoals(Array.isArray(goalsPayload) ? goalsPayload : []);
      setProducts(Array.isArray(productsPayload) ? productsPayload : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const primaryGoals = useMemo(
    () => goals.filter((goal) => goal.kind !== "games_children" && goal.kind !== "games_adults"),
    [goals],
  );

  const handleToggleGoal = (goal: Goal) => {
    if (!modal) return;
    const selected = modal.goals ?? [];
    const exists = selected.some((item) => item.id === goal.id);
    const next = exists ? selected.filter((item) => item.id !== goal.id) : [...selected, { ...goal, isPrimary: selected.length === 0 }];
    setModal({ ...modal, goals: next });
  };

  const handleAddConsumable = () => {
    if (!modal) return;
    setModal({
      ...modal,
      consumables: [...(modal.consumables ?? []), { id: `tmp-${Date.now()}`, productId: "", productName: "", quantity: 1 }],
    });
  };

  const handleAddSchedule = () => {
    if (!modal) return;
    setModal({
      ...modal,
      schedules: [
        ...(modal.schedules ?? []),
        {
          id: `tmp-${Date.now()}`,
          label: "جدول جديد",
          audience: "",
          timetableJson: "[]",
          notes: "",
          isDefault: (modal.schedules ?? []).length === 0,
          active: true,
          sortOrder: (modal.schedules ?? []).length,
        },
      ],
    });
  };

  const addFeature = () => {
    if (!modal || !featureInput.trim()) return;
    setModal({
      ...modal,
      features: [...(modal.features ?? []), featureInput.trim()],
    });
    setFeatureInput("");
  };

  const uploadProgramImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        window.alert(payload?.error ?? "تعذر رفع الصورة.");
        return;
      }
      setModal((current) => (current ? { ...current, image: payload.url } : current));
    } finally {
      setUploadingImage(false);
    }
  };

  const saveProgram = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const isEdit = Boolean(modal.id);
      const payload = {
        ...modal,
        goalMappings: (modal.goals ?? []).map((goal, index) => ({
          goalId: goal.id,
          isPrimary: goal.isPrimary ?? index === 0,
          sortOrder: goal.sortOrder ?? index,
        })),
      };

      const response = await fetch("/api/admin/programs", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(result?.error ?? "تعذر حفظ البرنامج.");
        return;
      }

      await loadData();
      setModal(null);
      setFeatureInput("");
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا البرنامج؟")) return;
    const response = await fetch("/api/admin/programs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر حذف البرنامج.");
      return;
    }
    await loadData();
  };

  const toggleProgram = async (program: Program) => {
    const response = await fetch("/api/admin/programs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: program.id, active: !program.active }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر تحديث حالة البرنامج.");
      return;
    }
    await loadData();
  };

  return (
    <AdminSectionShell
      title="البرامج والباقات"
      subtitle="أنشئ باقات أو اشتراكات بأهداف محددة، وحدد الجداول والمزايا والمنتجات المصاحبة."
      actions={
        <button
          onClick={() => setModal({ ...EMPTY_PROGRAM })}
          className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
        >
          + برنامج جديد
        </button>
      }
    >
      {loading ? (
        <AdminCard className="flex h-48 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل البرامج...</div>
        </AdminCard>
      ) : programs.length === 0 ? (
        <AdminEmptyState title="لا توجد برامج بعد" description="ابدأ بإنشاء أول برنامج أو باقة." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {programs.map((program) => (
            <AdminCard key={program.id} className="space-y-4">
              <div className="flex items-start gap-4">
                {program.image ? (
                  <img
                    src={program.image}
                    alt={program.title}
                    className="h-24 w-24 rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-[rgba(255,188,219,0.18)] bg-white/5 text-xs text-[#d7aabd]">
                    بدون صورة
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-black text-[#fff4f8]">{program.title}</h4>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-bold text-[#d7aabd]">
                      {program.type === "package" ? "باقة" : "اشتراك"}
                    </span>
                    {program.showOnHome ? (
                      <span className="rounded-full bg-[#ff4f93]/15 px-2 py-1 text-[10px] font-bold text-[#ff97bf]">
                        يظهر في الرئيسية
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-[#d7aabd]">الرابط: {program.slug}</div>
                  <div className="mt-1 text-sm text-[#d7aabd]">السعر: {program.salePrice ?? program.basePrice} ج.م</div>
                </div>
                <button
                  onClick={() => void toggleProgram(program)}
                  className={`relative h-5 w-10 rounded-full transition-colors ${program.active ? "bg-emerald-500" : "bg-white/15"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                      program.active ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {program.description ? <p className="text-sm leading-6 text-[#d7aabd]">{program.description}</p> : null}

              <div className="flex flex-wrap gap-2 text-xs text-[#d7aabd]">
                {(program.goals ?? []).length > 0 ? (
                  (program.goals ?? []).map((goal) => (
                    <span key={goal.id} className="rounded-full bg-white/10 px-2 py-1">
                      {goal.name}
                    </span>
                  ))
                ) : (
                  <span>بدون أهداف مرتبطة</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setModal({ ...program })}
                  className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                >
                  تعديل
                </button>
                <button
                  onClick={() => void deleteProgram(program.id)}
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
        <Modal title={modal.id ? "تعديل البرنامج" : "إضافة برنامج جديد"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم البرنامج">
                <input value={modal.title} onChange={(event) => setModal({ ...modal, title: event.target.value })} className={INPUT} />
              </Field>
              <Field label="نوع البرنامج">
                <select
                  value={modal.type}
                  onChange={(event) => setModal({ ...modal, type: event.target.value as Program["type"] })}
                  className={INPUT}
                >
                  <option value="subscription">اشتراك</option>
                  <option value="package">باقة</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="السعر الأساسي">
                <input
                  type="number"
                  value={modal.basePrice}
                  onChange={(event) => setModal({ ...modal, basePrice: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="سعر العرض (اختياري)">
                <input
                  type="number"
                  value={modal.salePrice ?? ""}
                  onChange={(event) => setModal({ ...modal, salePrice: event.target.value ? Number(event.target.value) : null })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="عدد الحصص">
                <input
                  type="number"
                  value={modal.sessionsCount ?? ""}
                  onChange={(event) => setModal({ ...modal, sessionsCount: event.target.value ? Number(event.target.value) : null })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="مدة البرنامج (بالأيام)">
                <input
                  type="number"
                  value={modal.durationDays ?? ""}
                  onChange={(event) => setModal({ ...modal, durationDays: event.target.value ? Number(event.target.value) : null })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
            </div>

            <Field label="الأهداف المرتبطة">
              <div className="flex flex-wrap gap-2">
                {primaryGoals.map((goal) => {
                  const selected = (modal.goals ?? []).some((item) => item.id === goal.id);
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => handleToggleGoal(goal)}
                      className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                        selected ? "bg-[#ff4f93] text-white" : "bg-white/10 text-[#d7aabd] hover:bg-white/20"
                      }`}
                    >
                      {goal.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="المزايا">
              <div className="mb-3 flex gap-2">
                <input
                  value={featureInput}
                  onChange={(event) => setFeatureInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addFeature();
                    }
                  }}
                  placeholder="مثال: قياس إنبودي"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={addFeature}
                  className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                >
                  +
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(modal.features ?? []).map((feature, index) => (
                  <span key={`${feature}-${index}`} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-[#fff4f8]">
                    {feature}
                    <button
                      type="button"
                      onClick={() =>
                        setModal({
                          ...modal,
                          features: (modal.features ?? []).filter((_, currentIndex) => currentIndex !== index),
                        })
                      }
                      className="text-[#ff97bf]"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </Field>

            <Field label="وصف البرنامج">
              <textarea
                value={modal.description ?? ""}
                onChange={(event) => setModal({ ...modal, description: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
              />
            </Field>

            <Field label="صورة البرنامج" hint="المقاس الموصى به 1600×900 بنسبة 16:9">
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadProgramImage(file);
                  }}
                  className={INPUT}
                />
                <input
                  value={modal.image ?? ""}
                  onChange={(event) => setModal({ ...modal, image: event.target.value })}
                  className={INPUT}
                  placeholder="أو ضع رابط الصورة"
                  dir="ltr"
                />
                {uploadingImage ? <div className="text-xs text-[#d7aabd]">جاري رفع الصورة...</div> : null}
              </div>
            </Field>

            <Field label="المنتجات المصاحبة (تُخصم من المخزون تلقائيًا)">
              <div className="space-y-3">
                {(modal.consumables ?? []).map((item, index) => (
                  <div key={`${item.productId}-${index}`} className="grid gap-3 sm:grid-cols-[1fr,140px,1fr,40px]">
                    <select
                      value={item.productId}
                      onChange={(event) => {
                        const product = products.find((entry) => entry.id === event.target.value);
                        const next = [...(modal.consumables ?? [])];
                        next[index] = {
                          ...item,
                          productId: event.target.value,
                          productName: product?.name ?? "",
                        };
                        setModal({ ...modal, consumables: next });
                      }}
                      className={INPUT}
                    >
                      <option value="">اختر المنتج</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} (المخزون {product.stock})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(event) => {
                        const next = [...(modal.consumables ?? [])];
                        next[index] = { ...item, quantity: Number(event.target.value) };
                        setModal({ ...modal, consumables: next });
                      }}
                      className={INPUT}
                      dir="ltr"
                    />
                    <input
                      value={item.notes ?? ""}
                      onChange={(event) => {
                        const next = [...(modal.consumables ?? [])];
                        next[index] = { ...item, notes: event.target.value };
                        setModal({ ...modal, consumables: next });
                      }}
                      className={INPUT}
                      placeholder="ملاحظة اختيارية"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = [...(modal.consumables ?? [])];
                        next.splice(index, 1);
                        setModal({ ...modal, consumables: next });
                      }}
                      className="rounded-lg bg-rose-500/10 text-rose-300 transition-colors hover:bg-rose-500/20"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddConsumable}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                >
                  + منتج مرافق
                </button>
              </div>
            </Field>

            <Field label="الجداول المرتبطة" hint="يمكن إدخال الجدول بصيغة JSON أو نص منظم حسب سياسة النادي.">
              <div className="space-y-3">
                {(modal.schedules ?? []).map((schedule, index) => (
                  <div key={`${schedule.id}-${index}`} className="space-y-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        value={schedule.label}
                        onChange={(event) => {
                          const next = [...(modal.schedules ?? [])];
                          next[index] = { ...schedule, label: event.target.value };
                          setModal({ ...modal, schedules: next });
                        }}
                        className={INPUT}
                        placeholder="اسم الجدول"
                      />
                      <input
                        value={schedule.audience ?? ""}
                        onChange={(event) => {
                          const next = [...(modal.schedules ?? [])];
                          next[index] = { ...schedule, audience: event.target.value };
                          setModal({ ...modal, schedules: next });
                        }}
                        className={INPUT}
                        placeholder="الفئة (اختياري)"
                      />
                    </div>
                    <textarea
                      value={schedule.timetableJson}
                      onChange={(event) => {
                        const next = [...(modal.schedules ?? [])];
                        next[index] = { ...schedule, timetableJson: event.target.value };
                        setModal({ ...modal, schedules: next });
                      }}
                      className={`${INPUT} min-h-24 resize-y`}
                    />
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-xs text-[#fff4f8]">
                        <input
                          type="checkbox"
                          checked={schedule.isDefault}
                          onChange={(event) => {
                            const next = [...(modal.schedules ?? [])];
                            next[index] = { ...schedule, isDefault: event.target.checked };
                            setModal({ ...modal, schedules: next });
                          }}
                        />
                        جدول أساسي
                      </label>
                      <label className="flex items-center gap-2 text-xs text-[#fff4f8]">
                        <input
                          type="checkbox"
                          checked={schedule.active}
                          onChange={(event) => {
                            const next = [...(modal.schedules ?? [])];
                            next[index] = { ...schedule, active: event.target.checked };
                            setModal({ ...modal, schedules: next });
                          }}
                        />
                        مفعل
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(modal.schedules ?? [])];
                          next.splice(index, 1);
                          setModal({ ...modal, schedules: next });
                        }}
                        className="rounded-lg bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                      >
                        حذف الجدول
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddSchedule}
                  className="rounded-xl bg-white/5 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                >
                  + إضافة جدول
                </button>
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="ترتيب الظهور">
                <input
                  type="number"
                  value={modal.sortOrder}
                  onChange={(event) => setModal({ ...modal, sortOrder: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.showOnHome}
                  onChange={(event) => setModal({ ...modal, showOnHome: event.target.checked })}
                />
                إظهار في الصفحة الرئيسية
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.surveyEnabled}
                  onChange={(event) => setModal({ ...modal, surveyEnabled: event.target.checked })}
                />
                تفعيل الاستبيان
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.scheduleManagedByAdmin}
                  onChange={(event) => setModal({ ...modal, scheduleManagedByAdmin: event.target.checked })}
                />
                الجدول يحدده النادي
              </label>
            </div>

            <button
              onClick={() => void saveProgram()}
              disabled={saving || uploadingImage}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جاري حفظ البرنامج..." : "حفظ البرنامج"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
