import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken, getAdminSessionCookieOptions } from "@/lib/admin-session";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`admin-login:${clientIp}`, 6, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many admin login attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { email, password } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPassword = String(password ?? "");

    if (!normalizedEmail || !normalizedPassword) {
      return NextResponse.json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        jobTitle: true,
        adminAccess: true,
        adminPermissions: true,
        isActive: true,
      },
    });
    const permissions =
      typeof user?.adminPermissions === "string"
        ? JSON.parse(user.adminPermissions || "[]")
        : [];
    if (
      !user?.password ||
      user.isActive === false ||
      (!user.adminAccess && user.role !== "admin" && user.role !== "staff")
    ) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
    }

    const valid = user.password.startsWith("$2") && (await bcryptjs.compare(normalizedPassword, user.password));
    if (!valid) {
      return NextResponse.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
    }

    const token = createAdminSessionToken({
      id: user.id,
      email: user.email ?? normalizedEmail,
      name: user.name ?? "FitZone Admin",
      role: user.role,
      jobTitle: user.jobTitle,
      permissions: Array.isArray(permissions) ? permissions : [],
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        jobTitle: user.jobTitle,
        permissions: Array.isArray(permissions) ? permissions : [],
      },
    });

    response.cookies.set(ADMIN_SESSION_COOKIE, token, getAdminSessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[ADMIN_LOGIN]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
