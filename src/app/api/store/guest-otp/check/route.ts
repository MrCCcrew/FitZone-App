import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { applySensitiveRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  callTwilioGuestVerify,
  createGuestPhoneGrant,
  readGuestPhoneGrant,
  GUEST_OTP_COOKIE,
  normalizeGuestPhone,
} from "@/lib/store-guest-verify";

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      phone?: unknown;
      code?: unknown;
    };

    const phone = normalizeGuestPhone(body.phone);
    const code = typeof body.code === "string"
      ? body.code.trim()
      : "";

    if (!phone || !/^\d{4,10}$/.test(code)) {
      return NextResponse.json(
        { error: "INVALID_VERIFICATION_REQUEST" },
        { status: 400 },
      );
    }

    const ip = getClientIp(request);
    const phoneKey = createHash("sha256").update(phone).digest("hex");

    const [perPhone, perIp] = await Promise.all([
      applySensitiveRateLimit(`guest-otp-check-phone:${phoneKey}`, 5, 600000),
      applySensitiveRateLimit(`guest-otp-check-ip:${ip}`, 20, 3600000),
    ]);

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

    const status = await callTwilioGuestVerify("check", phone, code);

    if (status !== "approved") {
      return NextResponse.json(
        { error: "OTP_NOT_APPROVED" },
        { status: 400 },
      );
    }

    // Persist the verification proof before issuing the browser cookie.
    // The nonce is stored hashed, never as a reusable plaintext token.
    const grant = createGuestPhoneGrant(phone);
    const decoded = readGuestPhoneGrant(grant);

    if (!decoded || decoded.phone !== phone) {
      throw new Error("GUEST_PROOF_CREATION_FAILED");
    }

    const nonceHash = createHash("sha256")
      .update(decoded.nonce)
      .digest("hex");

    await db.guestCheckoutProof.create({
      data: {
        nonceHash,
        phone,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const response = NextResponse.json(
      { verified: true },
      { headers: { "Cache-Control": "no-store" } },
    );

    response.cookies.set({
      name: GUEST_OTP_COOKIE,
      value: grant,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "OTP_CHECK_UNAVAILABLE" },
      { status: 503 },
    );
  }
}