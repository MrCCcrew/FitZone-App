import { NextRequest, NextResponse } from "next/server";
import { APP_SESSION_COOKIE, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";

export async function POST(req: NextRequest) {
  const pending = req.cookies.get("oauth_pending_session")?.value;
  if (!pending) {
    return NextResponse.json({ error: "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى." }, { status: 400 });
  }

  const { accepted } = (await req.json()) as { accepted?: boolean };
  if (!accepted) {
    const res = NextResponse.json({ error: "يجب الموافقة على الشروط للمتابعة." }, { status: 400 });
    res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, pending, getAppSessionCookieOptions());
  res.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
  res.cookies.set("oauth_pending_session", "", { httpOnly: true, maxAge: 0, path: "/" });
  return res;
}
