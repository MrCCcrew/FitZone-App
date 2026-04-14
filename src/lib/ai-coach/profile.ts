import { db } from "@/lib/db";
import type { CoachProfileData, QuestionnaireAnswers } from "@/lib/ai-coach/types";

const FREQUENCY_TO_DAYS: Record<string, number> = {
  low: 2,
  medium: 4,
  high: 6,
};

function toProfileData(profile: {
  id: string;
  primaryGoal: string | null;
  trainingLevel: string | null;
  preferredDays: number | null;
  preferredClassTypes: string | null;
  injuries: string | null;
  nutritionStyle: string | null;
  currentWeight: number | null;
  targetWeight: number | null;
  height: number | null;
  age: number | null;
  notes: string | null;
  lastAssessmentAt: Date | null;
  lastCheckInAt: Date | null;
}): CoachProfileData {
  let classTypes: string[] = [];
  try {
    classTypes = profile.preferredClassTypes ? (JSON.parse(profile.preferredClassTypes) as string[]) : [];
  } catch {
    classTypes = [];
  }

  return {
    id: profile.id,
    primaryGoal: profile.primaryGoal,
    trainingLevel: profile.trainingLevel,
    preferredDays: profile.preferredDays,
    preferredClassTypes: classTypes,
    injuries: profile.injuries,
    nutritionStyle: profile.nutritionStyle,
    currentWeight: profile.currentWeight ?? null,
    targetWeight: profile.targetWeight ?? null,
    height: profile.height ?? null,
    age: profile.age,
    notes: profile.notes,
    lastAssessmentAt: profile.lastAssessmentAt?.toISOString() ?? null,
    lastCheckInAt: profile.lastCheckInAt?.toISOString() ?? null,
  };
}

export async function loadCoachProfile(
  userId: string | null,
  guestSessionId?: string | null,
): Promise<CoachProfileData | null> {
  if (!userId && !guestSessionId) return null;

  const where = userId ? { userId } : { guestSessionId: guestSessionId! };
  const profile = await db.coachProfile.findFirst({ where });
  return profile ? toProfileData(profile) : null;
}

export async function upsertCoachProfileFromAnswers(
  userId: string | null,
  guestSessionId: string | null,
  answers: QuestionnaireAnswers,
): Promise<void> {
  if (!userId && !guestSessionId) return;

  const preferredClassTypes =
    answers.classes === "yes"
      ? JSON.stringify(["group"])
      : answers.classes === "no"
        ? JSON.stringify(["individual"])
        : null;

  const data = {
    primaryGoal: answers.goal ?? null,
    trainingLevel: answers.experience ?? null,
    preferredDays: answers.frequency ? (FREQUENCY_TO_DAYS[answers.frequency] ?? null) : null,
    preferredClassTypes,
    injuries: answers.injuries === "yes" ? "المستخدم أشار إلى وجود إصابة أو قيد" : null,
    nutritionStyle: answers.meals ?? null,
    currentWeight: answers.weight ? Number(answers.weight) : null,
    height: answers.height ? Number(answers.height) : null,
    age: answers.age ?? null,
    lastAssessmentAt: new Date(),
  };

  if (userId) {
    await db.coachProfile.upsert({
      where: { userId },
      create: { ...data, userId },
      update: data,
    });
  } else {
    await db.coachProfile.upsert({
      where: { guestSessionId: guestSessionId! },
      create: { ...data, guestSessionId: guestSessionId! },
      update: data,
    });
  }
}
