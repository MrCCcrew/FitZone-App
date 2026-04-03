"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GymClass } from "../types";

type ApiTrainer = {
  id: string;
  name: string;
  specialty: string;
};

const DAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const PRESET_TYPES = [
  { value: "cardio", label: "كارديو" },
  { value: "strength", label: "قوة" },
  { value: "yoga", label: "يوجا" },
  { value: "boxing", label: "ملاكمة" },
  { value: "swimming", label: "سباحة" },
  { value: "dance", label: "رقص" },
  { value: "pilates", label: "بيلاتس" },
  { value: "zumba", label: "زومبا" },
];

const CATEGORY_OPTIONS = [
  "التخسيس",
  "التهدئة والإطالة",
  "القوة البدنية والرشاقة",
  "زيادة الوزن وريشيب",
  "الترفيه والرقص",
  "إطالة ومرونة وريلاكس",
  "تأهيل إصابات",
  "شد وتنسيق الجسم",
  "ألعاب الدفاع عن النفس",
  "تأهيل عسكري",
  "قسم الأطفال",
  "قسم الفيتنس",
  "أنواع الزومبا",
];

const TYPE_COLOR_MAP: Record<string, string> = {
  cardio: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  strength: "bg-red-500/15 text-red-300 border-red-500/30",
  yoga: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  boxing: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  swimming: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  dance: "bg-pink-500/15 text-pink-300 border-pink-500/30",
  pilates: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  zumba: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
};

const INPUT =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-fuchsia-400/60 focus:bg-white/10";

type ClassModalState = {
  id?: string;
  name: string;
  trainer: string;
  trainerId: string;
  day: string;
  time: string;
  duration: number;
  capacity: number;
  enrolled: number;
  category: string;
  type: string;
  active: boolean;
  categoryPreset: string;
  customCategory: string;
  typePreset: string;
  customType: string;
};

const EMPTY_MODAL: ClassModalState = {
  name: "",
  trainer: "",
  trainerId: "",
  day: DAYS[0],
  time: "06:00",
  duration: 60,
  capacity: 15,
  enrolled: 0,
  category: "التخسيس",
  type: "strength",
  active: true,
  categoryPreset: "التخسيس",
  customCategory: "",
  typePreset: "strength",
  customType: "",
};

function normalizeTypeLabel(type: string) {
  const normalized = type.trim();
  if (!normalized) return "غير محدد";
  const preset = PRESET_TYPES.find(
    (item) =>
      item.value.toLowerCase() === normalized.toLowerCase() ||
      item.label === normalized,
  );
  return preset?.label ?? normalized;
}

function resolveTypeColor(type: string) {
  return TYPE_COLOR_MAP[type.toLowerCase()] ?? "bg-white/10 text-white/75 border-white/15";
}

function createModalState(item?: GymClass) {
  if (!item) return EMPTY_MODAL;
  const preset = PRESET_TYPES.find(
    (entry) =>
      entry.value.toLowerCase() === item.type.toLowerCase() ||
      entry.label === item.type,
  );

  return {
    ...item,
    trainerId: "",
    category: item.category ?? "",
    categoryPreset: item.category && CATEGORY_OPTIONS.includes(item.category) ? item.category : "custom",
    customCategory: item.category && CATEGORY_OPTIONS.includes(item.category) ? "" : item.category ?? "",
    typePreset: preset?.value ?? "custom",
    customType: preset ? "" : item.type,
  };
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-white/85">{label}</label>
        {hint ? <span className="text-[11px] text-white/45">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#2a0f1f] p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-black text-white">{title}</h3>
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1 text-lg text-white/70 transition hover:border-white/20 hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Classes() {
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [trainers, setTrainers] = useState<ApiTrainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"schedule" | "list">("schedule");
  const [filterDay, setFilterDay] = useState("الكل");
  const [filterType, setFilterType] = useState("الكل");
  const [modal, setModal] = useState<ClassModalState | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/classes", { cache: "no-store" });
      const payload = (await response.json()) as {
        classes?: GymClass[];
        trainers?: ApiTrainer[];
      };

      setClasses(Array.isArray(payload.classes) ? payload.classes : []);
      setTrainers(Array.isArray(payload.trainers) ? payload.trainers : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!modal || modal.trainerId || trainers.length === 0) return;
    const firstTrainer = trainers[0];
    setModal((current) =>
      current
        ? {
            ...current,
            trainerId: firstTrainer.id,
            trainer: firstTrainer.name,
          }
        : current,
    );
  }, [modal, trainers]);

  const typeOptions = useMemo(() => {
    const dynamic = Array.from(
      new Set(classes.map((item) => normalizeTypeLabel(item.type)).filter(Boolean)),
    );
    return ["الكل", ...dynamic];
  }, [classes]);

  const displayedClasses = useMemo(() => {
    return classes.filter((item) => {
      const matchesDay = filterDay === "الكل" || item.day === filterDay;
      const matchesType =
        filterType === "الكل" || normalizeTypeLabel(item.type) === filterType;
      return matchesDay && matchesType;
    });
  }, [classes, filterDay, filterType]);

  const stats = useMemo(() => {
    const totalCapacity = classes.reduce((sum, item) => sum + item.capacity, 0);
    const totalEnrolled = classes.reduce((sum, item) => sum + item.enrolled, 0);
    return [
      { label: "إجمالي الكلاسات", value: classes.length, tone: "text-white" },
      {
        label: "الكلاسات النشطة",
        value: classes.filter((item) => item.active).length,
        tone: "text-emerald-300",
      },
      { label: "إجمالي المسجلين", value: totalEnrolled, tone: "text-fuchsia-300" },
      {
        label: "متوسط الإشغال",
        value: totalCapacity > 0 ? `${Math.round((totalEnrolled / totalCapacity) * 100)}%` : "0%",
        tone: "text-amber-300",
      },
    ];
  }, [classes]);

  async function saveClass() {
    if (!modal) return;

    const resolvedCategory =
      modal.categoryPreset === "custom"
        ? modal.customCategory.trim()
        : modal.categoryPreset.trim();
    const resolvedType =
      modal.typePreset === "custom"
        ? modal.customType.trim()
        : modal.typePreset.trim();

    if (!modal.name.trim()) {
      alert("اسم الكلاس مطلوب.");
      return;
    }
    if (!modal.trainerId) {
      alert("اختَر المدربة أولًا.");
      return;
    }
    if (!resolvedType) {
      alert("اكتب نوع الكلاس أو اختَره من القائمة.");
      return;
    }

    setSaving(true);
    try {
      const selectedTrainer = trainers.find((item) => item.id === modal.trainerId);
      const isEdit = Boolean(modal.id);
      const response = await fetch("/api/admin/classes", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(modal.id ? { id: modal.id } : {}),
          name: modal.name.trim(),
          trainerId: modal.trainerId,
          category: resolvedCategory,
          type: resolvedType,
          duration: Number(modal.duration) || 60,
          intensity: "medium",
          maxSpots: Number(modal.capacity) || 15,
          price: 0,
          active: modal.active,
          day: modal.day,
          time: modal.time,
          trainer: selectedTrainer?.name ?? modal.trainer,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        alert(payload.error ?? "تعذر حفظ بيانات الكلاس الآن.");
        return;
      }

      await fetchAll();
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggleClass(item: GymClass) {
    const response = await fetch("/api/admin/classes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, active: !item.active }),
    });
    if (!response.ok) {
      alert("تعذر تحديث حالة الكلاس الآن.");
      return;
    }
    await fetchAll();
  }

  async function deleteClass(id: string) {
    if (!confirm("هل تريد حذف هذا الكلاس؟")) return;
    const response = await fetch("/api/admin/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) {
      alert("تعذر حذف الكلاس الآن.");
      return;
    }
    await fetchAll();
  }

  if (loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-sm text-white/60">
        جارٍ تحميل الكلاسات...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setView("schedule")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              view === "schedule" ? "bg-fuchsia-600 text-white" : "bg-white/5 text-white/65 hover:bg-white/10"
            }`}
          >
            عرض الجدول
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              view === "list" ? "bg-fuchsia-600 text-white" : "bg-white/5 text-white/65 hover:bg-white/10"
            }`}
          >
            عرض القائمة
          </button>
        </div>

        <button
          onClick={() => setModal(createModalState())}
          className="rounded-2xl bg-fuchsia-600 px-5 py-3 text-sm font-black text-white transition hover:bg-fuchsia-500"
        >
          + إضافة كلاس جديد
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <div className={`text-2xl font-black ${item.tone}`}>{item.value}</div>
            <div className="mt-1 text-xs text-white/55">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 lg:grid-cols-[1fr_auto_auto]">
        <div className="flex flex-wrap gap-2">
          {["الكل", ...DAYS].map((day) => (
            <button
              key={day}
              onClick={() => setFilterDay(day)}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                filterDay === day ? "bg-amber-400 text-black" : "bg-white/5 text-white/65 hover:bg-white/10"
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        <select
          value={filterType}
          onChange={(event) => setFilterType(event.target.value)}
          className={`${INPUT} min-w-[180px]`}
        >
          {typeOptions.map((type) => (
            <option key={type} value={type} className="bg-[#2a0f1f]">
              {type}
            </option>
          ))}
        </select>

        <div className="rounded-2xl border border-dashed border-white/15 bg-black/10 px-4 py-3 text-xs text-white/55">
          أضف نوعًا جديدًا من داخل نموذج الكلاس وسيظهر تلقائيًا في الفلاتر والواجهة العامة.
        </div>
      </div>

      {view === "schedule" ? (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="grid grid-cols-7 border-b border-white/10 text-center">
            {DAYS.map((day) => (
              <div key={day} className="border-s border-white/10 px-2 py-4 text-xs font-bold text-white/55 first:border-s-0">
                {day}
              </div>
            ))}
          </div>
          <div className="grid min-h-[320px] grid-cols-7">
            {DAYS.map((day) => (
              <div key={day} className="space-y-2 border-s border-white/10 p-3 first:border-s-0">
                {classes
                  .filter((item) => item.day === day)
                  .map((item) => {
                    const occupancy = item.capacity > 0 ? Math.min(100, Math.round((item.enrolled / item.capacity) * 100)) : 0;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setModal(createModalState(item))}
                        className={`w-full rounded-2xl border p-3 text-right transition hover:scale-[1.01] ${
                          item.active ? "border-white/10 bg-black/15" : "border-white/5 bg-black/5 opacity-55"
                        }`}
                      >
                        <div className="text-sm font-black text-white">{item.name}</div>
                        {item.category ? (
                          <div className="mt-1 text-[11px] text-white/55">{item.category}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-white/45">{item.time}</div>
                        <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${resolveTypeColor(item.type)}`}>
                          {normalizeTypeLabel(item.type)}
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${occupancy}%` }} />
                        </div>
                        <div className="mt-1 text-[10px] text-white/45">
                          {item.enrolled}/{item.capacity}
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-right text-xs text-white/45">
                  {["الكلاس", "المدربة", "اليوم", "الوقت", "المدة", "الإشغال", "النوع", "الحالة", "إجراءات"].map((head) => (
                    <th key={head} className="px-4 py-4 font-medium">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedClasses.map((item) => (
                  <tr key={item.id} className="border-b border-white/10 last:border-b-0">
                    <td className="px-4 py-4 font-bold text-white">{item.name}</td>
                    <td className="px-4 py-4 text-white/70">{item.trainer}</td>
                    <td className="px-4 py-4 text-white/70">{item.day}</td>
                    <td className="px-4 py-4 text-white/70" dir="ltr">
                      {item.time}
                    </td>
                    <td className="px-4 py-4 text-white/70">{item.duration} دقيقة</td>
                    <td className="px-4 py-4 text-white/70">
                      {item.enrolled}/{item.capacity}
                    </td>
                    <td className="px-4 py-4">
                      {item.category ? (
                        <div className="mb-1 text-[11px] font-semibold text-white/60">{item.category}</div>
                      ) : null}
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${resolveTypeColor(item.type)}`}>
                        {normalizeTypeLabel(item.type)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => void toggleClass(item)}
                        className={`relative h-6 w-12 rounded-full transition ${
                          item.active ? "bg-emerald-500/70" : "bg-white/15"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
                            item.active ? "right-1" : "left-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setModal(createModalState(item))}
                          className="rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-white/70 transition hover:border-fuchsia-400/40 hover:text-white"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => void deleteClass(item.id)}
                          className="rounded-xl border border-red-500/20 px-3 py-2 text-xs font-bold text-red-300 transition hover:bg-red-500/10"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal ? (
        <Modal title={modal.id ? "تعديل الكلاس" : "إضافة كلاس جديد"} onClose={() => setModal(null)}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="اسم الكلاس">
              <input
                value={modal.name}
                onChange={(event) => setModal({ ...modal, name: event.target.value })}
                className={INPUT}
                placeholder="مثال: يوجا الصباح"
              />
            </Field>

            <Field label="المدربة">
              <select
                value={modal.trainerId}
                onChange={(event) => {
                  const trainer = trainers.find((item) => item.id === event.target.value);
                  setModal({
                    ...modal,
                    trainerId: event.target.value,
                    trainer: trainer?.name ?? "",
                  });
                }}
                className={INPUT}
              >
                <option value="" className="bg-[#2a0f1f]">
                  اختَر المدربة
                </option>
                {trainers.map((trainer) => (
                  <option key={trainer.id} value={trainer.id} className="bg-[#2a0f1f]">
                    {trainer.name} - {trainer.specialty}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="نوع الكلاس" hint="يمكنك اختيار نوع جاهز أو كتابة نوع جديد">
              <select
                value={modal.typePreset}
                onChange={(event) => {
                  const preset = event.target.value;
                  setModal({
                    ...modal,
                    typePreset: preset,
                    type: preset === "custom" ? modal.customType : preset,
                  });
                }}
                className={INPUT}
              >
                {PRESET_TYPES.map((type) => (
                  <option key={type.value} value={type.value} className="bg-[#2a0f1f]">
                    {type.label}
                  </option>
                ))}
                <option value="custom" className="bg-[#2a0f1f]">
                  نوع جديد
                </option>
              </select>
            </Field>

            <Field label="اسم النوع الجديد" hint="مثال: كروس فيت أو ستيب">
              <input
                value={modal.customType}
                onChange={(event) =>
                  setModal({
                    ...modal,
                    customType: event.target.value,
                    type: modal.typePreset === "custom" ? event.target.value : modal.type,
                  })
                }
                className={INPUT}
                placeholder="اكتب النوع إذا اخترت نوع جديد"
                disabled={modal.typePreset !== "custom"}
              />
            </Field>

            <Field label="اليوم">
              <select
                value={modal.day}
                onChange={(event) => setModal({ ...modal, day: event.target.value })}
                className={INPUT}
              >
                {DAYS.map((day) => (
                  <option key={day} value={day} className="bg-[#2a0f1f]">
                    {day}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="الوقت">
              <input
                type="time"
                value={modal.time}
                onChange={(event) => setModal({ ...modal, time: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field label="المدة بالدقائق">
              <input
                type="number"
                value={modal.duration}
                onChange={(event) => setModal({ ...modal, duration: Number(event.target.value) || 0 })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field label="السعة القصوى">
              <input
                type="number"
                value={modal.capacity}
                onChange={(event) => setModal({ ...modal, capacity: Number(event.target.value) || 0 })}
                className={INPUT}
                dir="ltr"
              />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-white">تفعيل الكلاس</div>
              <div className="text-xs text-white/45">يمكن إخفاء الكلاس مؤقتًا بدون حذفه.</div>
            </div>
            <button
              onClick={() => setModal({ ...modal, active: !modal.active })}
              className={`relative h-7 w-14 rounded-full transition ${
                modal.active ? "bg-emerald-500/70" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-1.5 h-4 w-4 rounded-full bg-white transition ${
                  modal.active ? "right-1.5" : "left-1.5"
                }`}
              />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="القسم" hint="اختر القسم الرئيسي للكلاس">
              <select
                value={modal.categoryPreset}
                onChange={(event) => {
                  const preset = event.target.value;
                  setModal({
                    ...modal,
                    categoryPreset: preset,
                    category: preset === "custom" ? modal.customCategory : preset,
                  });
                }}
                className={INPUT}
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#2a0f1f]">
                    {cat}
                  </option>
                ))}
                <option value="custom" className="bg-[#2a0f1f]">
                  قسم جديد
                </option>
              </select>
            </Field>

            <Field label="اسم القسم الجديد" hint="مثال: قسم السيدات أو قسم الدفاع عن النفس">
              <input
                value={modal.customCategory}
                onChange={(event) =>
                  setModal({
                    ...modal,
                    customCategory: event.target.value,
                    category: modal.categoryPreset === "custom" ? event.target.value : modal.category,
                  })
                }
                className={INPUT}
                placeholder="اكتب اسم القسم إذا اخترت قسم جديد"
                disabled={modal.categoryPreset !== "custom"}
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              onClick={() => setModal(null)}
              className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white/70 transition hover:border-white/20 hover:text-white"
            >
              إلغاء
            </button>
            <button
              onClick={() => void saveClass()}
              disabled={saving}
              className="rounded-2xl bg-fuchsia-600 px-6 py-3 text-sm font-black text-white transition hover:bg-fuchsia-500 disabled:opacity-60"
            >
              {saving ? "جارٍ حفظ الكلاس..." : "حفظ الكلاس"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
