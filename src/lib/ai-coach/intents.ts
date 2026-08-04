import type { CoachIntent } from "@/lib/ai-coach/types";

export type CoachNavigationTarget = "classes" | "blog" | "store" | "offers" | "memberships" | "nutritionist" | "partners" | "goals";

/** Normalization for matching only.  It deliberately keeps the original text for replies. */
export function normalizeArabicIntent(text: string) {
  return text.toLowerCase()
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

/** Resolve explicit page commands before broad catalog matching or stale context. */
export function detectExplicitNavigationTarget(message: string): CoachNavigationTarget | null {
  const text = normalizeArabicIntent(message).replace(/ة/g, "ه");
  const asksToBuy = /(?:اشتري|اشتري|buy)/i.test(text);
  const asksToBrowseProducts = /(?:عايز|عايزه|عايزة)\s+اشوف\s+(?:ال)?منتجات/i.test(text);

  // Blog correction patterns: standalone blog mentions without navigation verbs still mean blog
  const isBlogCorrection = /(?:لا\s+)?(?:اقصد|أقصد)\s+(?:ال)?(?:مدون[ةه]|مقالات|blog)/i.test(text);
  const isBlogMention = /(?:طيب|طب)?\s*(?:ال)?(?:مدون[ةه]|المقالات|مقالات|blog)/i.test(text);
  const negatesOtherIntent = /(?:لا|مش|ليس)\s+(?:اقصد|أقصد|عايز|عايزه)\s+(?:الاشتراكات|العروض)/i.test(text);

  if (isBlogCorrection || (isBlogMention && negatesOtherIntent)) return "blog";
  if (isBlogMention && !/(?:افتح|افتحي|وديني|خديني|روح|روحي|وريني|انتقل|navigate|open)/i.test(text)) return "blog";

  if (!asksToBuy && !asksToBrowseProducts && !/(?:افتح|افتحي|وديني|خديني|روح|روحي|وريني|انتقل|navigate|open)/i.test(text)) return null;
  const targets: Array<[CoachNavigationTarget, RegExp]> = [
    ["goals", /(?:الاهداف|اهداف|الهدف|هدف|goals?)/i], // Must come before "offers" to prevent confusion
    ["classes", /(?:الجدول|المواعيد|مواعيد|الحصص|حصص|الكلاسات|كلاسات|classes?|schedule)/i],
    ["blog", /(?:المدونه|مدونه|المدوني|مدوني|المقالات|مقالات|المقال|مقال|البلوج|بلوج|blog)/i],
    ["store", /(?:المتجر|متجر|التسوق|تسوق|المنتجات|منتجات|store|shop)/i],
    ["offers", /(?:العروض|عروض|الخصومات|خصومات|offers?|discounts?)/i],
    ["memberships", /(?:الاشتراكات|اشتراكات|الباقات|باقات|العضويات|عضويات|memberships?|plans?)/i],
    ["nutritionist", /(?:دكتوره التغذيه|دكتوره|التغذيه|اخصائيه التغذيه|nutritionist|nutrition)/i],
    ["partners", /(?:شركاؤنا|شركاونا|الشركاء|شركاء|الشريك|شريك|partners?)/i],
  ];
  if (asksToBuy) return "store";
  return targets.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

function normalize(text: string) {
  return normalizeArabicIntent(text)
    .replace(/ة/g, "ه")
}

function matches(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => {
    if (pattern.test(text)) return true;

    // JavaScript's \b is ASCII-centric, so it does not form word boundaries
    // around Arabic letters. Re-run boundary-based patterns against padded text
    // with whitespace boundaries, after normalization has removed punctuation.
    if (!pattern.source.includes("\\b") || !/[\u0600-\u06ff]/u.test(pattern.source)) return false;

    const arabicBoundaryPattern = new RegExp(
      pattern.source.replaceAll("\\b", "(?:^|\\s)"),
      pattern.flags,
    );
    return arabicBoundaryPattern.test(` ${text} `);
  });
}

export function detectCoachIntent(message: string): CoachIntent {
  const text = normalize(message);

  if (!text) return "unknown";

  if ((text.includes("مستخدم تاني") || text.includes("عميل آخر") || text.includes("عميل اخر") || text.includes("بيانات شخص تاني") || text.includes("another user") || text.includes("other customer"))) return "privacy_guard";
  if (text.includes("رصيدي") || text.includes("نقاطي") || text.includes("wallet") || text.includes("reward")) return "account_summary";
  if ((text.includes("مواعيد") || text.includes("schedule")) && (text.includes("كلاس") || text.includes("كيك بوكس") || text.includes("kickbox") || text.includes("class"))) return "schedule_lookup";
  if ((text.includes("منتج") || text.includes("منتجات") || text.includes("متجر") || text.includes("عندكم") || text.includes("بتبيعوا")) && (text.includes("تخسيس") || text.includes("دايت") || text.includes("خساره") || text.includes("خسارة") || text.includes("weight loss") || text.includes("diet"))) return "product_help";

  // Privacy and account intent guards must win before any fitness/general matching.
  if (matches(text, [/\b(?:بيانات|رصيد|نقاط|اشتراك|حجوزات)\b.*\b(?:مستخدم|عميل|شخص)\s+(?:تاني|آخر|اخر)\b/, /\b(?:another|other)\s+(?:user|customer)\b/])) return "privacy_guard";
  if (matches(text, [/\bرصيدي\b/, /\bنقاطي\b/, /\bwallet\b/, /\breward(?:s| points)?\b/])) return "account_summary";
  if (matches(text, [/\bحجوزاتي\b/, /\bmy bookings\b/])) return "account_summary";
  if (matches(text, [/\bاشتراكي\b/, /\bعضويتي\b/, /\bmy membership\b/])) return "account_summary";
  if (matches(text, [/\b(?:منتج|منتجات|متجر|بتبيعوا|عندكم)\b.*\b(?:تخسيس|دايت|خساره|خسارة|weight loss|diet)\b/, /\b(?:تخسيس|دايت|خساره|خسارة|weight loss|diet)\b.*\b(?:منتج|منتجات|متجر)\b/])) return "product_help";

  // Goals must win over offers to prevent "الأهداف" → "العروض" confusion
  // Use explicit word boundaries and prevent "offers" keywords from overriding
  if (matches(text, [/\b(?:ال)?(?:اهداف|هدف)\b/, /\bgoals?\b/, /\bاختار\s+هدف\b/, /\bاختاري\s+هدف\b/])) {
    // Only return offers if there's an explicit offer keyword AND no goal keyword
    if (!/\b(?:عرض|عروض|خصم|خصومات|offer|discount)\b/i.test(text)) return "goals_list";
    // If both exist, goals win
    return "goals_list";
  }

  if (matches(text, [/\b(?:عرض|عروض|offer|discount)\b/])) return "offer_lookup";
  if (matches(text, [/\b(?:سعر|اسعار|أسعار|price|pricing)\b.*\b(?:اشتراك|عضويه|عضوية|membership)\b/])) return "pricing";
  if (matches(text, [/\b(?:مواعيد|ميعاد|schedule)\b.*\b(?:كلاس|class|كيك بوكس|kickbox)\b/, /\b(?:كيك بوكس|kickbox)\b.*\b(?:مواعيد|schedule)\b/])) return "schedule_lookup";

  // A named entity has priority over generic discount/offer wording.
  if (matches(text, [/\b(?:خصم|عرض)\s+على\s+(?:ال)?(?:منتجات|ملابس)\b/])) return "product_discount";
  if (matches(text, [/\b(?:رشح|رشحي)\b.*\b(?:منتج|لبس|ملابس)\b/])) return "product_recommendation";
  if (matches(text, [/\b(?:وزني|وزن)\s+\d+.*\b(?:اعمل ايه|ابدأ ازاي)\b/, /\bمحتاج\s+اخس\b/, /\bوزني عالي\b/])) return "weight_advice";
  if (matches(text, [/\b(?:عايزه|عايزة)\s+نظام\s+غذائي\b/])) return "nutrition_guidance";

  // Greetings
  if (matches(text, [/^(اهلا|السلام|مرحبا|هاي|hello|hi|hey)\b/, /\bازيك\b/, /\bعامل ايه\b/])) return "greeting";

  // Human handoff
  if (matches(text, [/\bموظف\b/, /\bدعم\b/, /\bاكلم\b.*\bموظف/, /\bhuman\b/, /\blive support\b/])) return "human_handoff";

  // Complaints
  if (matches(text, [/\bشكوى\b/, /\bcomplaint\b/, /\bمشكله\b/, /\bproblem\b/])) return "complaint_help";

  // Explicit logging only. Mentioning a weight is advice, never an implicit write.
  if (
    matches(text, [
      /\b(?:سجل|سجلي|احفظ|ضيف)\s+(?:لي\s+)?وزني\b/,
      /\bوزنت نفسي\b/,
      /\bcheck.?in\b/,
    ])
  )
    return "check_in";

  if (matches(text, [/\bوزني\s+\d+\b/])) return "weight_context";

  if (matches(text, [/\b(?:اريد|عايز)\s+تقييم\s+(?:سريع\s+)?(?:لاكلي|لأكلي)\b/, /\bnutrition review\b/])) return "nutrition_review";

  // Food check
  if (
    matches(text, [
      /\باكلت\b/, /\bاكل\b/, /\bوجبه\b/, /\bعشا\b/, /\bغدا\b/, /\bفطار\b/, /\bوجبات\b/,
      /\bطعام\b/, /\bاكلتي\b/, /\bمناسب للتخسيس\b/, /\bاخف عشا\b/, /\bاخف وجبه\b/,
      /\bبروتين\b/, /\bسعرات\b/, /\bكالوريز\b/, /\bرز\b/, /\bفراخ\b/,
      /\bخضار\b/, /\bسلطه\b/, /\bصدر فراخ\b/, /\bلحمه\b/, /\bسمك\b/, /\bبيض\b/,
      /\bمكرونه\b/, /\bخبز\b/, /\bكيك\b/, /\bشيبس\b/, /\bمشويات\b/,
      /food check/, /\bnutrition\b/, /\beat\b/, /\bmeal\b/, /\bdiet check\b/,
    ])
  )
    return "food_check";

  // Recommendation must win over a generic membership list.
  if (matches(text, [/\bافضل\s+(?:اشتراك|باقه|عضويه)\b/, /\b(?:رشح|رشحي|انسب)\b.*\b(?:اشتراك|باقه|عضويه)\b/, /\bاشتراك\s+مناسب\b/, /\brecommend\b.*\bmembership\b/])) return "membership_recommendation";
  // Pricing / membership
  if (matches(text, [/\bسعر\b/, /\bاسعار\b/, /\bprice\b/, /\bpricing\b/, /\bاشتراك\b/, /\bعضويه\b/, /\bmembership\b/])) return "pricing";

  // Classes
  if (matches(text, [/\bكلاس\b/, /\bحصه\b/, /\bclass\b/, /\bworkout class\b/, /\b(?:ال|لل)?تخسيس\b/, /\bشد الجسم\b/, /\bرشحي لي كلاس\b/])) return "class_recommendation";

  // Schedule
  if (matches(text, [/\bمواعيد\b/, /\bالنهارده\b/, /\bاليوم\b/, /\bschedule\b/, /\btoday\b/, /\bclasses today\b/])) return "schedule_lookup";

  // Booking
  if (matches(text, [/\bحجز\b/, /\bاحجز\b/, /\bbooking\b/, /\bbook\b/, /\bsession\b/])) return "booking_help";

  // Account
  if (matches(text, [/\bاشتراكي\b/, /\bمحفظتي\b/, /\bفيتزوناتي\b/, /\bحجوزاتي\b/, /\baccount\b/, /\bwallet\b/, /\brewards\b/])) return "account_summary";

  // Offers
  if (matches(text, [/\b(?:ال)?(?:عرض|عروض)\b/, /\boffer\b/, /\bdiscount\b/, /\bpromo\b/])) return "offer_lookup";

  // Trainers
  if (matches(text, [/\b(?:ال)?مدرب(?:ه|ات)?\b/, /\btrainer\b/, /\bcoach\b/])) return "trainer_info";

  // Store navigation must win over generic product help and prior context.
  if (matches(text, [/\bاقصد\s+(?:ال)?منتجات\b/, /\b(?:اقصد\s+)?(?:منتجات\s+)?المتجر\b/, /\bافتحي\s+المتجر\b/, /\bعايز\s+اتصفح\s+المتجر\b/, /\bوريني\s+(?:ال)?منتجات\b/, /\bعندكم\s+منتجات\b/, /\bعايز\s+اشوف\s+(?:ال)?لبس\b/, /\bopen\s+(?:the\s+)?shop\b/, /\bshop\s+browse\b/])) return "shop_browse";
  // Products
  if (matches(text, [/\bمنتج\b/, /\bمتجر\b/, /\bshop\b/, /\bproduct\b/, /\bleggings\b/, /\bsupplement\b/])) return "product_help";

  // FAQ
  if (matches(text, [/\bساعات العمل\b/, /\bالعنوان\b/, /\bمكان\b/, /\blocation\b/, /\bopen\b/, /\bfaq\b/, /\bازاي\b/, /\bكيف\b/])) return "faq";

  return "unknown";
}
