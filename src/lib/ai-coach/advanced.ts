import { createCheckInForSession, parseCheckInFromMessage } from "@/lib/ai-coach/checkin";
import { isCoachAdvancedFeaturesEnabled, isCoachObservabilityEnabled } from "@/lib/ai-coach/config";
import { detectNudge } from "@/lib/ai-coach/nudge";
import { logCoachEvent } from "@/lib/ai-coach/observability";
import { upsertCoachProfileFromAnswers } from "@/lib/ai-coach/profile";
import type {
  CoachCheckInData,
  CoachIntent,
  CoachLang,
  CoachNudge,
  CoachProfileData,
  CoachSiteSnapshot,
  QuestionnaireAnswers,
} from "@/lib/ai-coach/types";

type ParsedCheckIn = {
  weight?: number;
  waist?: number;
  energyLevel?: number;
  adherenceScore?: number;
  notes?: string;
};

export function canUseAdvancedCoachFeatures() {
  return isCoachAdvancedFeaturesEnabled();
}

export function parseAdvancedCheckIn(message: string): ParsedCheckIn | null {
  if (!canUseAdvancedCoachFeatures()) return null;
  return parseCheckInFromMessage(message);
}

export async function createAdvancedCheckIn(
  userId: string | null,
  sessionId: string,
  parsed: ParsedCheckIn,
): Promise<{ checkIn: CoachCheckInData; previous: CoachCheckInData | null } | null> {
  if (!canUseAdvancedCoachFeatures()) return null;
  return createCheckInForSession(userId, sessionId, parsed);
}

export async function persistQuestionnaireProfile(
  userId: string | null,
  sessionId: string,
  answers: QuestionnaireAnswers,
) {
  if (!canUseAdvancedCoachFeatures()) return null;
  return upsertCoachProfileFromAnswers(userId, sessionId, answers).catch(() => null);
}

export function buildAdvancedNudge(args: {
  lang: CoachLang;
  profile: CoachProfileData | null;
  snapshot: CoachSiteSnapshot;
  lastIntent: CoachIntent;
  nudgeShownCount: number;
  messageCount: number;
}): CoachNudge | null {
  if (!canUseAdvancedCoachFeatures()) return null;

  return detectNudge({
    lang: args.lang,
    profile: args.profile,
    hasMembership: Boolean(args.snapshot.account.membership),
    hasUpcomingBooking: Boolean(args.snapshot.account.upcomingBookingDate),
    recentCheckIns: args.snapshot.recentCheckIns,
    daysSinceLastAttended: args.snapshot.account.attendanceStats?.daysSinceLastAttended ?? null,
    authenticated: args.snapshot.account.authenticated,
    lastIntent: args.lastIntent,
    nudgeShownCount: args.nudgeShownCount,
    messageCount: args.messageCount,
  });
}

export function logAdvancedCoachEvent(data: {
  sessionId: string;
  intent: CoachIntent;
  usedAI: boolean;
  handoff?: boolean;
  outcome?: string;
}) {
  if (!canUseAdvancedCoachFeatures() || !isCoachObservabilityEnabled()) return;
  logCoachEvent(data);
}
