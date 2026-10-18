import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  parsePendingOAuthToken: vi.fn(),
  findOrCreateOAuthUser: vi.fn(),
  createAppSessionToken: vi.fn(),
}));

vi.mock("@/lib/oauth", () => ({
  parsePendingOAuthToken: mocks.parsePendingOAuthToken,
  findOrCreateOAuthUser: mocks.findOrCreateOAuthUser,
}));

vi.mock("@/lib/app-session", () => ({
  APP_SESSION_COOKIE: "test_app_session",
  createAppSessionToken: mocks.createAppSessionToken,
  getAppSessionCookieOptions: () => ({
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {},
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/referral-identity", () => ({
  buildReferralIdentityHashes: () => ({
    deviceHash: null,
    ipHash: null,
    userAgentHash: null,
  }),
}));

vi.mock("@/lib/referral-anti-abuse", () => ({
  evaluateReferralAntiAbuse: () => ({
    rewardEligible: false,
    riskReasons: [],
  }),
}));

import { POST } from "@/app/api/auth/oauth/consent/route";

const target = "/?page=offers&friendOffer=AbCdEfGhIjKlMnOpQrStUvWx";
const cookieName = "oauth_friend_offer_return";

function request(callback: string | null) {
  const cookies = ["oauth_pending_profile=mock-pending-profile"];
  if (callback !== null) {
    cookies.push(`${cookieName}=${encodeURIComponent(callback)}`);
  }

  return new NextRequest(
    "https://fitzoneland.com/api/auth/oauth/consent",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookies.join("; "),
      },
      body: JSON.stringify({
        accepted: true,
        deviceId: null,
      }),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.parsePendingOAuthToken.mockReturnValue({
    provider: "google",
    providerId: "mock-provider-id",
    email: "mock@example.invalid",
    name: "Test Member",
  });

  mocks.createAppSessionToken.mockReturnValue("mock-session-only");

  mocks.findOrCreateOAuthUser.mockResolvedValue({
    isNew: true,
    requiresVerification: false,
    user: {
      id: "mock-user",
      email: "mock@example.invalid",
      name: "Test Member",
      role: "member",
    },
  });
});

describe("Friends Offer Google new-account consent", () => {
  it("returns a new verified member to the original group", async () => {
    const res = await POST(request(target));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      redirectTo: target,
    });
    expect(res.cookies.get("test_app_session")?.value)
      .toBe("mock-session-only");
    expect(res.cookies.get(cookieName)?.value ?? "").toBe("");
  });

  it("preserves invitation while requiring email verification", async () => {
    mocks.findOrCreateOAuthUser.mockResolvedValue({
      isNew: true,
      requiresVerification: true,
      emailSent: true,
      user: {
        id: "mock-user",
        email: "mock@example.invalid",
        name: "Test Member",
        role: "member",
      },
    });

    const res = await POST(request(target));
    const body = await res.json();
    const url = new URL(body.redirectTo, "https://fitzoneland.com");

    expect(res.status).toBe(200);
    expect(url.pathname).toBe("/verify-email");
    expect(url.searchParams.get("callbackUrl")).toBe(target);
    expect(res.cookies.get("test_app_session")).toBeUndefined();
    expect(res.cookies.get(cookieName)?.value ?? "").toBe("");
  });

  it("returns a new Google account to group creation", async () => {
    const destination = "/?page=offers";
    const response = await POST(request(destination));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.redirectTo).toBe(destination);
    expect(response.cookies.get(cookieName)?.value ?? "")
      .toBe("");
  });

  it("preserves ordinary signup when no invitation exists", async () => {
    const res = await POST(request(null));
    const body = await res.json();

    expect(body.redirectTo).toBe("/");
  });

  it("rejects forged external return destinations", async () => {
    const res = await POST(request("https://evil.example/"));
    const body = await res.json();

    expect(body.redirectTo).toBe("/");
  });
});
