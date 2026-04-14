import type {
  CoachConversationContext,
  CoachLang,
  CoachQuestionnaireState,
  QuestionKey,
  QuestionnaireAnswers,
} from "@/lib/ai-coach/types";

export const QUESTION_ORDER: QuestionKey[] = [
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

export const QUESTION_TEXT: Record<CoachLang, Record<QuestionKey, string>> = {
  ar: {
    goal: "أهلًا بكِ في AI Coach من FitZone. ما هدفك الأساسي الآن: خسارة الوزن، بناء العضلات، شد الجسم، أم تحسين اللياقة العامة؟",
    gender: "هل أنتِ ذكر أم أنثى؟ هذا يساعدني على ترشيح خطة أقرب لاحتياجك.",
    age: "كم عمرك؟ اكتبي الرقم فقط.",
    height: "ما طولك بالسنتيمتر؟ مثال: 170",
    weight: "ما وزنك الحالي بالكيلو؟ مثال: 78",
    activity: "ما مستوى نشاطك اليومي خارج التمرين: قليل، متوسط، أم عالٍ؟",
    experience: "ما مستواك الحالي في التمرين: مبتدئ، متوسط، أم متقدم؟",
    frequency: "كم مرة تتوقعين أن تتمرني أسبوعيًا؟ مثال: 2 أو 4 أو 6",
    classes: "هل تفضلين الكلاسات الجماعية؟ اكتبي نعم أو لا.",
    injuries: "هل لديكِ إصابة أو ألم متكرر أو حالة صحية يجب مراعاتها؟ اكتبي نعم أو لا.",
    meals: "كيف هو نظام أكلك الحالي: ضعيف، متوسط، أم جيد؟",
    budget: "ما الميزانية الشهرية المناسبة لك تقريبًا بالجنيه المصري؟",
  },
  en: {
    goal: "Welcome to FitZone AI Coach. What is your main goal right now: weight loss, muscle gain, toning, or general fitness?",
    gender: "Are you male or female? This helps me recommend a better fit.",
    age: "How old are you? Please enter numbers only.",
    height: "What is your height in centimeters? Example: 170",
    weight: "What is your current weight in kilograms? Example: 78",
    activity: "How active are you outside training: low, medium, or high?",
    experience: "What is your current training level: beginner, intermediate, or advanced?",
    frequency: "How many times do you expect to train weekly? Example: 2, 4, or 6",
    classes: "Do you prefer group classes? Reply yes or no.",
    injuries: "Do you have any injury, recurring pain, or health condition we should consider? Reply yes or no.",
    meals: "How is your current nutrition: poor, average, or good?",
    budget: "What monthly budget feels suitable for you in EGP?",
  },
};

export function createDefaultContext(lang: CoachLang = "ar"): CoachConversationContext {
  return {
    version: 1,
    lang,
    questionnaire: {
      stage: "idle",
      answers: {},
      awaitingContinuation: false,
    },
  };
}

export function parseCoachContext(raw: string | null | undefined, lang: CoachLang = "ar"): CoachConversationContext {
  if (!raw) return createDefaultContext(lang);

  try {
    const parsed = JSON.parse(raw) as Partial<CoachConversationContext & CoachQuestionnaireState>;
    if ("questionnaire" in parsed) {
      return {
        version: 1,
        lang: parsed.lang === "en" ? "en" : lang,
        lastIntent: parsed.lastIntent,
        questionnaire: {
          stage: parsed.questionnaire?.stage ?? "idle",
          answers: parsed.questionnaire?.answers ?? {},
          awaitingContinuation: Boolean(parsed.questionnaire?.awaitingContinuation),
        },
      };
    }

    return {
      version: 1,
      lang,
      questionnaire: {
        stage: parsed.stage ?? "idle",
        answers: parsed.answers ?? {},
        awaitingContinuation: Boolean(parsed.awaitingContinuation),
      },
    };
  } catch {
    return createDefaultContext(lang);
  }
}

export function serializeCoachContext(context: CoachConversationContext) {
  return JSON.stringify(context);
}

export function startQuestionnaire(context: CoachConversationContext) {
  return {
    ...context,
    questionnaire: {
      stage: "goal" as const,
      answers: {},
      awaitingContinuation: false,
    },
  };
}

export function getNextStage(current: QuestionKey): QuestionKey | "done" {
  const index = QUESTION_ORDER.indexOf(current);
  return index === QUESTION_ORDER.length - 1 ? "done" : QUESTION_ORDER[index + 1];
}

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

function extractNumber(message: string) {
  const value = Number(normalize(message).match(/\d+/)?.[0]);
  return Number.isFinite(value) ? value : undefined;
}

export function isPositiveReply(text: string) {
  return /^(نعم|ايوه|أيوه|اكيد|أكيد|yes|y|sure|ok)/i.test(text.trim());
}

export function isNegativeReply(text: string) {
  return /^(لا|لأ|خلاص|مش|no|n|stop)/i.test(text.trim());
}

export function parseQuestionnaireAnswer(
  key: QuestionKey,
  message: string,
): QuestionnaireAnswers[QuestionKey] | undefined {
  const normalized = normalize(message);

  if (key === "goal") {
    if (/(تخسيس|تنحيف|وزن|دهون|حرق|weight loss)/.test(normalized)) return "weight-loss";
    if (/(عضل|عضلات|تضخيم|بناء|muscle)/.test(normalized)) return "muscle-gain";
    if (/(شد|نحت|toning)/.test(normalized)) return "toning";
    if (/(لياقه|fitness|general)/.test(normalized)) return "general-fitness";
    return undefined;
  }

  if (key === "gender") {
    if (/(ذكر|male|man|boy)/.test(normalized)) return "male";
    if (/(انثى|انثي|female|woman|girl|سيده)/.test(normalized)) return "female";
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
    if (/(قليل|low|خفيف)/.test(normalized)) return "low";
    if (/(متوسط|medium|average)/.test(normalized)) return "medium";
    if (/(عالي|عال|high|active)/.test(normalized)) return "high";
    return undefined;
  }

  if (key === "experience") {
    if (/(مبتدئ|beginner|new)/.test(normalized)) return "beginner";
    if (/(متوسط|intermediate)/.test(normalized)) return "intermediate";
    if (/(متقدم|advanced|pro)/.test(normalized)) return "advanced";
    return undefined;
  }

  if (key === "frequency") {
    const value = extractNumber(message);
    if (value) {
      if (value <= 3) return "low";
      if (value <= 5) return "medium";
      return "high";
    }
    return parseQuestionnaireAnswer("activity", message);
  }

  if (key === "classes" || key === "injuries") {
    if (/(نعم|ايوه|أيوه|yes|y)/.test(normalized)) return "yes";
    if (/(لا|لأ|no|n)/.test(normalized)) return "no";
    return undefined;
  }

  if (key === "meals") {
    if (/(ضعيف|poor|bad)/.test(normalized)) return "poor";
    if (/(متوسط|average|normal)/.test(normalized)) return "average";
    if (/(جيد|good|great)/.test(normalized)) return "good";
    return undefined;
  }

  if (key === "budget") {
    const value = extractNumber(message);
    return value && value > 0 ? value : undefined;
  }

  return undefined;
}
