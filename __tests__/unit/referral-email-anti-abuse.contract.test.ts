import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("email registration referral anti-abuse wiring contract", () => {
  const route = read("src/app/api/auth/register/route.ts");
  const page = read("src/app/register/page.tsx");
  const paymentService = read("src/lib/payments/service.ts");

  it("creates and persists a browser device id and sends it during registration", () => {
    expect(page).toMatch(/localStorage/);
    expect(page).toMatch(/crypto\.randomUUID/);
    expect(page).toMatch(/deviceId/);
    expect(page).toMatch(
      /JSON\.stringify\([\s\S]*?deviceId[\s\S]*?\)/,
    );
  });

  it("hashes registration identity server-side and never stores raw identity", () => {
    expect(route).toMatch(
      /from\s+["']@\/lib\/referral-identity["']/,
    );
    expect(route).toMatch(/buildReferralIdentityHashes/);
    expect(route).toMatch(/deviceId/);
    expect(route).toMatch(/user-agent/i);

    expect(route).toMatch(/referralDeviceHash/);
    expect(route).toMatch(/referralIpHash/);
    expect(route).toMatch(/referralUserAgentHash/);

    expect(route).not.toMatch(/referralDeviceHash\s*:\s*deviceId\b/);
    expect(route).not.toMatch(/referralIpHash\s*:\s*clientIp\b/);
    expect(route).not.toMatch(/referralUserAgentHash\s*:\s*userAgent\b/);
  });

  it("compares the referred user with the referrer and evaluates anti-abuse", () => {
    expect(route).toMatch(
      /from\s+["']@\/lib\/referral-anti-abuse["']/,
    );
    expect(route).toMatch(/evaluateReferralAntiAbuse/);

    expect(route).toMatch(
      /sameDevice[\s\S]*?referralDeviceHash/,
    );

    expect(route).toMatch(
      /sameIp[\s\S]*?referralIpHash/,
    );
  });

  it("stores the anti-abuse audit decision on ReferralUsage", () => {
    expect(route).toMatch(/antiAbuseRewardEligible/);
    expect(route).toMatch(/antiAbuseRiskReasons/);
    expect(route).toMatch(/antiAbuseEvaluatedAt/);
    expect(route).toMatch(/JSON\.stringify\([^)]*riskReasons/);
  });

  it("prevents reward unlock when anti-abuse explicitly denied the reward", () => {
    expect(paymentService).toMatch(
      /antiAbuseRewardEligible\s*===\s*false/,
    );

    const denyIndex = paymentService.indexOf(
      "antiAbuseRewardEligible === false",
    );

    const walletRewardIndex = paymentService.indexOf(
      'if (rType === "wallet")',
    );

    expect(denyIndex).toBeGreaterThan(-1);
    expect(walletRewardIndex).toBeGreaterThan(-1);
    expect(denyIndex).toBeLessThan(walletRewardIndex);
  });
  it("does not block account creation merely because the referral reward is ineligible", () => {
    expect(route).toMatch(
      /createdUser[\s\S]*?referralUsage\.create/,
    );

    expect(route).not.toMatch(
      /if\s*\(\s*!?\s*antiAbuse\w*\.?rewardEligible\s*\)\s*\{[\s\S]{0,400}?return\s+NextResponse/,
    );
  });
});
