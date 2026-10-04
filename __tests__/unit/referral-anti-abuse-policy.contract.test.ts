import { describe, expect, it, vi } from "vitest";

type AntiAbuseInput = {
  sameDevice: boolean;
  sameIp: boolean;
};

type AntiAbuseResult = {
  rewardEligible: boolean;
  riskReasons: string[];
};

type AntiAbuseModule = {
  evaluateReferralAntiAbuse(
    input: AntiAbuseInput,
  ): AntiAbuseResult;
};

async function loadAntiAbuse(): Promise<AntiAbuseModule | null> {
  try {
    return await vi.importActual<AntiAbuseModule>(
      "@/lib/referral-anti-abuse",
    );
  } catch {
    return null;
  }
}

async function requireAntiAbuse() {
  const mod = await loadAntiAbuse();

  expect(
    mod,
    "src/lib/referral-anti-abuse.ts must exist before these contracts can pass",
  ).not.toBeNull();

  return mod;
}

describe("member referral anti-abuse contract", () => {
  it("blocks the referral reward when referrer and referred account use the same device", async () => {
    const mod = await requireAntiAbuse();
    if (!mod) return;

    expect(
      mod.evaluateReferralAntiAbuse({
        sameDevice: true,
        sameIp: false,
      }),
    ).toMatchObject({
      rewardEligible: false,
    });
  });

  it("does not block a referral reward because of the same IP alone", async () => {
    const mod = await requireAntiAbuse();
    if (!mod) return;

    const result =
      mod.evaluateReferralAntiAbuse({
        sameDevice: false,
        sameIp: true,
      });

    expect(result.rewardEligible).toBe(true);
  });

  it("records same-IP as a risk signal even though it is not a standalone blocker", async () => {
    const mod = await requireAntiAbuse();
    if (!mod) return;

    const result =
      mod.evaluateReferralAntiAbuse({
        sameDevice: false,
        sameIp: true,
      });

    expect(result.riskReasons).toContain("same_ip");
  });

  it("blocks the reward when same device and same IP are both present", async () => {
    const mod = await requireAntiAbuse();
    if (!mod) return;

    expect(
      mod.evaluateReferralAntiAbuse({
        sameDevice: true,
        sameIp: true,
      }),
    ).toMatchObject({
      rewardEligible: false,
    });
  });

  it("allows a clean referral relationship with no shared-device signal", async () => {
    const mod = await requireAntiAbuse();
    if (!mod) return;

    expect(
      mod.evaluateReferralAntiAbuse({
        sameDevice: false,
        sameIp: false,
      }),
    ).toMatchObject({
      rewardEligible: true,
    });
  });
});