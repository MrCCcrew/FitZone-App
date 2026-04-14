import { QUESTION_TEXT } from "@/lib/ai-coach/context";
import { buildSafetyNote } from "@/lib/ai-coach/guards";
import type {
  CoachCheckInData,
  CoachIntent,
  CoachKnowledgeEntry,
  CoachLang,
  CoachProfileData,
  CoachPublicClass,
  CoachPublicMembership,
  CoachPublicOffer,
  CoachPublicProduct,
  CoachPublicTrainer,
  CoachSafetyFlags,
  QuestionnaireAnswers,
} from "@/lib/ai-coach/types";
import { buildMembershipRecommendationReason } from "@/lib/ai-coach/recommender";

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Knowledge matching (improved) ───────────────────────────────────────────

export function matchKnowledge(message: string, entries: CoachKnowledgeEntry[]) {
  const normalized = normalize(message);
  const tokens = normalized.split(" ").filter((t) => t.length > 1);

  let best: CoachKnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    let score = 0;

    // Title phrase match — highest signal
    const normalizedTitle = normalize(entry.title);
    if (normalized.includes(normalizedTitle)) score += 6;
    else if (normalizedTitle.split(" ").every((w) => normalized.includes(w))) score += 4;

    // Keyword scoring — phrase match > token overlap
    for (const keyword of entry.keywords) {
      const normalizedKw = normalize(keyword);
      if (normalized.includes(normalizedKw)) {
        // Longer keyword phrase = stronger signal
        score += Math.min(5, 2 + normalizedKw.split(" ").length);
      } else if (tokens.some((t) => normalizedKw.includes(t) || t.includes(normalizedKw))) {
        score += 1;
      }
    }

    // Priority bonus (capped so noisy low-quality entries don't win on priority alone)
    score += Math.min(3, Math.max(0, entry.priority));

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  // Require a minimum meaningful score to avoid returning noise
  return bestScore >= 4 ? best : null;
}

// ─── Basic builders ───────────────────────────────────────────────────────────

export function buildWelcomeMessage(lang: CoachLang) {
  return lang === "en"
    ? "Welcome to FitZone AI Coach. I can help with memberships, classes, offers, schedules, account info, and live support when needed."
    : "أهلًا بكِ في AI Coach من FitZone. أقدر أساعدك في الباقات والكلاسات والعروض والمواعيد وملخص حسابك، ولو احتجتِ أحولك للدعم المباشر.";
}

export function buildQuestionPrompt(lang: CoachLang, question: keyof typeof QUESTION_TEXT.ar) {
  return QUESTION_TEXT[lang][question];
}

export function buildPricingReply(lang: CoachLang, memberships: CoachPublicMembership[]) {
  if (memberships.length === 0)
    return lang === "en" ? "There are no active memberships available right now." : "لا توجد باقات مفعلة الآن.";
  const top = memberships.slice(0, 4);
  return lang === "en"
    ? `Here are the main active memberships now:\n${top.map((m) => `- ${m.name}: ${m.price} EGP`).join("\n")}`
    : `هذه أبرز الباقات المتاحة الآن:\n${top.map((m) => `- ${m.name}: ${m.price} ج.م`).join("\n")}`;
}

export function buildOffersReply(lang: CoachLang, offers: CoachPublicOffer[]) {
  if (offers.length === 0)
    return lang === "en" ? "There are no active offers at the moment." : "لا توجد عروض مفعلة في الوقت الحالي.";
  return lang === "en"
    ? `Current offers:\n${offers.slice(0, 4).map((o) => `- ${o.title}: ${o.description || "Special active offer"}`).join("\n")}`
    : `العروض الحالية:\n${offers.slice(0, 4).map((o) => `- ${o.title}: ${o.description || "عرض خاص متاح الآن"}`).join("\n")}`;
}

export function buildScheduleReply(lang: CoachLang, classes: CoachPublicClass[]) {
  const items = classes
    .flatMap((c) => c.schedules.slice(0, 2).map((s) => ({ c, s })))
    .slice(0, 5);
  if (items.length === 0)
    return lang === "en"
      ? "There are no upcoming active class slots in the next few days."
      : "لا توجد مواعيد كلاسات متاحة خلال الأيام القريبة.";
  return lang === "en"
    ? `Upcoming classes:\n${items.map(({ c, s }) => `- ${c.name} · ${new Date(s.date).toLocaleDateString("en-US")} · ${s.time}`).join("\n")}`
    : `المواعيد القريبة:\n${items.map(({ c, s }) => `- ${c.name} · ${new Date(s.date).toLocaleDateString("ar-EG")} · ${s.time}`).join("\n")}`;
}

export function buildTrainerReply(lang: CoachLang, trainers: CoachPublicTrainer[]) {
  if (trainers.length === 0)
    return lang === "en" ? "There are no active trainers available right now." : "لا توجد مدربات مفعّلات الآن.";
  return lang === "en"
    ? `Here are some active trainers:\n${trainers.slice(0, 3).map((t) => `- ${t.name}: ${t.specialty || "Trainer"} · rating ${t.rating.toFixed(1)}`).join("\n")}`
    : `هذه بعض المدربات المتاحات الآن:\n${trainers.slice(0, 3).map((t) => `- ${t.name}: ${t.specialty || "مدربة"} · تقييم ${t.rating.toFixed(1)}`).join("\n")}`;
}

export function buildProductReply(lang: CoachLang, products: CoachPublicProduct[]) {
  if (products.length === 0)
    return lang === "en" ? "There are no active products available right now." : "لا توجد منتجات مفعلة الآن.";
  return lang === "en"
    ? `Available products now:\n${products.slice(0, 4).map((p) => `- ${p.name}: ${p.price} EGP`).join("\n")}`
    : `المنتجات المتاحة الآن:\n${products.slice(0, 4).map((p) => `- ${p.name}: ${p.price} ج.م`).join("\n")}`;
}

export function buildAccountReply(
  lang: CoachLang,
  account: {
    authenticated: boolean;
    membership?: { name: string; endDate: string } | null;
    walletBalance?: number;
    rewardPoints?: number;
    rewardTier?: string;
    upcomingBookingDate?: string | null;
    attendanceStats?: { attendedCount30d: number; daysSinceLastAttended: number | null };
  },
  profile?: CoachProfileData | null,
) {
  if (!account.authenticated)
    return lang === "en"
      ? "Please log in first so I can show your membership, bookings, wallet, and rewards."
      : "لازم تسجلي الدخول أولًا حتى أقدر أعرض اشتراكك وحجوزاتك ومحفظتك ونقاطك.";

  const goalLabels: Record<string, { ar: string; en: string }> = {
    "weight-loss": { ar: "خسارة الوزن", en: "weight loss" },
    "muscle-gain": { ar: "بناء العضلات", en: "muscle gain" },
    toning: { ar: "شد الجسم", en: "toning" },
    "general-fitness": { ar: "اللياقة العامة", en: "general fitness" },
  };

  const lines =
    lang === "en"
      ? [
          "Here is your account summary:",
          `- Membership: ${account.membership?.name ?? "No active membership"}`,
          `- Wallet: ${account.walletBalance ?? 0} EGP`,
          `- Reward points: ${account.rewardPoints ?? 0}`,
          `- Tier: ${account.rewardTier ?? "bronze"}`,
          `- Upcoming booking: ${account.upcomingBookingDate ? new Date(account.upcomingBookingDate).toLocaleDateString("en-US") : "None"}`,
        ]
      : [
          "هذا ملخص حسابك الحالي:",
          `- الاشتراك: ${account.membership?.name ?? "لا يوجد اشتراك نشط"}`,
          `- المحفظة: ${account.walletBalance ?? 0} ج.م`,
          `- النقاط: ${account.rewardPoints ?? 0}`,
          `- المستوى: ${account.rewardTier ?? "bronze"}`,
          `- الحجز القادم: ${account.upcomingBookingDate ? new Date(account.upcomingBookingDate).toLocaleDateString("ar-EG") : "لا يوجد"}`,
        ];

  // Attendance insight
  if (account.attendanceStats) {
    const { attendedCount30d, daysSinceLastAttended } = account.attendanceStats;
    if (lang === "ar") {
      lines.push(`- حضور آخر 30 يوم: ${attendedCount30d} حصة`);
      if (daysSinceLastAttended !== null) {
        if (daysSinceLastAttended <= 3) lines.push("✅ أنتِ منتظمة — استمري هكذا!");
        else if (daysSinceLastAttended > 10)
          lines.push(`⚠️ لم تحضري حصة منذ ${daysSinceLastAttended} يوماً — حاولي العودة هذا الأسبوع.`);
      }
    } else {
      lines.push(`- Sessions in last 30 days: ${attendedCount30d}`);
      if (daysSinceLastAttended !== null) {
        if (daysSinceLastAttended <= 3) lines.push("✅ You are consistent — keep it up!");
        else if (daysSinceLastAttended > 10)
          lines.push(`⚠️ No session in ${daysSinceLastAttended} days — try to get back this week.`);
      }
    }
  }

  if (profile?.primaryGoal && goalLabels[profile.primaryGoal]) {
    lines.push(
      lang === "en"
        ? `- Your coaching goal: ${goalLabels[profile.primaryGoal].en}`
        : `- هدفك التدريبي: ${goalLabels[profile.primaryGoal].ar}`,
    );
  }

  if (profile?.injuries) {
    lines.push(
      lang === "en"
        ? "- Note: you have a recorded injury/limitation — I keep this in mind for class recommendations."
        : "- ملاحظة: لديكِ إصابة أو قيد مسجّل، سأأخذه في الاعتبار عند ترشيح الكلاسات.",
    );
  }

  return lines.join("\n");
}

export function buildBookingHelpReply(lang: CoachLang) {
  return lang === "en"
    ? "You can book from today's classes or the schedule page after logging in. If you want, I can recommend a class first."
    : "تقدري تحجزي من كلاسات اليوم أو من صفحة الجدول بعد تسجيل الدخول. ولو تحبي أقدر أرشح لكِ كلاس مناسب أولًا.";
}

export function buildComplaintReply(lang: CoachLang, supportOnline: boolean) {
  if (lang === "en")
    return supportOnline
      ? "I can transfer you to live support now, or you can send your complaint through your account."
      : "Live support is not available right now, but I can log your request and you can send a complaint from your account.";
  return supportOnline
    ? "أقدر أحولك الآن للدعم المباشر، أو يمكنك إرسال الشكوى من حسابك."
    : "الدعم المباشر غير متاح الآن، لكن أقدر أسجل طلبك ويمكنك أيضًا إرسال شكوى من حسابك.";
}

export function buildUnknownReply(lang: CoachLang) {
  return lang === "en"
    ? "I can help with memberships, classes, schedules, offers, trainers, products, booking, account summary, or live support."
    : "أقدر أساعدك في الباقات والكلاسات والمواعيد والعروض والمدربات والمنتجات والحجز وملخص الحساب أو التحويل للدعم.";
}

export function buildMembershipAssessmentReply(args: {
  lang: CoachLang;
  answers: QuestionnaireAnswers;
  membership: CoachPublicMembership | null;
  safetyFlags: CoachSafetyFlags;
  profile?: CoachProfileData | null;
}) {
  const { lang, answers, membership, safetyFlags, profile } = args;
  const safety = buildSafetyNote(safetyFlags, lang);

  const goalLabel =
    answers.goal === "weight-loss"
      ? lang === "en" ? "Weight loss" : "خسارة الوزن"
      : answers.goal === "muscle-gain"
        ? lang === "en" ? "Muscle gain" : "بناء العضلات"
        : answers.goal === "toning"
          ? lang === "en" ? "Toning" : "شد الجسم"
          : lang === "en" ? "General fitness" : "اللياقة العامة";

  const membershipReason = membership
    ? buildMembershipRecommendationReason(membership, answers, lang, profile)
    : null;

  const lines =
    lang === "en"
      ? [
          "I completed your initial assessment.",
          `- Goal: ${goalLabel}`,
          `- Expected training frequency: ${answers.frequency ?? "not specified"}`,
          `- Group classes: ${answers.classes === "yes" ? "yes" : answers.classes === "no" ? "no" : "not specified"}`,
          membership
            ? `My closest recommendation right now is **${membership.name}** at ${membership.price} EGP — ${membershipReason}.`
            : "I could not find a close active membership recommendation right now.",
        ]
      : [
          "أنهيت تقييمك المبدئي.",
          `- الهدف: ${goalLabel}`,
          `- معدل التمرين المتوقع: ${answers.frequency ?? "غير محدد"}`,
          `- تفضيل الكلاسات: ${answers.classes === "yes" ? "نعم" : answers.classes === "no" ? "لا" : "غير محدد"}`,
          membership
            ? `أقرب باقة لك الآن هي **${membership.name}** بسعر ${membership.price} ج.م — ${membershipReason}.`
            : "لم أجد باقة مفعلة قريبة من احتياجك الآن.",
        ];

  if (safety) lines.push(safety);
  lines.push(
    lang === "en"
      ? "If you want, I can continue with classes, pricing details, or transfer you to support."
      : "إذا تحبي أقدر أكمل معك في الكلاسات أو تفاصيل الأسعار أو أحولك للدعم.",
  );
  return lines.join("\n");
}

// ─── Check-in reply ───────────────────────────────────────────────────────────

export function buildCheckInReply(
  lang: CoachLang,
  checkIn: CoachCheckInData,
  previous: CoachCheckInData | null,
  profile?: CoachProfileData | null,
): string {
  const lines: string[] = [];
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  lines.push(t("✅ تم تسجيل قياسك:", "✅ Check-in recorded:"));

  if (checkIn.weight) {
    lines.push(t(`- الوزن: ${checkIn.weight} كجم`, `- Weight: ${checkIn.weight} kg`));

    if (previous?.weight) {
      const diff = checkIn.weight - previous.weight;
      const daysSince = Math.floor(
        (new Date(checkIn.createdAt).getTime() - new Date(previous.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      const period = daysSince > 0 ? t(`منذ ${daysSince} يوم`, `since ${daysSince} days ago`) : "";

      if (diff < -0.4) {
        lines.push(t(`📉 انخفض ${Math.abs(diff).toFixed(1)} كجم ${period} — استمري هكذا!`, `📉 Down ${Math.abs(diff).toFixed(1)} kg ${period} — keep it up!`));
      } else if (diff > 0.4) {
        lines.push(t(`📈 ارتفع ${diff.toFixed(1)} كجم ${period} — لا تقلقي، الالتزام بالتمرين والتغذية سيعيده للمسار.`, `📈 Up ${diff.toFixed(1)} kg ${period} — no worries, consistent training and nutrition will get you back on track.`));
      } else {
        lines.push(t(`➡️ الوزن ثابت ${period} — الثبات طبيعي، استمري في الانتظام.`, `➡️ Weight stable ${period} — plateaus are normal; stay consistent.`));
      }
    }

    // Progress toward target
    if (profile?.targetWeight && checkIn.weight) {
      const remaining = checkIn.weight - profile.targetWeight;
      if (remaining > 0.5) {
        lines.push(t(`🎯 متبقي ${remaining.toFixed(1)} كجم للوصول لهدفك.`, `🎯 ${remaining.toFixed(1)} kg remaining to reach your target.`));
      } else if (remaining <= 0) {
        lines.push(t("🏆 وصلتِ للوزن المستهدف أو تجاوزتِه — أنتِ رائعة!", "🏆 You've reached or passed your target weight — amazing work!"));
      }
    }
  }

  if (checkIn.energyLevel) {
    const labels = { ar: ["", "منهكة جداً", "متعبة", "عادي", "نشيطة", "نشيطة جداً"], en: ["", "Exhausted", "Tired", "Average", "Energetic", "Very energetic"] };
    lines.push(t(`- مستوى الطاقة: ${labels.ar[checkIn.energyLevel]}`, `- Energy level: ${labels.en[checkIn.energyLevel]}`));

    if (checkIn.energyLevel <= 2) {
      lines.push(t("💡 طاقتك منخفضة — فكري في تمرين خفيف اليوم والنوم الكافي الليلة.", "💡 Your energy is low — consider a lighter workout today and prioritize good sleep tonight."));
    }
  }

  lines.push(
    t(
      "📌 القياسات المنتظمة تساعدك على متابعة تقدمك بدقة — حاولي القياس كل أسبوع.",
      "📌 Regular check-ins help you track progress accurately — aim to check in weekly.",
    ),
  );

  return lines.join("\n");
}

// ─── Food check ───────────────────────────────────────────────────────────────

type FoodCategory = "protein" | "carb" | "fat" | "vegetable" | "sweet" | "fastfood" | "dairy" | "fruit";

const FOOD_MAP: Array<{ pattern: RegExp; category: FoodCategory; label: { ar: string; en: string } }> = [
  { pattern: /\b(فراخ|دجاج|صدر فراخ|chicken)\b/, category: "protein", label: { ar: "صدر فراخ", en: "chicken" } },
  { pattern: /\b(لحمه|لحم|beef|steak)\b/, category: "protein", label: { ar: "لحم", en: "beef" } },
  { pattern: /\b(سمك|fish|tuna|تونه)\b/, category: "protein", label: { ar: "سمك", en: "fish" } },
  { pattern: /\b(بيض|eggs)\b/, category: "protein", label: { ar: "بيض", en: "eggs" } },
  { pattern: /\b(رز|ارز|rice)\b/, category: "carb", label: { ar: "رز", en: "rice" } },
  { pattern: /\b(مكرونه|pasta|سباغيتي)\b/, category: "carb", label: { ar: "مكرونة", en: "pasta" } },
  { pattern: /\b(خبز|عيش|bread)\b/, category: "carb", label: { ar: "خبز", en: "bread" } },
  { pattern: /\b(بطاطس|بطاطا|potato)\b/, category: "carb", label: { ar: "بطاطس", en: "potato" } },
  { pattern: /\b(خضار|خضروات|salad|سلطه|vegetables)\b/, category: "vegetable", label: { ar: "خضار", en: "vegetables" } },
  { pattern: /\b(كيك|حلويات|شوكولاته|cake|sweets|chocolate)\b/, category: "sweet", label: { ar: "حلويات", en: "sweets" } },
  { pattern: /\b(شيبس|chips|crisps)\b/, category: "fastfood", label: { ar: "شيبس", en: "chips" } },
  { pattern: /\b(بيتزا|برجر|pizza|burger|فاست فود|fast food)\b/, category: "fastfood", label: { ar: "وجبة سريعة", en: "fast food" } },
  { pattern: /\b(لبن|حليب|زبادي|جبن|dairy|milk|yogurt|cheese)\b/, category: "dairy", label: { ar: "ألبان", en: "dairy" } },
  { pattern: /\b(فاكهه|فواكه|موز|تفاح|برتقال|fruit)\b/, category: "fruit", label: { ar: "فاكهة", en: "fruit" } },
  { pattern: /\b(زيت|butter|زبده|fat)\b/, category: "fat", label: { ar: "دهون", en: "fats" } },
];

const CATEGORY_TIPS: Record<FoodCategory, { ar: string; en: string }> = {
  protein: { ar: "مصدر بروتين ممتاز — داعم للعضلات والشبع.", en: "Great protein source — supports muscle and satiety." },
  carb: { ar: "كربوهيدرات — طاقة مفيدة، التحكم في الكمية مهم خصوصاً مع التخسيس.", en: "Carbohydrates — useful energy; portion control matters especially for weight loss." },
  vegetable: { ar: "خضروات ممتازة — أضيفيها بحرية لأي وجبة.", en: "Excellent vegetables — add them freely to any meal." },
  sweet: { ar: "حلويات — لا بأس باعتدال، لكن تقليلها يساعد على أي هدف.", en: "Sweets — fine in moderation, but reducing them helps any goal." },
  fastfood: { ar: "وجبات سريعة — حاولي تقليلها وعوّضيها بوجبات منزلية.", en: "Fast food — try to limit it and replace with home-cooked meals." },
  dairy: { ar: "ألبان — مصدر جيد للكالسيوم والبروتين، فضّلي قليل الدسم.", en: "Dairy — good calcium and protein source; opt for low-fat options." },
  fruit: { ar: "فاكهة — صحية ومفيدة، لكن انتبهي للكميات عند التخسيس.", en: "Fruit — healthy and beneficial; watch portions for weight loss." },
  fat: { ar: "دهون — اختاري الصحية كزيت الزيتون وتجنبي الدهون المشبعة الزائدة.", en: "Fats — choose healthy fats like olive oil and avoid excess saturated fats." },
};

const GOAL_GUIDANCE: Record<string, { ar: string; en: string }> = {
  "weight-loss": { ar: "هدفك خسارة الوزن — ركزي على البروتين العالي والخضار وتقليل الكربوهيدرات البيضاء.", en: "Your goal is weight loss — focus on high protein, vegetables, and reducing refined carbs." },
  "muscle-gain": { ar: "هدفك بناء العضلات — احرصي على بروتين كافٍ وكربوهيدرات معقدة للطاقة.", en: "Your goal is muscle gain — ensure adequate protein and complex carbs for energy." },
  toning: { ar: "هدفك شد الجسم — اتزان الأكل مع بروتين كافٍ وتقليل السكريات هو المفتاح.", en: "Your goal is toning — balanced eating with sufficient protein and reduced sugars is key." },
  "general-fitness": { ar: "هدفك اللياقة العامة — حافظي على تنوع الأكل وكل الفئات الغذائية باعتدال.", en: "Your goal is general fitness — maintain a varied diet with all food groups in moderation." },
};

export function buildFoodCheckReply(
  lang: CoachLang,
  message: string,
  profile?: CoachProfileData | null,
): string {
  const normalized = message.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  const detectedFoods = FOOD_MAP.filter(({ pattern }) => pattern.test(normalized));
  const goal = profile?.primaryGoal ?? null;
  const lines: string[] = [lang === "ar" ? "🥗 فحص سريع للوجبة:" : "🥗 Quick meal check:"];

  if (detectedFoods.length === 0) {
    lines.push(
      lang === "ar"
        ? "لم أتعرف على أصناف محددة، لكن بشكل عام: نِّوعي في البروتين والخضار وقللي من المعالَج والمقلي."
        : "I couldn't identify specific items, but generally: vary your proteins, add vegetables, and reduce processed or fried foods.",
    );
  } else {
    const hasProtein = detectedFoods.some((f) => f.category === "protein");
    const hasCarb = detectedFoods.some((f) => f.category === "carb");
    const hasVeg = detectedFoods.some((f) => f.category === "vegetable");
    const hasFastFood = detectedFoods.some((f) => f.category === "fastfood");
    const hasSweet = detectedFoods.some((f) => f.category === "sweet");

    for (const food of detectedFoods) {
      lines.push(`• ${food.label[lang]}: ${CATEGORY_TIPS[food.category][lang]}`);
    }

    if (!hasVeg && (hasProtein || hasCarb))
      lines.push(lang === "ar" ? "💡 إضافة خضار ستزيد إشباع الوجبة وقيمتها الغذائية." : "💡 Adding vegetables would increase satiety and nutritional value.");
    if (hasCarb && !hasProtein && goal === "weight-loss")
      lines.push(lang === "ar" ? "💡 أضيفي بروتين (فراخ / بيض / تونة) مع الكربوهيدرات للإشباع الأفضل." : "💡 Add a protein source (chicken / eggs / tuna) with the carbs for better satiety.");
    if (hasFastFood || hasSweet)
      lines.push(lang === "ar" ? "⚠️ حاولي تقليل هذه الأصناف أو صنعيها في البيت بمكونات أخف." : "⚠️ Try to limit these items or make a homemade lighter version.");
  }

  if (goal && GOAL_GUIDANCE[goal]) lines.push(GOAL_GUIDANCE[goal][lang]);
  else lines.push(lang === "ar" ? "💧 اشربي الماء الكافي وتجنبي الوجبات المتأخرة جداً قبل النوم." : "💧 Stay well-hydrated and avoid eating very late before bed.");

  lines.push(lang === "ar" ? "📌 هذه توجيهات عامة فقط وليست بديلاً عن خطة تغذية متخصصة." : "📌 These are general guidelines only, not a substitute for a professional nutrition plan.");
  return lines.join("\n");
}

// ─── Intent dispatcher ────────────────────────────────────────────────────────

export function buildIntentReply(args: {
  lang: CoachLang;
  intent: CoachIntent;
  knowledgeEntry?: CoachKnowledgeEntry | null;
  memberships?: CoachPublicMembership[];
  offers?: CoachPublicOffer[];
  classes?: CoachPublicClass[];
  trainers?: CoachPublicTrainer[];
  products?: CoachPublicProduct[];
  account?: {
    authenticated: boolean;
    membership?: { name: string; endDate: string } | null;
    walletBalance?: number;
    rewardPoints?: number;
    rewardTier?: string;
    upcomingBookingDate?: string | null;
    attendanceStats?: { attendedCount30d: number; daysSinceLastAttended: number | null };
  };
  supportOnline?: boolean;
  profile?: CoachProfileData | null;
  userMessage?: string;
}) {
  const { lang, intent } = args;
  if (intent === "greeting")
    return lang === "en"
      ? "Hi! How can I help you today? You can ask about memberships, classes, schedules, offers, or your account."
      : "أهلًا! كيف أقدر أساعدك؟ تقدري تسأليني عن الباقات أو الكلاسات أو المواعيد أو العروض أو حسابك.";
  if ((intent === "faq" || intent === "unknown") && args.knowledgeEntry) return args.knowledgeEntry.answer;
  if (intent === "pricing") return buildPricingReply(lang, args.memberships ?? []);
  if (intent === "offer_lookup") return buildOffersReply(lang, args.offers ?? []);
  if (intent === "schedule_lookup") return buildScheduleReply(lang, args.classes ?? []);
  if (intent === "trainer_info") return buildTrainerReply(lang, args.trainers ?? []);
  if (intent === "product_help") return buildProductReply(lang, args.products ?? []);
  if (intent === "account_summary") return buildAccountReply(lang, args.account ?? { authenticated: false }, args.profile);
  if (intent === "booking_help") return buildBookingHelpReply(lang);
  if (intent === "complaint_help") return buildComplaintReply(lang, Boolean(args.supportOnline));
  if (intent === "food_check") return buildFoodCheckReply(lang, args.userMessage ?? "", args.profile);
  return buildUnknownReply(lang);
}
