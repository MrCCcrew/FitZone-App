import { NextRequest, NextResponse } from "next/server";
import { createPendingOAuthToken, findExistingOAuthUser, getAppBaseUrl } from "@/lib/oauth";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";

export async function GET(req: NextRequest) {
  const base = getAppBaseUrl();
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${base}/api/auth/oauth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error("no_token");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = (await profileRes.json()) as { sub?: string; email?: string; name?: string };
    if (!profile.sub) throw new Error("no_sub");

    const existing = await findExistingOAuthUser({
      provider: "google",
      providerId: profile.sub,
      email: profile.email ?? null,
    });

    if (!existing) {
      if (!profile.email) throw new Error("no_email");

      const pendingToken = createPendingOAuthToken({
        provider: "google",
        providerId: profile.sub,
        email: profile.email,
        name: profile.name ?? null,
      });

      const res = NextResponse.redirect(`${base}/google-consent`);
      res.cookies.set("oauth_pending_profile", pendingToken, {
        httpOnly: true,
        maxAge: 600,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
      res.cookies.set("oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" });
      return res;
    }

    if (existing.requiresVerification && existing.user.email) {
      const verifyParams = new URLSearchParams({ email: existing.user.email });
      if (!existing.emailSent) verifyParams.set("sent", "0");
      return NextResponse.redirect(`${base}/verify-email?${verifyParams.toString()}`);
    }

    const token = createAppSessionToken({
      id: existing.user.id,
      email: existing.user.email ?? "",
      name: existing.user.name ?? "عضو FitZone",
      role: existing.user.role as "member" | "admin" | "staff" | "trainer" | "accountant",
    });

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
    res.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
    res.cookies.set("oauth_pending_profile", "", { httpOnly: true, maxAge: 0, path: "/" });
    res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    res.cookies.set("oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[GOOGLE_CALLBACK]", err);
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }
}
