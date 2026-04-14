import type { CoachIntent, CoachLang, CoachProfileData, CoachQuickAction } from "@/lib/ai-coach/types";

function action(id: string, label: string, prompt: string): CoachQuickAction {
  return { id, label, prompt };
}

export function buildQuickActions(options: {
  lang: CoachLang;
  authenticated: boolean;
  intent?: CoachIntent;
  supportOnline: boolean;
  liveMode: boolean;
  profile?: CoachProfileData | null;
  hasMembership?: boolean;
  hasUpcomingBooking?: boolean;
  checkInDue?: boolean;
  attendanceLow?: boolean;
}): CoachQuickAction[] {
  const {
    lang,
    authenticated,
    intent,
    supportOnline,
    liveMode,
    profile,
    hasMembership,
    hasUpcomingBooking,
    checkInDue,
    attendanceLow,
  } = options;
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  if (liveMode) {
    return [action("live-status", t("أكلم موظفة", "Talk to support"), t("أريد التحدث مع موظفة الدعم", "I want to talk to support"))];
  }

  const handoff = action(
    "support",
    t("أكلم موظفة", supportOnline ? "Talk to support" : "Leave a request"),
    t("أريد التحدث مع موظفة", "I want to talk to support"),
  );
  const foodAction = action("food", t("قيّمي أكلي", "Check my food"), t("أريد تقييم سريع لوجبتي", "I want a quick review of my meal"));
  const checkInAction = action("checkin", t("سجّلي وزني", "Log my weight"), t("وزني اليوم X كيلو", "my weight today is X kg"));
  const todayAction = action("today", t("مواعيد اليوم", "Today's schedule"), t("ما مواعيد اليوم؟", "What are today's classes?"));
  const hasProfile = Boolean(profile);

  // ── Live / complaint ───────────────────────────────────────────────────────
  if (intent === "complaint_help" || intent === "human_handoff") return [handoff];

  // ── Check-in context ───────────────────────────────────────────────────────
  if (intent === "check_in") {
    return [
      ...(profile?.primaryGoal ? buildGoalActions(profile, lang).slice(0, 2) : [todayAction]),
      foodAction,
      handoff,
    ];
  }

  // ── Food check context ─────────────────────────────────────────────────────
  if (intent === "food_check") {
    const related: CoachQuickAction[] = [
      action("food-again", t("تحقق من أكل آخر", "Check another food"), t("عايزة أتحقق من أكل تاني", "I want to check another food")),
    ];
    if (profile?.primaryGoal === "weight-loss")
      related.push(action("cardio", t("كلاسات الكارديو", "Cardio classes"), t("ما كلاسات الكارديو المتاحة؟", "What cardio classes are available?")));
    else
      related.push(action("class", t("رشحي لي كلاس", "Recommend a class"), t("رشحي لي كلاس مناسب", "Recommend a suitable class")));
    if (checkInDue) related.push(checkInAction);
    related.push(handoff);
    return related;
  }

  // ── Guest flow ─────────────────────────────────────────────────────────────
  if (!authenticated) {
    if (!hasProfile) {
      return [
        action("start", t("ابدأي رحلتك", "Start your journey"), t("أريد أن أبدأ رحلتي وأحتاج ترشيح باقة", "I want to start my journey and need a membership recommendation")),
        action("membership", t("رشحي لي باقة", "Recommend a membership"), t("رشحي لي باقة مناسبة", "Recommend a suitable membership")),
        todayAction,
        action("offers", t("العروض الحالية", "Current offers"), t("ما العروض الحالية؟", "What are the current offers?")),
        handoff,
      ];
    }
    const goalActions = buildGoalActions(profile, lang);
    return [...goalActions, todayAction, handoff];
  }

  // ── Account summary ────────────────────────────────────────────────────────
  if (intent === "account_summary") {
    const base = [
      action("membership-detail", t("اشتراكي الحالي", "My membership"), t("ما اشتراكي الحالي؟", "What is my current membership?")),
      action("bookings", t("حجوزاتي", "My bookings"), t("ما حجوزاتي القادمة؟", "What are my upcoming bookings?")),
      action("wallet", t("محفظتي ونقاطي", "Wallet and points"), t("ما رصيد محفظتي ونقاطي؟", "What are my wallet balance and points?")),
    ];
    if (checkInDue || !hasProfile) base.push(checkInAction);
    base.push(foodAction, handoff);
    return base;
  }

  // ── Pricing / membership recommendation ────────────────────────────────────
  if (intent === "pricing" || intent === "membership_recommendation") {
    return hasMembership
      ? [
          action("class", t("رشحي لي كلاس", "Recommend a class"), t("رشحي لي كلاس مناسب", "Recommend a suitable class")),
          todayAction,
          foodAction,
          handoff,
        ]
      : [
          action("start", t("ابدأي رحلتك", "Start your journey"), t("أريد أن أبدأ وأحتاج ترشيح باقة", "I want to start and need a membership recommendation")),
          action("offers", t("العروض الحالية", "Current offers"), t("ما العروض الحالية؟", "What are the current offers?")),
          todayAction,
          handoff,
        ];
  }

  // ── Class / schedule ───────────────────────────────────────────────────────
  if (intent === "class_recommendation" || intent === "schedule_lookup") {
    return [
      action("book", t("احجزي حصة", "Book a class"), t("كيف أحجز حصة؟", "How do I book a class?")),
      ...buildGoalActions(profile, lang).slice(0, 2),
      foodAction,
      handoff,
    ];
  }

  // ── Attendance low nudge context ───────────────────────────────────────────
  if (attendanceLow && hasMembership) {
    return [
      todayAction,
      action("book", t("احجزي حصة خفيفة", "Book a light class"), t("ما أسهل كلاس متاح اليوم؟", "What is the easiest class available today?")),
      ...buildGoalActions(profile, lang).slice(0, 1),
      checkInDue ? checkInAction : foodAction,
      handoff,
    ];
  }

  // ── No upcoming booking with active membership ─────────────────────────────
  if (!hasUpcomingBooking && hasMembership) {
    return [
      todayAction,
      action("book", t("احجزي حصة", "Book a class"), t("كيف أحجز حصة؟", "How do I book a class?")),
      ...buildGoalActions(profile, lang).slice(0, 1),
      checkInDue ? checkInAction : foodAction,
      handoff,
    ];
  }

  // ── No membership ──────────────────────────────────────────────────────────
  if (!hasMembership) {
    return [
      action("start", t("ابدأي رحلتك", "Start your journey"), t("أريد أن أبدأ وأحتاج ترشيح باقة", "I want to start and need a membership recommendation")),
      action("offers", t("العروض الحالية", "Current offers"), t("ما العروض الحالية؟", "What are the current offers?")),
      todayAction,
      handoff,
    ];
  }

  // ── No profile — suggest onboarding ───────────────────────────────────────
  if (!hasProfile) {
    return [
      action("start", t("أكملي ملفك", "Complete your profile"), t("أريد تقييم مخصص وترشيح باقة", "I want a personalized assessment")),
      todayAction,
      action("bookings", t("حجوزاتي", "My bookings"), t("ما حجوزاتي القادمة؟", "What are my upcoming bookings?")),
      foodAction,
      handoff,
    ];
  }

  // ── Default: member with profile ──────────────────────────────────────────
  const defaults = [
    action("today-plan", t("خطتي اليوم", "My plan today"), t("ما خطتي اليوم؟", "What is my plan for today?")),
    ...buildGoalActions(profile, lang).slice(0, 2),
    action("bookings", t("حجوزاتي", "My bookings"), t("ما حجوزاتي القادمة؟", "What are my upcoming bookings?")),
  ];
  if (checkInDue) defaults.push(checkInAction);
  else defaults.push(foodAction);
  defaults.push(handoff);
  return defaults;
}

function buildGoalActions(profile: CoachProfileData | null | undefined, lang: CoachLang): CoachQuickAction[] {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const goal = profile?.primaryGoal;

  if (goal === "weight-loss")
    return [
      action("cardio", t("كلاسات الكارديو", "Cardio classes"), t("ما كلاسات الكارديو المتاحة؟", "What cardio classes are available?")),
      action("food-loss", t("نصايح التخسيس", "Weight loss tips"), t("عندي أكل معين، هل مناسب للتخسيس؟", "I ate something — is it good for weight loss?")),
    ];

  if (goal === "muscle-gain")
    return [
      action("strength", t("كلاسات القوة", "Strength classes"), t("ما كلاسات القوة والمقاومة؟", "What strength classes are available?")),
      action("food-muscle", t("أكل بناء العضلات", "Muscle nutrition"), t("ما أفضل أكل لبناء العضلات؟", "What is the best food for muscle gain?")),
    ];

  if (goal === "toning")
    return [
      action("pilates", t("كلاسات الشد", "Toning classes"), t("ما كلاسات الشد والنحت؟", "What toning classes are available?")),
      action("food-tone", t("أكل لشد الجسم", "Toning nutrition"), t("هل أكلي مناسب لشد الجسم؟", "Is my food suitable for toning?")),
    ];

  return [
    action("class", t("رشحي لي كلاس", "Recommend a class"), t("رشحي لي كلاس مناسب", "Recommend a suitable class")),
    action("food-check", t("قيّمي أكلي", "Review my food"), t("أريد تقييم سريع لأكلي", "Give me a quick food review")),
  ];
}
