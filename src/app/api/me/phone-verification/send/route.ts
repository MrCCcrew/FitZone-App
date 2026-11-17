import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  callTwilioGuestVerify,
  normalizeGuestPhone,
} from "@/lib/store-guest-verify";
import { isVerifiedProfilePhone } from "@/lib/profile-phone-verification";
import { createProfilePhoneChallenge } from "@/lib/profile-phone-challenge";

export async function POST(request: Request) {
  try {
    const session = await getCurrentAppUser();

    if (!session) {
      return NextResponse.json(
        { error: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const phone = normalizeGuestPhone(body.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "INVALID_EGYPTIAN_MOBILE_NUMBER" },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: {
        role: true,
        phone: true,
        verifiedPhone: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (user.role !== "member") {
      return NextResponse.json(
        { error: "NOT_CUSTOMER_ACCOUNT" },
        { status: 403 },
      );
    }
    if (
      isVerifiedProfilePhone(user) &&
      normalizeGuestPhone(user.phone) === phone
    ) {
      return NextResponse.json({ alreadyVerified: true });
    }

    const phoneHash = createHash("sha256")
      .update(phone)
      .digest("hex");

    const userHash = createHash("sha256")
      .update(session.id)
      .digest("hex");

    const ip = getClientIp(request);

    const limits = await Promise.all([
      applySensitiveRateLimit(`profile-phone-send:${phoneHash}`, 3, 900000),
      applySensitiveRateLimit(`profile-user-send:${userHash}`, 5, 3600000),
      applySensitiveRateLimit(`profile-ip-send:${ip}`, 10, 3600000),
    ]);

    if (limits.some((limit) => limit.source !== "redis")) {
      return NextResponse.json(
        { error: "OTP_RATE_LIMIT_UNAVAILABLE" },
        { status: 503 },
      );
    }

    if (limits.some((limit) => !limit.ok)) {
      return NextResponse.json(
        { error: "OTP_RATE_LIMITED" },
        { status: 429 },
      );
    }

    // Generate the signed account+phone challenge before the provider side effect.
    const challenge = createProfilePhoneChallenge(session.id, phone);
    const sent = await callTwilioGuestVerify("send", phone);
    if (sent !== "pending") {
      return NextResponse.json(
        { error: "OTP_SEND_NOT_PENDING" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { ok: true, challenge },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "PHONE_VERIFICATION_SEND_FAILED" },
      { status: 503 },
    );
  }
}