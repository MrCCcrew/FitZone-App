import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

const SECTION = "store_gift_campaign_settings";

export type StoreGiftCampaignSettings = {
  campaignEnabled: boolean;
  campaignTitleAr: string;
  campaignTitleEn: string;
  campaignSubtitleAr: string;
  campaignSubtitleEn: string;
  minStoreCartSubtotal: number;
  requiredStoreReferralCount: number;
  rewardType: "free_product" | "wallet" | "points" | "free_shipping" | "discount";
  rewardProductId: string | null;
  rewardWalletAmount: number;
  rewardPoints: number;
  discountAmount: number;
  startsAt: string | null;
  endsAt: string | null;
  maxClaimsPerUser: number;
  onlyForNewStoreCustomers: boolean;
  requireCompletedStoreOrder: boolean;
  requireSuccessfulReferralSignup: boolean;
  requireReferralFirstStoreOrder: boolean;
  isActive: boolean;
};

const DEFAULT_SETTINGS: StoreGiftCampaignSettings = {
  campaignEnabled: false,
  campaignTitleAr: "🎁 هدية المتجر",
  campaignTitleEn: "Store Gift",
  campaignSubtitleAr: "هديتك قربت تفتح!",
  campaignSubtitleEn: "Your gift is almost unlocked!",
  minStoreCartSubtotal: 300,
  requiredStoreReferralCount: 3,
  rewardType: "wallet",
  rewardProductId: null,
  rewardWalletAmount: 50,
  rewardPoints: 200,
  discountAmount: 30,
  startsAt: null,
  endsAt: null,
  maxClaimsPerUser: 1,
  onlyForNewStoreCustomers: false,
  requireCompletedStoreOrder: true,
  requireSuccessfulReferralSignup: false,
  requireReferralFirstStoreOrder: false,
  isActive: false,
};

export async function getStoreCampaignSettings(): Promise<StoreGiftCampaignSettings> {
  const row = await db.siteContent.findUnique({ where: { section: SECTION } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.content) as object) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

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
