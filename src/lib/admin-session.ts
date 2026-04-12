import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_SESSION_COOKIE = "fitzone_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AdminSessionPayload = {
  id: string;
  email: string;
  name: string;
  role: string;
  jobTitle?: string | null;
  permissions?: string[];
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "fitzone-admin-dev-secret";
  throw new Error("AUTH_SECRET is required in production");
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createAdminSessionToken(payload: Omit<AdminSessionPayload, "exp">) {
  const fullPayload: AdminSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseAdminSessionToken(token?: string | null): AdminSessionPayload | null {
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
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AdminSessionPayload;
    if (!payload?.id || !payload?.email || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.role !== "string" || !payload.role) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  return parseAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? null);
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

export async function requireAdminSession(): Promise<{ ok: true; session: AdminSessionPayload } | { ok: false }> {
  const session = await getAdminSession();
  if (!session) return { ok: false };
  return { ok: true, session };
}

export async function getCurrentAdminUser() {
  try {
    const session = await getAdminSession();
    if (!session) return null;
    return {
      id: session.id,
      email: session.email,
      name: session.name ?? "",
      role: session.role,
      jobTitle: session.jobTitle ?? null,
      permissions: Array.isArray(session.permissions) ? session.permissions : [],
    };
  } catch (error) {
    console.error("[ADMIN_SESSION_USER]", error);
    return null;
  }
}
