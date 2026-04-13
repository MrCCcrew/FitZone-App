import { NextResponse } from "next/server";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const limit = applyRateLimit(`reset-password:${clientIp}`, 8, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "محاولات إعادة ضبط كلمة المرور كثيرة جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    if (!token || !password) {
      return NextResponse.json({ error: "الرابط أو كلمة المرور غير صالحين." }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." }, { status: 400 });
    }

    const record = await db.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.expires <= new Date()) {
      return NextResponse.json({ error: "رابط إعادة ضبط كلمة المرور غير صالح أو منتهي الصلاحية." }, { status: 400 });
    }

    const hashedPassword = await bcryptjs.hash(password, 12);

    await db.user.update({
      where: { email: record.identifier },
      data: { password: hashedPassword },
    });

    await db.passwordResetToken.deleteMany({
      where: { identifier: record.identifier },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[RESET_PASSWORD]", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
