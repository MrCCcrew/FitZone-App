import { NextRequest, NextResponse } from "next/server";
import { findOrCreateOAuthUser, generateAppleClientSecret, getAppBaseUrl, verifyAppleIdToken } from "@/lib/oauth";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";

// Apple sends a form POST to the callback URL
export async function POST(req: NextRequest) {
  const base = getAppBaseUrl();

  try {
    const formData = await req.formData();
    const code = formData.get("code") as string | null;
    const state = formData.get("state") as string | null;
    const idToken = formData.get("id_token") as string | null;
    const userJson = formData.get("user") as string | null; // only on first login
    const savedState = req.cookies.get("oauth_state")?.value;

    if (!code || !state || !savedState || state !== savedState) {
      return NextResponse.redirect(`${base}/login?error=oauth_failed`);
    }

    // Extract name from first-login user JSON
    let appleDisplayName: string | null = null;
    if (userJson) {
      try {
        const userObj = JSON.parse(userJson) as {
          name?: { firstName?: string; lastName?: string };
        };
        const first = userObj.name?.firstName ?? "";
        const last = userObj.name?.lastName ?? "";
        appleDisplayName = [first, last].filter(Boolean).join(" ") || null;
      } catch {}
    }

    // Verify id_token to get sub + email (no code exchange needed if id_token present)
    let appleUserId: string | null = null;
    let appleEmail: string | null = null;

    if (idToken) {
      const claims = await verifyAppleIdToken(idToken);
      if (!claims) {
        return NextResponse.redirect(`${base}/login?error=oauth_failed`);
      }
      appleUserId = claims.sub;
      appleEmail = claims.email;
    } else {
      // Exchange code for tokens
      const clientSecret = generateAppleClientSecret();
      const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.APPLE_CLIENT_ID!,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${base}/api/auth/oauth/apple/callback`,
        }),
      });
      const tokens = (await tokenRes.json()) as { id_token?: string };
      if (!tokens.id_token) throw new Error("no_id_token");

      const claims = await verifyAppleIdToken(tokens.id_token);
      if (!claims) throw new Error("invalid_id_token");
      appleUserId = claims.sub;
      appleEmail = claims.email;
    }

    if (!appleUserId) throw new Error("no_apple_id");

    const user = await findOrCreateOAuthUser({
      provider: "apple",
      providerId: appleUserId,
      email: appleEmail,
      name: appleDisplayName,
    });
    if (!user) throw new Error("no_user");

    const token = createAppSessionToken({
      id: user.id,
      email: user.email ?? "",
      name: user.name ?? "عضو FitZone",
      role: user.role as "member" | "admin" | "staff" | "trainer" | "accountant",
    });

    const res = NextResponse.redirect(`${base}/`);
    res.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
    res.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
    res.cookies.set("oauth_state", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  } catch (err) {
    console.error("[APPLE_CALLBACK]", err);
    return NextResponse.redirect(`${base}/login?error=oauth_failed`);
  }
}
