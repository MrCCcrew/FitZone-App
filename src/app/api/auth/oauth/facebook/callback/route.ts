import { NextRequest, NextResponse } from "next/server";
import { findOrCreateOAuthUser, getAppBaseUrl } from "@/lib/oauth";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";

export async function GET(req: NextRequest) {
  const base = getAppBaseUrl(req);
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const savedState = req.cookies.get("oauth_state")?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }

  try {
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID!,
        client_secret: process.env.FACEBOOK_APP_SECRET!,
        redirect_uri: `${base}/api/auth/oauth/facebook/callback`,
        code,
      })}`,
    );
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) throw new Error("no_token");

    const profileRes = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${tokens.access_token}`,
    );
    const profile = (await profileRes.json()) as { id?: string; name?: string; email?: string };
    if (!profile.id) throw new Error("no_id");

    const result = await findOrCreateOAuthUser({
      provider: "facebook",
      providerId: profile.id,
      email: profile.email ?? null,
      name: profile.name ?? null,
    });
    if (!result?.user) throw new Error("no_user");

    if (result.requiresVerification && result.user.email) {
      const verifyParams = new URLSearchParams({ email: result.user.email });
      if (!result.emailSent) verifyParams.set("sent", "0");
      return NextResponse.redirect(`${base}/verify-email?${verifyParams.toString()}`);
    }

    const token = createAppSessionToken({
      id: result.user.id,
      email: result.user.email ?? "",
      name: result.user.name ?? "عضو FitZone",
      role: result.user.role as "member" | "admin" | "staff" | "trainer" | "accountant",
    });

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
    res.cookies.set("oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[FACEBOOK_CALLBACK]", err);
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }
}
