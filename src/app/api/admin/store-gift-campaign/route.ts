import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";
import { getStoreCampaignSettings, type StoreGiftCampaignSettings } from "@/lib/store-gift-campaign";

const SECTION = "store_gift_campaign_settings";

export async function GET() {
  const auth = await requireAdminFeature("store-campaigns");
  if ("error" in auth) return auth.error;
  const settings = await getStoreCampaignSettings();

  // Also return recent claims stats
  const dbx = db as any;
  const totalClaims = await dbx.storeGiftCampaignClaim.count();
  const earnedClaims = await dbx.storeGiftCampaignClaim.count({ where: { status: { in: ["earned", "claimed"] } } });

  return NextResponse.json({ settings, stats: { totalClaims, earnedClaims } });
}

export async function PUT(req: Request) {
  const auth = await requireAdminFeature("store-campaigns");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as Partial<StoreGiftCampaignSettings>;
    const current = await getStoreCampaignSettings();
    const merged: StoreGiftCampaignSettings = { ...current, ...body };

    await db.siteContent.upsert({
      where: { section: SECTION },
      create: { section: SECTION, content: JSON.stringify(merged) },
      update: { content: JSON.stringify(merged) },
    });

    return NextResponse.json({ success: true, settings: merged });
  } catch (err) {
    console.error("[ADMIN_STORE_GIFT_CAMPAIGN_PUT]", err);
    return NextResponse.json({ error: "تعذر حفظ إعدادات الحملة." }, { status: 500 });
  }
}
