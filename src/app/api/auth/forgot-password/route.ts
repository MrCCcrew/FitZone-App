import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/oauth";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`forgot-password:${clientIp}`, 5, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "تم طلب إعادة ضبط كلمة المرور مرات كثيرة. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const normalizedEmail = String(body.email ?? "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (user?.email && user.isActive !== false) {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.passwordResetToken.deleteMany({ where: { identifier: user.email } });
      await db.passwordResetToken.create({
        data: {
          identifier: user.email,
          token,
          expires,
        },
      });

      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;
      await sendPasswordResetEmail(user.email, user.name ?? user.email.split("@")[0], resetUrl);
    }

    return NextResponse.json({
      success: true,
      message: "إذا كان البريد الإلكتروني مسجلًا، فسيصلك رابط لإعادة ضبط كلمة المرور.",
    });
  } catch (error) {
    console.error("[FORGOT_PASSWORD]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
