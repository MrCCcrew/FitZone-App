import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { sendVerificationEmail } from "@/lib/email";

export async function POST() {
  try {
    const user = await getCurrentAppUser();
    if (!user) {
      return NextResponse.json({ error: "يجب تسجيل الدخول أولًا" }, { status: 401 });
    }

    const fullUser = await db.user.findUnique({
      where: { id: user.id },
      select: { email: true, name: true, emailVerified: true },
    });

    if (!fullUser?.email) {
      return NextResponse.json({ error: "لم يتم العثور على المستخدم" }, { status: 404 });
    }

    if (fullUser.emailVerified) {
      return NextResponse.json({ error: "البريد الإلكتروني مفعّل بالفعل" }, { status: 400 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.verificationToken.deleteMany({ where: { identifier: fullUser.email } });
    await db.verificationToken.create({
      data: { identifier: fullUser.email, token: code, expires },
    });

    await sendVerificationEmail(fullUser.email, fullUser.name ?? "العضوة", code);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[RESEND_VERIFICATION]", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
