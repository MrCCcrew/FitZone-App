import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { findAuthUserByEmail } from "@/lib/mysql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, { status: 400 });
    }

    const user = await findAuthUserByEmail(normalizedEmail);
    if (!user?.password) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
    }

    const valid = user.password.startsWith("$2") && (await bcryptjs.compare(normalizedPassword, user.password));
    if (!valid) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
    }

    const token = createAppSessionToken({
      id: user.id,
      email: user.email ?? normalizedEmail,
      name: user.name ?? "عضو فيت زون",
      role: user.role as "member" | "admin" | "staff" | "trainer",
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });

    response.cookies.set(APP_SESSION_COOKIE, token, getAppSessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[APP_LOGIN]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
