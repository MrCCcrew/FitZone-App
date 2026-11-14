import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  findExistingOAuthUser: vi.fn(),
  createPendingOAuthToken: vi.fn(),
  createAppSessionToken: vi.fn(),
}));

vi.mock("@/lib/oauth", () => ({
  getAppBaseUrl: () => "https://fitzoneland.com",
  findExistingOAuthUser: mocks.findExistingOAuthUser,
  createPendingOAuthToken: mocks.createPendingOAuthToken,
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

vi.mock("@/lib/staging-safety", () => ({
  assertExternalSideEffectsAllowed: vi.fn(),
}));

import { GET as startGoogle } from "@/app/api/auth/oauth/google/route";
import { GET as finishGoogle } from "@/app/api/auth/oauth/google/callback/route";

const base = "https://fitzoneland.com";
const target =
  "/?page=offers&friendOffer=AbCdEfGhIjKlMnOpQrStUvWx";
const cookieName = "oauth_friend_offer_return";

async function begin(callbackUrl: string | null) {
  const url = new URL("/api/auth/oauth/google", base);
  if (callbackUrl) url.searchParams.set("callbackUrl", callbackUrl);
  const response = await startGoogle(new NextRequest(url));
  const state = response.cookies.get("oauth_state")?.value;
  expect(state).toMatch(/^[a-f0-9]{32}$/);
  return { response, state: state! };
}

function fakeGoogleProvider() {
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return { json: async () => ({ access_token: "test-only" }) };
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) {
      return {
        json: async () => ({
          sub: "mock-google-id",
          email: "mock@example.invalid",
          name: "Test User",
        }),
      };
    }
    throw Error("UNEXPECTED_EXTERNAL_REQUEST");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

async function complete(state: string, friendReturn: string) {
  const url = new URL("/api/auth/oauth/google/callback", base);
  url.searchParams.set("code", "MOCK_CODE");
  url.searchParams.set("state", state);

  return finishGoogle(new NextRequest(url, {
    headers: {
      cookie:
        `oauth_state=${state}; ` +
        `${cookieName}=${encodeURIComponent(friendReturn)}`,
    },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_CLIENT_ID = "test-client-no-provider";
  mocks.createAppSessionToken.mockReturnValue("mock-session-only");
  mocks.createPendingOAuthToken.mockReturnValue("mock-pending-only");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
});

describe("Friends Offer OAuth HTTP continuation", () => {
  it("stores the exact invitation on Google OAuth start", async () => {
    const { response } = await begin(target);
    expect(response.cookies.get(cookieName)?.value).toBe(target);
    expect(response.headers.get("location"))
      .toContain("accounts.google.com");
  });

  it("returns a creator to Offers after Google login", async () => {
    const destination = "/?page=offers";
    const { state } = await begin(destination);

    fakeGoogleProvider();

    mocks.findExistingOAuthUser.mockResolvedValue({
      requiresVerification: false,
      user: {
        id: "mock-creator",
        email: "mock@example.invalid",
        name: "Test Creator",
        role: "member",
      },
    });

    const response = await complete(state, destination);

    expect(response.headers.get("location"))
      .toBe(base + destination);

    expect(response.cookies.get(cookieName)?.value ?? "")
      .toBe("");
  });

  it("does not accept an external callback", async () => {
    const { response } = await begin("https://example.org/");
    expect(response.cookies.get(cookieName)?.value ?? "").toBe("");
  });

  it("returns an existing member to the same invitation", async () => {
    const { state } = await begin(target);
    const requests = fakeGoogleProvider();

    mocks.findExistingOAuthUser.mockResolvedValue({
      requiresVerification: false,
      user: {
        id: "mock-member",
        email: "mock@example.invalid",
        name: "Test User",
        role: "member",
      },
    });

    const response = await complete(state, target);

    expect(response.headers.get("location")).toBe(base + target);
    expect(response.cookies.get(cookieName)?.value ?? "").toBe("");
    expect(response.cookies.get("test_app_session")?.value)
      .toBe("mock-session-only");
    expect(requests).toHaveBeenCalledTimes(2);
  });

  it("preserves invitation through required email verification", async () => {
    const { state } = await begin(target);
    fakeGoogleProvider();

    mocks.findExistingOAuthUser.mockResolvedValue({
      requiresVerification: true,
      emailSent: true,
      user: {
        id: "mock-member",
        email: "mock@example.invalid",
        name: "Test User",
        role: "member",
      },
    });

    const response = await complete(state, target);
    const redirect = new URL(response.headers.get("location")!);

    expect(redirect.pathname).toBe("/verify-email");
    expect(redirect.searchParams.get("callbackUrl")).toBe(target);
    expect(response.cookies.get(cookieName)?.value ?? "").toBe("");
  });

  it("keeps the auth continuation wired through UI and consent", () => {
    const read = (path: string) => readFileSync(path, "utf8");
    const app = read("src/app/FitzoneApp.tsx");
    const login = read("src/app/login/page.tsx");
    const register = read("src/app/register/page.tsx");
    const verify = read("src/app/verify-email/page.tsx");
    const consent = read("src/app/api/auth/oauth/consent/route.ts");

    expect(app).toContain("friendGoToLogin(friendGroup.token)");
    expect(app).toContain("if (group.currentParticipant)");
    expect(login).toContain(
      'withFriendOfferReturn("/register", friendReturn)',
    );
    expect(register).toContain(
      'search.set("callbackUrl", friendReturn)',
    );
    expect(verify).toContain(
      'friendReturn ?? data?.redirectTo ?? "/account"',
    );
    expect(consent).toContain(
      'redirectTo: friendReturn ?? "/"',
    );
  });
});
