import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const sessionUser = await getCurrentAppUser();
    const body = await req.json().catch(() => ({}));
    const normalizedEmail = String(body.email ?? sessionUser?.email ?? "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    }

    const fullUser = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { email: true, name: true, emailVerified: true },
    });

    if (!fullUser?.email) {
      return NextResponse.json({ error: "لم يتم العثور على المستخدم." }, { status: 404 });
    }

    if (fullUser.emailVerified) {
      return NextResponse.json({ error: "البريد الإلكتروني مفعل بالفعل." }, { status: 400 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.verificationToken.deleteMany({ where: { identifier: fullUser.email } });
    await db.verificationToken.create({
      data: { identifier: fullUser.email, token: code, expires },
    });

    const emailSent = await sendVerificationEmail(fullUser.email, fullUser.name ?? "عضو FitZone", code);

    if (!emailSent) {
      return NextResponse.json({ error: "تعذر إرسال رسالة التفعيل الآن." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[RESEND_VERIFICATION]", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
