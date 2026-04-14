import type { CoachIntent, CoachLang } from "@/lib/ai-coach/types";

function isEnabled() {
  return process.env.AI_COACH_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function timeoutMs() {
  const value = Number(process.env.AI_COACH_TIMEOUT_MS ?? 6000);
  return Number.isFinite(value) && value > 0 ? value : 6000;
}

export async function phraseCoachReply(input: {
  lang: CoachLang;
  intent: CoachIntent;
  userMessage: string;
  draft: string;
  facts: string[];
}) {
  if (!isEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              input.lang === "en"
                ? "You are FitZone AI Coach. Rewrite the reply naturally and briefly. Do not invent any facts. Use only the provided facts and stay conservative on health topics. Never diagnose, prescribe medication, or make unsafe claims."
                : "أنت AI Coach من FitZone. أعد صياغة الرد بشكل طبيعي ومختصر. لا تخترع أي معلومة. استخدم فقط الحقائق المتاحة، وكن محافظًا في أي موضوع صحي. لا تشخص ولا تصف أدوية ولا تقدم ادعاءات غير آمنة.",
          },
          {
            role: "user",
            content: JSON.stringify({
              intent: input.intent,
              userMessage: input.userMessage,
              facts: input.facts,
              draft: input.draft,
            }),
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || null;
  } catch (error) {
    console.error("[AI_COACH_LLM]", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
