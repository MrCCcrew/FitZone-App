import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  emailSent: true,
}));

const m = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  tokenDeleteMany: vi.fn(),
  tokenCreate: vi.fn(),
  notificationCreate: vi.fn(),

  txUserCreate: vi.fn(),
  txWalletCreate: vi.fn(),
  txRewardCreate: vi.fn(),
  txReferralCreate: vi.fn(),

  sensitiveRateLimit: vi.fn(),
  rateLimit: vi.fn(),
  sendVerificationEmail: vi.fn(),
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async () => "hashed-password"),
  },
}));

vi.mock("@/lib/email", () => ({
  sendVerificationEmail: m.sendVerificationEmail,
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  applySensitiveRateLimit: m.sensitiveRateLimit,
  applyRateLimit: m.rateLimit,
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(async () => null),
}));

vi.mock("@/lib/reward-settings", () => ({
  getRewardSettings: vi.fn(async () => ({
    pointsPerReferral: 0,
    tierThresholds: [],
  })),
  calcTier: vi.fn(() => "bronze"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: m.userFindUnique,
    },
    verificationToken: {
      deleteMany: m.tokenDeleteMany,
      create: m.tokenCreate,
    },
    notification: {
      create: m.notificationCreate,
    },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        user: {
          create: m.txUserCreate,
        },
        wallet: {
          create: m.txWalletCreate,
        },
        rewardPoints: {
          create: m.txRewardCreate,
        },
        referral: {
          create: m.txReferralCreate,
        },
      }),
    ),
  },
}));

import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as resendPost } from "@/app/api/auth/resend-verification/route";

function request(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();

  state.emailSent = true;

  m.sensitiveRateLimit.mockResolvedValue({
    ok: true,
    remaining: 4,
    retryAfterMs: 600000,
    source: "memory",
  });

  m.rateLimit.mockReturnValue({
    ok: true,
    remaining: 3,
    retryAfterMs: 900000,
    source: "memory",
  });

  m.tokenDeleteMany.mockResolvedValue({ count: 0 });
  m.tokenCreate.mockResolvedValue({});
  m.notificationCreate.mockResolvedValue({});

  m.txUserCreate.mockResolvedValue({
    id: "test-user-1",
    name: "Test User Name",
    email: "new-user@test.local",
  });

  m.txWalletCreate.mockResolvedValue({});
  m.txRewardCreate.mockResolvedValue({ id: "reward-1" });
  m.txReferralCreate.mockResolvedValue({});

  m.sendVerificationEmail.mockImplementation(
    async () => state.emailSent,
  );
});

describe("auth email verification contract", () => {
  it("new registration preserves account/token and reports emailSent=false when email delivery fails", async () => {
    m.userFindUnique.mockResolvedValue(null);
    state.emailSent = false;

    const response = await registerPost(
      request("/api/auth/register", {
        name: "Test User Name",
        email: "new-user@test.local",
        phone: "",
        password: "StrongPass123!",
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      requiresVerification: true,
      email: "new-user@test.local",
      emailSent: false,
    });

    expect(m.tokenCreate).toHaveBeenCalledTimes(1);
    expect(m.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("existing unverified account reports emailSent=false when automatic resend fails", async () => {
    m.userFindUnique.mockResolvedValue({
      id: "existing-user",
      name: "Existing User Name",
      email: "existing@test.local",
      emailVerified: null,
    });

    state.emailSent = false;

    const response = await registerPost(
      request("/api/auth/register", {
        name: "Existing User Name",
        email: "existing@test.local",
        password: "StrongPass123!",
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      requiresVerification: true,
      email: "existing@test.local",
      emailSent: false,
    });

    expect(m.tokenCreate).toHaveBeenCalledTimes(1);
    expect(m.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("resend returns 500 when verification email cannot be sent", async () => {
    m.userFindUnique.mockResolvedValue({
      email: "existing@test.local",
      name: "Existing User Name",
      emailVerified: null,
    });

    state.emailSent = false;

    const response = await resendPost(
      request("/api/auth/resend-verification", {
        email: "existing@test.local",
      }),
    );

    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("تعذر إرسال");
    expect(m.tokenCreate).toHaveBeenCalledTimes(1);
    expect(m.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it("resend succeeds when verification email is accepted", async () => {
    m.userFindUnique.mockResolvedValue({
      email: "existing@test.local",
      name: "Existing User Name",
      emailVerified: null,
    });

    state.emailSent = true;

    const response = await resendPost(
      request("/api/auth/resend-verification", {
        email: "existing@test.local",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
    });
  });
});