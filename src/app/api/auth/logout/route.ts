import { NextResponse } from "next/server";
import { getAppSessionCookieOptions } from "@/lib/app-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  const cookieOptions = getAppSessionCookieOptions();
  response.cookies.set("fitzone_app_session", "", { ...cookieOptions, maxAge: 0 });
  return response;
}
