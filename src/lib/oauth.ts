import { createHmac, timingSafeEqual } from "crypto";
import { db } from "./db";
import { sendVerificationEmail } from "./email";

export function getAppBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://fitzoneland.com").replace(/\/$/, "");
}

type PendingOAuthPayload = {
  provider: string;
  providerId: string;
  email: string;
  name: string | null;
  exp: number;
};

function getOAuthSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "fitzone-oauth-dev-secret";
  throw new Error("AUTH_SECRET is required in production");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getOAuthSecret()).update(value).digest("base64url");
}

async function issueOAuthVerification(email: string, name: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.create({
    data: { identifier: email, token: code, expires },
  });

  const emailSent = await sendVerificationEmail(email, name, code);
  return { emailSent };
}

export async function findOrCreateOAuthUser(profile: {
  provider: string;
  providerId: string;
  email: string | null;
  name: string | null;
}) {
  const { provider, providerId, email, name } = profile;

  // 1. Check existing account link
  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: providerId } },
    include: { user: true },
  });
  if (existingAccount) {
    const user = existingAccount.user;
    if (!user.email || user.emailVerified) {
      return { user, requiresVerification: false, emailSent: false, isNew: false };
    }

    const verification = await issueOAuthVerification(user.email, user.name ?? user.email.split("@")[0]);
    return { user, requiresVerification: true, emailSent: verification.emailSent, isNew: false };
  }

  // 2. Find user by email or create new one
  let user = email ? await db.user.findUnique({ where: { email } }) : null;
  const isNew = !user;

  if (!user) {
    if (!email) return null; // Can't create without email
    user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: name ?? email.split("@")[0],
          email,
          role: "member",
        },
      });
      await tx.wallet.create({ data: { userId: created.id, balance: 0 } });
      await tx.rewardPoints.create({ data: { userId: created.id, points: 0, tier: "bronze" } });
      await tx.referral.create({
        data: { userId: created.id, code: `FZ-${created.id.slice(-6).toUpperCase()}` },
      });
      return created;
    });
  }

  // 3. Link provider account
  await db.account
    .create({ data: { userId: user.id, type: "oauth", provider, providerAccountId: providerId } })
    .catch(() => {}); // ignore duplicate if already linked

  if (!user.emailVerified && user.email) {
    const verification = await issueOAuthVerification(user.email, user.name ?? user.email.split("@")[0]);
    return { user, requiresVerification: true, emailSent: verification.emailSent, isNew };
  }

  return { user, requiresVerification: false, emailSent: false, isNew };
}

export async function findExistingOAuthUser(profile: {
  provider: string;
  providerId: string;
  email: string | null;
}) {
  const { provider, providerId, email } = profile;

  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: providerId } },
    include: { user: true },
  });

  if (existingAccount) {
    const user = existingAccount.user;
    if (!user.email || user.emailVerified) {
      return { user, requiresVerification: false, emailSent: false, isNew: false };
    }

    const verification = await issueOAuthVerification(user.email, user.name ?? user.email.split("@")[0]);
    return { user, requiresVerification: true, emailSent: verification.emailSent, isNew: false };
  }

  if (!email) return null;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return null;

  await db.account
    .create({ data: { userId: user.id, type: "oauth", provider, providerAccountId: providerId } })
    .catch(() => {});

  if (!user.emailVerified && user.email) {
    const verification = await issueOAuthVerification(user.email, user.name ?? user.email.split("@")[0]);
    return { user, requiresVerification: true, emailSent: verification.emailSent, isNew: false };
  }

  return { user, requiresVerification: false, emailSent: false, isNew: false };
}

export function createPendingOAuthToken(payload: Omit<PendingOAuthPayload, "exp">) {
  const fullPayload: PendingOAuthPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parsePendingOAuthToken(token?: string | null): PendingOAuthPayload | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as PendingOAuthPayload;
    if (!payload.email || !payload.provider || !payload.providerId || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// Verify Apple id_token (RS256 JWT signed by Apple)
export async function verifyAppleIdToken(
  idToken: string,
): Promise<{ sub: string; email: string | null } | null> {
  try {
    const { createVerify, createPublicKey } = await import("crypto");
    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString()) as {
      kid: string;
      alg: string;
    };
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as {
      sub: string;
      email?: string;
      exp: number;
      iss: string;
      aud: string;
    };

    // Fetch Apple's public keys
    const keysRes = await fetch("https://appleid.apple.com/auth/keys", { cache: "no-store" });
    const { keys } = (await keysRes.json()) as { keys: JsonWebKey[] };
    const jwk = keys.find((k) => (k as Record<string, unknown>).kid === header.kid);
    if (!jwk) return null;

    const publicKey = createPublicKey({ key: jwk, format: "jwk" });
    const verifier = createVerify("SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const valid = verifier.verify(publicKey, sigB64, "base64url");
    if (!valid) return null;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (payload.iss !== "https://appleid.apple.com") return null;

    return { sub: payload.sub, email: payload.email ?? null };
  } catch {
    return null;
  }
}

// Generate Apple client_secret (ES256 JWT)
export function generateAppleClientSecret(): string {
  const { createSign } = require("crypto") as typeof import("crypto");
  const privateKey = (process.env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const teamId = process.env.APPLE_TEAM_ID ?? "";
  const clientId = process.env.APPLE_CLIENT_ID ?? "";
  const keyId = process.env.APPLE_KEY_ID ?? "";

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({ iss: teamId, iat: now, exp: now + 3600, aud: "https://appleid.apple.com", sub: clientId }),
  ).toString("base64url");

  const signingInput = `${header}.${body}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  const sig = signer.sign(
    { key: privateKey, format: "pem", dsaEncoding: "ieee-p1363" } as Parameters<typeof signer.sign>[0],
    "base64url",
  );
  return `${signingInput}.${sig}`;
}
