import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getStoreCampaignSettings } from "@/lib/store-gift-campaign";

export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();
  if (!currentUser?.id) {
    return NextResponse.json({ error: "يجب تسجيل الدخول." }, { status: 401 });
  }
  const userId = currentUser.id;

  const body = await req.json() as { orderId?: string };

  const settings = await getStoreCampaignSettings();
  if (!settings.isActive) {
    return NextResponse.json({ error: "الحملة غير مفعلة حالياً." }, { status: 400 });
  }

  const now = new Date();
  if (settings.startsAt && new Date(settings.startsAt) > now) {
    return NextResponse.json({ error: "الحملة لم تبدأ بعد." }, { status: 400 });
  }
  if (settings.endsAt && new Date(settings.endsAt) < now) {
    return NextResponse.json({ error: "انتهت مدة الحملة." }, { status: 400 });
  }

  // Check max claims per user
  const dbx = db as any;
  const claimCount = await dbx.storeGiftCampaignClaim.count({
    where: { userId, status: { in: ["earned", "claimed"] } },
  });
  if (claimCount >= settings.maxClaimsPerUser) {
    return NextResponse.json({ error: "لقد استفدتِ من الهدية بالفعل." }, { status: 400 });
  }

  let conditionMet = false;
  let source = "store_cart_threshold";
  let storeOrderId: string | null = null;

  // Verify via a qualifying store order
  if (body.orderId) {
    const order = await db.order.findUnique({
      where: { id: body.orderId, userId },
      select: { id: true, businessUnit: true, subtotal: true, status: true },
    });

    if (!order || order.businessUnit !== "store") {
      return NextResponse.json({ error: "الطلب غير مؤهل للحملة." }, { status: 400 });
    }

    // Check no duplicate claim for same order
    const existingClaim = await dbx.storeGiftCampaignClaim.findFirst({
      where: { storeOrderId: order.id, status: { in: ["earned", "claimed"] } },
    });
    if (existingClaim) {
      return NextResponse.json({ error: "تم تطبيق الهدية على هذا الطلب مسبقاً." }, { status: 400 });
    }

    if (order.subtotal >= settings.minStoreCartSubtotal) {
      conditionMet = true;
      source = "store_cart_threshold";
      storeOrderId = order.id;
    }
  }

  // Referral condition as alternative
  if (!conditionMet && settings.requireSuccessfulReferralSignup) {
    const referral = await db.referral.findUnique({
      where: { userId },
      select: { usages: { select: { referredUserId: true } } },
    });
    if (referral && referral.usages.length >= settings.requiredStoreReferralCount) {
      conditionMet = true;
      source = "store_referral";
    }
  }

  if (!conditionMet) {
    return NextResponse.json({ error: "لم تستوفِ شروط الحملة بعد." }, { status: 400 });
  }

  // Determine reward value
  const rewardValue =
    settings.rewardType === "wallet" ? settings.rewardWalletAmount
    : settings.rewardType === "points" ? settings.rewardPoints
    : settings.rewardType === "discount" ? settings.discountAmount
    : null;

  // Create claim record
  const claim = await dbx.storeGiftCampaignClaim.create({
    data: {
      userId,
      storeOrderId,
      rewardType: settings.rewardType,
      rewardValue,
      rewardProductId: settings.rewardProductId ?? null,
      status: "earned",
      source,
    },
  });

  // Apply reward immediately for wallet/points
  if (settings.rewardType === "wallet" && settings.rewardWalletAmount > 0) {
    await db.wallet.upsert({
      where: { userId },
      create: { userId, balance: settings.rewardWalletAmount },
      update: { balance: { increment: settings.rewardWalletAmount } },
    });
    await dbx.storeGiftCampaignClaim.update({ where: { id: claim.id }, data: { status: "claimed", claimedAt: now } });
  } else if (settings.rewardType === "points" && settings.rewardPoints > 0) {
    const rp = await db.rewardPoints.upsert({
      where: { userId },
      create: { userId, points: settings.rewardPoints, tier: "bronze" },
      update: { points: { increment: settings.rewardPoints } },
    });
    await db.rewardHistory.create({ data: { rewardId: rp.id, points: settings.rewardPoints, reason: "store_gift_campaign" } });
    await dbx.storeGiftCampaignClaim.update({ where: { id: claim.id }, data: { status: "claimed", claimedAt: now } });
  }
  // free_product and discount are handled server-side at order time or manually by admin

  return NextResponse.json({ success: true, rewardType: settings.rewardType, rewardValue });
}
