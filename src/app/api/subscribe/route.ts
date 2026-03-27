import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { sendSubscriptionEmail } from "@/lib/email";

export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  const userId = user?.id;

  if (!userId) {
    return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
  }

  const { membershipId } = await req.json();
  if (!membershipId) {
    return NextResponse.json({ error: "يرجى اختيار باقة" }, { status: 400 });
  }

  const plan = await db.membership.findUnique({ where: { id: membershipId } });
  if (!plan) {
    return NextResponse.json({ error: "الباقة غير موجودة" }, { status: 404 });
  }

  await db.userMembership.updateMany({
    where: { userId, status: "active" },
    data: { status: "expired" },
  });

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + plan.duration);

  const sub = await db.userMembership.create({
    data: {
      userId,
      membershipId: plan.id,
      startDate,
      endDate,
      status: "active",
    },
  });

  if (plan.walletBonus && plan.walletBonus > 0) {
    const wallet = await db.wallet.upsert({
      where: { userId },
      update: { balance: { increment: plan.walletBonus } },
      create: { userId, balance: plan.walletBonus },
    });

    await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: plan.walletBonus,
        type: "credit",
        description: `مكافأة الاشتراك في باقة ${plan.name}`,
      },
    });
  }

  await db.notification.create({
    data: {
      userId,
      title: `تم الاشتراك في باقة ${plan.name}!`,
      body: `اشتراكك نشط حتى ${endDate.toLocaleDateString("ar-EG")}. استمتع بكل مميزات الباقة!`,
      type: "success",
    },
  });

  // إرسال بريد تأكيد الاشتراك
  try {
    const fullUser = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (fullUser?.email) {
      await sendSubscriptionEmail(
        fullUser.email,
        fullUser.name ?? "العضوة",
        plan.name,
        endDate,
        plan.walletBonus ?? 0,
      );
    }
  } catch (emailError) {
    console.error("[SUBSCRIBE_EMAIL]", emailError);
  }

  return NextResponse.json({ success: true, subscriptionId: sub.id, endDate: endDate.toISOString() });
}
