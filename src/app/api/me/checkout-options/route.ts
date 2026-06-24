import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const [dbUser, rewardSettings, affiliateUsageCount] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: {
          wallet: { select: { balance: true } },
          rewardPoints: { select: { points: true } },
          pendingPartnerRef: true,
        },
      }),
      db.siteContent.findUnique({ where: { section: "reward_settings" } }),
      // Mirrors subscribe/route.ts: "used" = active | expired | cancelled (payment confirmed)
      db.userMembership.count({ where: { userId: user.id, affiliateLinkId: { not: null }, status: { in: ["active", "expired", "cancelled"] } } }),
    ]);

    let pointValueEGP = 0.1;
    if (rewardSettings?.content) {
      try {
        const parsed = JSON.parse(rewardSettings.content) as { pointValueEGP?: number };
        if (typeof parsed.pointValueEGP === "number") pointValueEGP = parsed.pointValueEGP;
      } catch {}
    }

    const walletBalance = dbUser?.wallet?.balance ?? 0;
    const rewardPoints = dbUser?.rewardPoints?.points ?? 0;

    let affiliateDiscountRate = 0;
    let affiliateDiscountEligible = false;
    if (dbUser?.pendingPartnerRef && affiliateUsageCount === 0) {
      const link = await db.partnerAffiliateLink.findUnique({
        where: { token: dbUser.pendingPartnerRef },
        select: { isActive: true, partnerId: true },
      });
      if (link?.isActive) {
        const partner = await db.partner.findUnique({
          where: { id: link.partnerId },
          select: { referralDiscountRate: true },
        });
        if ((partner?.referralDiscountRate ?? 0) > 0) {
          affiliateDiscountRate = partner!.referralDiscountRate!;
          affiliateDiscountEligible = true;
        }
      }
    }

    return NextResponse.json({
      walletBalance,
      rewardPoints,
      pointValueEGP,
      rewardPointsEGP: Math.floor(rewardPoints * pointValueEGP * 100) / 100,
      affiliateDiscountRate,
      affiliateDiscountEligible,
    });
  } catch (error) {
    console.error("[CHECKOUT_OPTIONS_GET]", error);
    return NextResponse.json({ error: "تعذر جلب بيانات الرصيد." }, { status: 500 });
  }
}
