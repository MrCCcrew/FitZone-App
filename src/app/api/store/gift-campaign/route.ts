import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getStoreCampaignSettings } from "@/app/api/admin/store-gift-campaign/route";

export async function GET() {
  const settings = await getStoreCampaignSettings();

  // Campaign not active — return nothing so UI shows no banner
  if (!settings.isActive) {
    return NextResponse.json({ active: false });
  }

  // Check date range
  const now = new Date();
  if (settings.startsAt && new Date(settings.startsAt) > now) {
    return NextResponse.json({ active: false });
  }
  if (settings.endsAt && new Date(settings.endsAt) < now) {
    return NextResponse.json({ active: false });
  }

  const currentUser = await getCurrentAppUser();
  const userId = currentUser?.id ?? null;

  let referralProgress = 0;
  let alreadyClaimed = false;
  let referralCode: string | null = null;

  if (userId) {
    try {
      // Check if user already claimed max times
      const claimCount = await (db as any).storeGiftCampaignClaim.count({
        where: { userId, status: { in: ["earned", "claimed"] } },
      });
      alreadyClaimed = claimCount >= settings.maxClaimsPerUser;
    } catch {
      // Table may not exist yet — treat as not claimed
      alreadyClaimed = false;
    }

    try {
      // Get referral progress (how many of their referrals have placed a store order)
      const referral = await db.referral.findUnique({
        where: { userId },
        select: { code: true, usages: { select: { referredUserId: true } } },
      });

      if (referral) {
        referralCode = referral.code;
        if (referral.usages.length > 0) {
          const referredIds = referral.usages.map((u) => u.referredUserId);
          const referredWithOrders = await db.order.groupBy({
            by: ["userId"],
            where: {
              userId: { in: referredIds },
              businessUnit: "store",
              status: { in: ["confirmed", "preparing", "ready_to_ship", "shipped_to_courier", "in_transit", "delivered"] },
            },
          });
          referralProgress = referredWithOrders.length;
        }
      }
    } catch {
      // Referral data unavailable — show campaign without referral progress
    }
  }

  return NextResponse.json({
    active: true,
    settings: {
      titleAr: settings.campaignTitleAr,
      titleEn: settings.campaignTitleEn,
      subtitleAr: settings.campaignSubtitleAr,
      subtitleEn: settings.campaignSubtitleEn,
      minSubtotal: settings.minStoreCartSubtotal,
      requiredReferrals: settings.requiredStoreReferralCount,
      rewardType: settings.rewardType,
      rewardWalletAmount: settings.rewardWalletAmount,
      rewardPoints: settings.rewardPoints,
      discountAmount: settings.discountAmount,
      endsAt: settings.endsAt,
    },
    referralProgress,
    referralCode,
    alreadyClaimed,
    authenticated: !!userId,
  });
}
