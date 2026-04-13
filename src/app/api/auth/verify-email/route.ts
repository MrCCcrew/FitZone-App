import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentAppUser } from "@/lib/app-session";
import { applyRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const sessionUser = await getCurrentAppUser();
    const { code, email } = await req.json();

    const normalizedCode = String(code ?? "").trim();
    const normalizedEmail = String(email ?? sessionUser?.email ?? "").trim().toLowerCase();

    const limit = applyRateLimit(`verify-email:${clientIp}:${normalizedEmail || "unknown"}`, 8, 10 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "عدد محاولات التحقق كبير جدًا. حاول مرة أخرى بعد قليل." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    if (!normalizedEmail) {
      return NextResponse.json({ error: "ط§ظ„ط¨ط±ظٹط¯ ط§ظ„ط¥ظ„ظƒطھط±ظˆظ†ظٹ ظ…ط·ظ„ظˆط¨." }, { status: 400 });
    }

    if (!normalizedCode) {
      return NextResponse.json({ error: "ط±ظ…ط² ط§ظ„طھظپط¹ظٹظ„ ظ…ط·ظ„ظˆط¨." }, { status: 400 });
    }

    const record = await db.verificationToken.findFirst({
      where: {
        identifier: normalizedEmail,
        token: normalizedCode,
        expires: { gt: new Date() },
      },
    });

    if (!record) {
      return NextResponse.json({ error: "ط§ظ„ط±ظ…ط² ط؛ظٹط± طµط­ظٹط­ ط£ظˆ ظ…ظ†طھظ‡ظٹ ط§ظ„طµظ„ط§ط­ظٹط©." }, { status: 400 });
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
    return NextResponse.json({ error: "ط­ط¯ط« ط®ط·ط£ ظپظٹ ط§ظ„ط®ط§ط¯ظ…." }, { status: 500 });
  }
}
