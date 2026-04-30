import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

const SECTION = "reward_settings";

const DEFAULT_SETTINGS = {
  pointsPerSubscription: 100,
  pointsPerReferral: 50,
  pointValueEGP: 0.1,
  referralRewardType: "points", // points | wallet
  referralRewardValue: 50,
  tierThresholds: { silver: 500, gold: 1500, platinum: 5000 },
};

async function getSettings() {
  const row = await db.siteContent.findUnique({ where: { section: SECTION } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.content) as object) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminFeature("rewards");
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getSettings());
}

export async function PUT(req: Request) {
  const auth = await requireAdminFeature("rewards");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as Record<string, unknown>;
    const current = await getSettings();
    const merged = { ...current, ...body };

    await db.siteContent.upsert({
      where: { section: SECTION },
      create: { section: SECTION, content: JSON.stringify(merged) },
      update: { content: JSON.stringify(merged) },
    });

    return NextResponse.json({ success: true, settings: merged });
  } catch (error) {
    console.error("[ADMIN_REWARD_SETTINGS_PUT]", error);
    return NextResponse.json({ error: "تعذر حفظ إعدادات المكافآت." }, { status: 500 });
  }
}
