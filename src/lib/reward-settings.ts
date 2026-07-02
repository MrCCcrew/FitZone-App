import { db } from "@/lib/db";

const SECTION = "reward_settings";

export const DEFAULT_REWARD_SETTINGS = {
  pointsPerSubscription: 100,
  pointsPerReferral: 50,
  pointValueEGP: 0.1,
  referralRewardType: "wallet" as "points" | "wallet",
  referralRewardValue: 50,
  tierThresholds: { silver: 500, gold: 1500, platinum: 5000 },
  onboardingProfilePoints: 80,
  onboardingEmailPoints: 20,
};

export type RewardSettings = typeof DEFAULT_REWARD_SETTINGS;

export async function getRewardSettings(): Promise<RewardSettings> {
  try {
    const row = await db.siteContent.findUnique({ where: { section: SECTION } });
    if (!row) return DEFAULT_REWARD_SETTINGS;
    return { ...DEFAULT_REWARD_SETTINGS, ...(JSON.parse(row.content) as object) } as RewardSettings;
  } catch {
    return DEFAULT_REWARD_SETTINGS;
  }
}

export function calcTier(points: number, thresholds: RewardSettings["tierThresholds"]): string {
  if (points >= thresholds.platinum) return "platinum";
  if (points >= thresholds.gold) return "gold";
  if (points >= thresholds.silver) return "silver";
  return "bronze";
}
