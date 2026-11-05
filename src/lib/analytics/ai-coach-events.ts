import "server-only";

import { cookies } from "next/headers";
import {
  ANALYTICS_SESSION_COOKIE,
  ANALYTICS_VISITOR_COOKIE,
} from "@/lib/analytics/visitor-session";
import { recordBusinessAnalyticsEvent } from "@/lib/analytics/business-events";

type AiCoachEventName =
  | "ai_coach_open"
  | "ai_coach_message"
  | "ai_coach_response"
  | "ai_coach_error";

type AiCoachEventInput = {
  eventName: AiCoachEventName;
  chatSessionId: string;
  userId?: string | null;
  metadata?: Record<string, string | number | boolean>;
};

export async function recordAiCoachEvent(input: AiCoachEventInput) {
  try {
    const store = await cookies();

    return await recordBusinessAnalyticsEvent({
      eventName: input.eventName,
      entityType: "ai_coach",
      entityId: input.chatSessionId,
      entityName: "AI Coach",
      category: "ai_coach",
      visitorAnonymousId:
        store.get(ANALYTICS_VISITOR_COOKIE.name)?.value,
      sessionPublicId:
        store.get(ANALYTICS_SESSION_COOKIE.name)?.value,
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    });
  } catch {
    return {
      recorded: false,
      ignored: false,
      reason: "analytics_error",
    };
  }
}
