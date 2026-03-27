"use client";

import { useState, useEffect, useCallback } from "react";
import type { GymClass } from "../types";

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const TYPE_LABELS: Record<GymClass["type"], string> = { cardio: "كارديو", strength: "مقاومة", yoga: "يوغا", boxing: "ملاكمة", swimming: "سباحة", dance: "رقص" };
const TYPE_COLORS: Record<GymClass["type"], string> = { cardio: "bg-orange-500/20 text-orange-400", strength: "bg-red-500/20 text-red-400", yoga: "bg-purple-500/20 text-purple-400", boxing: "bg-blue-500/20 text-blue-400", swimming: "bg-cyan-500/20 text-cyan-400", dance: "bg-pink-500/20 text-pink-400" };
type ApiTrainer = { id: string; name: string; specialty: string };
const EMPTY_TRAINER_ID = "";
const EMPTY: Omit<GymClass, "id"> & { trainerId?: string } = { name: "", trainer: "", trainerId: EMPTY_TRAINER_ID, day: DAYS[0], time: "06:00", duration: 60, capacity: 15, enrolled: 0, type: "strength", active: true };

const INPUT = "w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-gray-500 text-xs mb-1.5">{label}</label>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-black text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Classes() {
  const [classes, setClasses]     = useState<GymClass[]>([]);
  const [trainers, setTrainers]   = useState<ApiTrainer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [modal, setModal] = useState<(GymClass & { trainerId?: string }) | (Omit<GymClass, "id"> & { trainerId?: string }) | null>(null);
  const [view, setView] = useState<"list" | "schedule">("schedule");
  const [filterDay, setFilterDay] = useState<string>("الكل");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const d = await fetch("/api/admin/classes").then(r => r.json());
    setClasses(Array.isArray(d.classes) ? d.classes : []);
    setTrainers(Array.isArray(d.trainers) ? d.trainers : []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    const isEdit = "id" in modal;
    const payload = {
      ...(isEdit && { id: (modal as GymClass).id }),
      name:      modal.name,
      trainerId: (modal as GymClass & { trainerId?: string }).trainerId ?? trainers[0]?.id,
      type:      modal.type,
      duration:  modal.duration,
      intensity: "medium",
      maxSpots:  modal.capacity,
      price:     0,
      active:    modal.active,
      day:       modal.day,
      time:      modal.time,
    };
    await fetch("/api/admin/classes", {
      method:  isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
    await fetchAll();
    setModal(null); setSaving(false);
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) });
    await fetchAll();
  };
  const del = async (id: string) => {
    if (!confirm("حذف الكلاس؟")) return;
    await fetch("/api/admin/classes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await fetchAll();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500 text-sm">جارٍ تحميل الكلاسات...</div></div>;

  const displayed = filterDay === "الكل" ? classes : classes.filter((c) => c.day === filterDay);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {["schedule", "list"].map((v) => (
            <button key={v} onClick={() => setView(v as typeof view)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${view === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
              {v === "schedule" ? "📅 الجدول" : "📋 القائمة"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 flex-wrap">
            {["الكل", ...DAYS].map((d) => (
              <button key={d} onClick={() => setFilterDay(d)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterDay === d ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                {d}
              </button>
            ))}
          </div>
          <button onClick={() => setModal(EMPTY)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors whitespace-nowrap">
            + كلاس جديد
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          ["إجمالي الكلاسات", classes.length, "text-white"],
          ["كلاسات نشطة", classes.filter(c => c.active).length, "text-green-400"],
          ["إجمالي المسجلين", classes.reduce((s, c) => s + c.enrolled, 0), "text-yellow-400"],
          ["متوسط الامتلاء", Math.round(classes.reduce((s, c) => s + (c.enrolled / c.capacity) * 100, 0) / classes.length) + "%", "text-red-400"],
        ].map(([label, val, color]) => (
          <div key={label as string} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-black ${color}`}>{val}</div>
            <div className="text-gray-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Schedule view */}
      {view === "schedule" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 text-center border-b border-gray-800">
            {DAYS.map((d) => (
              <div key={d} className="py-3 text-xs font-bold text-gray-400 border-l border-gray-800 first:border-l-0">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 min-h-48">
            {DAYS.map((day) => (
              <div key={day} className="border-l border-gray-800 first:border-l-0 p-2 space-y-1.5">
                {classes.filter((c) => c.day === day).map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => setModal(cls)}
                    className={`w-full text-right p-2 rounded-lg border transition-all hover:scale-[1.02] ${cls.active ? "border-gray-700 bg-gray-800/80" : "border-gray-800 bg-gray-900 opacity-50"}`}
                  >
                    <div className="text-white text-xs font-black leading-tight">{cls.name}</div>
                    <div className="text-gray-500 text-[10px]">{cls.time}</div>
                    <div className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-1 ${TYPE_COLORS[cls.type]}`}>
                      {TYPE_LABELS[cls.type]}
                    </div>
                    <div className="mt-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cls.enrolled / cls.capacity >= 0.9 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${(cls.enrolled / cls.capacity) * 100}%` }} />
                    </div>
                    <div className="text-gray-600 text-[9px] mt-0.5">{cls.enrolled}/{cls.capacity}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  {["الكلاس", "المدرب", "اليوم", "الوقت", "المدة", "الامتلاء", "النوع", "الحالة", ""].map((h) => (
                    <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((cls) => (
                  <tr key={cls.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4 text-white font-bold">{cls.name}</td>
                    <td className="py-3 px-4 text-gray-400">{cls.trainer}</td>
                    <td className="py-3 px-4 text-gray-400">{cls.day}</td>
                    <td className="py-3 px-4 text-gray-400" dir="ltr">{cls.time}</td>
                    <td className="py-3 px-4 text-gray-400">{cls.duration} دقيقة</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cls.enrolled / cls.capacity >= 0.9 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${(cls.enrolled / cls.capacity) * 100}%` }} />
                        </div>
                        <span className="text-gray-400 text-xs">{cls.enrolled}/{cls.capacity}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${TYPE_COLORS[cls.type]}`}>{TYPE_LABELS[cls.type]}</span>
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => toggle(cls.id, cls.active)} className={`relative w-10 h-5 rounded-full transition-colors ${cls.active ? "bg-green-600" : "bg-gray-700"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${cls.active ? "right-0.5" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(cls)} className="text-gray-500 hover:text-yellow-400 transition-colors text-xs">تعديل</button>
                        <button onClick={() => del(cls.id)} className="text-gray-500 hover:text-red-500 transition-colors text-xs">حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <Modal title={"id" in modal ? "تعديل الكلاس" : "كلاس جديد"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="اسم الكلاس">
              <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="المدرب">
                <select value={(modal as GymClass & { trainerId?: string }).trainerId ?? ""} onChange={(e) => { const t = trainers.find(x => x.id === e.target.value); setModal({ ...modal, trainerId: e.target.value, trainer: t?.name ?? "" }); }} className={INPUT}>
                  {trainers.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.specialty}</option>)}
                  {trainers.length === 0 && <option>لا يوجد مدربون — أضف مدرب أولاً</option>}
                </select>
              </Field>
              <Field label="النوع">
                <select value={modal.type} onChange={(e) => setModal({ ...modal, type: e.target.value as GymClass["type"] })} className={INPUT}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="اليوم">
                <select value={modal.day} onChange={(e) => setModal({ ...modal, day: e.target.value })} className={INPUT}>
                  {DAYS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="الوقت">
                <input type="time" value={modal.time} onChange={(e) => setModal({ ...modal, time: e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="المدة (دقيقة)">
                <input type="number" value={modal.duration} onChange={(e) => setModal({ ...modal, duration: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="السعة">
                <input type="number" value={modal.capacity} onChange={(e) => setModal({ ...modal, capacity: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
            </div>
            <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">{saving ? "جارٍ الحفظ..." : "💾 حفظ الكلاس"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
