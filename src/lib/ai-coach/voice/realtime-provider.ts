import type { RealtimeVoiceProvider } from "@/lib/ai-coach/voice/types";
import { configuredCoachVoice, configuredRealtimeFallbackModel, configuredRealtimeModel, voiceDebugEnabled } from "@/lib/ai-coach/voice/config";

const endpoint = "https://api.openai.com/v1/realtime/client_secrets";

export const realtimeToolDefinitions = [
  ["searchMemberships", "Find available membership plans and current pricing."],
  ["searchPackages", "Find available FitZone packages only; do not return subscriptions or customization offers."],
  ["searchOffers", "Find current public offers."],
  ["searchProducts", "Find visible store products."],
  ["searchClassSchedule", "Find published class schedules and distinguish missing classes, schedules, past schedules, and unavailable booking slots."],
  ["getAccountSummary", "Read only the current caller's own account summary."],
  ["getPageLink", "Return an allowlisted FitZone page link."],
  ["searchTrainers", "Find visible active FitZone trainers."],
  ["searchGoals", "Find visible FitZone goals and linked memberships."],
  ["searchTrialClasses", "Find bookable upcoming trial classes."],
  ["getNutritionDoctor", "Read the published nutrition doctor profile if available."],
  ["getSiteOverview", "Summarize only currently available FitZone site sections."],
] as const;

function instructions(lang: "ar" | "en") {
  return `${lang === "ar" ? "أنتِ مساعدة FitZone الصوتية." : "You are FitZone's voice assistant."}
تحدثي بالعربية المصرية الطبيعية، وافهمي العامية العادية والريفية والصعيدية قدر الإمكان بدون ذكر أو تصنيف لهجة العميلة. استخدمي الفصحى فقط عند الحاجة للوضوح.
صوتك نسائي طبيعي ودافئ وودود وواثق، مثل موظفة استقبال ومدربة مصرية حقيقية؛ ليس روبوتيًا ولا إخباريًا. استخدمي جملًا قصيرة وتوقفات طبيعية، بلا مبالغة أو مد حروف أو نبرة أطفال أو لهجة ساخرة، ولا تكرري المقدمة.
السرعة طبيعية. توقفي قليلًا بين السعر واسم الباقة، ولا تقرئي قوائم طويلة: عند كثرة النتائج اذكري أهم 3 ثم أخبريها أن الباقي ظاهر على الشاشة.
النطق: FitZone = فيت زون، Kick Boxing = كيك بوكس، Pilates = بيلاتس، Yoga = يوجا. لا تنطقي URLs أو metadata، وانطقي الأسعار والمواعيد بالمصري بوضوح.
لا تكشفي بيانات أي شخص آخر، ولا تنفذي كتابة أو دفع أو تعديل أو SQL أو صلاحيات. ارفضي تلك الطلبات بوضوح.
للأسعار والعروض والمنتجات والكلاسات والحساب والروابط استخدمي فقط أداة FitZone المناسبة. لا تخترعي بيانات حية. الأدوات للقراءة فقط، ومرري السؤال كما فهمتيه في query.
FitZone، كيك بوكس، بيلاتس، يوجا، كاراتيه، جمباز. لا تذكري زرًا إلا إذا كان ظاهرًا.`;
}

export const openAiRealtimeProvider: RealtimeVoiceProvider = {
  async createSession({ sessionId: _sessionId, lang, voice: requestedVoice }) {
    if (!process.env.OPENAI_API_KEY) throw new Error("REALTIME_NOT_CONFIGURED");
    const voice = configuredCoachVoice(requestedVoice); const primary = configuredRealtimeModel(); const fallback = configuredRealtimeFallbackModel();
    const issue = async (model: string) => fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        session: {
          type: "realtime", model, output_modalities: ["audio"], instructions: instructions(lang), reasoning: { effort: "low" },
          audio: { input: { turn_detection: { type: "server_vad", threshold: 0.25, prefix_padding_ms: 500, silence_duration_ms: 900, create_response: true, interrupt_response: true } }, output: { voice } },
          tools: realtimeToolDefinitions.map(([name, description]) => ({ type: "function", name, description, parameters: { type: "object", properties: { query: { type: "string", maxLength: 1800 }, pageId: { type: "string", maxLength: 64 } }, additionalProperties: false } })),
          tool_choice: "auto", tracing: null,
        },
      }), signal: AbortSignal.timeout(10_000),
    });
    let response = await issue(primary); let usedModel = primary; let fallbackUsed = false;
    if (!response.ok && response.status === 404 && fallback && fallback !== primary) { response = await issue(fallback); usedModel = fallback; fallbackUsed = true; }
    const data = await response.json().catch(() => null) as { value?: unknown; client_secret?: { value?: unknown; expires_at?: unknown }; expires_at?: unknown } | null;
    const token = typeof data?.value === "string" ? data.value : typeof data?.client_secret?.value === "string" ? data.client_secret.value : null;
    const expiresAt = typeof data?.expires_at === "number" ? new Date(data.expires_at * 1000).toISOString() : typeof data?.client_secret?.expires_at === "number" ? new Date(data.client_secret.expires_at * 1000).toISOString() : new Date(Date.now() + 60_000).toISOString();
    if (!response.ok || !token) throw new Error(response.status === 401 || response.status === 403 ? "REALTIME_AUTH_ERROR" : "REALTIME_PROVIDER_ERROR");
    if (voiceDebugEnabled()) console.info("[VOICE_REALTIME]", { realtimeModel: usedModel, realtimeVoice: voice, outputAudioFormat: "realtime_remote_audio", speed: 1, instructionsConfigured: true, fallbackUsed });
    return { token, expiresAt, model: usedModel, voice, fallbackUsed };
  },
};
