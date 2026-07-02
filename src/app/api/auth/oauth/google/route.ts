import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getAppBaseUrl } from "@/lib/oauth";

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Google OAuth not configured." }, { status: 503 });

  const refCode     = req.nextUrl.searchParams.get("ref")?.trim().toUpperCase() ?? "";
  const partnerRef  = req.nextUrl.searchParams.get("partnerRef")?.trim().toUpperCase() ?? "";
  const staffRef    = req.nextUrl.searchParams.get("staffRef")?.trim().toUpperCase() ?? "";
  const trainerRef  = req.nextUrl.searchParams.get("trainerRef")?.trim().toUpperCase() ?? "";
  const nutritionRef = req.nextUrl.searchParams.get("nutritionRef")?.trim().toUpperCase() ?? "";
  const agentRef    = req.nextUrl.searchParams.get("agentRef")?.trim().toUpperCase() ?? "";

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
  if (refCode)      res.cookies.set("oauth_ref_code",      refCode,      { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (partnerRef)   res.cookies.set("oauth_partner_ref",   partnerRef,   { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (staffRef)     res.cookies.set("oauth_staff_ref",     staffRef,     { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (trainerRef)   res.cookies.set("oauth_trainer_ref",   trainerRef,   { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (nutritionRef) res.cookies.set("oauth_nutrition_ref", nutritionRef, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  if (agentRef)     res.cookies.set("oauth_agent_ref",     agentRef,     { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  return res;
}
