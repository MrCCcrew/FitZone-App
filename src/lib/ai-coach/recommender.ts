import type {
  CoachAttendanceStats,
  CoachLang,
  CoachProfileData,
  CoachPublicClass,
  CoachPublicMembership,
  QuestionnaireAnswers,
} from "@/lib/ai-coach/types";

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

/** Merge profile data into answers so the profile acts as default values for missing answers. */
function mergeProfileIntoAnswers(
  answers: QuestionnaireAnswers,
  profile: CoachProfileData | null,
): QuestionnaireAnswers {
  if (!profile) return answers;
  return {
    goal: answers.goal ?? (profile.primaryGoal as QuestionnaireAnswers["goal"]) ?? undefined,
    experience: answers.experience ?? (profile.trainingLevel as QuestionnaireAnswers["experience"]) ?? undefined,
    frequency:
      answers.frequency ??
      (profile.preferredDays
        ? profile.preferredDays >= 5
          ? "high"
          : profile.preferredDays >= 3
            ? "medium"
            : "low"
        : undefined),
    classes:
      answers.classes ??
      (profile.preferredClassTypes.includes("group")
        ? "yes"
        : profile.preferredClassTypes.includes("individual")
          ? "no"
          : undefined),
    meals: answers.meals ?? (profile.nutritionStyle as QuestionnaireAnswers["meals"]) ?? undefined,
    weight: answers.weight ?? (profile.currentWeight ?? undefined),
    height: answers.height ?? (profile.height ?? undefined),
    age: answers.age ?? (profile.age ?? undefined),
    gender: answers.gender,
    activity: answers.activity,
    injuries: answers.injuries ?? (profile.injuries ? "yes" : undefined),
    budget: answers.budget,
  };
}

export function recommendMembership(
  answers: QuestionnaireAnswers,
  memberships: CoachPublicMembership[],
  profile?: CoachProfileData | null,
): CoachPublicMembership | null {
  if (memberships.length === 0) return null;

  const merged = mergeProfileIntoAnswers(answers, profile ?? null);

  const scored = memberships.map((membership) => {
    const features = membership.features.join(" ").toLowerCase();
    let score = 0;

    if (merged.goal === "weight-loss" && /(cardio|زومبا|كارديو|fat|loss)/i.test(features)) score += 4;
    if (merged.goal === "muscle-gain" && /(strength|مقاومه|عضل|muscle)/i.test(features)) score += 4;
    if (merged.goal === "toning" && /(classes|كلاسات|yoga|pilates)/i.test(features)) score += 3;
    if (merged.classes === "yes" && /(classes|كلاسات|dance|yoga|زومبا)/i.test(features)) score += 4;
    if (merged.frequency === "high" && (membership.maxClasses === -1 || membership.maxClasses >= 12)) score += 3;
    if (merged.frequency === "medium" && (membership.maxClasses === -1 || membership.maxClasses >= 8)) score += 2;
    if (merged.experience === "beginner" && /(beginner|مبتدئ|introductory|تمهيدي)/i.test(features)) score += 2;
    if (merged.experience === "advanced" && /(advanced|متقدم|unlimited|غير محدود)/i.test(features)) score += 2;

    if (typeof merged.budget === "number") {
      const diff = Math.abs(membership.price - merged.budget);
      score += Math.max(0, 6 - diff / 100);
      if (membership.price > merged.budget * 1.35) score -= 4;
    }

    return { membership, score };
  });

  scored.sort((a, b) => b.score - a.score || a.membership.price - b.membership.price);
  return scored[0]?.membership ?? null;
}

export function buildMembershipRecommendationReason(
  membership: CoachPublicMembership,
  answers: QuestionnaireAnswers,
  lang: CoachLang,
  profile?: CoachProfileData | null,
): string {
  const merged = mergeProfileIntoAnswers(answers, profile ?? null);
  const reasons: string[] = [];

  const goalLabels: Record<string, { ar: string; en: string }> = {
    "weight-loss": { ar: "خسارة الوزن", en: "weight loss" },
    "muscle-gain": { ar: "بناء العضلات", en: "muscle gain" },
    toning: { ar: "شد الجسم", en: "toning" },
    "general-fitness": { ar: "اللياقة العامة", en: "general fitness" },
  };

  if (merged.goal && goalLabels[merged.goal]) {
    const label = goalLabels[merged.goal][lang];
    reasons.push(lang === "ar" ? `تناسب هدفك في ${label}` : `matches your ${label} goal`);
  }
  if (merged.classes === "yes") {
    reasons.push(lang === "ar" ? "تتيح حضور كلاسات جماعية" : "includes group classes");
  }
  if (merged.frequency === "high") {
    reasons.push(lang === "ar" ? "تدعم تمرين يومي بدون قيود" : "supports daily training without limits");
  } else if (merged.frequency === "medium") {
    reasons.push(lang === "ar" ? "مناسبة لتردد أسبوعي متوسط" : "fits a moderate weekly frequency");
  }
  if (typeof merged.budget === "number" && membership.price <= merged.budget * 1.1) {
    reasons.push(lang === "ar" ? "تقع ضمن ميزانيتك" : "fits within your budget");
  }

  if (reasons.length === 0) {
    return lang === "ar"
      ? "هي الأقرب لاحتياجاتك بناءً على ما أخبرتِني"
      : "it is the closest match to your stated needs";
  }

  return lang === "ar"
    ? `لأنها ${reasons.join("، وهي ")}`
    : `because it ${reasons.join(", and ")}`;
}

export function recommendClasses(
  message: string,
  classes: CoachPublicClass[],
  lang: CoachLang,
  profile?: CoachProfileData | null,
  attendanceStats?: CoachAttendanceStats | null,
): CoachPublicClass[] {
  const text = normalize(message);
  const goal = profile?.primaryGoal ?? null;
  const level = profile?.trainingLevel ?? null;
  const preferGroup = profile?.preferredClassTypes.includes("group") ?? false;

  // Determine intensity bias from attendance
  const daysSince = attendanceStats?.daysSinceLastAttended ?? null;
  const preferLighter = daysSince !== null && daysSince > 10; // returning after a gap → ease back in
  const preferIntense = daysSince !== null && daysSince <= 3 && (attendanceStats?.attendedCount30d ?? 0) >= 6;

  const scored = classes.map((gymClass) => {
    const haystack = normalize(
      [gymClass.name, gymClass.description, gymClass.category, gymClass.type, gymClass.subType, gymClass.trainerSpecialty]
        .filter(Boolean)
        .join(" "),
    );
    let score = 0;

    // ── Message-based scoring ──────────────────────────────────────────────────
    if (/(تخسيس|دهون|weight|loss|cardio)/.test(text) && /(cardio|dance|زومبا|كارديو)/.test(haystack)) score += 5;
    if (/(مرونه|stretch|yoga|يوجا|pilates)/.test(text) && /(yoga|pilates|مرونه|stretch)/.test(haystack)) score += 5;
    if (/(عضل|strength|مقاومه|boxing|ملاكمه)/.test(text) && /(strength|boxing|مقاومه|power)/.test(haystack)) score += 5;
    if (/(beginner|مبتد)/.test(text) && /(beginner|low|متوسط|يوجا)/.test(haystack)) score += 3;
    if (haystack.includes(text)) score += 2;

    // ── Profile goal scoring ───────────────────────────────────────────────────
    if (goal === "weight-loss" && /(cardio|dance|زومبا|كارديو|aerobic)/.test(haystack)) score += 3;
    if (goal === "muscle-gain" && /(strength|power|مقاومه|boxing)/.test(haystack)) score += 3;
    if (goal === "toning" && /(pilates|yoga|يوجا|shaping|شيبينج|بايلاتس)/.test(haystack)) score += 3;
    if (goal === "general-fitness" && gymClass.schedules.length > 0) score += 1;

    // ── Intensity bias from attendance ────────────────────────────────────────
    if (preferLighter && /(yoga|pilates|مرونه|low impact|beginner|مبتدئ|يوجا)/.test(haystack)) score += 2;
    if (preferIntense && /(hiit|intense|متقدم|advanced|high impact|power|boxing)/.test(haystack)) score += 2;

    // ── Experience level ──────────────────────────────────────────────────────
    if (level === "beginner" && /(beginner|intro|مبتدئ|اساسيات|low impact)/.test(haystack)) score += 2;
    if (level === "advanced" && /(advanced|intense|متقدم|hiit|high impact)/.test(haystack)) score += 2;

    // ── Group class preference ────────────────────────────────────────────────
    if (preferGroup && gymClass.type && /(group|جماعي)/.test(normalize(gymClass.type))) score += 2;

    // ── Availability bonus ────────────────────────────────────────────────────
    if (gymClass.schedules.length > 0) score += 1;

    return { gymClass, score };
  });

  scored.sort((a, b) => b.score - a.score || a.gymClass.name.localeCompare(b.gymClass.name, lang === "en" ? "en" : "ar"));
  return scored.filter((item) => item.score > 0).slice(0, 3).map((item) => item.gymClass);
}
