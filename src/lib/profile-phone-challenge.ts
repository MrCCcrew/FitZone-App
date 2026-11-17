import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeGuestPhone } from "@/lib/store-guest-verify";

// A profile-phone challenge is not a guest-checkout grant and cannot be used as one.
const PURPOSE = "profile_phone_otp_v1";
export const PROFILE_PHONE_CHALLENGE_TTL_MS = 10 * 60 * 1000;

function signingKey(): Buffer {
  const value = process.env.GUEST_CHECKOUT_SIGNING_SECRET ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("PHONE_CHALLENGE_SIGNING_SECRET_NOT_CONFIGURED");
  }
  return Buffer.from(value, "hex");
}

function sign(payload: string): Buffer {
  return createHmac("sha256", signingKey()).update(payload).digest();
}

export function createProfilePhoneChallenge(userId: string, phone: string): string {
  if (!userId || normalizeGuestPhone(phone) !== phone) {
    throw new Error("INVALID_PROFILE_PHONE_CHALLENGE_INPUT");
  }
  const payload = Buffer.from(JSON.stringify({
    purpose: PURPOSE,
    userId,
    phone,
    nonce: randomBytes(16).toString("hex"),
    expiresAt: Date.now() + PROFILE_PHONE_CHALLENGE_TTL_MS,
  })).toString("base64url");
  return `${payload}.${sign(payload).toString("hex")}`;
}

export function readProfilePhoneChallenge(
  token: unknown,
  userId: string,
  phone: string,
): { nonce: string } | null {
  if (typeof token !== "string" || token.length > 2048 || !userId) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const [payload, mac] = parts;
  let expected: Buffer;
  try {
    expected = sign(payload);
  } catch {
    return null;
  }
  const provided = Buffer.from(mac, "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const now = Date.now();
    if (
      data.purpose !== PURPOSE ||
      data.userId !== userId ||
      data.phone !== phone ||
      normalizeGuestPhone(data.phone) !== phone ||
      typeof data.nonce !== "string" ||
      !/^[a-f0-9]{32}$/.test(data.nonce) ||
      typeof data.expiresAt !== "number" ||
      !Number.isFinite(data.expiresAt) ||
      data.expiresAt <= now ||
      data.expiresAt > now + PROFILE_PHONE_CHALLENGE_TTL_MS
    ) return null;
    return { nonce: data.nonce };
  } catch {
    return null;
  }
}
