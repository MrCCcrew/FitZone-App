import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProfilePhoneChallenge } from "@/lib/profile-phone-challenge";

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: vi.fn(() => "127.0.0.1"),
  applySensitiveRateLimit: vi.fn(),
}));

vi.mock("@/lib/store-guest-verify", () => ({
  normalizeGuestPhone: vi.fn((value: unknown) => {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (/^\+201[0125]\d{8}$/.test(text)) return text;
    if (/^01[0125]\d{8}$/.test(text)) return "+2" + text;
    return null;
  }),
  callTwilioGuestVerify: vi.fn(),
}));

import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { applySensitiveRateLimit } from "@/lib/rate-limit";
import { callTwilioGuestVerify } from "@/lib/store-guest-verify";

import { GET as getStatus } from "@/app/api/me/phone-verification/status/route";
import { POST as sendCode } from "@/app/api/me/phone-verification/send/route";
import { POST as checkCode } from "@/app/api/me/phone-verification/check/route";

const sessionMock = vi.mocked(getCurrentAppUser);
const findMock = vi.mocked(db.user.findUnique);
const updateMock = vi.mocked(db.user.update);
const limitMock = vi.mocked(applySensitiveRateLimit);
const twilioMock = vi.mocked(callTwilioGuestVerify);

const phone = "+201012345678";
const secret = "f".repeat(64);

function challengeFor(id = "synthetic-member", value = phone) {
  return createProfilePhoneChallenge(id, value);
}

const member = {
  role: "member",
  phone: null,
  verifiedPhone: null,
  phoneVerifiedAt: null,
  gender: "student",
  birthDate: new Date("2000-01-01T00:00:00Z"),
  governorate: "القاهرة",
};

function request(path: string, body: Record<string, unknown>) {
  return new Request("http://localhost" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GUEST_CHECKOUT_SIGNING_SECRET = secret;

  sessionMock.mockResolvedValue({ id: "synthetic-member" } as never);
  findMock.mockResolvedValue({ ...member } as never);

  limitMock.mockResolvedValue({
    source: "redis",
    ok: true,
  } as never);

  twilioMock.mockResolvedValue("approved" as never);

  updateMock.mockResolvedValue({
    ...member,
    phone,
    verifiedPhone: phone,
    phoneVerifiedAt: new Date(),
  } as never);
});

describe("R19 B67 registered-phone API security", () => {
  it("status rejects unauthenticated callers", async () => {
    sessionMock.mockResolvedValue(null as never);
    const response = await getStatus();
    expect(response.status).toBe(401);
    expect(findMock).not.toHaveBeenCalled();
  });

  it("status excludes staff users", async () => {
    findMock.mockResolvedValue({
      ...member,
      role: "staff",
    } as never);

    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.eligible).toBe(false);
  });

  it("status allows member with incomplete phone", async () => {
    const response = await getStatus();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.eligible).toBe(true);
    expect(data.phoneVerified).toBe(false);
    expect(data.profileComplete).toBe(false);
  });

  it("send rejects administrators without Twilio call", async () => {
    findMock.mockResolvedValue({
      ...member,
      role: "admin",
    } as never);

    const response = await sendCode(
      request("/api/me/phone-verification/send", { phone })
    );

    expect(response.status).toBe(403);
    expect(twilioMock).not.toHaveBeenCalled();
  });

  it("check rejects trainers without updating the user", async () => {
    findMock.mockResolvedValue({
      ...member,
      role: "trainer",
    } as never);

    const response = await checkCode(
      request("/api/me/phone-verification/check", {
        phone,
        code: "123456",
        challenge: challengeFor(),
      })
    );

    expect(response.status).toBe(403);
    expect(twilioMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("send fails closed when Redis is unavailable", async () => {
    limitMock.mockResolvedValue({
      source: "memory",
      ok: true,
    } as never);

    const response = await sendCode(
      request("/api/me/phone-verification/send", { phone })
    );

    expect(response.status).toBe(503);
    expect(twilioMock).not.toHaveBeenCalled();
  });

  it("invalid OTP cannot mark phone as verified", async () => {
    twilioMock.mockResolvedValue("pending" as never);

    const response = await checkCode(
      request("/api/me/phone-verification/check", {
        phone,
        code: "123456",
        challenge: challengeFor(),
      })
    );

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("approved OTP persists the verified phone to current user", async () => {
    const response = await checkCode(
      request("/api/me/phone-verification/check", {
        phone,
        code: "123456",
        challenge: challengeFor(),
      })
    );

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.phoneVerified).toBe(true);
    expect(data.profileComplete).toBe(true);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "synthetic-member" },
        data: expect.objectContaining({
          phone,
          verifiedPhone: phone,
          phoneVerifiedAt: expect.any(Date),
        }),
      })
    );
  });

  it("valid member may request OTP through mocked Twilio", async () => {
    twilioMock.mockResolvedValue("pending" as never);
    const response = await sendCode(
      request("/api/me/phone-verification/send", { phone })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(typeof data.challenge).toBe("string");
    expect(twilioMock).toHaveBeenCalledWith("send", phone);
  });
});

describe("R19 B71 signed profile phone challenge", () => {
  it("rejects verification without prior challenge", async () => {
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456",
    }));
    expect(response.status).toBe(400);
    expect(twilioMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a challenge issued for another account", async () => {
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge: challengeFor("another-member"),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a challenge issued for a different phone", async () => {
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge: challengeFor("synthetic-member", "+201112345678"),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects a modified challenge", async () => {
    const token = challengeFor();
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge: token.slice(0, -1) + (token.endsWith("a") ? "b" : "a"),
    }));
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rejects an expired challenge", async () => {
    const token = challengeFor();
    const realNow = Date.now;
    vi.spyOn(Date, "now").mockImplementation(() => realNow() + 11 * 60 * 1000);
    try {
      const response = await checkCode(request("/api/me/phone-verification/check", {
        phone, code: "123456", challenge: token,
      }));
      expect(response.status).toBe(400);
      expect(updateMock).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("rejects an already-consumed challenge without persisting", async () => {
    limitMock.mockImplementation((key) => Promise.resolve({
      source: "redis", ok: !String(key).startsWith("profile-otp-used:"),
    } as never));
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge: challengeFor(),
    }));
    expect(response.status).toBe(409);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("consumes one challenge only once across repeated checks", async () => {
    const used = new Set<string>();
    limitMock.mockImplementation((key) => {
      const text = String(key);
      if (!text.startsWith("profile-otp-used:")) {
        return Promise.resolve({ source: "redis", ok: true } as never);
      }
      const ok = !used.has(text);
      used.add(text);
      return Promise.resolve({ source: "redis", ok } as never);
    });
    const challenge = challengeFor();
    const req = () => request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge,
    });
    const results = await Promise.all([checkCode(req()), checkCode(req())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Redis replay protection is unavailable", async () => {
    limitMock.mockImplementation((key) => Promise.resolve({
      source: String(key).startsWith("profile-otp-used:") ? "memory" : "redis", ok: true,
    } as never));
    const response = await checkCode(request("/api/me/phone-verification/check", {
      phone, code: "123456", challenge: challengeFor(),
    }));
    expect(response.status).toBe(503);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
