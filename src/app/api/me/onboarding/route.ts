import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

const REWARDS = {
  profile_complete: { points: 50, reason: "onboarding_profile_complete", label: "مكافأة إكمال البيانات" },
  email_verified:   { points: 20, reason: "onboarding_email_verified",   label: "مكافأة تفعيل البريد الإلكتروني" },
} as const;

type RewardKey = keyof typeof REWARDS;

export async function POST(req: Request) {
  const sessionUser = await getCurrentAppUser();
  if (!sessionUser) return NextResponse.json({ error: "غير مصرح." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const reward = body?.reward as RewardKey | undefined;

  if (!reward || !(reward in REWARDS)) {
    return NextResponse.json({ error: "نوع المكافأة غير صالح." }, { status: 400 });
  }

  const cfg = REWARDS[reward];

  const user = await db.user.findUnique({
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
            where: { reason: cfg.reason },
            take: 1,
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "المستخدم غير موجود." }, { status: 404 });

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

  // Grant reward
  await db.$transaction(async (tx) => {
    if (user.rewardPoints) {
      const newPoints = user.rewardPoints.points + cfg.points;
      const tier =
        newPoints >= 3000 ? "platinum" :
        newPoints >= 2000 ? "gold" :
        newPoints >= 1000 ? "silver" : "bronze";

      await tx.rewardPoints.update({
        where: { userId: user.id },
        data: {
          points: { increment: cfg.points },
          tier,
        },
      });
      await tx.rewardHistory.create({
        data: {
          rewardId: user.rewardPoints.id,
          points: cfg.points,
          reason: cfg.reason,
        },
      });
    } else {
      const created = await tx.rewardPoints.create({
        data: { userId: user.id, points: cfg.points, tier: "bronze" },
      });
      await tx.rewardHistory.create({
        data: { rewardId: created.id, points: cfg.points, reason: cfg.reason },
      });
    }

    await tx.notification.create({
      data: {
        userId: user.id,
        title: "🎉 مكافأة جديدة!",
        body: `حصلتِ على ${cfg.points} نقطة — ${cfg.label}`,
        type: "success",
      },
    });
  });

  return NextResponse.json({ success: true, points: cfg.points });
}
