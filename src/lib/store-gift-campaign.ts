import { db } from "@/lib/db";

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

const SECTION = "store_gift_campaign_settings";

export async function getStoreCampaignSettings(): Promise<StoreGiftCampaignSettings> {
  const row = await db.siteContent.findUnique({ where: { section: SECTION } });
  if (!row) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.content) as object) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
