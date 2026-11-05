import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ReferralUsage anti-abuse audit schema contract", () => {
  const schema = readFileSync(
    resolve(process.cwd(), "prisma/schema.prisma"),
    "utf8",
  );

  it("stores a nullable anti-abuse reward decision for legacy-safe cutover", () => {
    expect(schema).toMatch(
      /^\s*antiAbuseRewardEligible\s+Boolean\?\s*$/m,
    );
  });

  it("stores risk reason codes without raw identity data", () => {
    expect(schema).toMatch(
      /^\s*antiAbuseRiskReasons\s+String\?\s+@db\.Text\s*$/m,
    );

    expect(schema).not.toMatch(
      /^\s*antiAbuseDeviceId\s+/m,
    );

    expect(schema).not.toMatch(
      /^\s*antiAbuseIpAddress\s+/m,
    );
  });

  it("stores when the anti-abuse decision was evaluated", () => {
    expect(schema).toMatch(
      /^\s*antiAbuseEvaluatedAt\s+DateTime\?\s*$/m,
    );
  });
});
