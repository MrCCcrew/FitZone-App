import { buildCoachPayload, handleCoachMessage, initializeCoachSession } from "@/lib/ai-coach/engine";
import type { CoachLang } from "@/lib/ai-coach/types";

export async function initializeChatSession(sessionId: string, lang: CoachLang = "ar") {
  return initializeCoachSession(sessionId, lang);
}

export async function generateBotReply(sessionId: string, userMessage: string, lang: CoachLang = "ar") {
  return handleCoachMessage(sessionId, userMessage, lang);
}

export async function serializeChatSession<T extends { context?: string | null; messages: Array<{ metadata: string | null }> }>(
  session: T | null,
  lang: CoachLang = "ar",
) {
  if (!session) return null;
  const payload = await buildCoachPayload(session as never, lang);
  if (!payload) return null;

  return {
    ...payload,
    messages: serializeMessages(payload.messages ?? []),
  };
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
