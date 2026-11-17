import { createHash } from "node:crypto";
import { readProfilePhoneChallenge, PROFILE_PHONE_CHALLENGE_TTL_MS } from "@/lib/profile-phone-challenge";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  callTwilioGuestVerify,
  normalizeGuestPhone,
} from "@/lib/store-guest-verify";
import {
  isCompletedVerifiedProfile,
  isVerifiedProfilePhone,
} from "@/lib/profile-phone-verification";

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

    const code =
      typeof body.code === "string"
        ? body.code.trim()
        : "";

    if (!phone || !/^\d{4,10}$/.test(code)) {
      return NextResponse.json(
        { error: "INVALID_VERIFICATION_REQUEST" },
        { status: 400 },
      );
    }

    const phoneHash = createHash("sha256")
      .update(phone)
      .digest("hex");

    const userHash = createHash("sha256")
      .update(session.id)
      .digest("hex");

    const ip = getClientIp(request);

    const limits = await Promise.all([
      applySensitiveRateLimit(`profile-phone-check:${phoneHash}`, 5, 600000),
      applySensitiveRateLimit(`profile-user-check:${userHash}`, 8, 3600000),
      applySensitiveRateLimit(`profile-ip-check:${ip}`, 20, 3600000),
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

    const existing = await db.user.findUnique({
      where: { id: session.id },
      select: {
        role: true,
        phone: true,
        verifiedPhone: true,
        phoneVerifiedAt: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    if (existing.role !== "member") {
      return NextResponse.json(
        { error: "NOT_CUSTOMER_ACCOUNT" },
        { status: 403 },
      );
    }
    if (
      isVerifiedProfilePhone(existing) &&
      normalizeGuestPhone(existing.phone) === phone
    ) {
      return NextResponse.json({ alreadyVerified: true });
    }

    // The caller must present a recent signed challenge created by this account's send route.
    const proof = readProfilePhoneChallenge(body.challenge, session.id, phone);
    if (!proof) {
      return NextResponse.json(
        { error: "PHONE_CHALLENGE_INVALID" },
        { status: 400 },
      );
    }

    const result = await callTwilioGuestVerify("check", phone, code);

    if (result !== "approved") {
      return NextResponse.json(
        { error: "OTP_NOT_APPROVED" },
        { status: 400 },
      );
    }

    // Redis-backed atomic increment: at most one successful verification per nonce.
    // Fail closed if the shared rate limiter cannot provide Redis-backed state.
    const consumed = await applySensitiveRateLimit(
      `profile-otp-used:${proof.nonce}`,
      1,
      PROFILE_PHONE_CHALLENGE_TTL_MS,
    );
    if (consumed.source !== "redis") {
      return NextResponse.json(
        { error: "OTP_RATE_LIMIT_UNAVAILABLE" },
        { status: 503 },
      );
    }
    if (!consumed.ok) {
      return NextResponse.json(
        { error: "PHONE_CHALLENGE_REPLAYED" },
        { status: 409 },
      );
    }

    const updated = await db.user.update({
      where: { id: session.id },
      data: {
        phone,
        verifiedPhone: phone,
        phoneVerifiedAt: new Date(),
      },
      select: {
        phone: true,
        verifiedPhone: true,
        phoneVerifiedAt: true,
        gender: true,
        birthDate: true,
        governorate: true,
      },
    });

    return NextResponse.json({
      ok: true,
      phoneVerified: isVerifiedProfilePhone(updated),
      profileComplete: isCompletedVerifiedProfile(updated),
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "PHONE_VERIFICATION_CHECK_FAILED" },
      { status: 503 },
    );
  }
}