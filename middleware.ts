import { NextRequest, NextResponse } from "next/server";

const PROTECTED_MUTATION_PREFIXES = [
  "/api/admin/",
  "/api/chat/admin/",
];

const PROTECTED_MUTATION_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/register",
  "/api/auth/resend-verification",
  "/api/auth/verify-email",
  "/api/site-content",
  "/api/setup",
]);

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isProtectedMutation(request: NextRequest) {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;
  const pathname = request.nextUrl.pathname;
  if (PROTECTED_MUTATION_PATHS.has(pathname)) return true;
  return PROTECTED_MUTATION_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isTrustedRequest(request: NextRequest) {
  // Use x-forwarded-host so we work correctly behind nginx / reverse proxies
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}

export function middleware(request: NextRequest) {
  if (isProtectedMutation(request) && !isTrustedRequest(request)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const response = NextResponse.next();

  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=15552000");
  }

  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};
