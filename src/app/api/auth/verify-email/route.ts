import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";

export async function POST(req: Request) {
  try {
    const sessionUser = await getCurrentAppUser();
    const { code, email } = await req.json();

    const normalizedCode = String(code ?? "").trim();
    const normalizedEmail = String(email ?? sessionUser?.email ?? "").trim().toLowerCase();

    if (!normalizedEmail) {
      return NextResponse.json({ error: "البريد الإلكتروني مطلوب." }, { status: 400 });
    }

    if (!normalizedCode) {
      return NextResponse.json({ error: "رمز التفعيل مطلوب." }, { status: 400 });
    }

    const record = await db.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        token: normalizedCode,
        expires: { gt: new Date() },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "الرمز غير صحيح أو منتهي الصلاحية." }, { status: 400 });
    }

    await db.user.update({
      where: { email: normalizedEmail },
      data: { emailVerified: new Date() },
    });

    await db.verificationToken.deleteMany({
      where: { identifier: normalizedEmail },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[VERIFY_EMAIL]", err);
    return NextResponse.json({ error: "حدث خطأ في الخادم." }, { status: 500 });
  }
}
