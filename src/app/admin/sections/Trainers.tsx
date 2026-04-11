"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Trainer } from "../types";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-pink-500";

type EditableTrainer = Omit<Trainer, "id" | "classesCount"> & { id?: string };

const EMPTY_TRAINER: EditableTrainer = {
  name: "",
  nameEn: "",
  specialty: "",
  specialtyEn: "",
  bio: "",
  bioEn: "",
  certifications: [],
  certificationsEn: [],
  rating: 5,
  sessionsCount: 0,
  image: "",
  active: true,
  showOnHome: true,
  sortOrder: 0,
};

function listToText(items: string[]) {
  return items.join("\n");
}

function textToList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldHint({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-1 text-xs leading-6 text-gray-400">{hint}</div>
      </div>
      {children}
    </label>
  );
}

export default function Trainers() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<EditableTrainer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/trainers", { cache: "no-store" });
      const data = await response.json().catch(() => []);
      setTrainers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim();
    if (!query) return trainers;

    return trainers.filter(
      (trainer) =>
        trainer.name.includes(query) ||
        (trainer.nameEn ?? "").includes(query) ||
        trainer.specialty.includes(query) ||
        (trainer.specialtyEn ?? "").includes(query) ||
        (trainer.bio ?? "").includes(query),
    );
  }, [search, trainers]);

  const saveTrainer = async () => {
    if (!modal) return;

    setSaving(true);
    try {
      const response = await fetch("/api/admin/trainers", {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.alert(payload.error ?? "تعذر حفظ بيانات المدربة الآن.");
        return;
      }

      await load();
      setModal(null);
      setUploadError(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (trainer: Trainer) => {
    await fetch("/api/admin/trainers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trainer.id, active: !trainer.active }),
    });
    await load();
  };

  const toggleHome = async (trainer: Trainer) => {
    await fetch("/api/admin/trainers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: trainer.id, showOnHome: !trainer.showOnHome }),
    });
    await load();
  };

  const removeTrainer = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذه المدربة؟")) return;

    await fetch("/api/admin/trainers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const uploadImage = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "trainers");

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "تعذر رفع صورة المدربة الآن.");
      }

      setModal((current) => (current ? { ...current, image: payload.url } : current));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع صورة المدربة الآن.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-gray-500">جارٍ تحميل بيانات المدربات...</div>;
  }

  const activeCount = trainers.filter((trainer) => trainer.active).length;
  const visibleOnHomeCount = trainers.filter((trainer) => trainer.showOnHome && trainer.active).length;
  const totalClasses = trainers.reduce((sum, trainer) => sum + trainer.classesCount, 0);
  const totalSessions = trainers.reduce((sum, trainer) => sum + trainer.sessionsCount, 0);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.4fr,1fr,1fr,1fr]">
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">قسم المدربات</div>
          <div className="mt-2 text-3xl font-black text-white">{trainers.length}</div>
          <div className="mt-3 text-xs leading-6 text-gray-500">
            من هنا تدير بيانات المدربات كاملة: الصورة، التخصص، النبذة، الشهادات، ترتيب الظهور،
            والحالة. أما نصوص صفحة المدربات العامة فستجدها داخل قسم
            <span className="px-1 font-bold text-pink-300">الصفحات والمحتوى → صفحة المدربات</span>.
          </div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">مدربات نشطات</div>
          <div className="mt-2 text-3xl font-black text-emerald-300">{activeCount}</div>
          <div className="mt-3 text-xs text-gray-500">المدربات المتاحات حاليًا داخل الموقع ولوحة الإدارة.</div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">ظاهرة في الرئيسية</div>
          <div className="mt-2 text-3xl font-black text-pink-300">{visibleOnHomeCount}</div>
          <div className="mt-3 text-xs text-gray-500">عدد المدربات المعروضات في الصفحة الرئيسية.</div>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
          <div className="text-sm text-gray-400">تقارير سريعة</div>
          <div className="mt-2 text-sm font-bold text-white">جلسات: {totalSessions}</div>
          <div className="mt-1 text-sm font-bold text-white">كلاسات: {totalClasses}</div>
          <div className="mt-3 text-xs text-gray-500">مؤشرات سريعة لمتابعة حجم عمل فريق المدربات.</div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-black text-white">إدارة المدربات</h3>
            <p className="mt-1 text-xs leading-6 text-gray-500">
              مقاس صورة المدربة الموصى به:
              <span className="px-1 font-bold text-pink-300">1000 × 1250</span>
              بنسبة
              <span className="px-1 font-bold text-pink-300">4:5</span>
              ، بخلفية نظيفة وقص يركز على الوجه والكتفين لتظهر بشكل أنيق في صفحة المدربات والرئيسية.
            </p>
          </div>

          <div className="flex gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحثي عن مدربة..."
              className={`${INPUT} min-w-[240px]`}
            />
            <button
              onClick={() => {
                setUploadError(null);
                setModal({ ...EMPTY_TRAINER, sortOrder: trainers.length });
              }}
              className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white"
            >
              + إضافة مدربة
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((trainer) => (
            <div key={trainer.id} className="rounded-2xl border border-gray-800 bg-black/20 p-4">
              <div className="flex gap-4">
                <div className="h-28 w-24 flex-shrink-0 overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
                  {trainer.image ? (
                    <img src={trainer.image} alt={trainer.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">👩‍🏫</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-black text-white">{trainer.name}</div>
                      <div className="text-xs text-gray-500">{trainer.nameEn || "—"}</div>
                      <div className="text-sm font-semibold text-pink-300">{trainer.specialty}</div>
                      {trainer.specialtyEn ? <div className="text-xs text-gray-500">{trainer.specialtyEn}</div> : null}
                    </div>
                    <div className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
                      ترتيب {trainer.sortOrder}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.rating.toFixed(1)}</div>
                      <div>التقييم</div>
                    </div>
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.sessionsCount}</div>
                      <div>الجلسات</div>
                    </div>
                    <div className="rounded-xl bg-gray-800/70 px-2 py-2 text-gray-300">
                      <div className="font-black text-white">{trainer.classesCount}</div>
                      <div>الكلاسات</div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => void toggleStatus(trainer)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${
                        trainer.active ? "bg-emerald-950/40 text-emerald-300" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {trainer.active ? "نشطة" : "مخفية"}
                    </button>
                    <button
                      onClick={() => void toggleHome(trainer)}
                      className={`rounded-lg px-3 py-2 text-xs font-bold ${
                        trainer.showOnHome ? "bg-pink-600/20 text-pink-200" : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      {trainer.showOnHome ? "تظهر في الرئيسية" : "لا تظهر في الرئيسية"}
                    </button>
                  </div>
                </div>
              </div>

              {trainer.bio ? <div className="mt-4 text-sm leading-7 text-gray-400">{trainer.bio}</div> : null}

              {trainer.certifications.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {trainer.certifications.map((certification) => (
                    <span
                      key={certification}
                      className="rounded-full border border-pink-500/30 bg-pink-500/10 px-3 py-1 text-xs text-pink-200"
                    >
                      {certification}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => {
                    setUploadError(null);
                    setModal({ ...trainer });
                  }}
                  className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs font-bold text-white"
                >
                  تعديل
                </button>
                <button
                  onClick={() => void removeTrainer(trainer.id)}
                  className="rounded-lg bg-red-950/50 px-3 py-2 text-xs font-bold text-red-300"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modal ? (
        <Modal title={modal.id ? "تعديل بيانات المدربة" : "إضافة مدربة جديدة"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-black/20 p-4 text-xs leading-7 text-gray-400">
              أدخلي البيانات كما ستظهر للعميلة داخل صفحة المدربات والصفحة الرئيسية. يفضل أن تكون
              الصورة شخصية أو نصفية، وأن تكتب الشهادات كل شهادة في سطر مستقل لتظهر بشكل مرتب.
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldHint title="اسم المدربة" hint="الاسم الظاهر للعميلات داخل صفحة المدربات.">
                <input
                  value={modal.name}
                  onChange={(event) => setModal({ ...modal, name: event.target.value })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="اسم المدربة بالإنجليزية" hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية.">
                <input
                  value={modal.nameEn ?? ""}
                  onChange={(event) => setModal({ ...modal, nameEn: event.target.value })}
                  className={INPUT}
                  dir="ltr"
                />
              </FieldHint>

              <FieldHint title="التخصص" hint="مثال: يوجا وتأهيل بدني أو زومبا وكارديو.">
                <input
                  value={modal.specialty}
                  onChange={(event) => setModal({ ...modal, specialty: event.target.value })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="التخصص بالإنجليزية" hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية.">
                <input
                  value={modal.specialtyEn ?? ""}
                  onChange={(event) => setModal({ ...modal, specialtyEn: event.target.value })}
                  className={INPUT}
                  dir="ltr"
                />
              </FieldHint>

              <FieldHint title="التقييم" hint="يظهر على شكل 4.9 أو 5.0 داخل البطاقة.">
                <input
                  type="number"
                  step="0.1"
                  value={modal.rating}
                  onChange={(event) => setModal({ ...modal, rating: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="عدد الجلسات" hint="إحصائية تعريفية تظهر للعميلة داخل صفحة المدربات.">
                <input
                  type="number"
                  value={modal.sessionsCount}
                  onChange={(event) => setModal({ ...modal, sessionsCount: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <FieldHint title="ترتيب الظهور" hint="الأقل يظهر أولًا في الصفحة الرئيسية وصفحة المدربات.">
                <input
                  type="number"
                  value={modal.sortOrder}
                  onChange={(event) => setModal({ ...modal, sortOrder: Number(event.target.value) || 0 })}
                  className={INPUT}
                />
              </FieldHint>

              <div className="grid grid-cols-2 gap-3">
                <label className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white">
                  <div className="mb-2 font-bold">الحالة</div>
                  <select
                    value={modal.active ? "active" : "inactive"}
                    onChange={(event) => setModal({ ...modal, active: event.target.value === "active" })}
                    className={INPUT}
                  >
                    <option value="active">نشطة</option>
                    <option value="inactive">مخفية</option>
                  </select>
                </label>

                <label className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-sm text-white">
                  <div className="mb-2 font-bold">الصفحة الرئيسية</div>
                  <select
                    value={modal.showOnHome ? "show" : "hide"}
                    onChange={(event) => setModal({ ...modal, showOnHome: event.target.value === "show" })}
                    className={INPUT}
                  >
                    <option value="show">تظهر</option>
                    <option value="hide">لا تظهر</option>
                  </select>
                </label>
              </div>
            </div>

            <FieldHint
              title="نبذة عن المدربة"
              hint="من سطرين إلى أربعة أسطر تشرح خبرتها وأسلوبها التدريبي بشكل مختصر."
            >
              <textarea
                value={modal.bio ?? ""}
                onChange={(event) => setModal({ ...modal, bio: event.target.value })}
                rows={4}
                className={`${INPUT} resize-none`}
              />
            </FieldHint>

            <FieldHint
              title="نبذة عن المدربة بالإنجليزية"
              hint="اختياري، لكنه سيظهر عند اختيار اللغة الإنجليزية."
            >
              <textarea
                value={modal.bioEn ?? ""}
                onChange={(event) => setModal({ ...modal, bioEn: event.target.value })}
                rows={4}
                className={`${INPUT} resize-none`}
                dir="ltr"
              />
            </FieldHint>

            <FieldHint
              title="الشهادات والاعتمادات"
              hint="اكتبي كل شهادة في سطر منفصل، وستظهر على شكل شارات داخل صفحة المدربات."
            >
              <textarea
                value={listToText(modal.certifications)}
                onChange={(event) => setModal({ ...modal, certifications: textToList(event.target.value) })}
                rows={4}
                className={`${INPUT} resize-none`}
              />
            </FieldHint>

            <FieldHint
              title="الشهادات والاعتمادات بالإنجليزية"
              hint="اكتب كل شهادة في سطر منفصل لتظهر عند اختيار اللغة الإنجليزية."
            >
              <textarea
                value={listToText(modal.certificationsEn ?? [])}
                onChange={(event) => setModal({ ...modal, certificationsEn: textToList(event.target.value) })}
                rows={4}
                className={`${INPUT} resize-none`}
                dir="ltr"
              />
            </FieldHint>

            <div className="space-y-3">
              <FieldHint
                title="صورة المدربة"
                hint="المقاس الأفضل: 1000 × 1250 بنسبة 4:5، وقص رأسي يركز على الوجه والكتفين."
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                    event.currentTarget.value = "";
                  }}
                  className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-pink-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
                />
              </FieldHint>

              <FieldHint
                title="أو رابط الصورة"
                hint="إذا كانت الصورة مرفوعة مسبقًا، ضعي الرابط المباشر هنا."
              >
                <input
                  value={modal.image ?? ""}
                  onChange={(event) => setModal({ ...modal, image: event.target.value })}
                  placeholder="https://example.com/trainer.jpg"
                  className={INPUT}
                  dir="ltr"
                />
              </FieldHint>

              {uploading ? <div className="text-xs text-yellow-400">جارٍ رفع صورة المدربة...</div> : null}
              {uploadError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-200">
                  {uploadError}
                </div>
              ) : null}

              {modal.image ? (
                <div className="max-w-[220px] overflow-hidden rounded-2xl border border-gray-700 bg-gray-800">
                  <img src={modal.image} alt={modal.name || "trainer-preview"} className="h-[280px] w-full object-cover" />
                </div>
              ) : null}
            </div>

            <button
              onClick={() => void saveTrainer()}
              disabled={saving || uploading}
              className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50"
            >
              {saving ? "جارٍ حفظ بيانات المدربة..." : "حفظ بيانات المدربة"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
