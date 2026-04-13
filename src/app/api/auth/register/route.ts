import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`register:${clientIp}`, 5, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات التسجيل كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { name, email, phone, password, referralCode } = await req.json();

    const normalizedName = String(name ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPhone = String(phone ?? "").trim();
    const normalizedPassword = String(password ?? "");

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return NextResponse.json(
        { error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة." },
        { status: 400 },
      );
    }

    if (normalizedName.split(/\s+/).length < 3) {
      return NextResponse.json(
        { error: "يجب إدخال ثلاثة أسماء على الأقل (الاسم الأول والأوسط والأخير)." },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (!existing.emailVerified) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await db.verificationToken.deleteMany({ where: { identifier: normalizedEmail } });
        await db.verificationToken.create({
          data: { identifier: normalizedEmail, token: code, expires },
        });

        const emailSent = await sendVerificationEmail(normalizedEmail, existing.name ?? normalizedName, code);

        return NextResponse.json(
          {
            error: "هذا البريد مسجل بالفعل لكنه غير مفعل.",
            requiresVerification: true,
            email: normalizedEmail,
            emailSent,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: "هذا البريد الإلكتروني مسجل بالفعل." },
        { status: 409 },
      );
    }

    const hashedPassword = await bcryptjs.hash(normalizedPassword, 12);
    const normalizedReferralCode = referralCode ? String(referralCode).trim().toUpperCase() : null;

    // Validate referral code before creating user
    let referralRecord: { id: string; userId: string } | null = null;
    if (normalizedReferralCode) {
      referralRecord = await db.referral.findUnique({
        where: { code: normalizedReferralCode },
        select: { id: true, userId: true },
      }) ?? null;
      // Silently ignore invalid codes — don't block registration
    }

    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone || null,
          password: hashedPassword,
          role: "member",
        },
      });

      await tx.wallet.create({ data: { userId: createdUser.id, balance: 0 } });
      await tx.rewardPoints.create({ data: { userId: createdUser.id, points: 0, tier: "bronze" } });
      await tx.referral.create({
        data: { userId: createdUser.id, code: `FZ-${createdUser.id.slice(-6).toUpperCase()}` },
      });

      // Record referral usage and reward the referrer with 50 EGP wallet credit
      if (referralRecord) {
        const REFERRAL_REWARD_EGP = 50;

        // Ensure referrer has a wallet
        const referrerWallet = await tx.wallet.upsert({
          where: { userId: referralRecord.userId },
          update: {},
          create: { userId: referralRecord.userId, balance: 0 },
        });

        await tx.wallet.update({
          where: { id: referrerWallet.id },
          data: { balance: { increment: REFERRAL_REWARD_EGP } },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: referrerWallet.id,
            amount: REFERRAL_REWARD_EGP,
            type: "credit",
            description: `مكافأة إحالة — انضمت ${normalizedName}`,
          },
        });

        await tx.referralUsage.create({
          data: {
            referralId: referralRecord.id,
            referredUserId: createdUser.id,
            rewardGiven: true,
            rewardType: "wallet",
            rewardValue: REFERRAL_REWARD_EGP,
          },
        });

        await tx.referral.update({
          where: { id: referralRecord.id },
          data: {
            referredCount: { increment: 1 },
            totalEarned: { increment: REFERRAL_REWARD_EGP },
          },
        });

        // Notify referrer
        await tx.notification.create({
          data: {
            userId: referralRecord.userId,
            title: "🎉 مكافأة إحالة!",
            body: `انضمت ${normalizedName} بكودك وحصلتِ على ${REFERRAL_REWARD_EGP} ج.م في محفظتك!`,
            type: "success",
          },
        });
      }

      return createdUser;
    });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.verificationToken.deleteMany({ where: { identifier: normalizedEmail } });
    await db.verificationToken.create({
      data: { identifier: normalizedEmail, token: code, expires },
    });

    const emailSent = await sendVerificationEmail(normalizedEmail, normalizedName, code);

    try {
      await db.notification.create({
        data: {
          userId: user.id,
          title: "مرحبًا بك في FitZone",
          body: "تم إنشاء حسابك بنجاح. أدخل رمز التفعيل المرسل إلى بريدك الإلكتروني لإكمال التفعيل.",
          type: "success",
        },
      });
    } catch (notificationError) {
      console.error("[REGISTER_NOTIFICATION]", notificationError);
    }

    const response = NextResponse.json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      emailSent,
    });

    response.cookies.set(ADMIN_SESSION_COOKIE, "", {
      ...getAdminSessionCookieOptions(),
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
