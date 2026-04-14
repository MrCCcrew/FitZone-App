import { db } from "@/lib/db";
import type { CoachCheckInData } from "@/lib/ai-coach/types";

// ─── Arabic-Indic numeral conversion ──────────────────────────────────────────
function normalizeNumerals(text: string) {
  return text.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function norm(text: string) {
  return normalizeNumerals(text)
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCheckInData(row: {
  id: string;
  weight: number | null;
  waist: number | null;
  energyLevel: number | null;
  adherenceScore: number | null;
  notes: string | null;
  createdAt: Date;
}): CoachCheckInData {
  return {
    id: row.id,
    weight: row.weight,
    waist: row.waist,
    energyLevel: row.energyLevel,
    adherenceScore: row.adherenceScore,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

export type ParsedCheckIn = {
  weight?: number;
  energyLevel?: number;
  notes?: string;
};

export function parseCheckInFromMessage(message: string): ParsedCheckIn | null {
  const normalized = norm(message);

  // Match weight: "وزني 75" | "وزني 75.5 كيلو" | "my weight 75"
  const weightMatch = normalized.match(
    /(?:وزني|وزن اليوم|اليوم وزني|weight today|my weight|وزنت نفسي)[^\d]*(\d+(?:\.\d+)?)/,
  ) ?? normalized.match(/(?:^|[\s])(\d{2,3}(?:\.\d+)?)(?:\s*(?:كيلو|kg|كجم))/);

  const weight = weightMatch ? parseFloat(weightMatch[1]) : undefined;
  if (!weight || weight < 30 || weight > 250) return null;

  // Energy level from text cues
  let energyLevel: number | undefined;
  if (/(نشيطه جدا|نشيط جدا|ممتاز|رائع|very good|excellent|great)/.test(normalized)) energyLevel = 5;
  else if (/(نشيطه|نشيط|بخير|تمام|good|fine|ok)/.test(normalized)) energyLevel = 4;
  else if (/(متوسط|عادي|average|normal)/.test(normalized)) energyLevel = 3;
  else if (/(تعبانه|تعبان|متعب|tired|low)/.test(normalized)) energyLevel = 2;
  else if (/(تعبانه جدا|تعبان جدا|very tired|exhausted|منهكه)/.test(normalized)) energyLevel = 1;

  return { weight, energyLevel };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function getRecentCheckIns(coachProfileId: string, limit = 5): Promise<CoachCheckInData[]> {
  const rows = await db.coachCheckIn.findMany({
    where: { coachProfileId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toCheckInData);
}

export async function getRecentCheckInsByProfile(
  profileId: string | null,
  limit = 5,
): Promise<CoachCheckInData[]> {
  if (!profileId) return [];
  return getRecentCheckIns(profileId, limit);
}

/** Find or create a CoachProfile for the session, then record a check-in. */
export async function createCheckInForSession(
  userId: string | null,
  sessionId: string,
  parsed: ParsedCheckIn,
): Promise<{ checkIn: CoachCheckInData; previous: CoachCheckInData | null }> {
  // Resolve profile
  let profile = await db.coachProfile.findFirst({
    where: userId ? { userId } : { guestSessionId: sessionId },
  });

  if (!profile) {
    profile = await db.coachProfile.create({
      data: userId ? { userId } : { guestSessionId: sessionId },
    });
  }

  // Previous check-in for comparison
  const prevRow = await db.coachCheckIn.findFirst({
    where: { coachProfileId: profile.id },
    orderBy: { createdAt: "desc" },
  });
  const previous = prevRow ? toCheckInData(prevRow) : null;

  // Create new check-in
  const row = await db.coachCheckIn.create({
    data: {
      coachProfileId: profile.id,
      weight: parsed.weight ?? null,
      energyLevel: parsed.energyLevel ?? null,
    },
  });

  // Update lastCheckInAt
  await db.coachProfile.update({
    where: { id: profile.id },
    data: { lastCheckInAt: row.createdAt, currentWeight: parsed.weight ?? profile.currentWeight },
  }).catch(() => null);

  return { checkIn: toCheckInData(row), previous };
}
