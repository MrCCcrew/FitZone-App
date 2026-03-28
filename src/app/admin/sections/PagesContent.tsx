"use client";

import { useCallback, useEffect, useState } from "react";

type Tab = "hero" | "contact" | "trainers" | "announcements" | "about";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hero", label: "الصفحة الرئيسية", icon: "🏠" },
  { id: "contact", label: "تواصل معنا", icon: "📞" },
  { id: "trainers", label: "المدربات", icon: "🏋️" },
  { id: "announcements", label: "الإعلانات", icon: "📣" },
  { id: "about", label: "عن النادي", icon: "ℹ️" },
];

type HeroStat = { value: string; label: string };
type HeroData = {
  badge: string;
  headline1: string;
  headline2: string;
  headline3: string;
  subtext: string;
  ctaPrimary: string;
  ctaSecondary: string;
  stats: HeroStat[];
  slides: string[];
};

type ContactData = {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  facebook: string;
  instagram: string;
  mapEmbed: string;
};

type Trainer = { name: string; specialty: string; bio: string; rating: number; sessions: number; emoji: string };
type Announcement = { id: string; text: string; active: boolean };
type AboutData = { name: string; city: string; founded: string; description: string; vision: string };

const DEFAULTS: Record<Tab, unknown> = {
  hero: {
    badge: "أول نادي للسيدات في بني سويف",
    headline1: "ابدئي رحلتك",
    headline2: "FIT ZONE",
    headline3: "مع",
    subtext: "النادي الوحيد المخصص للسيدات والأطفال. كلاسات متنوعة، مدربات محترفات، ونتائج حقيقية في بيئة آمنة ومريحة.",
    ctaPrimary: "اشتركي الآن",
    ctaSecondary: "احجزي كلاس تجريبي",
    stats: [
      { value: "500+", label: "عضوة نشطة" },
      { value: "50+", label: "كلاس أسبوعيًا" },
      { value: "3", label: "مدربات محترفات" },
    ],
    slides: [],
  } satisfies HeroData,
  contact: {
    phone: "01001234567",
    whatsapp: "01001234567",
    email: "info@fitzone.eg",
    address: "بني سويف - مصر",
    hours: "السبت - الخميس: 6 ص - 11 م",
    facebook: "",
    instagram: "",
    mapEmbed: "",
  } satisfies ContactData,
  trainers: [
    { name: "هبة زارع", specialty: "مدربة رئيسية", bio: "خبرة كبيرة في التدريب النسائي.", rating: 4.9, sessions: 520, emoji: "🏋️" },
  ] satisfies Trainer[],
  announcements: [
    { id: "1", text: "عرض خاص لفترة محدودة", active: true },
  ] satisfies Announcement[],
  about: {
    name: "نادي فيت زون",
    city: "بني سويف - مصر",
    founded: "2020",
    description: "نادي رياضي مخصص للسيدات والأطفال مع تجربة تدريب عصرية ومريحة.",
    vision: "أن نكون الوجهة الأولى للياقة النسائية في بني سويف.",
  } satisfies AboutData,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-gray-400">{label}</label>
      {children}
    </div>
  );
}

function TInput({ value, onChange, placeholder = "" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none"
    />
  );
}

function TTextarea({ value, onChange, rows = 3, placeholder = "" }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      className="w-full resize-none rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none"
    />
  );
}

function listToText(items?: string[]) {
  return Array.isArray(items) ? items.join("\n") : "";
}

function textToList(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function HeroTab({ data, onChange }: { data: HeroData; onChange: (d: HeroData) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const update = <K extends keyof HeroData>(key: K, value: HeroData[K]) => onChange({ ...data, [key]: value });

  const updateStat = (index: number, key: keyof HeroStat, value: string) => {
    const stats = [...data.stats];
    stats[index] = { ...stats[index], [key]: value };
    onChange({ ...data, stats });
  };

  const addStat = () => onChange({ ...data, stats: [...data.stats, { value: "", label: "" }] });
  const removeStat = (index: number) => onChange({ ...data, stats: data.stats.filter((_, i) => i !== index) });

  const uploadSlides = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? `تعذر رفع الصورة: ${file.name}`);
        if (payload.url) urls.push(payload.url);
      }
      onChange({ ...data, slides: [...data.slides, ...urls] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع الصور الآن.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="الشريط الصغير أعلى العنوان">
          <TInput value={data.badge} onChange={(v) => update("badge", v)} placeholder="أول نادي للسيدات في بني سويف" />
        </Field>
        <Field label="زر الدعوة الأساسي">
          <TInput value={data.ctaPrimary} onChange={(v) => update("ctaPrimary", v)} placeholder="اشتركي الآن" />
        </Field>
        <Field label="السطر الأول من العنوان">
          <TInput value={data.headline1} onChange={(v) => update("headline1", v)} placeholder="ابدئي رحلتك" />
        </Field>
        <Field label="زر الدعوة الثانوي">
          <TInput value={data.ctaSecondary} onChange={(v) => update("ctaSecondary", v)} placeholder="احجزي كلاس تجريبي" />
        </Field>
        <Field label="الكلمة المميزة">
          <TInput value={data.headline2} onChange={(v) => update("headline2", v)} placeholder="FIT ZONE" />
        </Field>
        <Field label="الكلمة الأخيرة">
          <TInput value={data.headline3} onChange={(v) => update("headline3", v)} placeholder="مع" />
        </Field>
      </div>

      <Field label="الوصف التعريفي">
        <TTextarea value={data.subtext} onChange={(v) => update("subtext", v)} rows={3} />
      </Field>

      <div className="rounded-2xl border border-gray-800 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-white">سلايدر الصور الرئيسي</div>
            <div className="mt-1 text-xs leading-6 text-gray-400">أضف 5 صور أو أكثر لتظهر بشكل متكرر داخل الهيرو في الجهة اليسرى.</div>
          </div>
          <div className="text-xs text-emerald-300">عدد الصور: {data.slides.length}</div>
        </div>

        <input
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => {
            void uploadSlides(e.target.files);
            e.currentTarget.value = "";
          }}
          className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
        />
        {uploading && <div className="mt-3 text-xs text-yellow-400">جارٍ رفع صور السلايدر...</div>}
        {uploadError && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-200">{uploadError}</div>}

        <div className="mt-4">
          <Field label="روابط الصور اليدوية - رابط واحد في كل سطر">
            <TTextarea value={listToText(data.slides)} onChange={(v) => update("slides", textToList(v))} rows={5} placeholder="https://example.com/hero-slide-1.jpg" />
          </Field>
        </div>

        {!!data.slides.length && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.slides.map((slide, index) => (
              <div key={`${slide}-${index}`} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                <img src={slide} alt={`hero-slide-${index + 1}`} className="h-32 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => update("slides", data.slides.filter((_, i) => i !== index))}
                  className="w-full border-t border-gray-800 px-3 py-2 text-xs text-red-300"
                >
                  حذف الصورة
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 text-xs text-gray-400">الإحصائيات المختصرة أسفل أزرار الهيرو</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {data.stats.map((item, index) => (
            <div key={index} className="rounded-2xl border border-gray-800 bg-gray-900 p-3">
              <div className="grid gap-3">
                <TInput value={item.value} onChange={(v) => updateStat(index, "value", v)} placeholder="500+" />
                <TInput value={item.label} onChange={(v) => updateStat(index, "label", v)} placeholder="عضوة نشطة" />
                <button type="button" onClick={() => removeStat(index)} className="text-xs text-red-400">
                  حذف الإحصائية
                </button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addStat} className="mt-3 rounded-xl border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-300">
          + إضافة إحصائية
        </button>
      </div>
    </div>
  );
}

function ContactTab({ data, onChange }: { data: ContactData; onChange: (d: ContactData) => void }) {
  const update = <K extends keyof ContactData>(key: K, value: ContactData[K]) => onChange({ ...data, [key]: value });
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="رقم الهاتف"><TInput value={data.phone} onChange={(v) => update("phone", v)} /></Field>
      <Field label="واتساب"><TInput value={data.whatsapp} onChange={(v) => update("whatsapp", v)} /></Field>
      <Field label="البريد الإلكتروني"><TInput value={data.email} onChange={(v) => update("email", v)} /></Field>
      <Field label="العنوان"><TInput value={data.address} onChange={(v) => update("address", v)} /></Field>
      <Field label="مواعيد العمل"><TInput value={data.hours} onChange={(v) => update("hours", v)} /></Field>
      <Field label="فيسبوك"><TInput value={data.facebook} onChange={(v) => update("facebook", v)} /></Field>
      <Field label="إنستجرام"><TInput value={data.instagram} onChange={(v) => update("instagram", v)} /></Field>
      <Field label="رابط الخريطة"><TInput value={data.mapEmbed} onChange={(v) => update("mapEmbed", v)} /></Field>
    </div>
  );
}

function TrainersTab({ data, onChange }: { data: Trainer[]; onChange: (d: Trainer[]) => void }) {
  const update = (index: number, key: keyof Trainer, value: string | number) => {
    const next = [...data];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  };
  return (
    <div className="space-y-4">
      {data.map((trainer, index) => (
        <div key={index} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-bold text-white">{trainer.name}</div>
            <button type="button" onClick={() => onChange(data.filter((_, i) => i !== index))} className="text-xs text-red-400">حذف</button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="الاسم"><TInput value={trainer.name} onChange={(v) => update(index, "name", v)} /></Field>
            <Field label="التخصص"><TInput value={trainer.specialty} onChange={(v) => update(index, "specialty", v)} /></Field>
            <Field label="الأيقونة"><TInput value={trainer.emoji} onChange={(v) => update(index, "emoji", v)} /></Field>
            <Field label="التقييم"><TInput value={String(trainer.rating)} onChange={(v) => update(index, "rating", Number(v) || 0)} /></Field>
            <Field label="عدد الجلسات"><TInput value={String(trainer.sessions)} onChange={(v) => update(index, "sessions", Number(v) || 0)} /></Field>
          </div>
          <div className="mt-3">
            <Field label="نبذة قصيرة"><TTextarea value={trainer.bio} onChange={(v) => update(index, "bio", v)} rows={2} /></Field>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...data, { name: "مدربة جديدة", specialty: "", bio: "", rating: 5, sessions: 0, emoji: "🏋️" }])}
        className="w-full rounded-xl border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-300"
      >
        + إضافة مدربة
      </button>
    </div>
  );
}

function AnnouncementsTab({ data, onChange }: { data: Announcement[]; onChange: (d: Announcement[]) => void }) {
  const update = (index: number, key: keyof Announcement, value: string | boolean) => {
    const next = [...data];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {data.map((announcement, index) => (
        <div key={announcement.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <input type="checkbox" checked={announcement.active} onChange={(e) => update(index, "active", e.target.checked)} />
          <input
            type="text"
            value={announcement.text}
            onChange={(e) => update(index, "text", e.target.value)}
            className="flex-1 border-b border-gray-700 bg-transparent pb-1 text-sm text-gray-200 focus:border-red-600 focus:outline-none"
          />
          <button type="button" onClick={() => onChange(data.filter((_, i) => i !== index))} className="text-red-400">حذف</button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...data, { id: Date.now().toString(), text: "إعلان جديد", active: true }])}
        className="w-full rounded-xl border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-300"
      >
        + إضافة إعلان
      </button>
    </div>
  );
}

function AboutTab({ data, onChange }: { data: AboutData; onChange: (d: AboutData) => void }) {
  const update = <K extends keyof AboutData>(key: K, value: AboutData[K]) => onChange({ ...data, [key]: value });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="اسم النادي"><TInput value={data.name} onChange={(v) => update("name", v)} /></Field>
        <Field label="المدينة"><TInput value={data.city} onChange={(v) => update("city", v)} /></Field>
        <Field label="سنة التأسيس"><TInput value={data.founded} onChange={(v) => update("founded", v)} /></Field>
      </div>
      <Field label="وصف النادي"><TTextarea value={data.description} onChange={(v) => update("description", v)} rows={3} /></Field>
      <Field label="الرؤية"><TTextarea value={data.vision} onChange={(v) => update("vision", v)} rows={2} /></Field>
    </div>
  );
}

export default function PagesContent() {
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [content, setContent] = useState<Record<Tab, unknown>>(DEFAULTS as Record<Tab, unknown>);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/site-content?sections=hero,contact,trainers,announcements,about", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setContent((prev) => ({ ...prev, ...data }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const updateContent = (value: unknown) => setContent((prev) => ({ ...prev, [activeTab]: value }));

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: activeTab, content: content[activeTab] }),
      });
      showToast(response.ok ? "تم حفظ التغييرات بنجاح." : "حدث خطأ أثناء الحفظ.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 p-5">
          <div>
            <h2 className="text-base font-black text-white">
              {TABS.find((tab) => tab.id === activeTab)?.icon} {TABS.find((tab) => tab.id === activeTab)?.label}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">كل التعديلات هنا تُحفظ مباشرة داخل قاعدة البيانات وتظهر في الموقع بعد الحفظ.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setContent((prev) => ({ ...prev, [activeTab]: DEFAULTS[activeTab] }))}
              className="rounded-xl bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            >
              إعادة تعيين
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || loading}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="py-12 text-center text-gray-500">جارٍ تحميل المحتوى...</div>
          ) : (
            <>
              {activeTab === "hero" && <HeroTab data={content.hero as HeroData} onChange={(d) => updateContent(d)} />}
              {activeTab === "contact" && <ContactTab data={content.contact as ContactData} onChange={(d) => updateContent(d)} />}
              {activeTab === "trainers" && <TrainersTab data={content.trainers as Trainer[]} onChange={(d) => updateContent(d)} />}
              {activeTab === "announcements" && <AnnouncementsTab data={content.announcements as Announcement[]} onChange={(d) => updateContent(d)} />}
              {activeTab === "about" && <AboutTab data={content.about as AboutData} onChange={(d) => updateContent(d)} />}
            </>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-gray-600 bg-gray-800 px-6 py-3 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
