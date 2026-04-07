import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const APP_SESSION_COOKIE = "fitzone_app_session";
const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

type AppRole = "member" | "admin" | "staff" | "trainer";

type AppSessionPayload = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  exp: number;
};

function getSessionSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "fitzone-app-dev-secret";
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

export function createAppSessionToken(payload: Omit<AppSessionPayload, "exp">) {
  const fullPayload: AppSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + APP_SESSION_TTL_SECONDS,
  };

  const encodedPayload = encodeBase64Url(JSON.stringify(fullPayload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function parseAppSessionToken(token?: string | null): AppSessionPayload | null {
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
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as AppSessionPayload;
    if (!payload?.id || !payload?.email || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getAppSession() {
  const cookieStore = await cookies();
  return parseAppSessionToken(cookieStore.get(APP_SESSION_COOKIE)?.value ?? null);
}

export function getAppSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: APP_SESSION_TTL_SECONDS,
  };
}

export async function getCurrentAppUser() {
  try {
    const appSession = await getAppSession();
    if (!appSession) return null;

    return {
      id: appSession.id,
      email: appSession.email,
      name: appSession.name ?? "",
      role: appSession.role,
    };
  } catch (error) {
    console.error("[APP_SESSION_USER]", error);
    return null;
  }
}
