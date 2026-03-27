"use client";

import { useState, useEffect, useCallback } from "react";

type Tab = "hero" | "contact" | "trainers" | "announcements" | "about";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hero",          label: "الصفحة الرئيسية",  icon: "🏠" },
  { id: "contact",       label: "تواصل معنا",        icon: "📞" },
  { id: "trainers",      label: "المدربون",          icon: "💪" },
  { id: "announcements", label: "الإعلانات",         icon: "📣" },
  { id: "about",         label: "عن النادي",         icon: "ℹ️" },
];

const DEFAULTS: Record<Tab, unknown> = {
  hero: {
    badge:       "نادي فيت زون — بني سويف",
    headline1:   "حوّل",
    headline2:   "جسمك",
    headline3:   "وحياتك",
    subtext:     "أحدث الأجهزة · أفضل المدربين · جو احترافي في قلب بني سويف",
    ctaPrimary:  "ابدأ رحلتك",
    ctaSecondary:"شاهد الكلاسات",
    stats: [
      { value: "+500", label: "عضو نشط" },
      { value: "15",   label: "مدرب محترف" },
      { value: "20+",  label: "كلاس أسبوعياً" },
      { value: "4",    label: "سنوات خبرة" },
    ],
  },
  contact: {
    phone: "01001234567", whatsapp: "01001234567", email: "info@fitzone.eg",
    address: "شارع الجمهورية، بني سويف", hours: "السبت – الخميس: 6 ص – 11 م",
    facebook: "https://facebook.com/fitzone.benisuef",
    instagram: "https://instagram.com/fitzone.benisuef", mapEmbed: "",
  },
  trainers: [
    { name: "أحمد حسن",    specialty: "كمال الأجسام",  bio: "بطل محلي في كمال الأجسام، خبرة 8 سنوات", rating: 4.9, sessions: 1240, emoji: "💪" },
    { name: "سارة محمد",   specialty: "يوجا وتأمل",    bio: "معلمة يوجا معتمدة", rating: 4.8, sessions: 890, emoji: "🧘" },
    { name: "محمود علي",   specialty: "كروس فيت",      bio: "مدرب كروس فيت معتمد، خبرة 6 سنوات", rating: 4.9, sessions: 1050, emoji: "🏋️" },
    { name: "نورا إبراهيم", specialty: "رقص ودانس",   bio: "راقصة متخصصة في التعليم الجماعي", rating: 4.7, sessions: 670, emoji: "💃" },
    { name: "خالد عمر",    specialty: "ملاكمة",        bio: "بطل ملاكمة سابق، مدرب معتمد", rating: 4.8, sessions: 820, emoji: "🥊" },
  ],
  announcements: [
    { id: "1", text: "🎉 عرض خاص: اشترك في الباقة السنوية واحصل على شهر مجاناً!", active: true },
    { id: "2", text: "🏋️ كلاس جديد: CrossFit للمبتدئين كل يوم سبت الساعة 7 صباحاً", active: true },
  ],
  about: {
    name: "نادي فيت زون", city: "بني سويف، مصر", founded: "2020",
    description: "نادي فيت زون هو الوجهة الأولى للياقة البدنية في بني سويف. نقدم أحدث الأجهزة وأفضل المدربين في بيئة احترافية ومحفزة.",
    vision: "نسعى لتكون فيت زون المرجع الأول للياقة البدنية في صعيد مصر.",
  },
};

// ── Reusable helpers ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-gray-400 text-xs mb-1.5">{label}</label>{children}</div>;
}
function TInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-red-600 text-sm" />
  );
}
function TTextarea({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:outline-none focus:border-red-600 text-sm resize-none" />
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────
type HeroData = { badge: string; headline1: string; headline2: string; headline3: string; subtext: string; ctaPrimary: string; ctaSecondary: string; stats: { value: string; label: string }[] };
function HeroTab({ data, onChange }: { data: HeroData; onChange: (d: unknown) => void }) {
  const upd = (k: keyof HeroData, v: unknown) => onChange({ ...data, [k]: v });
  const updStat = (i: number, k: string, v: string) => {
    const stats = [...data.stats]; stats[i] = { ...stats[i], [k]: v }; onChange({ ...data, stats });
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="النص الصغير (badge)"><TInput value={data.badge} onChange={v => upd("badge", v)} /></Field>
        <Field label="الكلمة الأولى"><TInput value={data.headline1} onChange={v => upd("headline1", v)} /></Field>
        <Field label="الكلمة المميزة (أحمر)"><TInput value={data.headline2} onChange={v => upd("headline2", v)} /></Field>
        <Field label="الكلمة الثالثة"><TInput value={data.headline3} onChange={v => upd("headline3", v)} /></Field>
        <Field label="زر CTA الأول"><TInput value={data.ctaPrimary} onChange={v => upd("ctaPrimary", v)} /></Field>
        <Field label="زر CTA الثاني"><TInput value={data.ctaSecondary} onChange={v => upd("ctaSecondary", v)} /></Field>
      </div>
      <Field label="النص التوضيحي"><TTextarea value={data.subtext} onChange={v => upd("subtext", v)} rows={2} /></Field>
      <div>
        <div className="text-gray-400 text-xs mb-3">الإحصائيات</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.stats.map((s, i) => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
              <TInput value={s.value} onChange={v => updStat(i, "value", v)} placeholder="القيمة" />
              <TInput value={s.label} onChange={v => updStat(i, "label", v)} placeholder="الوصف" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Contact ───────────────────────────────────────────────────────────────────
function ContactTab({ data, onChange }: { data: Record<string, string>; onChange: (d: unknown) => void }) {
  const upd = (k: string, v: string) => onChange({ ...data, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field label="رقم الهاتف"><TInput value={data.phone ?? ""} onChange={v => upd("phone", v)} placeholder="01xxxxxxxxx" /></Field>
      <Field label="واتساب"><TInput value={data.whatsapp ?? ""} onChange={v => upd("whatsapp", v)} placeholder="01xxxxxxxxx" /></Field>
      <Field label="البريد الإلكتروني"><TInput value={data.email ?? ""} onChange={v => upd("email", v)} placeholder="info@fitzone.eg" /></Field>
      <Field label="العنوان"><TInput value={data.address ?? ""} onChange={v => upd("address", v)} /></Field>
      <Field label="مواعيد العمل"><TInput value={data.hours ?? ""} onChange={v => upd("hours", v)} /></Field>
      <Field label="فيسبوك"><TInput value={data.facebook ?? ""} onChange={v => upd("facebook", v)} /></Field>
      <Field label="إنستغرام"><TInput value={data.instagram ?? ""} onChange={v => upd("instagram", v)} /></Field>
      <Field label="رابط الخريطة"><TInput value={data.mapEmbed ?? ""} onChange={v => upd("mapEmbed", v)} /></Field>
    </div>
  );
}

// ── Trainers ──────────────────────────────────────────────────────────────────
type Trainer = { name: string; specialty: string; bio: string; rating: number; sessions: number; emoji: string };
function TrainersTab({ data, onChange }: { data: Trainer[]; onChange: (d: unknown) => void }) {
  const upd = (i: number, k: keyof Trainer, v: string | number) => { const a = [...data]; a[i] = { ...a[i], [k]: v }; onChange(a); };
  const add = () => onChange([...data, { name: "مدرب جديد", specialty: "", bio: "", rating: 5.0, sessions: 0, emoji: "💪" }]);
  const remove = (i: number) => onChange(data.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-4">
      {data.map((t, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-white flex items-center gap-2"><span className="text-xl">{t.emoji}</span>{t.name}</span>
            <button onClick={() => remove(i)} className="text-red-500 hover:text-red-400 text-xs">حذف</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="الاسم"><TInput value={t.name} onChange={v => upd(i, "name", v)} /></Field>
            <Field label="التخصص"><TInput value={t.specialty} onChange={v => upd(i, "specialty", v)} /></Field>
            <Field label="Emoji"><TInput value={t.emoji} onChange={v => upd(i, "emoji", v)} /></Field>
            <Field label="التقييم">
              <input type="number" min={1} max={5} step={0.1} value={t.rating} onChange={e => upd(i, "rating", parseFloat(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none" />
            </Field>
            <Field label="عدد الجلسات">
              <input type="number" min={0} value={t.sessions} onChange={e => upd(i, "sessions", parseInt(e.target.value))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none" />
            </Field>
          </div>
          <div className="mt-3"><Field label="نبذة"><TTextarea value={t.bio} onChange={v => upd(i, "bio", v)} rows={2} /></Field></div>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-gray-700 hover:border-red-600 text-gray-500 hover:text-red-500 py-3 rounded-2xl text-sm transition-colors">
        + إضافة مدرب
      </button>
    </div>
  );
}

// ── Announcements ─────────────────────────────────────────────────────────────
type Ann = { id: string; text: string; active: boolean };
function AnnouncementsTab({ data, onChange }: { data: Ann[]; onChange: (d: unknown) => void }) {
  const upd = (i: number, k: keyof Ann, v: string | boolean) => { const a = [...data]; a[i] = { ...a[i], [k]: v }; onChange(a); };
  const add = () => onChange([...data, { id: Date.now().toString(), text: "إعلان جديد", active: true }]);
  const remove = (i: number) => onChange(data.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-3">
      {data.map((a, i) => (
        <div key={a.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" checked={a.active} onChange={e => upd(i, "active", e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 bg-gray-700 peer-checked:bg-red-600 rounded-full peer after:content-[''] after:absolute after:top-0.5 after:start-[4px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
          </label>
          <input type="text" value={a.text} onChange={e => upd(i, "text", e.target.value)}
            className="flex-1 bg-transparent text-gray-200 text-sm focus:outline-none border-b border-gray-700 focus:border-red-600 pb-1 transition-colors" />
          <button onClick={() => remove(i)} className="text-gray-600 hover:text-red-500 transition-colors text-xl leading-none shrink-0">✕</button>
        </div>
      ))}
      <button onClick={add} className="w-full border-2 border-dashed border-gray-700 hover:border-red-600 text-gray-500 hover:text-red-500 py-3 rounded-xl text-sm transition-colors">
        + إضافة إعلان
      </button>
    </div>
  );
}

// ── About ─────────────────────────────────────────────────────────────────────
function AboutTab({ data, onChange }: { data: Record<string, string>; onChange: (d: unknown) => void }) {
  const upd = (k: string, v: string) => onChange({ ...data, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="اسم النادي"><TInput value={data.name ?? ""} onChange={v => upd("name", v)} /></Field>
        <Field label="المدينة"><TInput value={data.city ?? ""} onChange={v => upd("city", v)} /></Field>
        <Field label="سنة التأسيس"><TInput value={data.founded ?? ""} onChange={v => upd("founded", v)} /></Field>
      </div>
      <Field label="وصف النادي"><TTextarea value={data.description ?? ""} onChange={v => upd("description", v)} rows={3} /></Field>
      <Field label="رسالة النادي / الرؤية"><TTextarea value={data.vision ?? ""} onChange={v => upd("vision", v)} rows={2} /></Field>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PagesContent() {
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [content, setContent]     = useState<Record<Tab, unknown>>(DEFAULTS as Record<Tab, unknown>);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/site-content?sections=hero,contact,trainers,announcements,about");
      if (res.ok) {
        const data = await res.json();
        setContent(prev => ({ ...prev, ...data }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/site-content", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: activeTab, content: content[activeTab] }),
      });
      showToast(res.ok ? "✅ تم الحفظ بنجاح" : "❌ حدث خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const upd = (v: unknown) => setContent(prev => ({ ...prev, [activeTab]: v }));

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === t.id ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="bg-gray-950 border border-gray-800 rounded-2xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div>
            <h2 className="text-white font-black text-base">
              {TABS.find(t => t.id === activeTab)?.icon} {TABS.find(t => t.id === activeTab)?.label}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">التغييرات تُحفظ في قاعدة البيانات</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setContent(prev => ({ ...prev, [activeTab]: DEFAULTS[activeTab] }))}
              className="px-4 py-2 rounded-xl text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              إعادة تعيين
            </button>
            <button onClick={save} disabled={saving || loading}
              className="px-4 py-2 rounded-xl text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition-colors">
              {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="text-center text-gray-500 py-12">جارٍ تحميل المحتوى...</div>
          ) : (
            <>
              {activeTab === "hero"          && <HeroTab          data={content.hero as HeroData}             onChange={upd} />}
              {activeTab === "contact"       && <ContactTab       data={content.contact as Record<string,string>}  onChange={upd} />}
              {activeTab === "trainers"      && <TrainersTab      data={content.trainers as Trainer[]}         onChange={upd} />}
              {activeTab === "announcements" && <AnnouncementsTab data={content.announcements as Ann[]}        onChange={upd} />}
              {activeTab === "about"         && <AboutTab         data={content.about as Record<string,string>} onChange={upd} />}
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-medium z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
