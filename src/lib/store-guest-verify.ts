import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GUEST_OTP_COOKIE = "fitzone-guest-phone-proof";
const GRANT_TTL_MS = 10 * 60 * 1000;

export function normalizeGuestPhone(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const value = input.replace(/[\s()-]/g, "");
  const phone = value.startsWith("01") ? `+2${value}` : value;

  return /^\+201[0125]\d{8}$/.test(phone) ? phone : null;
}

function signingKey(): string {
  const key = process.env.GUEST_CHECKOUT_SIGNING_SECRET ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error("GUEST_CHECKOUT_SIGNING_SECRET_NOT_CONFIGURED");
  }
  return key;
}

function signature(payload: string): string {
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest("hex");
}

export function createGuestPhoneGrant(phone: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      phone,
      expiresAt: Date.now() + GRANT_TTL_MS,
      nonce: randomBytes(16).toString("hex"),
      purpose: "store_guest_checkout",
    }),
  ).toString("base64url");

  return `${payload}.${signature(payload)}`;
}

export function readGuestPhoneGrant(
  token: string | undefined | null,
): { phone: string; nonce: string } | null {
  if (!token || token.length > 2048) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, mac] = parts;
  if (!/^[0-9a-f]{64}$/.test(mac)) return null;

  const expected = Buffer.from(signature(payload), "hex");
  const provided = Buffer.from(mac, "hex");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return null;
  }

  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;

    if (
      data.purpose !== "store_guest_checkout" ||
      typeof data.phone !== "string" ||
      normalizeGuestPhone(data.phone) !== data.phone ||
      typeof data.nonce !== "string" ||
      !/^[0-9a-f]{32}$/.test(data.nonce) ||
      typeof data.expiresAt !== "number" ||
      !Number.isFinite(data.expiresAt) ||
      data.expiresAt <= Date.now() ||
      data.expiresAt > Date.now() + GRANT_TTL_MS
    ) {
      return null;
    }

    return { phone: data.phone, nonce: data.nonce };
  } catch {
    return null;
  }
}

export async function callTwilioGuestVerify(
  action: "send" | "check",
  phone: string,
  code?: string,
): Promise<"pending" | "approved" | "failed"> {
  const account = process.env.TWILIO_ACCOUNT_SID ?? "";
  const token = process.env.TWILIO_AUTH_TOKEN ?? "";
  const service = process.env.TWILIO_VERIFY_SERVICE_SID ?? "";

  if (
    !/^AC[a-fA-F0-9]{32}$/.test(account) ||
    !/^[a-fA-F0-9]{32}$/.test(token) ||
    !/^VA[a-fA-F0-9]{32}$/.test(service)
  ) {
    throw new Error("TWILIO_VERIFY_NOT_CONFIGURED");
  }

  // No external side effects in isolated/staging execution.
  if (process.env.APP_ENV === "staging") {
    throw new Error("TWILIO_VERIFY_STAGING_DISABLED");
  }

  const path = action === "send"
    ? "Verifications"
    : "VerificationCheck";

  const params = new URLSearchParams(
    action === "send"
      ? { To: phone, Channel: "sms" }
      : { To: phone, Code: code ?? "" },
  );

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${service}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization:
          `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    // Do not expose provider errors, credentials or submitted OTP.
    throw new Error("TWILIO_VERIFY_REQUEST_FAILED");
  }

  const result = await response.json() as { status?: string };
  if (result.status === "approved") return "approved";
  if (result.status === "pending") return "pending";
  return "failed";
}