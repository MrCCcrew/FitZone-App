"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TranslateButton } from "./TranslateButton";

type Tab = "hero" | "contact" | "trainersPage" | "announcements" | "about" | "blog" | "policy" | "privacy" | "refund";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "hero", label: "الصفحة الرئيسية", icon: "🏠" },
  { id: "contact", label: "تواصل معنا", icon: "📞" },
  { id: "trainersPage", label: "صفحة المدربات", icon: "🏋️" },
  { id: "announcements", label: "الإعلانات", icon: "📣" },
  { id: "about", label: "عن النادي", icon: "ℹ️" },
  { id: "blog", label: "المدونة", icon: "📝" },
  { id: "policy", label: "سياسة الاستخدام", icon: "📄" },
  { id: "privacy", label: "سياسة الخصوصية", icon: "🔒" },
  { id: "refund", label: "سياسة الاسترجاع", icon: "↩️" },
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
  slides: string[];
  stats: HeroStat[];
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

type TrainersPageData = {
  badge: string;
  badgeEn?: string;
  title: string;
  titleEn?: string;
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  highlight: string;
  highlightEn?: string;
  ctaLabel: string;
  ctaLabelEn?: string;
};

type Announcement = { id: string; text: string; active: boolean };
type AboutData = {
  name: string;
  city: string;
  founded: string;
  description: string;
  vision: string;
};
type BlogPost = {
  id: string;
  title: string;
  titleEn?: string;
  category: string;
  categoryEn?: string;
  author: string;
  authorEn?: string;
  date: string;
  dateEn?: string;
  readTime: string;
  readTimeEn?: string;
  featured: boolean;
  summary: string;
  summaryEn?: string;
  content: string;
  contentEn?: string;
  coverImage: string;
  videoUrl: string;
  active: boolean;
};
type BlogData = {
  categories: string[];
  categoriesEn?: string[];
  posts: BlogPost[];
};
type LegalData = {
  title: string;
  titleEn?: string;
  updatedAt: string;
  updatedAtEn?: string;
  content: string;
  contentEn?: string;
};

const DEFAULTS: Record<Tab, unknown> = {
  hero: {
    badge: "أول نادي للسيدات في بني سويف",
    headline1: "ابدئي رحلتك",
    headline2: "FIT ZONE",
    headline3: "مع",
    subtext:
      "النادي الوحيد المخصص للسيدات والأطفال. كلاسات متنوعة، مدربات محترفات، ونتائج حقيقية في بيئة آمنة ومريحة.",
    ctaPrimary: "اشتركي الآن",
    ctaSecondary: "احجزي كلاس تجريبي",
    slides: [],
    stats: [
      { value: "500+", label: "عضوة نشطة" },
      { value: "50+", label: "كلاس أسبوعيًا" },
      { value: "3", label: "مدربات محترفات" },
    ],
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
  trainersPage: {
    badge: "فريقنا",
    title: "مدرباتنا المحترفات",
    subtitle: "أفضل فريق تدريبي في بني سويف",
    description:
      "تعرفي على فريق المدربات في فيت زون، واختاري المدربة الأقرب لهدفك التدريبي وخبرتك الحالية.",
    highlight: "صورة مدربة واضحة + نبذة مختصرة + التخصصات + عدد الجلسات",
    ctaLabel: "احجزي مع المدربة المناسبة",
  } satisfies TrainersPageData,
  announcements: [
    { id: "1", text: "عرض خاص لفترة محدودة", active: true },
  ] satisfies Announcement[],
  about: {
    name: "نادي فيت زون",
    city: "بني سويف - مصر",
    founded: "2020",
    description:
      "نادي رياضي مخصص للسيدات والأطفال مع تجربة تدريب عصرية ومريحة وبيئة آمنة تناسب كل الأعمار.",
    vision: "أن نكون الوجهة الأولى للياقة النسائية في بني سويف.",
  } satisfies AboutData,
  blog: {
    categories: ["لياقة", "تغذية", "صحة", "تحفيز"],
    posts: [],
  } satisfies BlogData,
  policy: {
    title: "سياسة الاستخدام والشروط",
    updatedAt: "آخر تحديث: 2026-04-08",
    content:
      "باستخدامك لهذا الموقع أو خدمات Fit Zone فإنك تقر بأنك قرأت هذه السياسة ووافقت عليها.\n\n1) الاستخدام المقبول: يُمنع إساءة الاستخدام أو نشر محتوى مخالف.\n2) الاشتراكات والحجوزات: أي حجز أو اشتراك يتم وفق المواعيد والسياسات المعروضة داخل الموقع.\n3) المدفوعات: يتم الدفع عبر الوسائل المعتمدة داخل الموقع، وأي رسوم موضّحة يتم إظهارها قبل التأكيد النهائي.\n4) المحتوى والملكية الفكرية: جميع المحتويات والصور والشعارات مملوكة لـ Fit Zone أو مرخّصة لها.\n5) التعديلات: نحتفظ بحق تعديل هذه السياسة، وسيتم تحديث تاريخ آخر تعديل أعلاه.",
  } satisfies LegalData,
  privacy: {
    title: "سياسة الخصوصية",
    updatedAt: "آخر تحديث: 2026-04-08",
    content:
      "نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية.\n\n1) البيانات التي نجمعها: الاسم، البريد الإلكتروني، الهاتف، وبيانات الحجز/الاشتراك عند الحاجة.\n2) استخدام البيانات: لإدارة الحساب، الحجز، إرسال إشعارات مهمة، وتحسين الخدمة.\n3) مشاركة البيانات: لا نشارك بياناتك مع أطراف خارجية إلا عند الضرورة لتنفيذ الخدمة (مثل شركات الدفع/الشحن) أو وفق القانون.\n4) الأمان: نستخدم إجراءات مناسبة لحماية البيانات من الوصول غير المصرح به.\n5) حقوقك: يمكنك طلب تعديل أو حذف بياناتك عبر الدعم.",
  } satisfies LegalData,
  refund: {
    title: "سياسة الاسترجاع والإلغاء",
    updatedAt: "آخر تحديث: 2026-04-08",
    content:
      "نسعى لتقديم أفضل تجربة. توضح هذه السياسة آلية الاسترجاع والإلغاء.\n\n1) الاشتراكات: قد تكون غير قابلة للاسترداد بعد التفعيل، إلا إذا نصّت العروض على غير ذلك.\n2) الباقات/العروض: تُطبق شروط الاسترجاع الخاصة بكل عرض كما تظهر عند الشراء.\n3) الحجوزات: يمكن تعديل المواعيد وفق الشروط الموضحة داخل الحساب.\n4) المنتجات: يمكن استرجاع المنتجات وفق حالة المنتج وسياسة المتجر (إن وجدت).\n5) التواصل: للاستفسارات أو طلب استرجاع، يرجى التواصل مع فريق الدعم.",
  } satisfies LegalData,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-400">{label}</label>
      {children}
      {hint ? <div className="mt-1 text-[11px] leading-5 text-gray-500">{hint}</div> : null}
    </div>
  );
}

function TInput({
  value,
  onChange,
  placeholder = "",
  className: extraClass = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none ${extraClass}`}
    />
  );
}

function TTextarea({
  value,
  onChange,
  rows = 3,
  placeholder = "",
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
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
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
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
  const removeStat = (index: number) =>
    onChange({ ...data, stats: data.stats.filter((_, itemIndex) => itemIndex !== index) });

  const uploadSlides = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");

    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("folder", "hero");

        const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? `تعذر رفع الصورة: ${file.name}`);
        }
        if (payload.url) urls.push(payload.url);
      }

      onChange({ ...data, slides: [...data.slides, ...urls] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع صور السلايدر الآن.");
    } finally {
      setUploading(false);
    }
  };

  const moveSlide = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= data.slides.length) return;
    const slides = [...data.slides];
    const [moved] = slides.splice(index, 1);
    slides.splice(target, 0, moved);
    onChange({ ...data, slides });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="الشريط الصغير أعلى العنوان">
          <TInput value={data.badge} onChange={(v) => update("badge", v)} />
        </Field>
        <Field label="زر الدعوة الأساسي">
          <TInput value={data.ctaPrimary} onChange={(v) => update("ctaPrimary", v)} />
        </Field>
        <Field label="السطر الأول من العنوان">
          <TInput value={data.headline1} onChange={(v) => update("headline1", v)} />
        </Field>
        <Field label="زر الدعوة الثانوي">
          <TInput value={data.ctaSecondary} onChange={(v) => update("ctaSecondary", v)} />
        </Field>
        <Field label="الكلمة المميزة">
          <TInput value={data.headline2} onChange={(v) => update("headline2", v)} />
        </Field>
        <Field label="الكلمة الأخيرة">
          <TInput value={data.headline3} onChange={(v) => update("headline3", v)} />
        </Field>
      </div>

      <Field label="الوصف التعريفي">
        <TTextarea value={data.subtext} onChange={(v) => update("subtext", v)} rows={3} />
      </Field>

      <div className="rounded-2xl border border-gray-800 bg-black/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold text-white">سلايدر الصور الرئيسي</div>
            <div className="mt-1 text-xs leading-6 text-gray-400">
              ارفعي 5 صور أو أكثر لتتحرك داخل الهيرو بشكل تلقائي وانسيابي.
            </div>
          </div>
          <div className="text-xs text-emerald-300">عدد الصور: {data.slides.length}</div>
        </div>

        <Field
          label="رفع صور السلايدر"
          hint="المقاس المثالي: 1280 × 720 بكسل (نسبة 16:9) — الصورة ستملأ السلايدر بالكامل بدون مساحات فارغة. إذا كانت الصورة بنفس النسبة 16:9 ستظهر بدون أي قص."
        >
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
        </Field>

        {uploading ? <div className="mt-3 text-xs text-yellow-400">جارٍ رفع صور السلايدر...</div> : null}
        {uploadError ? (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs text-red-200">
            {uploadError}
          </div>
        ) : null}

        <div className="mt-4">
          <Field label="روابط الصور اليدوية - رابط واحد في كل سطر">
            <TTextarea
              value={listToText(data.slides)}
              onChange={(v) => update("slides", textToList(v))}
              rows={5}
              placeholder="https://example.com/hero-slide-1.jpg"
            />
          </Field>
        </div>

        {data.slides.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.slides.map((slide, index) => (
              <div key={`${slide}-${index}`} className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
                <img src={slide} alt={`slide-${index + 1}`} className="h-32 w-full object-cover" />
                <div className="flex items-center justify-between border-t border-gray-800 px-3 py-2 text-xs text-gray-300">
                  <span>الأولوية: {index + 1}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => moveSlide(index, -1)} className="rounded bg-gray-800 px-2 py-1">
                      رفع
                    </button>
                    <button type="button" onClick={() => moveSlide(index, 1)} className="rounded bg-gray-800 px-2 py-1">
                      خفض
                    </button>
                    <button
                      type="button"
                      onClick={() => update("slides", data.slides.filter((_, itemIndex) => itemIndex !== index))}
                      className="rounded bg-red-950 px-2 py-1 text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
        <button
          type="button"
          onClick={addStat}
          className="mt-3 rounded-xl border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-300"
        >
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
      <Field label="رقم الهاتف">
        <TInput value={data.phone} onChange={(v) => update("phone", v)} />
      </Field>
      <Field label="واتساب">
        <TInput value={data.whatsapp} onChange={(v) => update("whatsapp", v)} />
      </Field>
      <Field label="البريد الإلكتروني">
        <TInput value={data.email} onChange={(v) => update("email", v)} />
      </Field>
      <Field label="العنوان">
        <TInput value={data.address} onChange={(v) => update("address", v)} />
      </Field>
      <Field label="مواعيد العمل">
        <TInput value={data.hours} onChange={(v) => update("hours", v)} />
      </Field>
      <Field label="فيسبوك">
        <TInput value={data.facebook} onChange={(v) => update("facebook", v)} />
      </Field>
      <Field label="إنستجرام">
        <TInput value={data.instagram} onChange={(v) => update("instagram", v)} />
      </Field>
      <Field label="رابط الخريطة">
        <TInput value={data.mapEmbed} onChange={(v) => update("mapEmbed", v)} />
      </Field>
    </div>
  );
}

function TrainersPageTab({
  data,
  onChange,
}: {
  data: TrainersPageData;
  onChange: (d: TrainersPageData) => void;
}) {
  const update = <K extends keyof TrainersPageData>(key: K, value: TrainersPageData[K]) =>
    onChange({ ...data, [key]: value });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 text-sm leading-7 text-emerald-100">
        هذا القسم يتحكم في <span className="font-bold">مقدمة صفحة المدربات العامة</span> فقط.
        <br />
        أما إضافة المدربات وتعديل صورهن وتخصصاتهن وتقاريرهن المختصرة فيكون من قسم <span className="font-bold">المدربات</span>.
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="شارة أعلى الصفحة">
          <TInput value={data.badge} onChange={(v) => update("badge", v)} />
        </Field>
        <Field label="زر الدعوة">
          <TInput value={data.ctaLabel} onChange={(v) => update("ctaLabel", v)} />
        </Field>
        <Field label="CTA Label (EN)">
          <div className="flex gap-2">
            <TInput className="flex-1" value={data.ctaLabelEn ?? ""} onChange={(v) => update("ctaLabelEn", v)} />
            <TranslateButton from={data.ctaLabel} onTranslated={(v) => update("ctaLabelEn", v)} />
          </div>
        </Field>
        <Field label="Badge (EN)">
          <div className="flex gap-2">
            <TInput className="flex-1" value={data.badgeEn ?? ""} onChange={(v) => update("badgeEn", v)} />
            <TranslateButton from={data.badge} onTranslated={(v) => update("badgeEn", v)} />
          </div>
        </Field>
      </div>

      <Field label="العنوان الرئيسي">
        <TInput value={data.title} onChange={(v) => update("title", v)} />
      </Field>
      <Field label="Title (EN)">
        <div className="flex gap-2">
          <TInput className="flex-1" value={data.titleEn ?? ""} onChange={(v) => update("titleEn", v)} />
          <TranslateButton from={data.title} onTranslated={(v) => update("titleEn", v)} />
        </div>
      </Field>

      <Field label="العنوان الفرعي">
        <TInput value={data.subtitle} onChange={(v) => update("subtitle", v)} />
      </Field>
      <Field label="Subtitle (EN)">
        <div className="flex gap-2">
          <TInput className="flex-1" value={data.subtitleEn ?? ""} onChange={(v) => update("subtitleEn", v)} />
          <TranslateButton from={data.subtitle} onTranslated={(v) => update("subtitleEn", v)} />
        </div>
      </Field>

      <Field label="وصف الصفحة">
        <TTextarea value={data.description} onChange={(v) => update("description", v)} rows={4} />
      </Field>
      <Field label="Description (EN)">
        <div className="space-y-1">
          <TTextarea value={data.descriptionEn ?? ""} onChange={(v) => update("descriptionEn", v)} rows={4} />
          <TranslateButton from={data.description} onTranslated={(v) => update("descriptionEn", v)} />
        </div>
      </Field>

      <Field label="سطر إبراز أسفل المقدمة">
        <TInput value={data.highlight} onChange={(v) => update("highlight", v)} />
      </Field>
      <Field label="Highlight (EN)">
        <div className="flex gap-2">
          <TInput className="flex-1" value={data.highlightEn ?? ""} onChange={(v) => update("highlightEn", v)} />
          <TranslateButton from={data.highlight} onTranslated={(v) => update("highlightEn", v)} />
        </div>
      </Field>
    </div>
  );
}

function AnnouncementsTab({
  data,
  onChange,
}: {
  data: Announcement[];
  onChange: (d: Announcement[]) => void;
}) {
  const update = (index: number, key: keyof Announcement, value: string | boolean) => {
    const next = [...data];
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {data.map((announcement, index) => (
        <div key={announcement.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <input
            type="checkbox"
            checked={announcement.active}
            onChange={(e) => update(index, "active", e.target.checked)}
          />
          <input
            type="text"
            value={announcement.text}
            onChange={(e) => update(index, "text", e.target.value)}
            className="flex-1 border-b border-gray-700 bg-transparent pb-1 text-sm text-gray-200 focus:border-red-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(data.filter((_, itemIndex) => itemIndex !== index))}
            className="text-red-400"
          >
            حذف
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          onChange([...data, { id: `${Date.now()}`, text: "إعلان جديد", active: true }])
        }
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
        <Field label="اسم النادي">
          <TInput value={data.name} onChange={(v) => update("name", v)} />
        </Field>
        <Field label="المدينة">
          <TInput value={data.city} onChange={(v) => update("city", v)} />
        </Field>
        <Field label="سنة التأسيس">
          <TInput value={data.founded} onChange={(v) => update("founded", v)} />
        </Field>
      </div>
      <Field label="وصف النادي">
        <TTextarea value={data.description} onChange={(v) => update("description", v)} rows={4} />
      </Field>
      <Field label="الرؤية">
        <TTextarea value={data.vision} onChange={(v) => update("vision", v)} rows={3} />
      </Field>
    </div>
  );
}

function LegalTab({ data, onChange }: { data: LegalData; onChange: (d: LegalData) => void }) {
  const update = <K extends keyof LegalData>(key: K, value: LegalData[K]) => onChange({ ...data, [key]: value });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="عنوان الصفحة">
          <TInput value={data.title} onChange={(v) => update("title", v)} />
        </Field>
        <Field label="Title (EN)">
          <div className="flex gap-2">
            <TInput className="flex-1" value={data.titleEn ?? ""} onChange={(v) => update("titleEn", v)} />
            <TranslateButton from={data.title} onTranslated={(v) => update("titleEn", v)} />
          </div>
        </Field>
        <Field label="تاريخ التحديث">
          <TInput value={data.updatedAt} onChange={(v) => update("updatedAt", v)} />
        </Field>
        <Field label="Updated At (EN)">
          <TInput value={data.updatedAtEn ?? ""} onChange={(v) => update("updatedAtEn", v)} />
        </Field>
      </div>
      <Field label="المحتوى" hint="اكتبي النص الكامل، ويمكن استخدام سطور جديدة للتقسيم.">
        <TTextarea value={data.content} onChange={(v) => update("content", v)} rows={10} />
      </Field>
      <Field label="Content (EN)" hint="Use the English version of the same legal page here.">
        <div className="space-y-1">
          <TTextarea value={data.contentEn ?? ""} onChange={(v) => update("contentEn", v)} rows={10} />
          <TranslateButton from={data.content} onTranslated={(v) => update("contentEn", v)} />
        </div>
      </Field>
    </div>
  );
}

const EMPTY_BLOG_POST: BlogPost = {
  id: "",
  title: "",
  titleEn: "",
  category: "",
  categoryEn: "",
  author: "",
  authorEn: "",
  date: "",
  dateEn: "",
  readTime: "",
  readTimeEn: "",
  featured: false,
  summary: "",
  summaryEn: "",
  content: "",
  contentEn: "",
  coverImage: "",
  videoUrl: "",
  active: true,
};

function BlogTabFixed({ data, onChange }: { data: BlogData; onChange: (d: BlogData) => void }) {
  const [draft, setDraft] = useState<BlogPost>(EMPTY_BLOG_POST);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const update = <K extends keyof BlogData>(key: K, value: BlogData[K]) => onChange({ ...data, [key]: value });
  const setDraftField = <K extends keyof BlogPost>(key: K, value: BlogPost[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const resetDraft = () => {
    setDraft(EMPTY_BLOG_POST);
    setEditingId(null);
    setUploadError("");
  };

  const savePost = () => {
    if (!draft.title.trim()) return;
    const nextPost = { ...draft, id: draft.id || `post-${Date.now()}` };
    let posts = data.posts.filter((post) => post.id !== nextPost.id);
    if (nextPost.featured) {
      posts = posts.map((post) => ({ ...post, featured: false }));
    }
    posts = [nextPost, ...posts];
    const categories = nextPost.category && !data.categories.includes(nextPost.category)
      ? [...data.categories, nextPost.category]
      : data.categories;
    const categoriesEn =
      nextPost.categoryEn && !((data.categoriesEn ?? []).includes(nextPost.categoryEn))
        ? [...(data.categoriesEn ?? []), nextPost.categoryEn]
        : (data.categoriesEn ?? []);
    onChange({ ...data, categories, categoriesEn, posts });
    resetDraft();
  };

  const editPost = (post: BlogPost) => {
    setDraft(post);
    setEditingId(post.id);
  };

  const removePost = (id: string) =>
    onChange({ ...data, posts: data.posts.filter((post) => post.id !== id) });

  const toggleActive = (id: string) =>
    onChange({
      ...data,
      posts: data.posts.map((post) =>
        post.id === id ? { ...post, active: !post.active } : post,
      ),
    });

  const uploadMedia = async (file: File, target: "coverImage" | "videoUrl") => {
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "blog");
      const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر رفع الملف.");
      }
      if (payload.url) {
        setDraftField(target, payload.url);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع الملف الآن.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-gray-800 bg-black/30 p-4">
        <Field label="تصنيفات المدونة (كل تصنيف في سطر)">
          <TTextarea
            value={listToText(data.categories)}
            onChange={(v) => update("categories", textToList(v))}
            rows={4}
          />
        </Field>
        <Field label="Blog Categories EN (one per line)">
          <div className="space-y-1">
            <TTextarea
              value={listToText(data.categoriesEn)}
              onChange={(v) => update("categoriesEn", textToList(v))}
              rows={4}
            />
            <TranslateButton from={listToText(data.categories)} onTranslated={(v) => update("categoriesEn", textToList(v))} />
          </div>
        </Field>
      </div>

      <div className="grid gap-4 rounded-2xl border border-gray-800 bg-black/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-bold text-white">محتوى المدونة</div>
            <div className="text-xs text-gray-400">أضيفي المقالات أو الفيديوهات التي ستظهر للعميل.</div>
          </div>
          <button
            type="button"
            onClick={resetDraft}
            className="rounded-xl border border-gray-700 px-4 py-2 text-xs font-bold text-gray-300 hover:bg-gray-900"
          >
            تفريغ النموذج
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="عنوان المقال / الفيديو">
            <TInput value={draft.title} onChange={(v) => setDraftField("title", v)} placeholder="عنوان جذاب" />
          </Field>
          <Field label="التصنيف">
            <TInput value={draft.category} onChange={(v) => setDraftField("category", v)} placeholder="مثال: لياقة" />
          </Field>
          <Field label="اسم الكاتب">
            <TInput value={draft.author} onChange={(v) => setDraftField("author", v)} placeholder="هبة زارع" />
          </Field>
          <Field label="تاريخ النشر">
            <TInput value={draft.date} onChange={(v) => setDraftField("date", v)} placeholder="14 يناير" />
          </Field>
          <Field label="مدة القراءة">
            <TInput value={draft.readTime} onChange={(v) => setDraftField("readTime", v)} placeholder="5 دق" />
          </Field>
          <Field label="ملخص مختصر">
            <TTextarea value={draft.summary} onChange={(v) => setDraftField("summary", v)} rows={2} />
          </Field>
          <Field label="تفاصيل المقال">
            <TTextarea value={draft.content} onChange={(v) => setDraftField("content", v)} rows={5} />
          </Field>
          <Field label="رابط صورة الغلاف">
            <TInput value={draft.coverImage} onChange={(v) => setDraftField("coverImage", v)} placeholder="https://..." />
          </Field>
          <Field label="رابط الفيديو">
            <TInput value={draft.videoUrl} onChange={(v) => setDraftField("videoUrl", v)} placeholder="https://..." />
          </Field>
          <Field label="Title EN">
            <div className="flex gap-2">
              <TInput className="flex-1" value={draft.titleEn ?? ""} onChange={(v) => setDraftField("titleEn", v)} placeholder="English title" />
              <TranslateButton from={draft.title} onTranslated={(v) => setDraftField("titleEn", v)} />
            </div>
          </Field>
          <Field label="Category EN">
            <div className="flex gap-2">
              <TInput className="flex-1" value={draft.categoryEn ?? ""} onChange={(v) => setDraftField("categoryEn", v)} placeholder="Fitness" />
              <TranslateButton from={draft.category} onTranslated={(v) => setDraftField("categoryEn", v)} />
            </div>
          </Field>
          <Field label="Author EN">
            <div className="flex gap-2">
              <TInput className="flex-1" value={draft.authorEn ?? ""} onChange={(v) => setDraftField("authorEn", v)} placeholder="Heba Zarif" />
              <TranslateButton from={draft.author} onTranslated={(v) => setDraftField("authorEn", v)} />
            </div>
          </Field>
          <Field label="Date EN">
            <TInput value={draft.dateEn ?? ""} onChange={(v) => setDraftField("dateEn", v)} placeholder="April 11, 2026" />
          </Field>
          <Field label="Read Time EN">
            <TInput value={draft.readTimeEn ?? ""} onChange={(v) => setDraftField("readTimeEn", v)} placeholder="5 min read" />
          </Field>
          <Field label="Summary EN">
            <div className="space-y-1">
              <TTextarea value={draft.summaryEn ?? ""} onChange={(v) => setDraftField("summaryEn", v)} rows={2} />
              <TranslateButton from={draft.summary} onTranslated={(v) => setDraftField("summaryEn", v)} />
            </div>
          </Field>
          <Field label="Content EN">
            <div className="space-y-1">
              <TTextarea value={draft.contentEn ?? ""} onChange={(v) => setDraftField("contentEn", v)} rows={5} />
              <TranslateButton from={draft.content} onTranslated={(v) => setDraftField("contentEn", v)} />
            </div>
          </Field>
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400">رفع صورة الغلاف</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMedia(file, "coverImage");
                e.currentTarget.value = "";
              }}
              className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
            />
            <label className="text-xs font-medium text-gray-400">رفع فيديو (MP4/WebM)</label>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadMedia(file, "videoUrl");
                e.currentTarget.value = "";
              }}
              className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white"
            />
            {uploading ? <div className="text-xs text-yellow-400">جارٍ رفع الملف...</div> : null}
            {uploadError ? <div className="text-xs text-red-300">{uploadError}</div> : null}
          </div>
          <div className="space-y-3">
            <label className="text-xs font-medium text-gray-400">خيارات العرض</label>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.featured}
                  onChange={(e) => setDraftField("featured", e.target.checked)}
                />
                مقال مميز
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(e) => setDraftField("active", e.target.checked)}
                />
                ظاهر للعميل
              </label>
            </div>
            <button
              type="button"
              onClick={savePost}
              className="w-full rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white hover:bg-pink-500"
            >
              {editingId ? "تحديث المحتوى" : "إضافة المحتوى"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {data.posts.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-8 text-center text-sm text-gray-400">
            لا يوجد محتوى بعد. أضيفي أول فيديو أو مقال للمدونة.
          </div>
        ) : (
          data.posts.map((post) => (
            <div key={post.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-950/60 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-white">{post.title}</div>
                <div className="text-xs text-gray-400">{post.category || "بدون تصنيف"} · {post.author || "غير محدد"}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editPost(post)}
                  className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-bold text-white"
                >
                  تعديل
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(post.id)}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-bold text-gray-300"
                >
                  {post.active ? "إخفاء" : "إظهار"}
                </button>
                <button
                  type="button"
                  onClick={() => removePost(post.id)}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300"
                >
                  حذف
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function PagesContent() {
  const [activeTab, setActiveTab] = useState<Tab>("hero");
  const [hero, setHero] = useState<HeroData>(DEFAULTS.hero as HeroData);
  const [contact, setContact] = useState<ContactData>(DEFAULTS.contact as ContactData);
  const [trainersPage, setTrainersPage] = useState<TrainersPageData>(DEFAULTS.trainersPage as TrainersPageData);
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULTS.announcements as Announcement[]);
  const [about, setAbout] = useState<AboutData>(DEFAULTS.about as AboutData);
  const [blog, setBlog] = useState<BlogData>(DEFAULTS.blog as BlogData);
  const [policy, setPolicy] = useState<LegalData>(DEFAULTS.policy as LegalData);
  const [privacy, setPrivacy] = useState<LegalData>(DEFAULTS.privacy as LegalData);
  const [refund, setRefund] = useState<LegalData>(DEFAULTS.refund as LegalData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      try {
        const response = await fetch(
          "/api/site-content?sections=hero,contact,trainersPage,announcements,about,blog,policy,privacy,refund",
          { cache: "no-store" },
        );
        const payload = await response.json();
        if (cancelled) return;

        if (payload.hero && typeof payload.hero === "object") {
          setHero({ ...(DEFAULTS.hero as HeroData), ...(payload.hero as Partial<HeroData>) });
        }
        if (payload.contact && typeof payload.contact === "object") {
          setContact({ ...(DEFAULTS.contact as ContactData), ...(payload.contact as Partial<ContactData>) });
        }
        if (payload.trainersPage && typeof payload.trainersPage === "object") {
          setTrainersPage({
            ...(DEFAULTS.trainersPage as TrainersPageData),
            ...(payload.trainersPage as Partial<TrainersPageData>),
          });
        }
        if (Array.isArray(payload.announcements)) {
          setAnnouncements(payload.announcements as Announcement[]);
        }
        if (payload.about && typeof payload.about === "object") {
          setAbout({ ...(DEFAULTS.about as AboutData), ...(payload.about as Partial<AboutData>) });
        }
        if (payload.blog && typeof payload.blog === "object") {
          setBlog({ ...(DEFAULTS.blog as BlogData), ...(payload.blog as Partial<BlogData>) });
        }
        if (payload.policy && typeof payload.policy === "object") {
          setPolicy({ ...(DEFAULTS.policy as LegalData), ...(payload.policy as Partial<LegalData>) });
        }
        if (payload.privacy && typeof payload.privacy === "object") {
          setPrivacy({ ...(DEFAULTS.privacy as LegalData), ...(payload.privacy as Partial<LegalData>) });
        }
        if (payload.refund && typeof payload.refund === "object") {
          setRefund({ ...(DEFAULTS.refund as LegalData), ...(payload.refund as Partial<LegalData>) });
        }
      } catch {
        setMessage({ text: "تعذر تحميل محتوى الصفحات الآن.", ok: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadContent();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentSection = useMemo(() => {
    switch (activeTab) {
      case "hero":
        return { section: "hero", content: hero };
      case "contact":
        return { section: "contact", content: contact };
      case "trainersPage":
        return { section: "trainersPage", content: trainersPage };
      case "announcements":
        return { section: "announcements", content: announcements };
      case "about":
        return { section: "about", content: about };
      case "blog":
        return { section: "blog", content: blog };
      case "policy":
        return { section: "policy", content: policy };
      case "privacy":
        return { section: "privacy", content: privacy };
      case "refund":
        return { section: "refund", content: refund };
    }
  }, [about, activeTab, announcements, blog, contact, hero, trainersPage, policy, privacy, refund]);

  const saveCurrentTab = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/site-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentSection),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ التعديلات الحالية.");
      }

      setMessage({ text: "تم حفظ التغييرات بنجاح.", ok: true });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "تعذر حفظ التغييرات.", ok: false });
    } finally {
      setSaving(false);
    }
  }, [currentSection]);

  const resetCurrentTab = () => {
    setMessage(null);
    switch (activeTab) {
      case "hero":
        setHero(DEFAULTS.hero as HeroData);
        break;
      case "contact":
        setContact(DEFAULTS.contact as ContactData);
        break;
      case "trainersPage":
        setTrainersPage(DEFAULTS.trainersPage as TrainersPageData);
        break;
      case "announcements":
        setAnnouncements(DEFAULTS.announcements as Announcement[]);
        break;
      case "about":
        setAbout(DEFAULTS.about as AboutData);
        break;
      case "blog":
        setBlog(DEFAULTS.blog as BlogData);
        break;
      case "policy":
        setPolicy(DEFAULTS.policy as LegalData);
        break;
      case "privacy":
        setPrivacy(DEFAULTS.privacy as LegalData);
        break;
      case "refund":
        setRefund(DEFAULTS.refund as LegalData);
        break;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-gray-800 bg-gray-950/70 p-5">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === tab.id
                  ? "bg-pink-600 text-white"
                  : "bg-gray-900 text-gray-300 hover:bg-gray-800"
              }`}
            >
              <span className="ml-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-5">
          <div>
            <div className="text-xl font-black text-white">{TABS.find((tab) => tab.id === activeTab)?.label}</div>
            <div className="mt-1 text-sm text-gray-400">
              كل التعديلات هنا تُحفظ مباشرة داخل قاعدة البيانات وتظهر في الموقع بعد الحفظ.
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={saveCurrentTab}
              disabled={saving || loading}
              className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-pink-500 disabled:opacity-50"
            >
              {saving ? "جارٍ حفظ التغييرات..." : "حفظ التغييرات"}
            </button>
            <button
              type="button"
              onClick={resetCurrentTab}
              disabled={saving || loading}
              className="rounded-2xl border border-gray-700 px-5 py-3 text-sm font-bold text-gray-300 transition-colors hover:bg-gray-900 disabled:opacity-50"
            >
              إعادة تعيين
            </button>
          </div>
        </div>

        {message ? (
          <div
            className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
              message.ok
                ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
                : "border border-red-500/30 bg-red-950/30 text-red-200"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-10 text-center text-sm text-gray-400">
            جارٍ تحميل محتوى الصفحات...
          </div>
        ) : null}

        {!loading && activeTab === "hero" ? <HeroTab data={hero} onChange={setHero} /> : null}
        {!loading && activeTab === "contact" ? <ContactTab data={contact} onChange={setContact} /> : null}
        {!loading && activeTab === "trainersPage" ? (
          <TrainersPageTab data={trainersPage} onChange={setTrainersPage} />
        ) : null}
        {!loading && activeTab === "announcements" ? (
          <AnnouncementsTab data={announcements} onChange={setAnnouncements} />
        ) : null}
        {!loading && activeTab === "about" ? <AboutTab data={about} onChange={setAbout} /> : null}
        {!loading && activeTab === "blog" ? <BlogTabFixed data={blog} onChange={setBlog} /> : null}
        {!loading && activeTab === "policy" ? <LegalTab data={policy} onChange={setPolicy} /> : null}
        {!loading && activeTab === "privacy" ? <LegalTab data={privacy} onChange={setPrivacy} /> : null}
        {!loading && activeTab === "refund" ? <LegalTab data={refund} onChange={setRefund} /> : null}
      </div>
    </div>
  );
}
