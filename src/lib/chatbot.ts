import { db } from "@/lib/db";

type QuestionKey =
  | "goal"
  | "gender"
  | "age"
  | "height"
  | "weight"
  | "activity"
  | "experience"
  | "frequency"
  | "classes"
  | "injuries"
  | "meals"
  | "budget";

type QuestionnaireAnswers = {
  goal?: "weight-loss" | "muscle-gain" | "toning" | "general-fitness";
  gender?: "male" | "female";
  age?: number;
  height?: number;
  weight?: number;
  activity?: "low" | "medium" | "high";
  experience?: "beginner" | "intermediate" | "advanced";
  frequency?: "low" | "medium" | "high";
  classes?: "yes" | "no";
  injuries?: "yes" | "no";
  meals?: "poor" | "average" | "good";
  budget?: number;
};

type ChatContext = {
  stage: QuestionKey | "done";
  answers: QuestionnaireAnswers;
  awaitingContinuation?: boolean;
};

type FaqEntry = {
  keywords: string[];
  answer: string;
  priority?: number;
};

const QUESTION_ORDER: QuestionKey[] = [
  "goal",
  "gender",
  "age",
  "height",
  "weight",
  "activity",
  "experience",
  "frequency",
  "classes",
  "injuries",
  "meals",
  "budget",
];

const QUESTION_TEXT: Record<QuestionKey, string> = {
  goal: "أهلًا بك في فيت زون. ما هدفك الأساسي حاليًا: خسارة الوزن، بناء العضلات، شد الجسم، أم تحسين اللياقة العامة؟",
  gender: "هل أنت ذكر أم أنثى؟ هذا يساعدني على ترشيح أنسب خطة لك.",
  age: "كم عمرك؟ اكتب الرقم فقط.",
  height: "ما طولك بالسنتيمتر؟ مثال: 170",
  weight: "ما وزنك الحالي بالكيلو؟ مثال: 78",
  activity: "ما مستوى نشاطك اليومي خارج التمرين: قليل، متوسط، أم عالٍ؟",
  experience: "ما مستواك الحالي في التمرين: مبتدئ، متوسط، أم متقدم؟",
  frequency: "كم مرة تتوقع أن تتمرن أسبوعيًا؟ مثال: 2 أو 4 أو 6",
  classes: "هل تفضل الكلاسات الجماعية مثل الزومبا أو اليوجا أو الكارديو؟ اكتب نعم أو لا.",
  injuries: "هل لديك إصابة أو ألم متكرر أو حالة صحية يجب مراعاتها؟ اكتب نعم أو لا.",
  meals: "كيف هو نظام أكلك الحالي: ضعيف، متوسط، أم جيد؟",
  budget: "ما الميزانية الشهرية المناسبة لك تقريبًا بالجنيه المصري؟",
};

const DEFAULT_CONTEXT: ChatContext = {
  stage: "goal",
  answers: {},
};

const FAQ_ENTRIES: FaqEntry[] = [
  {
    keywords: ["تخسيس", "تنحيف", "نزول وزن", "حرق", "دهون", "رجيم"],
    answer:
      "خسارة الوزن تعتمد على عجز سعرات معتدل مع تمارين مقاومة وكارديو وحركة يومية جيدة. الهدف ليس الحرمان، بل الاستمرار ونتيجة ثابتة.",
  },
  {
    keywords: ["عضل", "عضلات", "تضخيم", "كتلة", "بناء جسم"],
    answer:
      "بناء العضلات يحتاج تمارين مقاومة منتظمة، بروتين كافٍ، ونوم جيد. أفضل نتيجة تظهر مع الالتزام وزيادة الحمل التدريجية.",
  },
  {
    keywords: ["شد", "نحت", "قوام"],
    answer:
      "شد الجسم يحتاج دمج تمارين مقاومة مع كارديو معتدل وتنظيم الأكل، وليس الاعتماد على الكارديو وحده.",
  },
  {
    keywords: ["أكل", "غذاء", "دايت", "وجبات", "سعرات"],
    answer:
      "أفضل نظام غذائي هو الذي يمكنك الالتزام به. ابدأ بتنظيم الوجبات، رفع البروتين، الإكثار من الخضار، وتقليل السكريات العالية.",
  },
  {
    keywords: ["مكمل", "مكملات", "بروتين", "كرياتين"],
    answer:
      "المكملات ليست الأساس. الأولوية دائمًا للأكل والنوم والتمرين. وإذا كانت لديك حالة صحية خاصة فاستشر مختصًا قبل استخدام أي مكمل.",
  },
  {
    keywords: ["إصابة", "ألم", "ركبة", "ظهر", "مفصل"],
    answer:
      "إذا لديك إصابة أو ألم متكرر، فالأفضل اختيار برنامج تدريجي ومراعاة التمارين المناسبة لحالتك، ومع الحالات المستمرة يفضّل مراجعة مختص.",
  },
  {
    keywords: ["أسعار", "سعر", "اشتراك", "باقات", "باقة"],
    answer:
      "لدينا أكثر من باقة حسب هدفك وميزانيتك وعدد مرات التمرين. أكمل معي التقييم وسأرشح لك الباقة الأقرب بشكل أوضح.",
  },
  {
    keywords: ["كلاس", "كلاسات", "يوجا", "زومبا", "حجز"],
    answer:
      "يمكنني ترشيح باقة مناسبة أو تحويلك إلى الدعم المباشر. وإذا كنت تريد موظفًا مباشرة فاكتب: أريد التحدث مع موظف.",
  },
];

function parseKeywords(value: string | null) {
  try {
    return value ? (JSON.parse(value) as string[]) : [];
  } catch {
    return [];
  }
}

function parseContext(context?: string | null): ChatContext {
  if (!context) return DEFAULT_CONTEXT;

  try {
    const parsed = JSON.parse(context) as ChatContext;
    return {
      stage: parsed.stage ?? "goal",
      answers: parsed.answers ?? {},
      awaitingContinuation: Boolean(parsed.awaitingContinuation),
    };
  } catch {
    return DEFAULT_CONTEXT;
  }
}

function serializeContext(context: ChatContext) {
  return JSON.stringify(context);
}

function nextQuestion(stage: ChatContext["stage"]) {
  if (stage === "done") return null;
  return QUESTION_TEXT[stage];
}

function getNextStage(current: QuestionKey): ChatContext["stage"] {
  const index = QUESTION_ORDER.indexOf(current);
  return index === QUESTION_ORDER.length - 1 ? "done" : QUESTION_ORDER[index + 1];
}

function normalizeArabic(text: string) {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractNumber(message: string) {
  const normalized = normalizeArabic(message);
  const value = Number(normalized.match(/\d+/)?.[0]);
  return Number.isFinite(value) ? value : undefined;
}

function parseAnswer(key: QuestionKey, message: string): QuestionnaireAnswers[QuestionKey] | undefined {
  const normalized = normalizeArabic(message);

  if (key === "goal") {
    if (/(تخسيس|تنحيف|وزن|دهون|حرق)/.test(normalized)) return "weight-loss";
    if (/(عضل|عضلات|تضخيم|بناء)/.test(normalized)) return "muscle-gain";
    if (/(شد|نحت|قوام)/.test(normalized)) return "toning";
    if (/(لياقه|fitness|صحه|نشاط)/.test(normalized)) return "general-fitness";
    return undefined;
  }

  if (key === "gender") {
    if (/(ذكر|رجل|شاب|male)/.test(normalized)) return "male";
    if (/(انثي|انثى|بنت|سيده|ست|female|امراه)/.test(normalized)) return "female";
    return undefined;
  }

  if (key === "age") {
    const value = extractNumber(message);
    return value && value >= 12 && value <= 80 ? value : undefined;
  }

  if (key === "height") {
    const value = extractNumber(message);
    return value && value >= 120 && value <= 230 ? value : undefined;
  }

  if (key === "weight") {
    const value = extractNumber(message);
    return value && value >= 30 && value <= 250 ? value : undefined;
  }

  if (key === "activity") {
    if (/(قليل|ضعيف|منخفض)/.test(normalized)) return "low";
    if (/(متوسط|عادي)/.test(normalized)) return "medium";
    if (/(عالي|عال|مرتفع|كثير)/.test(normalized)) return "high";
    return undefined;
  }

  if (key === "experience") {
    if (/(مبتد|بدايه|جديد)/.test(normalized)) return "beginner";
    if (/(متوسط)/.test(normalized)) return "intermediate";
    if (/(متقدم|احترافي|advanced)/.test(normalized)) return "advanced";
    return undefined;
  }

  if (key === "frequency") {
    const numeric = extractNumber(message);
    if (numeric) {
      if (numeric <= 3) return "low";
      if (numeric <= 5) return "medium";
      return "high";
    }

    if (/(مرتين|ثلاث|2|3)/.test(normalized)) return "low";
    if (/(اربع|خمس|4|5)/.test(normalized)) return "medium";
    if (/(يومي|شبه يومي|6|7)/.test(normalized)) return "high";
    return undefined;
  }

  if (key === "classes" || key === "injuries") {
    if (/(نعم|ايوه|اكيد|yes|عندي|يوجد)/.test(normalized)) return "yes";
    if (/(لا|مش|no|لا يوجد)/.test(normalized)) return "no";
    return undefined;
  }

  if (key === "meals") {
    if (/(ضعيف|سيئ|عشوائي|مش منظم)/.test(normalized)) return "poor";
    if (/(متوسط|عادي)/.test(normalized)) return "average";
    if (/(جيد|ممتاز|منظم|ملتزم)/.test(normalized)) return "good";
    return undefined;
  }

  if (key === "budget") {
    const value = extractNumber(message);
    return value && value > 0 ? value : undefined;
  }

  return undefined;
}

function activityMultiplier(activity?: QuestionnaireAnswers["activity"]) {
  if (activity === "high") return 1.55;
  if (activity === "medium") return 1.4;
  return 1.25;
}

function computeBmi(weight?: number, height?: number) {
  if (!weight || !height) return null;
  const meters = height / 100;
  const bmi = weight / (meters * meters);
  return Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null;
}

function bmiLabel(bmi: number | null) {
  if (!bmi) return null;
  if (bmi < 18.5) return "أقل من الطبيعي";
  if (bmi < 25) return "ضمن الطبيعي";
  if (bmi < 30) return "فوق الطبيعي";
  return "مرتفع";
}

function estimateCalories(answers: QuestionnaireAnswers) {
  if (!answers.gender || !answers.age || !answers.height || !answers.weight) return null;

  const bmr =
    answers.gender === "male"
      ? 10 * answers.weight + 6.25 * answers.height - 5 * answers.age + 5
      : 10 * answers.weight + 6.25 * answers.height - 5 * answers.age - 161;

  const maintenance = Math.round(bmr * activityMultiplier(answers.activity));

  if (answers.goal === "weight-loss") {
    return {
      maintenance,
      target: Math.max(1200, maintenance - 350),
      note: "نرشح لك عجزًا معتدلًا حتى تحافظ على نشاطك وكتلتك العضلية.",
    };
  }

  if (answers.goal === "muscle-gain") {
    return {
      maintenance,
      target: maintenance + 250,
      note: "الأفضل فائض بسيط مع بروتين كافٍ وتمارين مقاومة منتظمة.",
    };
  }

  return {
    maintenance,
    target: maintenance,
    note: "الأفضل الحفاظ على سعرات قريبة من احتياجك اليومي مع توزيع جيد للبروتين.",
  };
}

function buildTrainingAdvice(answers: QuestionnaireAnswers) {
  if (answers.goal === "weight-loss") {
    return "الأنسب لك غالبًا 3 إلى 5 أيام مقاومة أسبوعيًا مع 2 إلى 4 حصص كارديو خفيف إلى متوسط وحركة يومية جيدة.";
  }
  if (answers.goal === "muscle-gain") {
    return "الأنسب لك غالبًا 4 إلى 5 أيام تمارين مقاومة مع زيادة حمل تدريجية وتقليل الكارديو الزائد.";
  }
  if (answers.goal === "toning") {
    return "الأنسب لك دمج تمارين مقاومة منتظمة مع كارديو معتدل وتحكم جيد في الأكل.";
  }
  return "الأنسب لك برنامج متوازن يجمع بين المقاومة والكارديو والحركة اليومية.";
}

function buildNutritionAdvice(answers: QuestionnaireAnswers) {
  const quality =
    answers.meals === "poor"
      ? "ابدأ بتنظيم 3 وجبات واضحة يوميًا وتقليل الحلويات والمشروبات العالية بالسعرات."
      : answers.meals === "average"
        ? "حاول رفع جودة الأكل بزيادة البروتين والخضار وتنظيم الوجبات الخفيفة."
        : "استمر على جودة الأكل الحالية مع ضبط الكميات بما يناسب هدفك.";

  const protein = answers.weight
    ? `واستهدف بروتينًا يوميًا بين ${Math.round(answers.weight * 1.4)} و${Math.round(answers.weight * 2)} جرام تقريبًا.`
    : "واحرص على بروتين كافٍ يوميًا.";

  return `${quality} ${protein}`;
}

function buildSafetyAdvice(answers: QuestionnaireAnswers) {
  if (answers.injuries === "yes") {
    return "بما أنك ذكرت وجود إصابة أو ألم متكرر، فالأفضل البدء تدريجيًا واختيار تمارين مناسبة، ومع الحالات المستمرة يفضّل الرجوع إلى مختص.";
  }

  return "إذا شعرت بألم غير طبيعي أثناء التمرين فأوقف التمرين وراجع المدرب أو المختص.";
}

function goalLabel(goal?: QuestionnaireAnswers["goal"]) {
  if (goal === "weight-loss") return "خسارة الوزن";
  if (goal === "muscle-gain") return "بناء العضلات";
  if (goal === "toning") return "شد الجسم";
  if (goal === "general-fitness") return "تحسين اللياقة العامة";
  return "غير محدد";
}

function experienceLabel(experience?: QuestionnaireAnswers["experience"]) {
  if (experience === "beginner") return "مبتدئ";
  if (experience === "intermediate") return "متوسط";
  if (experience === "advanced") return "متقدم";
  return "غير محدد";
}

function frequencyLabel(frequency?: QuestionnaireAnswers["frequency"]) {
  if (frequency === "low") return "2 إلى 3 مرات أسبوعيًا";
  if (frequency === "medium") return "4 إلى 5 مرات أسبوعيًا";
  if (frequency === "high") return "6 مرات أو أكثر أسبوعيًا";
  return "غير محدد";
}

function activityLabel(activity?: QuestionnaireAnswers["activity"]) {
  if (activity === "low") return "قليل";
  if (activity === "medium") return "متوسط";
  if (activity === "high") return "عالٍ";
  return "غير محدد";
}

function mealsLabel(meals?: QuestionnaireAnswers["meals"]) {
  if (meals === "poor") return "ضعيف";
  if (meals === "average") return "متوسط";
  if (meals === "good") return "جيد";
  return "غير محدد";
}

function yesNoLabel(value?: "yes" | "no") {
  if (value === "yes") return "نعم";
  if (value === "no") return "لا";
  return "غير محدد";
}

async function recommendMembership(answers: QuestionnaireAnswers) {
  const memberships = await db.membership.findMany({
    where: { isActive: true },
    orderBy: { price: "asc" },
  });

  if (memberships.length === 0) return null;

  const scored = memberships.map((membership) => {
    let score = 0;
    const features = (() => {
      try {
        return JSON.parse(membership.features) as string[];
      } catch {
        return [];
      }
    })()
      .join(" ")
      .toLowerCase();

    if (answers.goal === "weight-loss" && /(cardio|كارديو|زومبا|يوجا|تغذيه)/i.test(features)) score += 5;
    if (answers.goal === "muscle-gain" && /(strength|مدرب|عضل|جلسات|مقاومه)/i.test(features)) score += 5;
    if (answers.goal === "toning" && /(classes|كلاسات|يوجا|تقييم)/i.test(features)) score += 4;
    if (answers.classes === "yes" && /(classes|كلاسات|يوجا|زومبا)/i.test(features)) score += 4;
    if (answers.frequency === "high" && (membership.maxClasses === -1 || membership.maxClasses >= 12)) score += 4;
    if (answers.frequency === "medium" && (membership.maxClasses === -1 || membership.maxClasses >= 8)) score += 3;
    if (answers.experience === "beginner" && membership.price <= 700) score += 3;
    if (answers.experience === "advanced" && membership.price >= 500) score += 2;
    if (answers.injuries === "yes" && /(مدرب|جلسات|متابعه)/i.test(features)) score += 3;

    if (typeof answers.budget === "number") {
      const diff = Math.abs(membership.price - answers.budget);
      score += Math.max(0, 6 - diff / 100);
      if (membership.price > answers.budget * 1.35) score -= 4;
    }

    return { membership, score };
  });

  scored.sort((a, b) => b.score - a.score || a.membership.price - b.membership.price);
  return scored[0]?.membership ?? null;
}

async function loadKnowledgeEntries() {
  try {
    const entries = await db.chatKnowledgeEntry.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    });

    return entries.map((entry) => ({
      keywords: parseKeywords(entry.keywords),
      answer: entry.answer,
      priority: entry.priority,
    }));
  } catch {
    return [];
  }
}

function matchFaq(message: string, entries: FaqEntry[]) {
  const normalized = normalizeArabic(message);
  const tokens = normalized.split(" ").filter(Boolean);

  let bestEntry: FaqEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const score =
      entry.keywords.reduce((total, keyword) => {
        const normalizedKeyword = normalizeArabic(keyword);
        if (normalized.includes(normalizedKeyword)) return total + 3;
        if (tokens.some((token) => normalizedKeyword.includes(token) || token.includes(normalizedKeyword))) {
          return total + 1;
        }
        return total;
      }, 0) + Math.max(0, entry.priority ?? 0);

    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestScore >= 3 ? bestEntry : null;
}

function buildMembershipReason(answers: QuestionnaireAnswers, membershipName?: string) {
  if (!membershipName) return null;

  const reasons: string[] = [];

  if (answers.goal === "weight-loss") reasons.push("هدفك الحالي هو خسارة الوزن");
  if (answers.goal === "muscle-gain") reasons.push("هدفك الحالي هو بناء العضلات");
  if (answers.goal === "toning") reasons.push("هدفك الحالي هو شد الجسم");
  if (answers.classes === "yes") reasons.push("أنت مهتم بالكلاسات الجماعية");
  if (answers.frequency === "high") reasons.push("معدل تمرينك المتوقع مرتفع");
  if (answers.frequency === "medium") reasons.push("معدل تمرينك المتوقع متوسط ومنتظم");
  if (typeof answers.budget === "number") reasons.push(`ميزانيتك التقريبية في حدود ${answers.budget} ج.م`);
  if (answers.injuries === "yes") reasons.push("تحتاج باقة تسمح بمرونة ومراعاة حالتك");

  if (reasons.length === 0) {
    return `الباقة الأقرب لك حاليًا هي ${membershipName} لأنها الأنسب لهدفك ومستوى التزامك الحالي.`;
  }

  return `رشحت لك باقة ${membershipName} لأن ${reasons.slice(0, 3).join("، ")}.`;
}

function buildClientSummary(answers: QuestionnaireAnswers) {
  const summary = [
    `الهدف: ${goalLabel(answers.goal)}`,
    `العمر: ${answers.age ?? "غير محدد"} سنة`,
    `الطول: ${answers.height ?? "غير محدد"} سم`,
    `الوزن: ${answers.weight ?? "غير محدد"} كجم`,
    `النشاط اليومي: ${activityLabel(answers.activity)}`,
    `الخبرة: ${experienceLabel(answers.experience)}`,
    `عدد مرات التمرين المتوقع: ${frequencyLabel(answers.frequency)}`,
    `يفضل الكلاسات: ${yesNoLabel(answers.classes)}`,
    `يوجد إصابات أو آلام: ${yesNoLabel(answers.injuries)}`,
    `مستوى الأكل الحالي: ${mealsLabel(answers.meals)}`,
    `الميزانية: ${answers.budget ? `${answers.budget} ج.م` : "غير محددة"}`,
  ];

  return summary.join("\n");
}

function buildFinalAssessment(answers: QuestionnaireAnswers, membershipName?: string, membershipPrice?: number) {
  const bmi = computeBmi(answers.weight, answers.height);
  const bmiState = bmiLabel(bmi);
  const calories = estimateCalories(answers);
  const reason = buildMembershipReason(answers, membershipName);

  const lines = [
    "أنهيت تقييمك المبدئي، وهذه خلاصة واضحة مبنية على إجاباتك:",
    buildClientSummary(answers),
    bmi ? `مؤشر كتلة الجسم التقريبي لديك: ${bmi} (${bmiState}).` : null,
    calories
      ? `سعرات الحفاظ التقريبية: ${calories.maintenance}، والهدف الغذائي المبدئي المناسب لك حاليًا: ${calories.target}. ${calories.note}`
      : null,
    `الخطة التدريبية المقترحة: ${buildTrainingAdvice(answers)}`,
    `النصيحة الغذائية: ${buildNutritionAdvice(answers)}`,
    `تنبيه مهم: ${buildSafetyAdvice(answers)}`,
    membershipName
      ? `${reason}${membershipPrice ? ` وسعرها ${membershipPrice} ج.م.` : ""}`
      : "لم أجد باقة مفعلة مناسبة في النظام الآن، لكن يمكنني تحويلك إلى الدعم المباشر لإكمال الترشيح.",
    "هل يمكنني مساعدتك في أي شيء تاني؟ اكتب نعم للاستمرار أو لا لإنهاء المحادثة.",
  ].filter(Boolean);

  return lines.join("\n\n");
}

async function fallbackGeneralReply(message: string, stage: ChatContext["stage"]) {
  const storedEntries = await loadKnowledgeEntries();
  const faq = matchFaq(message, [...storedEntries, ...FAQ_ENTRIES]);

  if (faq) {
    const question = nextQuestion(stage);
    return question ? `${faq.answer}\n\nولو تحب نكمل التقييم خطوة بخطوة: ${question}` : faq.answer;
  }

  const question = nextQuestion(stage);
  if (question) {
    return `يمكنني مساعدتك في اللياقة، التغذية، واختيار الاشتراك المناسب. ${question}`;
  }

  return "يمكنني مساعدتك في تقييم اللياقة أو التخسيس أو بناء العضلات، ثم أرشح لك الباقة الأقرب أو أحولك إلى الدعم المباشر.";
}

async function createBotMessage(sessionId: string, content: string, metadata?: Record<string, unknown>) {
  await db.chatMessage.create({
    data: {
      sessionId,
      senderType: "bot",
      senderName: "مساعد فيت زون",
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}

export async function initializeChatSession(sessionId: string) {
  const session = await db.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) return null;
  if (session.messages.length > 0) return session;

  await createBotMessage(
    sessionId,
    `${QUESTION_TEXT.goal}\n\nبعد إجاباتك سأعطيك تقييمًا مبدئيًا واضحًا وملخصًا لحالتك، ثم أرشح لك الباقة الأقرب لاحتياجك.`,
  );

  await db.chatSession.update({
    where: { id: sessionId },
    data: {
      context: serializeContext(DEFAULT_CONTEXT),
      status: "open",
      mode: "bot",
      lastMessageAt: new Date(),
    },
  });

  return db.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      recommendedMembership: true,
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

async function closeConversation(sessionId: string) {
  await db.chatSession.update({
    where: { id: sessionId },
    data: {
      status: "resolved",
      mode: "bot",
      context: serializeContext({
        stage: "done",
        answers: {},
        awaitingContinuation: false,
      }),
      recommendedMembershipId: null,
      lastMessageAt: new Date(),
    },
  });

  await createBotMessage(sessionId, "تم إنهاء المحادثة الحالية. إذا أرسلت رسالة جديدة سأبدأ معك محادثة جديدة بالكامل.", {
    closeSession: true,
  });
}

async function transferToLiveSupport(sessionId: string) {
  const support = await db.user.findFirst({
    where: {
      role: { in: ["admin", "staff"] },
      supportPresence: { isOnline: true },
    },
    include: { supportPresence: true },
    orderBy: { createdAt: "asc" },
  });

  await db.chatSession.update({
    where: { id: sessionId },
    data: {
      mode: "live",
      status: "live",
      assignedToId: support?.id ?? null,
      lastMessageAt: new Date(),
    },
  });

  await db.chatMessage.create({
    data: {
      sessionId,
      senderType: "system",
      senderName: "النظام",
      content: support
        ? `تم تحويل المحادثة إلى ${support.name || support.email || "موظف الدعم"} وسيقوم بالرد عليك قريبًا.`
        : "تم تسجيل طلبك للتحدث مع موظف. لا يوجد موظف متاح الآن، وسيتم الرد عليك عند توفر الدعم.",
    },
  });
}

function isPositiveReply(text: string) {
  return /^(نعم|ايوه|أيوه|اكيد|أكيد|yes|y|طبعا|طبعا)/i.test(text.trim());
}

function isNegativeReply(text: string) {
  return /^(لا|لأ|لاء|مش|كفاية|خلاص|no|n)/i.test(text.trim());
}

function wantsLiveSupport(text: string) {
  const normalized = normalizeArabic(text);
  return /(موظف|خدمه عملاء|دعم|بشر|حد يكلمني|اكلم موظف|التحدث مع موظف)/.test(normalized);
}

export async function generateBotReply(sessionId: string, userMessage: string) {
  const session = await db.chatSession.findUnique({
    where: { id: sessionId },
    include: { recommendedMembership: true },
  });

  if (!session) return null;

  const context = parseContext(session.context);

  if (wantsLiveSupport(userMessage)) {
    await transferToLiveSupport(sessionId);
    return db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  if (context.stage === "done" && context.awaitingContinuation) {
    if (isPositiveReply(userMessage)) {
      const updatedContext: ChatContext = {
        ...context,
        awaitingContinuation: false,
      };

      await db.chatSession.update({
        where: { id: sessionId },
        data: {
          context: serializeContext(updatedContext),
          status: "open",
          lastMessageAt: new Date(),
        },
      });

      await createBotMessage(
        sessionId,
        "أكيد، أنا معك. اكتب سؤالك الجديد أو قل لي هل تريد الاستفسار عن التمارين أو التغذية أو الباقات أو الكلاسات.",
      );
    } else if (isNegativeReply(userMessage)) {
      await closeConversation(sessionId);
    } else {
      await createBotMessage(
        sessionId,
        "إذا كنت تريد الاستمرار اكتب نعم، وإذا كنت تريد إنهاء المحادثة الحالية اكتب لا.",
      );
    }

    return db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  if (context.stage === "done") {
    const reply = await fallbackGeneralReply(userMessage, context.stage);
    await createBotMessage(sessionId, reply);
    return db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  const parsedAnswer = parseAnswer(context.stage, userMessage);

  if (typeof parsedAnswer === "undefined") {
    const faqReply = await fallbackGeneralReply(userMessage, context.stage);
    await createBotMessage(sessionId, faqReply);

    return db.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        recommendedMembership: true,
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }

  const updatedAnswers: QuestionnaireAnswers = {
    ...context.answers,
    [context.stage]: parsedAnswer,
  };

  const nextStage = getNextStage(context.stage);

  if (nextStage === "done") {
    const membership = await recommendMembership(updatedAnswers);
    const finalReply = buildFinalAssessment(updatedAnswers, membership?.name, membership?.price);

    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        context: serializeContext({
          stage: "done",
          answers: updatedAnswers,
          awaitingContinuation: true,
        }),
        recommendedMembershipId: membership?.id ?? null,
        status: "open",
        lastMessageAt: new Date(),
      },
    });

    await createBotMessage(
      sessionId,
      finalReply,
      membership ? { membershipId: membership.id } : undefined,
    );
  } else {
    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        context: serializeContext({
          stage: nextStage,
          answers: updatedAnswers,
        }),
        lastMessageAt: new Date(),
      },
    });

    await createBotMessage(sessionId, QUESTION_TEXT[nextStage]);
  }

  return db.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      recommendedMembership: true,
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export function serializeMessages<T extends { metadata: string | null }>(messages: T[]) {
  return messages.map((message) => ({
    ...message,
    metadata: (() => {
      try {
        return message.metadata ? JSON.parse(message.metadata) : null;
      } catch {
        return null;
      }
    })(),
  }));
}
