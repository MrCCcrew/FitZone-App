import { db } from "@/lib/db";
import type { CoachIntent } from "@/lib/ai-coach/types";

/** Fire-and-forget event log — never throws, never blocks the response. */
export function logCoachEvent(data: {
  sessionId: string;
  intent: CoachIntent;
  usedAI: boolean;
  handoff?: boolean;
  outcome?: string;
}): void {
  db.coachEventLog
    .create({
      data: {
        sessionId: data.sessionId,
        intent: data.intent,
        usedAI: data.usedAI,
        handoff: data.handoff ?? false,
        outcome: data.outcome ?? null,
      },
    })
    .catch((err: unknown) => {
      console.error("[COACH_EVENT_LOG]", err instanceof Error ? err.message : err);
    });
}
