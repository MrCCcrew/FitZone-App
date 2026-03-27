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
  goal: "أهلاً بك في فت زون. ما هدفك الأساسي الآن: التخسيس، شد الجسم، بناء العضلات، أم اللياقة العامة؟",
  gender: "لأجل ترشيح أدق، هل أنت ذكر أم أنثى؟",
  age: "كم عمرك؟ اكتب الرقم فقط.",
  height: "ما طولك بالسنتيمتر؟ مثال: 175",
  weight: "ما وزنك الحالي بالكيلو؟ مثال: 82",
  activity: "ما مستوى نشاطك اليومي خارج التمرين: قليل، متوسط، أم عالٍ؟",
  experience: "ما مستواك الحالي في التمرين: مبتدئ، متوسط، أم متقدم؟",
  frequency: "كم مرة تتوقع أن تتمرن أسبوعياً؟ 2-3 مرات، 4-5 مرات، أم شبه يومي؟",
  classes: "هل تفضل الكلاسات الجماعية مثل الكارديو أو الزومبا أو اليوجا؟ اكتب نعم أو لا.",
  injuries: "هل لديك إصابة أو ألم متكرر أو حالة صحية يجب مراعاتها؟ اكتب نعم أو لا.",
  meals: "كيف هو نظام أكلك حالياً: ضعيف، متوسط، أم جيد؟",
  budget: "ما الميزانية الشهرية المناسبة لك تقريباً بالجنيه؟",
};

const DEFAULT_CONTEXT: ChatContext = {
  stage: "goal",
  answers: {},
};

const FAQ_ENTRIES: FaqEntry[] = [
  {
    keywords: ["تخسيس", "تنحيف", "نزول وزن", "حرق", "دهون", "رجيم"],
    answer:
      "التخسيس الفعلي يعتمد على عجز سعرات مناسب مع تمارين مقاومة وكارديو ونوم جيد. الهدف ليس الحرمان، بل الاستمرارية والحفاظ على الكتلة العضلية.",
  },
  {
    keywords: ["عضل", "عضلات", "تضخيم", "كتلة", "بناء جسم"],
    answer:
      "بناء العضلات يحتاج تمارين مقاومة منتظمة، بروتين كافٍ، وزيادة حمل تدريجية. أفضل نتيجة تكون غالباً مع الالتزام من 3 إلى 5 أيام أسبوعياً.",
  },
  {
    keywords: ["شد", "نحت", "قوام"],
    answer:
      "شد الجسم يحتاج دمج تمارين مقاومة مع تحكم جيد في التغذية وتقليل نسبة الدهون بشكل تدريجي، وليس كارديو فقط.",
  },
  {
    keywords: ["أكل", "غذاء", "دايت", "وجبات", "سعرات", "سناك"],
    answer:
      "أفضل نظام غذائي هو الذي تستطيع الالتزام به. نبدأ عادة بتنظيم الوجبات، رفع البروتين، زيادة الخضار، وتقليل المشروبات السكرية والأطعمة العالية بالسعرات.",
  },
  {
    keywords: ["مكمل", "مكملات", "بروتين", "كرياتين"],
    answer:
      "المكملات ليست الأساس. الأولوية دائماً للأكل والنوم والتمرين. وإذا لديك حالة صحية خاصة فاستشر مختصاً قبل استخدام أي مكمل.",
  },
  {
    keywords: ["كارديو", "مشي", "جري", "دهون"],
    answer:
      "الكارديو مفيد جداً لصحة القلب وزيادة الصرف الحراري، لكن أفضل نتيجة عادة تكون عند دمجه مع تمارين مقاومة للحفاظ على الشكل والعضلات.",
  },
  {
    keywords: ["سعر", "أسعار", "اشتراك", "باقات", "باقة"],
    answer:
      "لدينا أكثر من باقة حسب الهدف والميزانية وعدد مرات التمرين. أقدر أرشح لك الأنسب إذا أكملت معي التقييم السريع.",
  },
  {
    keywords: ["إصابة", "ألم", "ركبة", "ظهر", "مفصل"],
    answer:
      "إذا لديك إصابة أو ألم متكرر، فالأفضل أن نراعي ذلك عند اختيار التمارين ونبدأ بشكل تدريجي. وفي الحالات الطبية المستمرة يفضل الرجوع إلى مختص.",
  },
  {
    keywords: ["كلاس", "كلاسات", "حجز", "يوجا", "زومبا", "مواعيد"],
    answer:
      "يمكنني مساعدتك في ترشيح باقة مناسبة أو تحويلك للدعم المباشر. وإذا كنت تريد موظفاً مباشرة فاكتب: أريد التحدث مع موظف.",
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
    if (/(عضل|عضلات|كتله|بناء|تضخيم)/.test(normalized)) return "muscle-gain";
    if (/(شد|قوام|نحت)/.test(normalized)) return "toning";
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
    if (/(عال|مرتفع|كثير)/.test(normalized)) return "high";
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
    if (/(ضعيف|سيء|عشوائي|مش منظم)/.test(normalized)) return "poor";
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
      note: "ابدأ بعجز معتدل حتى تحافظ على نشاطك وكتلتك العضلية.",
    };
  }

  if (answers.goal === "muscle-gain") {
    return {
      maintenance,
      target: maintenance + 250,
      note: "ابدأ بفائض بسيط مع بروتين كافٍ وتمارين مقاومة منتظمة.",
    };
  }

  return {
    maintenance,
    target: maintenance,
    note: "حافظ على سعرات قريبة من احتياجك اليومي مع توزيع جيد للبروتين.",
  };
}

function buildTrainingAdvice(answers: QuestionnaireAnswers) {
  if (answers.goal === "weight-loss") {
    return "الأنسب لك غالباً: 3 إلى 5 أيام مقاومة أسبوعياً مع 2 إلى 4 حصص كارديو خفيف إلى متوسط وحركة يومية جيدة.";
  }
  if (answers.goal === "muscle-gain") {
    return "الأنسب لك غالباً: 4 إلى 5 أيام تمارين مقاومة مع زيادة حمل تدريجية وتقليل الكارديو الزائد.";
  }
  if (answers.goal === "toning") {
    return "الأنسب لك غالباً: دمج تمارين مقاومة منتظمة مع كارديو معتدل وتحكم جيد في الأكل.";
  }
  return "الأنسب لك غالباً: برنامج متوازن يجمع بين المقاومة والكارديو والحركة اليومية.";
}

function buildNutritionAdvice(answers: QuestionnaireAnswers) {
  const quality =
    answers.meals === "poor"
      ? "ابدأ بتنظيم 3 وجبات واضحة يومياً وتقليل الحلويات والمشروبات العالية بالسعرات."
      : answers.meals === "average"
        ? "حاول رفع جودة الأكل بزيادة البروتين والخضار وتنظيم الوجبات الخفيفة."
        : "استمر على جودة الأكل الحالية مع ضبط الكميات بما يناسب هدفك.";

  const protein = answers.weight
    ? `استهدف بروتيناً يومياً بين ${Math.round(answers.weight * 1.4)} و${Math.round(answers.weight * 2)} جرام تقريباً.`
    : "احرص على بروتين كافٍ يومياً.";

  return `${quality} ${protein}`;
}

function buildSafetyAdvice(answers: QuestionnaireAnswers) {
  if (answers.injuries === "yes") {
    return "بما أنك ذكرت وجود إصابة أو ألم متكرر، فالأفضل البدء تدريجياً ومراعاة التمارين المناسبة، ومع الحالات المستمرة يفضل الرجوع إلى مختص.";
  }
  return "إذا شعرت بألم غير طبيعي أثناء التمرين فأوقف التمرين وراجع المدرب أو المختص.";
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
    if (answers.goal === "muscle-gain" && /(strength|مدرب|عضل|جلسات)/i.test(features)) score += 5;
    if (answers.goal === "toning" && /(classes|كلاسات|يوجا|تقييم)/i.test(features)) score += 4;
    if (answers.classes === "yes" && /(classes|كلاسات|يوجا|زومبا)/i.test(features)) score += 4;
    if (answers.frequency === "high" && (membership.maxClasses === -1 || membership.maxClasses >= 12)) score += 4;
    if (answers.frequency === "medium" && membership.maxClasses >= 8) score += 3;
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

function buildFinalAssessment(answers: QuestionnaireAnswers, membershipName?: string, membershipPrice?: number) {
  const bmi = computeBmi(answers.weight, answers.height);
  const bmiState = bmiLabel(bmi);
  const calories = estimateCalories(answers);

  const lines = [
    "هذا تقييم مبدئي آلي لمساعدتك في اختيار المسار الأنسب داخل النادي.",
    bmi ? `مؤشر الكتلة التقريبي لديك: ${bmi} (${bmiState}).` : null,
    calories
      ? `سعرات المحافظة التقريبية: ${calories.maintenance}، والهدف المقترح حالياً: ${calories.target}. ${calories.note}`
      : null,
    buildTrainingAdvice(answers),
    buildNutritionAdvice(answers),
    buildSafetyAdvice(answers),
    membershipName
      ? `الباقة الأقرب لك حالياً هي: ${membershipName}${membershipPrice ? ` بسعر ${membershipPrice} ج.م` : ""}.`
      : null,
  ].filter(Boolean);

  return lines.join("\n\n");
}

async function fallbackGeneralReply(message: string, stage: ChatContext["stage"]) {
  const storedEntries = await loadKnowledgeEntries();
  const faq = matchFaq(message, [...storedEntries, ...FAQ_ENTRIES]);

  if (faq) {
    const question = nextQuestion(stage);
    return question ? `${faq.answer}\n\nإذا أردت أكمل معك التقييم: ${question}` : faq.answer;
  }

  const question = nextQuestion(stage);
  if (question) {
    return `أستطيع مساعدتك في التخسيس واللياقة والتغذية واختيار الاشتراك المناسب. ${question}`;
  }

  return "أستطيع مساعدتك في التقييم المبدئي للياقة أو التخسيس أو بناء العضلات، ثم أرشح لك الباقة المناسبة أو أحولك لموظف مباشر.";
}

export async function initializeChatSession(sessionId: string) {
  const session = await db.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) return null;
  if (session.messages.length > 0) return session;

  await db.chatMessage.create({
    data: {
      sessionId,
      senderType: "bot",
      senderName: "مساعد فت زون",
      content: `${QUESTION_TEXT.goal}\n\nبعد الإجابات سأعطيك تقييماً مبدئياً وأرشح لك الباقة الأقرب لك.`,
    },
  });

  return db.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function generateBotReply(sessionId: string, userMessage: string) {
  const session = await db.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;

  const context = parseContext(session.context);
  const stage = context.stage;
  const normalized = normalizeArabic(userMessage);

  if (/موظف|ادمن|انسان|شخص حقيقي|خدمه عملاء|دعم مباشر/.test(normalized)) {
    const onlineCount = await db.supportPresence.count({
      where: { isOnline: true, lastSeenAt: { gte: new Date(Date.now() - 2 * 60 * 1000) } },
    });

    const content =
      onlineCount > 0
        ? "تم تحويل المحادثة للدعم المباشر. يوجد مسؤول متاح الآن وسيتم الرد عليك هنا خلال لحظات."
        : "تم تسجيل طلبك للدعم المباشر. إذا لم يكن أحد متاحاً الآن فسأستمر معك لحين دخول الإدارة.";

    await db.chatSession.update({
      where: { id: sessionId },
      data: { mode: "live", status: "live", lastMessageAt: new Date() },
    });

    return db.chatMessage.create({
      data: {
        sessionId,
        senderType: "bot",
        senderName: "مساعد فت زون",
        content,
      },
    });
  }

  if (stage !== "done") {
    const parsedAnswer = parseAnswer(stage, userMessage);

    if (!parsedAnswer) {
      return db.chatMessage.create({
        data: {
          sessionId,
          senderType: "bot",
          senderName: "مساعد فت زون",
          content: await fallbackGeneralReply(userMessage, stage),
        },
      });
    }

    const nextAnswers = {
      ...context.answers,
      [stage]: parsedAnswer,
    };

    const nextStage = getNextStage(stage);

    if (nextStage !== "done") {
      await db.chatSession.update({
        where: { id: sessionId },
        data: {
          context: serializeContext({ stage: nextStage, answers: nextAnswers }),
          lastMessageAt: new Date(),
        },
      });

      return db.chatMessage.create({
        data: {
          sessionId,
          senderType: "bot",
          senderName: "مساعد فت زون",
          content: nextQuestion(nextStage) ?? "ممتاز، أكمل معي.",
        },
      });
    }

    const recommendation = await recommendMembership(nextAnswers);
    const assessment = buildFinalAssessment(nextAnswers, recommendation?.name, recommendation?.price);

    await db.chatSession.update({
      where: { id: sessionId },
      data: {
        context: serializeContext({ stage: "done", answers: nextAnswers }),
        recommendedMembershipId: recommendation?.id,
        lastMessageAt: new Date(),
      },
    });

    return db.chatMessage.create({
      data: {
        sessionId,
        senderType: "bot",
        senderName: "مساعد فت زون",
        content: `${assessment}\n\nإذا أردت أسئلة إضافية أو موظفاً مباشراً فاكتب: أريد التحدث مع موظف.`,
        metadata: recommendation ? JSON.stringify({ membershipId: recommendation.id }) : null,
      },
    });
  }

  const recommendation = session.recommendedMembershipId
    ? await db.membership.findUnique({ where: { id: session.recommendedMembershipId } })
    : null;
  const storedEntries = await loadKnowledgeEntries();
  const faq = matchFaq(userMessage, [...storedEntries, ...FAQ_ENTRIES]);

  return db.chatMessage.create({
    data: {
      sessionId,
      senderType: "bot",
      senderName: "مساعد فت زون",
      content:
        faq?.answer ||
        (recommendation
          ? `ما زالت الباقة الأقرب لك هي ${recommendation.name}. إذا أردت أشرح لك سبب الترشيح أو أحولك لموظف مباشر.`
          : "أستطيع مساعدتك في أسئلة التخسيس واللياقة والتغذية واختيار الباقة المناسبة، أو تحويلك للدعم المباشر."),
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
