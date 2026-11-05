import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { asDbTransactionClient, db } from "@/lib/db";
import { previewMembershipCarryoverForCustomerTx } from "@/lib/membership-carryover-customer-preview";
import {
  resolveReferralCreditAllowance,
  type ReferralPurchaseKind,
} from "@/lib/referral-credit-policy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const url = new URL(req.url);
    const membershipId = url.searchParams.get("membershipId");
    const offerId = url.searchParams.get("offerId");
    const selectedMonthsRaw = url.searchParams.get("selectedMonths");
    const startDate = url.searchParams.get("startDate");
    const scheduleIds = url.searchParams
      .getAll("scheduleId")
      .map((value) => value.trim())
      .filter(Boolean);

    const selectedMonths =
      selectedMonthsRaw != null &&
      Number.isFinite(Number(selectedMonthsRaw))
        ? Number(selectedMonthsRaw)
        : null;

    const [dbUser, rewardSettings, affiliateUsageCount] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: {
          wallet: { select: { balance: true, referralBalance: true } },
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
    const referralBalance = Math.max(
      0,
      Math.min(
        walletBalance,
        dbUser?.wallet?.referralBalance ?? 0,
      ),
    );
    const generalBalance =
      Math.round(
        Math.max(
          0,
          walletBalance - referralBalance,
        ) * 100,
      ) / 100;

    const rewardPoints = dbUser?.rewardPoints?.points ?? 0;

    let referralPurchaseKind: ReferralPurchaseKind =
      offerId ? "offer" : "subscription";

    let referralAmountDue = 0;

    if (!offerId && membershipId) {
      if (membershipId === "trial-class") {
        referralPurchaseKind = "trial";
      } else {
        const membership =
          await db.membership.findUnique({
            where: { id: membershipId },
          });

        if (membership) {
          referralPurchaseKind =
            membership.kind === "package"
              ? "package"
              : membership.kind === "trial"
                ? "trial"
                : "subscription";

          if (
            referralPurchaseKind ===
            "subscription"
          ) {
            if (membership.kind === "custom") {
              const customMembership =
                membership as typeof membership & {
                  minMonths?: number | null;
                  maxMonths?: number | null;
                  discountPct?: number | null;
                };

              const months =
                Math.floor(selectedMonths ?? 0);

              const minMonths =
                customMembership.minMonths ?? 1;

              const maxMonths =
                customMembership.maxMonths ?? 12;

              if (
                months >= minMonths &&
                months <= maxMonths
              ) {
                referralAmountDue =
                  Math.round(
                    (
                      membership.price *
                      months *
                      (
                        1 -
                        (
                          customMembership.discountPct ??
                          0
                        ) /
                          100
                      )
                    ) *
                      100,
                  ) / 100;
              }
            } else {
              referralAmountDue =
                membership.priceAfter != null &&
                membership.priceAfter > 0
                  ? membership.priceAfter
                  : membership.price;
            }
          }
        }
      }
    }

    const referralAllowance =
      resolveReferralCreditAllowance({
        purchaseKind: referralPurchaseKind,
        referralBalance,
        amountDue: referralAmountDue,
      });

    const maxUsableReferral =
      referralAllowance.maxUsableReferral;

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

    let carryover = null;

    if (membershipId || offerId) {
      try {
        carryover = await db.$transaction((tx) =>
          previewMembershipCarryoverForCustomerTx(
            asDbTransactionClient(tx),
            user.id,
            {
              membershipId,
              offerId,
              scheduleIds,
              selectedMonths,
              startDate,
            },
          ),
        );
      } catch (error) {
        console.error(
          "[CHECKOUT_OPTIONS_CARRYOVER_PREVIEW]",
          error,
        );
      }
    }

    return NextResponse.json({
      walletBalance,
      referralBalance,
      generalBalance,
      maxUsableReferral,
      rewardPoints,
      pointValueEGP,
      rewardPointsEGP: Math.floor(rewardPoints * pointValueEGP * 100) / 100,
      affiliateDiscountRate,
      affiliateDiscountEligible,
      carryover,
    });
  } catch (error) {
    console.error("[CHECKOUT_OPTIONS_GET]", error);
    return NextResponse.json({ error: "تعذر جلب بيانات الرصيد." }, { status: 500 });
  }
}
