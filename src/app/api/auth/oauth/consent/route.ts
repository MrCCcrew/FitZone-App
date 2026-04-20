import { NextRequest, NextResponse } from "next/server";
import { createAppSessionToken, APP_SESSION_COOKIE, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";
import { findOrCreateOAuthUser, parsePendingOAuthToken } from "@/lib/oauth";
import { db } from "@/lib/db";

const CLEAR_COOKIES = (res: NextResponse) => {
  res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_ref_code", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
};

export async function POST(req: NextRequest) {
  const pending = parsePendingOAuthToken(req.cookies.get("oauth_pending_profile")?.value);
  if (!pending) {
    return NextResponse.json({ error: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى." }, { status: 400 });
  }

  const { accepted } = (await req.json()) as { accepted?: boolean };
  if (!accepted) {
    return CLEAR_COOKIES(NextResponse.json({ error: "يجب الموافقة على الشروط للمتابعة." }, { status: 400 }));
  }

  const refCode = req.cookies.get("oauth_ref_code")?.value?.trim().toUpperCase() || null;

  const result = await findOrCreateOAuthUser({
    provider: pending.provider,
    providerId: pending.providerId,
    email: pending.email,
    name: pending.name,
  });

  if (!result?.user) {
    return CLEAR_COOKIES(NextResponse.json({ error: "تعذر إنشاء الحساب حاليًا." }, { status: 500 }));
  }

  // Apply referral reward if this is a brand-new user with a valid referral code
  if (result.isNew && refCode) {
    try {
      const referralRecord = await db.referral.findUnique({
        where: { code: refCode },
        select: { id: true, userId: true },
      });

      const isOwnCode = referralRecord?.userId === result.user.id;
      const alreadyUsed = referralRecord
        ? !!(await db.referralUsage.findUnique({ where: { referredUserId: result.user.id } }))
        : false;

      if (referralRecord && !isOwnCode && !alreadyUsed) {
        const REWARD = 50;
        await db.$transaction(async (tx) => {
          const referrerWallet = await tx.wallet.upsert({
            where: { userId: referralRecord.userId },
            update: {},
            create: { userId: referralRecord.userId, balance: 0 },
          });
          await tx.wallet.update({
            where: { id: referrerWallet.id },
            data: { balance: { increment: REWARD } },
          });
          await tx.walletTransaction.create({
            data: {
              walletId: referrerWallet.id,
              amount: REWARD,
              type: "credit",
              description: `مكافأة إحالة — انضمت ${result.user.name ?? result.user.email} (Google)`,
            },
          });
          await tx.referralUsage.create({
            data: {
              referralId: referralRecord.id,
              referredUserId: result.user.id,
              rewardGiven: true,
              rewardType: "wallet",
              rewardValue: REWARD,
            },
          });
          await tx.referral.update({
            where: { id: referralRecord.id },
            data: { referredCount: { increment: 1 }, totalEarned: { increment: REWARD } },
          });
          await tx.notification.create({
            data: {
              userId: referralRecord.userId,
              title: "🎉 مكافأة إحالة!",
              body: `انضمت ${result.user.name ?? result.user.email} بكودك وحصلتِ على ${REWARD} ج.م في محفظتك!`,
              type: "success",
            },
          });
        });
      }
    } catch {
      // Referral error must not block account creation
    }
  }

  if (result.requiresVerification && result.user.email) {
    const redirectTo = `/verify-email?email=${encodeURIComponent(result.user.email)}${result.emailSent ? "" : "&sent=0"}`;
    return CLEAR_COOKIES(NextResponse.json({ ok: true, redirectTo }));
  }

  const token = createAppSessionToken({
    id: result.user.id,
    email: result.user.email ?? "",
    name: result.user.name ?? "عضو FitZone",
    role: result.user.role as "member" | "admin" | "staff" | "trainer" | "accountant",
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
  return CLEAR_COOKIES(res);
}
