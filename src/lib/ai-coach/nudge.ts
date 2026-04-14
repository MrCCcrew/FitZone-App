import type { CoachCheckInData, CoachIntent, CoachLang, CoachNudge, CoachProfileData } from "@/lib/ai-coach/types";

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

/** Returns at most one nudge to append to the bot reply, or null if none is appropriate. */
export function detectNudge(options: {
  lang: CoachLang;
  profile: CoachProfileData | null;
  hasMembership: boolean;
  hasUpcomingBooking: boolean;
  recentCheckIns: CoachCheckInData[];
  daysSinceLastAttended: number | null;
  authenticated: boolean;
  lastIntent: CoachIntent | undefined;
  nudgeShownCount: number;
  messageCount: number;
}): CoachNudge | null {
  const {
    lang,
    profile,
    hasMembership,
    hasUpcomingBooking,
    recentCheckIns,
    daysSinceLastAttended,
    authenticated,
    lastIntent,
    nudgeShownCount,
    messageCount,
  } = options;

  // Don't nudge on early messages or if we've already nudged many times
  if (messageCount < 3) return null;
  if (nudgeShownCount >= 3) return null;

  // Don't re-nudge immediately after a check-in intent
  if (lastIntent === "check_in") return null;

  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);

  // ── Priority 1: attendance gap with active membership ──────────────────────
  if (
    authenticated &&
    hasMembership &&
    daysSinceLastAttended !== null &&
    daysSinceLastAttended > 10
  ) {
    return {
      type: "attendance_low",
      message: t(
        `\n💡 لاحظت أنك لم تحضري حصة منذ ${daysSinceLastAttended} يوماً. حتى تمرين خفيف هذا الأسبوع سيساعدك على الاستمرار.`,
        `\n💡 I noticed you haven't attended a session in ${daysSinceLastAttended} days. Even a light workout this week will help maintain momentum.`,
      ),
    };
  }

  // ── Priority 2: first-time check-in reminder ───────────────────────────────
  if (authenticated && profile && recentCheckIns.length === 0 && lastIntent !== "food_check") {
    return {
      type: "check_in_reminder",
      message: t(
        "\n💡 سجّلي وزنك لأول مرة لنتمكن من متابعة تقدمك — اكتبي مثلاً: **وزني اليوم ٧٠ كيلو**.",
        "\n💡 Record your weight for the first time so we can track your progress — e.g.: **my weight today is 70 kg**.",
      ),
    };
  }

  // ── Priority 3: check-in overdue (14+ days) ───────────────────────────────
  if (authenticated && profile && recentCheckIns.length > 0) {
    const days = daysSince(recentCheckIns[0].createdAt);
    if (days >= 14) {
      return {
        type: "check_in_reminder",
        message: t(
          `\n💡 آخر قياس وزن كان منذ ${days} يوماً — أرسلي "وزني اليوم X كيلو" لمتابعة تقدمك.`,
          `\n💡 Your last weight check-in was ${days} days ago — send "my weight today is X kg" to track progress.`,
        ),
      };
    }
  }

  // ── Priority 4: has membership, no upcoming booking after class suggestion ──
  if (
    authenticated &&
    hasMembership &&
    !hasUpcomingBooking &&
    (lastIntent === "class_recommendation" || lastIntent === "schedule_lookup")
  ) {
    return {
      type: "book_class",
      message: t(
        "\n💡 يمكنك الحجز مباشرة من صفحة الجدول أو من خلال حسابك.",
        "\n💡 You can book directly from the schedule page or through your account.",
      ),
    };
  }

  return null;
}
