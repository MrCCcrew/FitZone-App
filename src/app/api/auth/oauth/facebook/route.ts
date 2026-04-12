import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/oauth";

export async function GET() {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return NextResponse.json({ error: "Facebook OAuth غير مفعّل." }, { status: 503 });
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: `${getAppBaseUrl()}/api/auth/oauth/facebook/callback`,
    scope: "email,public_profile",
    response_type: "code",
    state,
  });

  const res = NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params}`,
  );
  res.cookies.set("oauth_state", state, {
    httpOnly: true,
    maxAge: 600,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
