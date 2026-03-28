import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { APP_SESSION_COOKIE, createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { ADMIN_SESSION_COOKIE, getAdminSessionCookieOptions } from "@/lib/admin-session";
import { sendVerificationEmail } from "@/lib/email";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`register:${clientIp}`, 5, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { name, email, phone, password } = await req.json();

    const normalizedName = String(name ?? "").trim();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    const normalizedPhone = String(phone ?? "").trim();
    const normalizedPassword = String(password ?? "");

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return NextResponse.json(
        { error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" },
        { status: 400 },
      );
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { error: "البريد الإلكتروني مسجل بالفعل" },
        { status: 409 },
      );
    }

    const hashedPassword = await bcryptjs.hash(normalizedPassword, 12);
    const user = await db.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          name: normalizedName,
          email: normalizedEmail,
          phone: normalizedPhone || null,
          password: hashedPassword,
          role: "member",
        },
      });

      await tx.wallet.create({ data: { userId: createdUser.id, balance: 0 } });
      await tx.rewardPoints.create({ data: { userId: createdUser.id, points: 0, tier: "bronze" } });
      await tx.referral.create({
        data: { userId: createdUser.id, code: `FZ-${createdUser.id.slice(-6).toUpperCase()}` },
      });

      return createdUser;
    });

    // إنشاء كود التفعيل وإرساله بالبريد
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.verificationToken.deleteMany({ where: { identifier: normalizedEmail } });
      await db.verificationToken.create({
        data: { identifier: normalizedEmail, token: code, expires },
      });
      // fire-and-forget عشان ما نعلقش التسجيل
      sendVerificationEmail(normalizedEmail, normalizedName, code)
        .catch((emailError) => console.error("[REGISTER_EMAIL]", emailError));
    } catch (emailError) {
      console.error("[REGISTER_TOKEN]", emailError);
    }

    try {
      await db.notification.create({
        data: {
          userId: user.id,
          title: "مرحبًا بك في فيت زون",
          body: `أهلًا ${normalizedName}، تم إنشاء حسابك بنجاح ويمكنك الآن استكشاف الاشتراكات والحجوزات.`,
          type: "success",
        },
      });
    } catch (notificationError) {
      console.error("[REGISTER_NOTIFICATION]", notificationError);
    }

    const token = createAppSessionToken({
      id: user.id,
      email: user.email ?? normalizedEmail,
      name: user.name ?? normalizedName,
      role: user.role as "member" | "admin" | "staff" | "trainer",
    });

    const response = NextResponse.json({ success: true });
    const cookieOptions = getAppSessionCookieOptions();
    response.cookies.set(ADMIN_SESSION_COOKIE, "", { ...getAdminSessionCookieOptions(), maxAge: 0 });
    response.cookies.set(APP_SESSION_COOKIE, token, cookieOptions);
    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
