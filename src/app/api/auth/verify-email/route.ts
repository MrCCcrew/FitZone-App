import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

const EMAIL_VERIFY_POINTS = 20;

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const sessionUser = await getCurrentAppUser();
    const { code, email } = await req.json();

    const normalizedCode = String(code ?? "").trim();
    const normalizedEmail = String(email ?? sessionUser?.email ?? "").trim().toLowerCase();

    const limit = applyRateLimit(`verify-email:${clientIp}:${normalizedEmail || "unknown"}`, 8, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات التحقق كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    if (!normalizedEmail) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    }

    if (!normalizedCode) {
      return NextResponse.json({ error: "رمز التفعيل مطلوب." }, { status: 400 });
    }

    const record = await db.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        token: normalizedCode,
        expires: { gt: new Date() },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "الرمز غير صحيح أو منتهي الصلاحية." }, { status: 400 });
    }

    const user = await db.user.update({
      where: { email: normalizedEmail },
      data: { emailVerified: new Date() },
      select: {
        id: true,
        rewardPoints: {
          include: {
            history: { where: { reason: "onboarding_email_verified" }, take: 1 },
          },
        },
      },
    });

    await db.verificationToken.deleteMany({
      where: { identifier: normalizedEmail },
    });

    // Auto-grant 20 points for email verification (idempotent)
    if (!user.rewardPoints?.history.length) {
      try {
        await db.$transaction(async (tx) => {
          const rp = await tx.rewardPoints.upsert({
            where: { userId: user.id },
            update: { points: { increment: EMAIL_VERIFY_POINTS } },
            create: { userId: user.id, points: EMAIL_VERIFY_POINTS, tier: "bronze" },
          });
          await tx.rewardHistory.create({
            data: { rewardId: rp.id, points: EMAIL_VERIFY_POINTS, reason: "onboarding_email_verified" },
          });
          await tx.notification.create({
            data: {
              userId: user.id,
              title: "🎉 مكافأة تفعيل البريد!",
              body: `حصلتِ على ${EMAIL_VERIFY_POINTS} نقطة لتفعيل بريدك الإلكتروني.`,
              type: "success",
            },
          });
        });
      } catch (rewardErr) {
        console.error("[VERIFY_EMAIL_REWARD]", rewardErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[VERIFY_EMAIL]", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
