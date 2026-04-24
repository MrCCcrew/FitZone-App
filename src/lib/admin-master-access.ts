import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_MASTER_ACCESS_COOKIE = "fitzone_admin_master_access";
const ADMIN_MASTER_ACCESS_TTL_SECONDS = 60 * 30;
const PROTECTED_ADMIN_SECTIONS = ["payments", "database"] as const;

type ProtectedAdminSection = (typeof PROTECTED_ADMIN_SECTIONS)[number];

type MasterAccessPayload = {
  sections: ProtectedAdminSection[];
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "fitzone-admin-master-dev-secret";
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

export function isProtectedAdminSection(value: string): value is ProtectedAdminSection {
  return PROTECTED_ADMIN_SECTIONS.includes(value as ProtectedAdminSection);
}

export function createAdminMasterAccessToken(sections: ProtectedAdminSection[]) {
  const payload: MasterAccessPayload = {
    sections,
    exp: Math.floor(Date.now() / 1000) + ADMIN_MASTER_ACCESS_TTL_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseAdminMasterAccessToken(token?: string | null): MasterAccessPayload | null {
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
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as MasterAccessPayload;
    if (!Array.isArray(payload.sections) || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      sections: payload.sections.filter(isProtectedAdminSection),
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getAdminMasterAccess() {
  const cookieStore = await cookies();
  return parseAdminMasterAccessToken(cookieStore.get(ADMIN_MASTER_ACCESS_COOKIE)?.value ?? null);
}

export function getAdminMasterAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MASTER_ACCESS_TTL_SECONDS,
  };
}

export async function hasAdminMasterAccess(section: ProtectedAdminSection) {
  const access = await getAdminMasterAccess();
  return Boolean(access?.sections.includes(section));
}

export function getProtectedAdminSections() {
  return [...PROTECTED_ADMIN_SECTIONS];
}
