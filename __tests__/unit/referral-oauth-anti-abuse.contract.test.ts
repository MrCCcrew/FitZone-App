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

describe("OAuth referral anti-abuse wiring contract", () => {
  const consentPage = read(
    "src/app/google-consent/page.tsx",
  );

  const consentRoute = read(
    "src/app/api/auth/oauth/consent/route.ts",
  );

  const oauthLib = read(
    "src/lib/oauth.ts",
  );

  it("persists a stable browser device id and sends it with OAuth consent", () => {
    expect(consentPage).toMatch(
      /localStorage/,
    );

    expect(consentPage).toMatch(
      /crypto\.randomUUID/,
    );

    expect(consentPage).toMatch(
      /deviceId/,
    );

    expect(consentPage).toMatch(
      /JSON\.stringify\(\s*\{[\s\S]*accepted\s*:\s*true[\s\S]*deviceId[\s\S]*\}\s*\)/,
    );
  });

  it("hashes OAuth registration identity server-side", () => {
    expect(consentRoute).toMatch(
      /from\s+["']@\/lib\/referral-identity["']/,
    );

    expect(consentRoute).toMatch(
      /buildReferralIdentityHashes/,
    );

    expect(consentRoute).toMatch(
      /getClientIp/,
    );

    expect(consentRoute).toMatch(
      /user-agent/,
    );

    expect(consentRoute).toMatch(
      /\bdeviceId\b/,
    );

    expect(consentRoute).toMatch(
      /referralDeviceHash\s*:\s*registrationIdentity\.deviceHash/,
    );

    expect(consentRoute).toMatch(
      /referralIpHash\s*:\s*registrationIdentity\.ipHash/,
    );

    expect(consentRoute).toMatch(
      /referralUserAgentHash\s*:\s*registrationIdentity\.userAgentHash/,
    );
  });

  it("stores only identity hashes when a new OAuth user is created", () => {
    expect(oauthLib).toMatch(
      /referralDeviceHash\??\s*:/,
    );

    expect(oauthLib).toMatch(
      /referralIpHash\??\s*:/,
    );

    expect(oauthLib).toMatch(
      /referralUserAgentHash\??\s*:/,
    );

    expect(oauthLib).toMatch(
      /referralDeviceHash\s*:\s*profile\.referralDeviceHash/,
    );

    expect(oauthLib).toMatch(
      /referralIpHash\s*:\s*profile\.referralIpHash/,
    );

    expect(oauthLib).toMatch(
      /referralUserAgentHash\s*:\s*profile\.referralUserAgentHash/,
    );

    expect(oauthLib).not.toMatch(
      /referralDeviceHash\s*:\s*deviceId\b/,
    );

    expect(oauthLib).not.toMatch(
      /referralIpHash\s*:\s*clientIp\b/,
    );

    expect(oauthLib).not.toMatch(
      /referralUserAgentHash\s*:\s*userAgent\b/,
    );
  });

  it("compares the new OAuth user with the referrer and evaluates anti-abuse", () => {
    expect(consentRoute).toMatch(
      /from\s+["']@\/lib\/referral-anti-abuse["']/,
    );

    expect(consentRoute).toMatch(
      /evaluateReferralAntiAbuse/,
    );

    expect(consentRoute).toMatch(
      /select\s*:\s*\{[\s\S]*referralDeviceHash\s*:\s*true[\s\S]*referralIpHash\s*:\s*true[\s\S]*\}/,
    );

    expect(consentRoute).toMatch(
      /sameDevice[\s\S]*referralDeviceHash/,
    );

    expect(consentRoute).toMatch(
      /sameIp[\s\S]*referralIpHash/,
    );

    expect(consentRoute).toMatch(
      /evaluateReferralAntiAbuse\(\s*\{[\s\S]*sameDevice[\s\S]*sameIp[\s\S]*\}\s*\)/,
    );
  });

  it("persists the OAuth anti-abuse decision on ReferralUsage", () => {
    expect(consentRoute).toMatch(
      /antiAbuseRewardEligible\s*:\s*referralAntiAbuseDecision\.rewardEligible/,
    );

    expect(consentRoute).toMatch(
      /antiAbuseRiskReasons\s*:\s*JSON\.stringify\(\s*referralAntiAbuseDecision\.riskReasons\s*,?\s*\)/,
    );

    expect(consentRoute).toMatch(
      /antiAbuseEvaluatedAt\s*:\s*new Date\(\)/,
    );
  });

  it("does not block OAuth account creation when referral reward is denied", () => {
    expect(consentRoute).not.toMatch(
      /if\s*\(\s*!referralAntiAbuseDecision\.rewardEligible\s*\)\s*\{?\s*return/,
    );

    expect(consentRoute).not.toMatch(
      /if\s*\(\s*referralAntiAbuseDecision\.rewardEligible\s*===\s*false\s*\)\s*\{?\s*return/,
    );

    expect(consentRoute).toMatch(
      /if\s*\(\s*result\.isNew\s*&&\s*refCode\s*\)/,
    );

    expect(consentRoute).toMatch(
      /referralUsage\.create/,
    );
  });
});