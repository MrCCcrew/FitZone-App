import { createHmac } from "crypto";

type ReferralIdentityKind =
  | "device"
  | "ip"
  | "user_agent";

export type ReferralIdentityHashes = {
  deviceHash: string | null;
  ipHash: string | null;
  userAgentHash: string | null;
};

function getReferralIdentitySecret(): string {
  const secret =
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "fitzone-referral-identity-dev-secret";
  }

  throw new Error(
    "AUTH_SECRET is required in production",
  );
}

function normalizeReferralIdentityValue(
  kind: ReferralIdentityKind,
  value: string | null | undefined,
): string | null {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return null;
  }

  // Device IDs and IP representations are compared
  // case-insensitively. User-Agent is kept verbatim
  // apart from surrounding whitespace.
  if (kind === "device" || kind === "ip") {
    return trimmed.toLowerCase();
  }

  return trimmed;
}

function hashReferralIdentity(
  kind: ReferralIdentityKind,
  value: string | null | undefined,
): string | null {
  const normalized =
    normalizeReferralIdentityValue(kind, value);

  if (!normalized) {
    return null;
  }

  return createHmac(
    "sha256",
    getReferralIdentitySecret(),
  )
    .update(
      `referral-identity:v1:${kind}:${normalized}`,
      "utf8",
    )
    .digest("base64url");
}

export function hashReferralDeviceId(
  deviceId: string | null | undefined,
): string | null {
  return hashReferralIdentity(
    "device",
    deviceId,
  );
}

export function hashReferralIp(
  ipAddress: string | null | undefined,
): string | null {
  return hashReferralIdentity(
    "ip",
    ipAddress,
  );
}

export function hashReferralUserAgent(
  userAgent: string | null | undefined,
): string | null {
  return hashReferralIdentity(
    "user_agent",
    userAgent,
  );
}

export function buildReferralIdentityHashes(input: {
  deviceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): ReferralIdentityHashes {
  return {
    deviceHash:
      hashReferralDeviceId(input.deviceId),
    ipHash:
      hashReferralIp(input.ipAddress),
    userAgentHash:
      hashReferralUserAgent(input.userAgent),
  };
}
