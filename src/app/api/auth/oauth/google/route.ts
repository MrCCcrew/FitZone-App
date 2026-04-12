import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/oauth";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth not configured." }, { status: 503 });

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getAppBaseUrl()}/api/auth/oauth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("oauth_state", state, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  return res;
}
