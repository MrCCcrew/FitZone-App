import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth not configured." }, { status: 503 });
  const base = getAppBaseUrl(req);

  const refCode = req.nextUrl.searchParams.get("ref")?.trim().toUpperCase() ?? "";

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/auth/oauth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "offline",
    prompt: "select_account",
  });

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("oauth_state", state, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (refCode) {
    res.cookies.set("oauth_ref_code", refCode, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  }
  return res;
}
