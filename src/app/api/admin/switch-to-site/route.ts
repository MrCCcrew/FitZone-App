import { NextResponse } from "next/server";
import { getCurrentAdminUser } from "@/lib/admin-session";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const adminUser = await getCurrentAdminUser();
  if (!adminUser) {
    return NextResponse.redirect(new URL("/admin/login?callbackUrl=/admin", req.url));
  }

  const token = createAppSessionToken({
    id: adminUser.id,
    email: adminUser.email,
    name: adminUser.name || "FitZone User",
    role: adminUser.role as "member" | "admin" | "staff" | "trainer" | "accountant",
  });

  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
  return response;
}

