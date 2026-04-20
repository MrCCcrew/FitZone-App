import { NextRequest, NextResponse } from "next/server";
import { createAppSessionToken, APP_SESSION_COOKIE, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";
import { findOrCreateOAuthUser, parsePendingOAuthToken } from "@/lib/oauth";

export async function POST(req: NextRequest) {
  const pending = parsePendingOAuthToken(req.cookies.get("oauth_pending_profile")?.value);
  if (!pending) {
    return NextResponse.json({ error: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى." }, { status: 400 });
  }

  const { accepted } = (await req.json()) as { accepted?: boolean };
  if (!accepted) {
    const res = NextResponse.json({ error: "يجب الموافقة على الشروط للمتابعة." }, { status: 400 });
    res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
    res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  }

  const result = await findOrCreateOAuthUser({
    provider: pending.provider,
    providerId: pending.providerId,
    email: pending.email,
    name: pending.name,
  });

  if (!result?.user) {
    const res = NextResponse.json({ error: "تعذر إنشاء الحساب حاليًا." }, { status: 500 });
    res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
    res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  }

  if (result.requiresVerification && result.user.email) {
    const redirectTo = `/verify-email?email=${encodeURIComponent(result.user.email)}${result.emailSent ? "" : "&sent=0"}`;
    const res = NextResponse.json({ ok: true, redirectTo });
    res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
    res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
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
  res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
  res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
