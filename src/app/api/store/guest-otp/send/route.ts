import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  callTwilioGuestVerify,
  normalizeGuestPhone,
} from "@/lib/store-guest-verify";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { phone?: unknown };
    const phone = normalizeGuestPhone(body.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "INVALID_EGYPTIAN_MOBILE_NUMBER" },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);
    const phoneKey = createHash("sha256").update(phone).digest("hex");

    const [perPhone, perIp] = await Promise.all([
      applySensitiveRateLimit(`guest-otp-send-phone:${phoneKey}`, 3, 900000),
      applySensitiveRateLimit(`guest-otp-send-ip:${ip}`, 10, 3600000),
    ]);

    // Do not fall back to process-local limits for phone verification.
    if (perPhone.source !== "redis" || perIp.source !== "redis") {
      return NextResponse.json(
        { error: "OTP_RATE_LIMIT_UNAVAILABLE" },
        { status: 503 },
      );
    }

    if (!perPhone.ok || !perIp.ok) {
      return NextResponse.json(
        { error: "OTP_RATE_LIMITED" },
        { status: 429 },
      );
    }

    await callTwilioGuestVerify("send", phone);

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "OTP_SEND_UNAVAILABLE" },
      { status: 503 },
    );
  }
}