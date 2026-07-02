import { NextRequest, NextResponse } from "next/server";
import { createAppSessionToken, APP_SESSION_COOKIE, getAppSessionCookieOptions } from "@/lib/app-session";
import { findOrCreateOAuthUser, parsePendingOAuthToken } from "@/lib/oauth";
import { db } from "@/lib/db";

const CLEAR_COOKIES = (res: NextResponse) => {
  res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_ref_code",        "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_partner_ref",     "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_staff_ref",       "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_trainer_ref",     "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_nutrition_ref",   "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_agent_ref",       "", { httpOnly: true, maxAge: 0, path: "/" });
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

  const refCode        = req.cookies.get("oauth_ref_code")?.value?.trim().toUpperCase()      || null;
  const partnerRefToken  = req.cookies.get("oauth_partner_ref")?.value?.trim().toUpperCase()  || null;
  const staffRefToken    = req.cookies.get("oauth_staff_ref")?.value?.trim().toUpperCase()    || null;
  const trainerRefToken  = req.cookies.get("oauth_trainer_ref")?.value?.trim().toUpperCase()  || null;
  const nutritionRefToken = req.cookies.get("oauth_nutrition_ref")?.value?.trim().toUpperCase() || null;
  const agentRefToken    = req.cookies.get("oauth_agent_ref")?.value?.trim().toUpperCase()    || null;

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
        // Track referral — reward is held until the referred user subscribes or purchases
        await db.$transaction(async (tx) => {
          await tx.referral.update({
            where: { id: referralRecord.id },
            data: { referredCount: { increment: 1 } },
          });

          await tx.referralUsage.create({
            data: {
              referralId: referralRecord.id,
              referredUserId: result.user.id,
              rewardGiven: false,
              rewardType: null,
              rewardValue: null,
            },
          });
        });
      }
    } catch {
      // Referral error must not block account creation
    }
  }

  // Apply partner affiliate ref for new users (separate from member referral)
  if (result.isNew && partnerRefToken) {
    try {
      const al = await db.partnerAffiliateLink.findUnique({
        where: { token: partnerRefToken },
        select: { isActive: true },
      });
      if (al?.isActive) {
        await db.user.update({
          where: { id: result.user.id },
          data: { pendingPartnerRef: partnerRefToken },
        });
      }
    } catch {
      // Non-blocking — partner ref failure must not block account creation
    }
  }

  // Apply staff / trainer / nutrition / agent pending refs for new OAuth users
  if (result.isNew && (staffRefToken || trainerRefToken || nutritionRefToken || agentRefToken)) {
    try {
      const dbx = db as any;
      const updates: Record<string, string | null> = {};

      if (staffRefToken) {
        const sl = await dbx.staffReferralLink.findUnique({ where: { token: staffRefToken }, select: { isActive: true } });
        if (sl?.isActive) updates.pendingStaffRef = staffRefToken;
      }
      if (trainerRefToken) {
        const tl = await dbx.trainerReferralLink.findUnique({ where: { token: trainerRefToken }, select: { isActive: true } });
        if (tl?.isActive) updates.pendingTrainerRef = trainerRefToken;
      }
      if (nutritionRefToken) {
        const nl = await dbx.nutritionReferralLink.findUnique({ where: { token: nutritionRefToken }, select: { isActive: true } });
        if (nl?.isActive) updates.pendingNutritionRef = nutritionRefToken;
      }
      if (agentRefToken) {
        const ag = await dbx.salesAgent.findUnique({ where: { referralCode: agentRefToken }, select: { isActive: true } });
        if (ag?.isActive) updates.pendingAgentRef = agentRefToken;
      }

      if (Object.keys(updates).length > 0) {
        await dbx.user.update({ where: { id: result.user.id }, data: updates });
      }
    } catch {
      // Non-blocking — ref failures must not block account creation
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
  return CLEAR_COOKIES(res);
}
