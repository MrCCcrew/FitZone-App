import { NextResponse } from "next/server";
import { getAdminSessionCookieOptions } from "@/lib/admin-session";

export async function POST() {
  const response = NextResponse.json({ success: true });
  const cookieOptions = getAdminSessionCookieOptions();
  response.cookies.set("fitzone_admin_session", "", {
    ...cookieOptions,
    maxAge: 0,
  });
  return response;
}
