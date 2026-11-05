import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("registration Turnstile wiring contract", () => {
  const page = read(
    "src/app/register/page.tsx",
  );

  const route = read(
    "src/app/api/auth/register/route.ts",
  );

  it("loads the official Cloudflare Turnstile script and public site key", () => {
    expect(page).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    );

    expect(page).toContain(
      "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
    );

    expect(page).toContain(
      "turnstile.render",
    );
  });

  it("captures and submits the Turnstile token with registration", () => {
    expect(page).toMatch(
      /\bturnstileToken\b/,
    );

    expect(page).toMatch(
      /setTurnstileToken/,
    );

    expect(page).toMatch(
      /turnstileToken\s*,/,
    );
  });

  it("clears expired or failed client Turnstile tokens", () => {
    expect(page).toMatch(
      /expired-callback|expiredCallback|expiredCallback:/,
    );

    expect(page).toMatch(
      /error-callback|errorCallback|errorCallback:/,
    );

    expect(page).toMatch(
      /setTurnstileToken\(\s*["']["']\s*\)|setTurnstileToken\(\s*null\s*\)/,
    );
  });

  it("implements mandatory server-side Siteverify validation", () => {
    expect(route).toContain(
      "verifyTurnstileToken",
    );

    expect(route).toContain(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );

    expect(route).toContain(
      "TURNSTILE_SECRET_KEY",
    );

    expect(route).toMatch(
      /method\s*:\s*["']POST["']/,
    );
  });

  it("sends the token and client IP to Siteverify", () => {
    expect(route).toMatch(
      /\bresponse\b[\s\S]*token/,
    );

    expect(route).toMatch(
      /\bremoteip\b[\s\S]*remoteIp|\bremoteip\b[\s\S]*clientIp/,
    );

    expect(route).toMatch(
      /\bsecret\b/,
    );
  });

  it("fails closed when the Turnstile secret is unavailable", () => {
    expect(route).toMatch(
      /if\s*\(\s*!secret\s*\)[\s\S]*return\s+false/,
    );
  });

  it("requires a Turnstile token and verifies it before account lookup", () => {
    expect(route).toMatch(
      /\bturnstileToken\b/,
    );

    const verifyIndex =
      route.indexOf("verifyTurnstileToken");

    const existingUserIndex =
      route.indexOf("db.user.findUnique");

    expect(verifyIndex).toBeGreaterThanOrEqual(0);
    expect(existingUserIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeLessThan(existingUserIndex);
  });

  it("rejects registration when Turnstile validation fails", () => {
    expect(route).toMatch(
      /if\s*\(\s*!turnstileValid\s*\)/,
    );

    expect(route).toMatch(
      /التحقق الأمني|security verification|Turnstile/i,
    );

    expect(route).toMatch(
      /status\s*:\s*(400|403)/,
    );
  });
});