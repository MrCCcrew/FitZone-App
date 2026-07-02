import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import { getRewardSettings } from "@/lib/reward-settings";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = await applySensitiveRateLimit(`register:${clientIp}`, 5, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات التسجيل كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { name, email, phone, password, referralCode, affiliateRef, partnerRef, agentRef, staffRef, trainerRef, nutritionRef } = await req.json();

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

    // Validate partner affiliate ref — store on user so commission fires even if they subscribe later
    const normalizedAffiliateRef = affiliateRef ? String(affiliateRef).trim().toUpperCase() : null;
    const normalizedPartnerRef = partnerRef ? String(partnerRef).trim().toUpperCase() : null;
    let pendingPartnerRef: string | null = null;
    const partnerToken = normalizedAffiliateRef ?? normalizedPartnerRef;
    if (partnerToken) {
      const al = await db.partnerAffiliateLink.findUnique({
        where: { token: partnerToken },
        select: { id: true, isActive: true },
      });
      if (al?.isActive) pendingPartnerRef = partnerToken;
    }

    // Validate sales agent referral code — store on user for later subscription attribution
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbx = db as any;
    const normalizedAgentRef = agentRef ? String(agentRef).trim().toUpperCase() : null;
    let pendingAgentRef: string | null = null;
    if (normalizedAgentRef) {
      const ag = await dbx.salesAgent.findUnique({ where: { referralCode: normalizedAgentRef }, select: { id: true, isActive: true } });
      if (ag?.isActive) pendingAgentRef = normalizedAgentRef;
    }

    // Validate staff referral link token
    const normalizedStaffRef = staffRef ? String(staffRef).trim().toUpperCase() : null;
    let pendingStaffRef: string | null = null;
    if (normalizedStaffRef) {
      const sl = await dbx.staffReferralLink.findUnique({ where: { token: normalizedStaffRef }, select: { id: true, isActive: true } });
      if (sl?.isActive) pendingStaffRef = normalizedStaffRef;
    }

    // Validate trainer referral link token
    const normalizedTrainerRef = trainerRef ? String(trainerRef).trim().toUpperCase() : null;
    let pendingTrainerRef: string | null = null;
    if (normalizedTrainerRef) {
      const tl = await dbx.trainerReferralLink.findUnique({ where: { token: normalizedTrainerRef }, select: { id: true, isActive: true } });
      if (tl?.isActive) pendingTrainerRef = normalizedTrainerRef;
    }

    // Validate nutritionist referral link token
    const normalizedNutritionRef = nutritionRef ? String(nutritionRef).trim().toUpperCase() : null;
    let pendingNutritionRef: string | null = null;
    if (normalizedNutritionRef) {
      const nl = await dbx.nutritionReferralLink.findUnique({ where: { token: normalizedNutritionRef }, select: { id: true, isActive: true } });
      if (nl?.isActive) pendingNutritionRef = normalizedNutritionRef;
    }

    // Validate referral code before creating user
    let referralRecord: { id: string; userId: string; referredCount: number; subscriptionActivatedCount: number } | null = null;
    if (normalizedReferralCode) {
      const found = await db.referral.findUnique({
        where: { code: normalizedReferralCode },
        select: { id: true, userId: true, referredCount: true, subscriptionActivatedCount: true },
      });
      // Silently ignore invalid codes — don't block registration
      if (found) {
        // Prevent self-referral: check if the code belongs to the same email
        const codeOwner = await db.user.findUnique({
          where: { id: found.userId },
          select: { email: true },
        });
        if (codeOwner?.email?.toLowerCase() !== normalizedEmail) {
          referralRecord = found;
        }
      }
    }

    const rewardSettings = await getRewardSettings();

    const user = await db.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txUser = (tx.user as any);
      const createdUser = await txUser.create({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone || null,
          password: hashedPassword,
          role: "member",
          pendingPartnerRef: pendingPartnerRef || null,
          pendingAgentRef: pendingAgentRef || null,
          pendingStaffRef: pendingStaffRef || null,
          pendingTrainerRef: pendingTrainerRef || null,
          pendingNutritionRef: pendingNutritionRef || null,
        },
      });

      await tx.wallet.create({ data: { userId: createdUser.id, balance: 0 } });
      const newUserRewardPoints = await tx.rewardPoints.create({ data: { userId: createdUser.id, points: 0, tier: "bronze" } });
      await tx.referral.create({
        data: { userId: createdUser.id, code: `FZ-${createdUser.id.slice(-6).toUpperCase()}` },
      });

      // Record referral usage — reward only if subscriptionActivatedCount >= referredCount
      if (referralRecord) {
        const alreadyReferred = await tx.referralUsage.findUnique({
          where: { referredUserId: createdUser.id },
        });
        if (alreadyReferred) referralRecord = null;
      }
      if (referralRecord) {
        const rType  = rewardSettings.referralRewardType;
        const rValue = rewardSettings.referralRewardValue;
        const eligible = referralRecord.subscriptionActivatedCount >= referralRecord.referredCount;

        if (eligible) {
          if (rType === "wallet") {
            const referrerWallet = await tx.wallet.upsert({
              where: { userId: referralRecord.userId },
              update: {},
              create: { userId: referralRecord.userId, balance: 0 },
            });
            await tx.wallet.update({
              where: { id: referrerWallet.id },
              data: { balance: { increment: rValue } },
            });
            await tx.walletTransaction.create({
              data: {
                walletId: referrerWallet.id,
                amount: rValue,
                type: "credit",
                description: `مكافأة إحالة — انضمت ${normalizedName}`,
              },
            });
            await tx.notification.create({
              data: {
                userId: referralRecord.userId,
                title: "🎉 مكافأة إحالة!",
                body: `انضمت ${normalizedName} بكودك وحصلتِ على ${rValue} ج.م في محفظتك!`,
                type: "success",
              },
            });
          } else {
            // points reward for referrer
            const referrerRewards = await tx.rewardPoints.findUnique({ where: { userId: referralRecord.userId } });
            if (referrerRewards) {
              const newPts = referrerRewards.points + rValue;
              const tier = newPts >= 5000 ? "platinum" : newPts >= 3000 ? "gold" : newPts >= 1000 ? "silver" : "bronze";
              await tx.rewardPoints.update({
                where: { id: referrerRewards.id },
                data: { points: { increment: rValue }, tier },
              });
              await tx.rewardHistory.create({
                data: { rewardId: referrerRewards.id, points: rValue, reason: "referral_bonus" },
              });
            }
            await tx.notification.create({
              data: {
                userId: referralRecord.userId,
                title: "🎉 مكافأة إحالة!",
                body: `انضمت ${normalizedName} بكودك وحصلتِ على ${rValue} نقطة في رصيد مكافآتك!`,
                type: "success",
              },
            });
          }

          await tx.referral.update({
            where: { id: referralRecord.id },
            data: {
              referredCount: { increment: 1 },
              totalEarned: { increment: rValue },
            },
          });
        } else {
          // Track the referral but hold the reward until a subscription is activated
          await tx.referral.update({
            where: { id: referralRecord.id },
            data: { referredCount: { increment: 1 } },
          });
        }

        await tx.referralUsage.create({
          data: {
            referralId: referralRecord.id,
            referredUserId: createdUser.id,
            rewardGiven: eligible,
            rewardType: eligible ? rType : null,
            rewardValue: eligible ? rValue : null,
          },
        });

        // Give the new user points for registering with a referral code (immediate, not tied to eligibility)
        if (rewardSettings.pointsPerReferral > 0) {
          const pts = rewardSettings.pointsPerReferral;
          const tier = pts >= 5000 ? "platinum" : pts >= 3000 ? "gold" : pts >= 1000 ? "silver" : "bronze";
          await tx.rewardPoints.update({
            where: { id: newUserRewardPoints.id },
            data: { points: pts, tier },
          });
          await tx.rewardHistory.create({
            data: { rewardId: newUserRewardPoints.id, points: pts, reason: "referral_signup" },
          });
        }
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

    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
