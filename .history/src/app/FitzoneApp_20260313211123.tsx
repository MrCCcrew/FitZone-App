"use client";

import { useState } from "react";

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconDumbbell() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <path d="M6.5 6.5h11M6.5 17.5h11M3 9.5h18M3 14.5h18" strokeLinecap="round" />
      <rect x="2" y="8.5" width="2" height="7" rx="1" fill="currentColor" stroke="none" />
      <rect x="20" y="8.5" width="2" height="7" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconFire() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
      <path d="M12 2C9 6 6 8 6 13a6 6 0 0012 0c0-2.5-1-4.5-2-6-1 2-2 3-4 4 0-2.5 1-5 0-9z" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.07 1.18a2 2 0 012-2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 6.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
function IconLocation() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconWhatsapp() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.121 1.533 5.851L.057 23.428a.5.5 0 00.611.608l5.763-1.51A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.002-1.37l-.358-.214-3.72.975.993-3.625-.234-.374A9.818 9.818 0 1112 21.818z" />
    </svg>
  );
}
function IconMenu() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const CLASSES = [
  { name: "كروس فيت", time: "6:00 ص", duration: "60 دقيقة", trainer: "أحمد حسن", spots: 8, icon: "🔥" },
  { name: "يوغا", time: "8:00 ص", duration: "45 دقيقة", trainer: "منى خالد", spots: 12, icon: "🧘" },
  { name: "ملاكمة", time: "5:00 م", duration: "60 دقيقة", trainer: "كريم عادل", spots: 6, icon: "🥊" },
  { name: "رقص لاتيني", time: "7:00 م", duration: "45 دقيقة", trainer: "سارة محمود", spots: 15, icon: "💃" },
  { name: "سباحة", time: "7:00 ص", duration: "60 دقيقة", trainer: "طارق علي", spots: 10, icon: "🏊" },
  { name: "تمارين مقاومة", time: "6:00 م", duration: "75 دقيقة", trainer: "أحمد حسن", spots: 5, icon: "💪" },
];

const PLANS = [
  {
    name: "أساسي",
    price: 299,
    period: "شهرياً",
    color: "border-gray-600",
    badge: null,
    features: [
      "دخول الصالة (6 أيام/أسبوع)",
      "تمارين القلب",
      "غرف تغيير الملابس",
      "خزائن آمنة",
    ],
    notIncluded: ["الحمام السباحة", "الكلاسات الجماعية", "جلسة تغذية"],
  },
  {
    name: "بلاتيني",
    price: 499,
    period: "شهرياً",
    color: "border-red-600",
    badge: "الأكثر طلباً",
    features: [
      "دخول الصالة (7 أيام/أسبوع)",
      "تمارين القلب والمقاومة",
      "الحمام السباحة",
      "كلاسين جماعيين/أسبوع",
      "خزائن آمنة",
      "تقييم لياقة مجاني",
    ],
    notIncluded: ["جلسة تغذية"],
  },
  {
    name: "VIP",
    price: 799,
    period: "شهرياً",
    color: "border-yellow-500",
    badge: "الأفضل قيمة",
    features: [
      "دخول الصالة (24/7)",
      "جميع الأجهزة والمعدات",
      "الحمام السباحة",
      "جميع الكلاسات الجماعية",
      "مدرب شخصي (4 جلسات)",
      "جلسة تغذية شهرية",
      "مساج استرخاء مجاني",
    ],
    notIncluded: [],
  },
];

const TRAINERS = [
  { name: "أحمد حسن", role: "مدرب لياقة عام", exp: "8 سنوات", cert: "ACSM معتمد", emoji: "👨‍💼" },
  { name: "منى خالد", role: "مدربة يوغا ورقص", exp: "6 سنوات", cert: "RYT-200 معتمدة", emoji: "👩‍💼" },
  { name: "كريم عادل", role: "مدرب ملاكمة", exp: "10 سنوات", cert: "بطل قومي سابق", emoji: "🧔" },
  { name: "سارة محمود", role: "مدربة تغذية ولياقة", exp: "5 سنوات", cert: "PhD تغذية رياضية", emoji: "👩‍🔬" },
];

const TESTIMONIALS = [
  { name: "مريم السيد", text: "أحسن نادي في بني سويف! المدربين محترفين والأجهزة حديثة. خسيت 15 كيلو في 4 أشهر!", stars: 5 },
  { name: "محمد الشرقاوي", text: "جو عائلي وأسعار مناسبة. بنتي بتاخد كلاس يوغا وأنا بتدرب. أنصح بيه الكل!", stars: 5 },
  { name: "نورا إبراهيم", text: "الحمام السباحة نظيف جداً والكلاسات بتتغير وما بتتكررش. ممتاز!", stars: 5 },
];

// ─── Main Component ────────────────────────────────────────────────────────────
export default function FitzoneApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "morning" | "evening">("all");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const filteredClasses = CLASSES.filter((c) => {
    if (activeTab === "morning") return c.time.includes("ص") || c.time.startsWith("7") || c.time.startsWith("8");
    if (activeTab === "evening") return c.time.includes("م");
    return true;
  });

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-black text-white font-sans">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 right-0 left-0 z-50 bg-black/90 backdrop-blur border-b border-yellow-500/20">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
          {/* Logo */}
          <button onClick={() => scrollTo("hero")} className="flex items-center gap-2">
            <span className="text-2xl font-black text-red-600 tracking-tight">FIT</span>
            <span className="text-2xl font-black text-yellow-400 tracking-tight">ZONE</span>
          </button>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            {[["about", "عن النادي"], ["classes", "الكلاسات"], ["plans", "الاشتراكات"], ["trainers", "المدربون"], ["contact", "تواصل معنا"]].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="text-gray-300 hover:text-yellow-400 transition-colors">
                {label}
              </button>
            ))}
          </div>

          {/* CTA + Hamburger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => scrollTo("plans")}
              className="hidden md:block bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
            >
              اشترك الآن
            </button>
            <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <IconX /> : <IconMenu />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-black border-t border-yellow-500/20 px-4 py-4 flex flex-col gap-4">
            {[["about", "عن النادي"], ["classes", "الكلاسات"], ["plans", "الاشتراكات"], ["trainers", "المدربون"], ["contact", "تواصل معنا"]].map(([id, label]) => (
              <button key={id} onClick={() => scrollTo(id)} className="text-right text-gray-300 hover:text-yellow-400 transition-colors py-1">
                {label}
              </button>
            ))}
            <button onClick={() => scrollTo("plans")} className="bg-red-600 text-white font-bold py-2 rounded-lg">
              اشترك الآن
            </button>
          </div>
        )}
      </nav>

      {/* ── Hero ── */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-black via-red-950/30 to-black" />
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "repeating-linear-gradient(45deg, #b91c1c 0, #b91c1c 1px, transparent 0, transparent 50%)", backgroundSize: "30px 30px" }} />

        {/* Glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-700/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center max-w-4xl mx-auto px-4">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <span>⚡</span> النادي رقم 1 في بني سويف
          </div>

          <h1 className="text-5xl md:text-7xl font-black mb-4 leading-tight">
            <span className="text-white">حوّل </span>
            <span className="text-red-500">جسمك</span>
            <br />
            <span className="text-yellow-400">غيّر حياتك</span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            نادي فيت زون — بني سويف. أحدث الأجهزة، أفضل المدربين، وأجواء تحفيزية استثنائية لتحقيق أهدافك الرياضية
          </p>

          {/* Stats bar */}
          <div className="flex flex-wrap justify-center gap-8 mb-10">
            {[["2,000+", "عضو"], ["15+", "مدرب محترف"], ["30+", "كلاس أسبوعي"], ["5★", "تقييمنا"]].map(([val, label]) => (
              <div key={label} className="text-center">
                <div className="text-2xl md:text-3xl font-black text-yellow-400">{val}</div>
                <div className="text-gray-400 text-sm">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => scrollTo("plans")}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-lg px-8 py-3.5 rounded-xl transition-all hover:scale-105 shadow-lg shadow-red-900/50"
            >
              🔥 ابدأ رحلتك الآن
            </button>
            <button
              onClick={() => scrollTo("classes")}
              className="border border-yellow-500/50 hover:border-yellow-400 text-yellow-400 font-bold text-lg px-8 py-3.5 rounded-xl transition-all hover:bg-yellow-500/10"
            >
              استكشف الكلاسات
            </button>
          </div>

          {/* Scroll indicator */}
          <div className="mt-16 flex justify-center animate-bounce">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-6 h-6 text-yellow-500/50">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Text */}
            <div>
              <p className="text-red-500 font-bold mb-2 text-sm tracking-widest uppercase">من نحن</p>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-6">
                أكثر من مجرد <span className="text-yellow-400">صالة رياضية</span>
              </h2>
              <p className="text-gray-400 leading-relaxed mb-6">
                فيت زون هو أول نادٍ رياضي متكامل في بني سويف، تأسس عام 2018 بهدف تقديم تجربة لياقة بدنية استثنائية للأسرة المصرية. نؤمن أن الصحة حق للجميع، ولذلك نقدم خدماتنا بأسعار مناسبة مع أعلى جودة.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                {[
                  ["🏋️", "أجهزة حديثة", "أحدث معدات LifeFitness"],
                  ["🏊", "حمام سباحة", "مسبح أولمبي مغطى"],
                  ["🧘", "قاعة متعددة", "يوغا، زومبا، ملاكمة"],
                  ["🥗", "تغذية رياضية", "استشارات مجانية للأعضاء"],
                ].map(([icon, title, desc]) => (
                  <div key={title} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
                    <div className="text-2xl mb-2">{icon}</div>
                    <div className="text-white font-bold text-sm mb-1">{title}</div>
                    <div className="text-gray-500 text-xs">{desc}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => scrollTo("contact")}
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-black px-6 py-3 rounded-xl transition-colors"
              >
                زورنا اليوم مجاناً
              </button>
            </div>

            {/* Visual card */}
            <div className="relative">
              <div className="bg-gradient-to-br from-red-900/40 to-black border border-red-800/40 rounded-2xl p-8 text-center">
                <div className="text-7xl mb-4">🏆</div>
                <h3 className="text-xl font-black text-yellow-400 mb-6">جوائزنا وإنجازاتنا</h3>
                <div className="space-y-3">
                  {[
                    "أفضل نادٍ رياضي في الصعيد 2022",
                    "شهادة ISO جودة الخدمات الرياضية",
                    "شراكة مع الاتحاد المصري لكمال الأجسام",
                    "أفضل مدرب عام على مستوى بني سويف",
                  ].map((award) => (
                    <div key={award} className="flex items-center gap-3 text-gray-300 text-sm">
                      <span className="text-yellow-400 font-black">✦</span>
                      {award}
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-6 border-t border-gray-800 grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-black text-red-500">7</div>
                    <div className="text-gray-400 text-xs">سنوات خبرة</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-black text-yellow-400">98%</div>
                    <div className="text-gray-400 text-xs">رضا الأعضاء</div>
                  </div>
                </div>
              </div>
              {/* Decorative */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-red-600/20 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-yellow-500/10 rounded-full blur-2xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Classes ── */}
      <section id="classes" className="py-20 px-4 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-red-500 font-bold mb-2 text-sm tracking-widest uppercase">جدول الكلاسات</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              كلاس <span className="text-yellow-400">لكل هدف</span>
            </h2>
            <p className="text-gray-400 max-w-xl mx-auto">اختار الكلاس اللي يناسبك من جدولنا الأسبوعي المتنوع</p>

            {/* Filter tabs */}
            <div className="flex justify-center gap-2 mt-6">
              {[["all", "الكل"], ["morning", "صباحي"], ["evening", "مسائي"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setActiveTab(val as typeof activeTab)}
                  className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
                    activeTab === val
                      ? "bg-red-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredClasses.map((cls) => (
              <div
                key={cls.name}
                className="bg-black border border-gray-800 hover:border-red-600/50 rounded-2xl p-6 transition-all hover:-translate-y-1 group cursor-pointer"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="text-4xl">{cls.icon}</span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${cls.spots <= 6 ? "bg-red-900/50 text-red-400" : "bg-green-900/50 text-green-400"}`}>
                    {cls.spots} مقاعد متاحة
                  </span>
                </div>
                <h3 className="text-white font-black text-lg mb-1 group-hover:text-yellow-400 transition-colors">{cls.name}</h3>
                <p className="text-gray-500 text-sm mb-4">مع {cls.trainer}</p>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <IconClock />
                    <span>{cls.time} — {cls.duration}</span>
                  </div>
                </div>
                <button className="mt-4 w-full bg-gray-900 group-hover:bg-red-600 border border-gray-700 group-hover:border-red-600 text-gray-300 group-hover:text-white font-bold py-2 rounded-lg text-sm transition-all">
                  احجز مقعدك
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-red-500 font-bold mb-2 text-sm tracking-widest uppercase">باقات الاشتراك</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              اختار الباقة <span className="text-yellow-400">المناسبة ليك</span>
            </h2>
            <p className="text-gray-400">أسعار بالجنيه المصري — لا رسوم خفية</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                onClick={() => setSelectedPlan(plan.name)}
                className={`relative border-2 rounded-2xl p-6 cursor-pointer transition-all ${
                  plan.name === "VIP"
                    ? "bg-gradient-to-b from-yellow-950/30 to-black border-yellow-500"
                    : plan.name === "بلاتيني"
                    ? "bg-gradient-to-b from-red-950/30 to-black border-red-600"
                    : "bg-gray-950 border-gray-700 hover:border-gray-500"
                } ${selectedPlan === plan.name ? "ring-2 ring-white/30 scale-[1.02]" : "hover:scale-[1.01]"}`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className={`absolute -top-3 right-6 text-xs font-black px-3 py-1 rounded-full ${
                    plan.name === "VIP" ? "bg-yellow-500 text-black" : "bg-red-600 text-white"
                  }`}>
                    {plan.badge}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className={`text-xl font-black mb-1 ${plan.name === "VIP" ? "text-yellow-400" : plan.name === "بلاتيني" ? "text-red-400" : "text-white"}`}>
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-white">{plan.price.toLocaleString("ar-EG")}</span>
                    <span className="text-gray-400 text-sm">ج.م / {plan.period}</span>
                  </div>
                </div>

                <div className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-gray-300">
                      <span className={`shrink-0 ${plan.name === "VIP" ? "text-yellow-400" : "text-red-500"}`}><IconCheck /></span>
                      {f}
                    </div>
                  ))}
                  {plan.notIncluded.map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-gray-600 line-through">
                      <span className="shrink-0 text-gray-700"><IconCheck /></span>
                      {f}
                    </div>
                  ))}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); scrollTo("contact"); }}
                  className={`w-full font-black py-3 rounded-xl transition-all ${
                    plan.name === "VIP"
                      ? "bg-yellow-500 hover:bg-yellow-400 text-black"
                      : plan.name === "بلاتيني"
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-white"
                  }`}
                >
                  اشترك الآن
                </button>
              </div>
            ))}
          </div>

          {/* Annual offer */}
          <div className="mt-8 bg-gradient-to-r from-red-950/40 via-gray-900 to-yellow-950/30 border border-yellow-500/30 rounded-2xl p-6 text-center">
            <span className="text-yellow-400 text-2xl font-black">🎉 عرض سنوي خاص!</span>
            <p className="text-gray-300 mt-2">اشترك سنة كاملة واحصل على <span className="text-red-400 font-black">شهرين مجاناً</span> + تقييم جسم مجاني + قميص رياضي هدية</p>
          </div>
        </div>
      </section>

      {/* ── Trainers ── */}
      <section id="trainers" className="py-20 px-4 bg-gray-950">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-red-500 font-bold mb-2 text-sm tracking-widest uppercase">فريقنا</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              مدربون <span className="text-yellow-400">محترفون ومعتمدون</span>
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {TRAINERS.map((t) => (
              <div key={t.name} className="bg-black border border-gray-800 hover:border-yellow-500/40 rounded-2xl p-6 text-center transition-all hover:-translate-y-1 group">
                <div className="text-6xl mb-4 transition-transform group-hover:scale-110">{t.emoji}</div>
                <h3 className="text-white font-black text-lg mb-1">{t.name}</h3>
                <p className="text-red-400 text-sm font-medium mb-2">{t.role}</p>
                <div className="space-y-1 text-gray-500 text-xs">
                  <p>خبرة {t.exp}</p>
                  <p className="text-yellow-500/70">{t.cert}</p>
                </div>
                <div className="flex justify-center gap-0.5 mt-3">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-400"><IconStar /></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white">
              ماذا قال <span className="text-yellow-400">أعضاؤنا</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-gray-950 border border-gray-800 rounded-2xl p-6">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(t.stars)].map((_, i) => (
                    <span key={i} className="text-yellow-400"><IconStar /></span>
                  ))}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-700 flex items-center justify-center text-white font-black text-sm">
                    {t.name[0]}
                  </div>
                  <span className="text-white font-bold text-sm">{t.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="py-20 px-4 bg-gray-950">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-red-500 font-bold mb-2 text-sm tracking-widest uppercase">تواصل معنا</p>
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
              ابدأ <span className="text-yellow-400">رحلتك معنا</span>
            </h2>
            <p className="text-gray-400">تواصل معنا الآن وأول جلسة تجريبية مجاناً</p>
          </div>

          <div className="grid md:grid-cols-2 gap-10">
            {/* Info */}
            <div className="space-y-6">
              {/* Contact cards */}
              {[
                { icon: <IconPhone />, label: "الهاتف", value: "010 0000 0000", sub: "السبت – الخميس، 6ص – 11م" },
                { icon: <IconWhatsapp />, label: "واتساب", value: "012 3456 7890", sub: "رد فوري في أوقات العمل" },
                { icon: <IconLocation />, label: "العنوان", value: "شارع النيل، بني سويف", sub: "أمام المستشفى الجامعي" },
                { icon: <IconClock />, label: "مواعيد العمل", value: "6:00 ص — 11:00 م", sub: "يومياً بما فيها الجمعة" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-4 bg-black border border-gray-800 rounded-xl p-4">
                  <div className="text-yellow-400 mt-0.5">{item.icon}</div>
                  <div>
                    <div className="text-gray-500 text-xs mb-0.5">{item.label}</div>
                    <div className="text-white font-bold">{item.value}</div>
                    <div className="text-gray-500 text-xs">{item.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => { e.preventDefault(); alert("تم إرسال رسالتك! هنتواصل معاك قريباً ✅"); }}
              className="bg-black border border-gray-800 rounded-2xl p-6 space-y-4"
            >
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: محمد أحمد"
                  className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors text-sm"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">رقم الهاتف</label>
                <input
                  type="tel"
                  required
                  placeholder="010 0000 0000"
                  className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors text-sm"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">الباقة المهتم بيها</label>
                <select className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white outline-none transition-colors text-sm">
                  <option value="">اختار باقة...</option>
                  <option>أساسي — 299 ج.م</option>
                  <option>بلاتيني — 499 ج.م</option>
                  <option>VIP — 799 ج.م</option>
                  <option>اشتراك سنوي</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-400 text-sm mb-1.5">رسالتك (اختياري)</label>
                <textarea
                  rows={3}
                  placeholder="أي استفسار أو طلب خاص..."
                  className="w-full bg-gray-900 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 outline-none transition-colors text-sm resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-all hover:scale-[1.02] text-lg"
              >
                🔥 احجز جلستك المجانية
              </button>
              <p className="text-center text-gray-600 text-xs">هنتواصل معاك خلال ساعة</p>
            </form>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-black border-t border-gray-900 py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1 text-xl font-black">
            <span className="text-red-600">FIT</span>
            <span className="text-yellow-400">ZONE</span>
            <span className="text-gray-500 font-normal text-sm mr-2">— بني سويف</span>
          </div>
          <p className="text-gray-600 text-sm">© {new Date().getFullYear()} FitZone. جميع الحقوق محفوظة.</p>
          <div className="flex items-center gap-2">
            <IconDumbbell />
            <span className="text-gray-500 text-sm">صُنع بـ ❤️ في بني سويف</span>
            <IconFire />
          </div>
        </div>
      </footer>
    </div>
  );
}
