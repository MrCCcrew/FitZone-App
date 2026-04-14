import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

async function getPointValueEGP(): Promise<number> {
  const row = await db.siteContent.findUnique({ where: { section: "reward_settings" } });
  if (!row) return 0.1;
  try {
    const parsed = JSON.parse(row.content) as { pointValueEGP?: number };
    return typeof parsed.pointValueEGP === "number" ? parsed.pointValueEGP : 0.1;
  } catch {
    return 0.1;
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentAppUser();
    if (!user?.id) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا." }, { status: 401 });
    }

    const body = (await req.json()) as { points?: number };
    const pointsToConvert = Math.floor(Number(body.points ?? 0));

    if (!Number.isFinite(pointsToConvert) || pointsToConvert <= 0) {
      return NextResponse.json({ error: "عدد النقاط غير صحيح." }, { status: 400 });
    }

    const [pointsRow, pointValueEGP] = await Promise.all([
      db.rewardPoints.findUnique({ where: { userId: user.id } }),
      getPointValueEGP(),
    ]);

    const currentPoints = pointsRow?.points ?? 0;
    if (pointsToConvert > currentPoints) {
      return NextResponse.json({ error: "رصيد النقاط غير كافٍ." }, { status: 400 });
    }

    const egpAmount = Math.round(pointsToConvert * pointValueEGP * 100) / 100;
    if (egpAmount <= 0) {
      return NextResponse.json({ error: "قيمة النقاط لا تكفي للتحويل." }, { status: 400 });
    }

    await db.$transaction(async (tx) => {
      // Deduct points
      await tx.rewardPoints.update({
        where: { userId: user.id },
        data: { points: { decrement: pointsToConvert } },
      });
      await tx.rewardHistory.create({
        data: {
          rewardId: pointsRow!.id,
          points: -pointsToConvert,
          reason: `تحويل ${pointsToConvert} نقطة إلى رصيد المحفظة`,
        },
      });

      // Credit wallet
      const wallet = await tx.wallet.upsert({
        where: { userId: user.id },
        update: { balance: { increment: egpAmount } },
        create: { userId: user.id, balance: egpAmount },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: egpAmount,
          type: "credit",
          description: `تحويل ${pointsToConvert} نقطة (${egpAmount} ج.م)`,
        },
      });
    });

    return NextResponse.json({ success: true, convertedPoints: pointsToConvert, egpAmount });
  } catch (error) {
    console.error("[CONVERT_POINTS]", error);
    return NextResponse.json({ error: "تعذر تحويل النقاط الآن." }, { status: 500 });
  }
}
