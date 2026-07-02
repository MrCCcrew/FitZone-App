import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { getRewardSettings } from "@/lib/reward-settings";

type RewardKey = "profile_complete" | "email_verified";

const REWARD_META = {
  profile_complete: { reason: "onboarding_profile_complete", label: "مكافأة إكمال البيانات" },
  email_verified:   { reason: "onboarding_email_verified",   label: "مكافأة تفعيل البريد الإلكتروني" },
} as const;

export async function POST(req: Request) {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser) return NextResponse.json({ error: "غير مصرح." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reward = body?.reward as RewardKey | undefined;

  if (!reward || !(reward in REWARD_META)) {
    return NextResponse.json({ error: "نوع المكافأة غير صالح." }, { status: 400 });
  }

  const meta = REWARD_META[reward];

  const [settings, user] = await Promise.all([
    getRewardSettings(),
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        phone: true,
        gender: true,
        birthDate: true,
        governorate: true,
        emailVerified: true,
        rewardPoints: {
          include: {
            history: {
              where: { reason: meta.reason },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "المستخدم غير موجود." }, { status: 404 });

  const points =
    reward === "profile_complete"
      ? settings.onboardingProfilePoints
      : settings.onboardingEmailPoints;

  // Idempotency — don't grant twice
  if (user.rewardPoints?.history.length) {
    return NextResponse.json({ alreadyClaimed: true });
  }

  // Verify the condition is actually met
  if (reward === "profile_complete" && !(user.phone && user.gender && user.birthDate && user.governorate)) {
    return NextResponse.json({ error: "أكملي هاتفك ونوعك وتاريخ ميلادك ومحافظتك أولاً." }, { status: 400 });
  }
  if (reward === "email_verified" && !user.emailVerified) {
    return NextResponse.json({ error: "فعّلي بريدك الإلكتروني أولاً." }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    const currentPoints = user.rewardPoints?.points ?? 0;
    const newPoints = currentPoints + points;
    const tier =
      newPoints >= 3000 ? "platinum" :
      newPoints >= 2000 ? "gold" :
      newPoints >= 1000 ? "silver" : "bronze";

    if (user.rewardPoints) {
      await tx.rewardPoints.update({
        where: { userId: user.id },
        data: { points: { increment: points }, tier },
      });
      await tx.rewardHistory.create({
        data: { rewardId: user.rewardPoints.id, points, reason: meta.reason },
      });
    } else {
      const created = await tx.rewardPoints.create({
        data: { userId: user.id, points, tier },
      });
      await tx.rewardHistory.create({
        data: { rewardId: created.id, points, reason: meta.reason },
      });
    }

    await tx.notification.create({
      data: {
        userId: user.id,
        title: "🎉 مكافأة جديدة!",
        body: `حصلتِ على ${points} نقطة — ${meta.label}`,
        type: "success",
      },
    });
  });

  return NextResponse.json({ success: true, points });
}
