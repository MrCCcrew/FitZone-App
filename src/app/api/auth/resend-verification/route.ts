import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { sendVerificationEmail } from "@/lib/email";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const sessionUser = await getCurrentAppUser();
    const body = await req.json().catch(() => ({}));
    const normalizedEmail = String(body.email ?? sessionUser?.email ?? "").trim().toLowerCase();

    const limit = applyRateLimit(`resend-verification:${clientIp}:${normalizedEmail || "unknown"}`, 4, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "تم طلب إعادة إرسال الكود مرات كثيرة. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    if (!normalizedEmail) {
      return NextResponse.json({ error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ط·ظ„ظˆط¨." }, { status: 400 });
    }

    const fullUser = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { email: true, name: true, emailVerified: true },
    });

    if (!fullUser?.email) {
      return NextResponse.json({ error: "ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ…ط³طھط®ط¯ظ…." }, { status: 404 });
    }

    if (fullUser.emailVerified) {
      return NextResponse.json({ error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ظپط¹ظ„ ط¨ط§ظ„ظپط¹ظ„." }, { status: 400 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.verificationToken.deleteMany({ where: { identifier: fullUser.email } });
    await db.verificationToken.create({
      data: { identifier: fullUser.email, token: code, expires },
    });

    const emailSent = await sendVerificationEmail(fullUser.email, fullUser.name ?? "ط¹ط¶ظˆ FitZone", code);

    if (!emailSent) {
      return NextResponse.json({ error: "طھط¹ط°ط± ط¥ط±ط³ط§ظ„ ط±ط³ط§ظ„ط© ط§ظ„طھظپط¹ظٹظ„ ط§ظ„ط¢ظ†." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[RESEND_VERIFICATION]", err);
    return NextResponse.json({ error: "ط­ط¯ط« ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…." }, { status: 500 });
  }
}
