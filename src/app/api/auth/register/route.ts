import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { createAppSessionToken, getAppSessionCookieOptions } from "@/lib/app-session";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
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
    const user = await db.user.create({
      data: {
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone || null,
        password: hashedPassword,
        role: "member",
      },
    });

    await db.wallet.create({ data: { userId: user.id, balance: 0 } });
    await db.rewardPoints.create({ data: { userId: user.id, points: 0, tier: "bronze" } });
    await db.referral.create({ data: { userId: user.id, code: `FZ-${user.id.slice(-6).toUpperCase()}` } });

    // إنشاء كود التفعيل وإرساله بالبريد
    try {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.verificationToken.deleteMany({ where: { identifier: normalizedEmail } });
      await db.verificationToken.create({
        data: { identifier: normalizedEmail, token: code, expires },
      });
      await sendVerificationEmail(normalizedEmail, normalizedName, code);
    } catch (emailError) {
      console.error("[REGISTER_EMAIL]", emailError);
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
    response.cookies.set("fitzone_app_session", token, cookieOptions);
    return response;
  } catch (error) {
    console.error("[REGISTER]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
