import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE, getAppSessionCookieOptions } from "@/lib/app-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(APP_SESSION_COOKIE, "", { ...getAppSessionCookieOptions(), maxAge: 0 });
  return response;
}
