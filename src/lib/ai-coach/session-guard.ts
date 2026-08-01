import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getCurrentAppUser } from "@/lib/app-session";

const COOKIE = "fitzone_ai_coach_session";
const TTL_SECONDS = 60 * 60 * 24 * 7;

type CoachSessionClaim = { sessionId: string; userId: string | null; exp: number };

function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return "fitzone-ai-coach-dev-secret";
  throw new Error("AUTH_SECRET is required in production");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encode(claim: CoachSessionClaim) {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string | undefined): CoachSessionClaim | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as CoachSessionClaim;
    return claim.sessionId && claim.exp >= Math.floor(Date.now() / 1000) ? claim : null;
  } catch { return null; }
}

export function coachSessionCookie(value: string) {
  return { name: COOKIE, value, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL_SECONDS };
}

export async function createCoachSessionCookie(sessionId: string) {
  const user = await getCurrentAppUser();
  return encode({ sessionId, userId: user?.id ?? null, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS });
}

/** Confirms possession of the server-signed session claim and, for members, the same authenticated account. */
export async function ownsCoachSession(sessionId: string) {
  const store = await cookies();
  const claim = decode(store.get(COOKIE)?.value);
  if (!claim) return false;
  const user = await getCurrentAppUser();
  return isCoachSessionClaimOwner(claim, sessionId, user?.id ?? null);
}

export function isCoachSessionClaimOwner(claim: { sessionId: string; userId: string | null; exp: number } | null, sessionId: string, userId: string | null) {
  return Boolean(claim && claim.exp >= Math.floor(Date.now() / 1000) && claim.sessionId === sessionId && claim.userId === userId);
}
