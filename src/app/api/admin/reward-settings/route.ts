import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { getRewardSettings } from "@/lib/reward-settings";

const SECTION = "reward_settings";

export async function GET() {
  const auth = await requireAdminFeature("rewards");
  if ("error" in auth) return auth.error;
  return NextResponse.json(await getRewardSettings());
}

export async function PUT(req: Request) {
  const auth = await requireAdminFeature("rewards");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as Record<string, unknown>;
    const current = await getRewardSettings();
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
