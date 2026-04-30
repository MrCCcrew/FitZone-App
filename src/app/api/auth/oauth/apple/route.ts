import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/oauth";

export async function GET(req: Request) {
  const clientId = process.env.APPLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Apple OAuth غير مفعّل." }, { status: 503 });
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${getAppBaseUrl({ headers: req.headers })}/api/auth/oauth/apple/callback`,
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post",
    state,
  });

  const res = NextResponse.redirect(
    `https://appleid.apple.com/auth/authorize?${params}`,
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
