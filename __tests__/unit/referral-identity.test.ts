import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildReferralIdentityHashes,
  hashReferralDeviceId,
  hashReferralIp,
  hashReferralUserAgent,
} from "@/lib/referral-identity";

describe("referral identity hashing", () => {
  it("returns null for missing identity values", () => {
    expect(
      hashReferralDeviceId(null),
    ).toBeNull();

    expect(
      hashReferralIp("   "),
    ).toBeNull();

    expect(
      hashReferralUserAgent(undefined),
    ).toBeNull();
  });

  it("produces deterministic keyed device hashes", () => {
    const first =
      hashReferralDeviceId("DEVICE-ABC-123");

    const second =
      hashReferralDeviceId("device-abc-123");

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  it("normalizes equivalent IP casing", () => {
    const first =
      hashReferralIp("2001:DB8::1");

    const second =
      hashReferralIp("2001:db8::1");

    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });

  it("uses domain separation between identity types", () => {
    const raw = "same-raw-value";

    const device =
      hashReferralDeviceId(raw);

    const ip =
      hashReferralIp(raw);

    const userAgent =
      hashReferralUserAgent(raw);

    expect(device).not.toBe(ip);
    expect(device).not.toBe(userAgent);
    expect(ip).not.toBe(userAgent);
  });

  it("does not collide for distinct device IDs", () => {
    expect(
      hashReferralDeviceId("device-a"),
    ).not.toBe(
      hashReferralDeviceId("device-b"),
    );
  });

  it("returns base64url SHA-256 HMAC output", () => {
    const hash =
      hashReferralDeviceId("device-a");

    expect(hash).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );
  });

  it("builds the three registration identity hashes together", () => {
    const result =
      buildReferralIdentityHashes({
        deviceId: "DEVICE-123",
        ipAddress: "10.0.0.1",
        userAgent: "Mozilla/Test",
      });

    expect(result.deviceHash).toBe(
      hashReferralDeviceId("device-123"),
    );

    expect(result.ipHash).toBe(
      hashReferralIp("10.0.0.1"),
    );

    expect(result.userAgentHash).toBe(
      hashReferralUserAgent("Mozilla/Test"),
    );
  });
});
