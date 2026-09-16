import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getStoreCampaignSettings } from "@/app/api/admin/store-gift-campaign/route";
import {
  grantStoreGiftClaimAtomic,
  type StoreGiftRewardType,
} from "@/lib/store-gift-reward-service";

export async function POST(req: Request) {
  const currentUser =
    await getCurrentAppUser();

  if (!currentUser?.id) {
    return NextResponse.json(
      {
        error: "يجب تسجيل الدخول.",
      },
      {
        status: 401,
      },
    );
  }

  const userId = currentUser.id;

  const body =
    (await req.json()) as {
      orderId?: string;
    };

  const settings =
    await getStoreCampaignSettings();

  if (!settings.isActive) {
    return NextResponse.json(
      {
        error:
          "الحملة غير مفعلة حالياً.",
      },
      {
        status: 400,
      },
    );
  }

  const now = new Date();

  if (
    settings.startsAt &&
    new Date(settings.startsAt) > now
  ) {
    return NextResponse.json(
      {
        error: "الحملة لم تبدأ بعد.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    settings.endsAt &&
    new Date(settings.endsAt) < now
  ) {
    return NextResponse.json(
      {
        error: "انتهت مدة الحملة.",
      },
      {
        status: 400,
      },
    );
  }

  let conditionMet = false;
  let source =
    "store_cart_threshold";

  let storeOrderId:
    | string
    | null = null;

  // ── Store order condition ──────────────────────────
  if (body.orderId) {
    const order =
      await db.order.findFirst({
        where: {
          id: body.orderId,
          userId,
        },
        select: {
          id: true,
          businessUnit: true,
          subtotal: true,
          status: true,
        },
      });

    if (
      !order ||
      order.businessUnit !== "store"
    ) {
      return NextResponse.json(
        {
          error:
            "الطلب غير مؤهل للحملة.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      order.subtotal >=
      settings.minStoreCartSubtotal
    ) {
      conditionMet = true;
      source =
        "store_cart_threshold";
      storeOrderId = order.id;
    }
  }

  // ── Referral condition ─────────────────────────────
  if (
    !conditionMet &&
    settings.requireSuccessfulReferralSignup
  ) {
    const referral =
      await db.referral.findUnique({
        where: {
          userId,
        },
        select: {
          usages: {
            select: {
              referredUserId: true,
            },
          },
        },
      });

    if (
      referral &&
      referral.usages.length >=
        settings.requiredStoreReferralCount
    ) {
      conditionMet = true;
      source = "store_referral";
    }
  }

  if (!conditionMet) {
    return NextResponse.json(
      {
        error:
          "لم تستوفِ شروط الحملة بعد.",
      },
      {
        status: 400,
      },
    );
  }

  const result =
    await grantStoreGiftClaimAtomic({
      userId,
      storeOrderId,
      source,

      maxClaimsPerUser:
        settings.maxClaimsPerUser,

      rewardType:
        settings.rewardType as StoreGiftRewardType,

      rewardWalletAmount:
        settings.rewardWalletAmount,

      rewardPoints:
        settings.rewardPoints,

      discountAmount:
        settings.discountAmount,

      rewardProductId:
        settings.rewardProductId ?? null,
    });

  if (
    result.status === "duplicate"
  ) {
    return NextResponse.json(
      {
        error:
          "تم تطبيق الهدية على هذا الطلب مسبقاً.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    result.status ===
    "limit_reached"
  ) {
    return NextResponse.json(
      {
        error:
          "لقد استفدتِ من الهدية بالفعل.",
      },
      {
        status: 400,
      },
    );
  }

  return NextResponse.json({
    success: true,
    rewardType: result.rewardType,
    rewardValue: result.rewardValue,
  });
}
