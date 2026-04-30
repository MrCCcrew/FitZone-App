import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = await applySensitiveRateLimit(`app-login:${clientIp}`, 8, 5 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات تسجيل الدخول كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { email, password } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json(
        { error: "البريد الإلكتروني وكلمة المرور مطلوبان." },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        emailVerified: true,
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "هذا البريد الإلكتروني غير مسجل لدينا." },
        { status: 401 },
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { error: "هذا الحساب موقوف. تواصلي مع الإدارة." },
        { status: 401 },
      );
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "هذا الحساب مسجل عبر Google أو Apple — يرجى تسجيل الدخول بنفس الطريقة." },
        { status: 401 },
      );
    }

    const valid = user.password.startsWith("$2") && (await bcryptjs.compare(normalizedPassword, user.password));
    if (!valid) {
      return NextResponse.json(
        { error: "كلمة المرور غير صحيحة." },
        { status: 401 },
      );
    }

    if (!user.emailVerified) {
      return NextResponse.json(
        {
          error: "يجب تفعيل البريد الإلكتروني أولًا.",
          requiresVerification: true,
          email: user.email ?? normalizedEmail,
        },
        { status: 403 },
      );
    }

    const token = createAppSessionToken({
      id: user.id,
      email: user.email ?? normalizedEmail,
      name: user.name ?? "عضو FitZone",
      role: user.role as "member" | "admin" | "staff" | "trainer" | "accountant",
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
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
