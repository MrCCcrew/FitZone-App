import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("membership supersession regression guards", () => {
  it("does not expire the current membership merely because a paid checkout starts", () => {
    const source = readSource("src/app/api/subscribe/route.ts");

    expect(source).toContain(
      'if (!needsPaymentConfirmation && plan.kind !== "trial")',
    );
    expect(source).toContain("id: { not: subscription.id }");

    const oldUnsafeBlock = `if (plan.kind !== "trial") {
        await tx.userMembership.updateMany({
          where: { userId, status: "active" },
          data: { status: "expired" },
        });
      }`;

    expect(source).not.toContain(oldUnsafeBlock);
  });

  it("supersedes an old membership only after successful paid activation", () => {
    const source = readSource("src/lib/payments/service.ts");

    expect(source).toContain(
      'if (membership.membership?.kind !== "trial")',
    );
    expect(source).toContain("userId: membership.userId");
    expect(source).toContain("id: { not: membershipId }");
  });

  it("admin customer editing never creates a free replacement membership", () => {
    const source = readSource("src/app/api/admin/customers/route.ts");

    const start = source.indexOf("async function applyMembership");
    const end = source.indexOf(
      "async function applyWalletAndRewards",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const applyMembership = source.slice(start, end);

    expect(applyMembership).toContain("if (activeMembership)");
    expect(applyMembership).toContain('status: "expired"');
    expect(applyMembership).toContain("endDate: { gt: new Date() }");
    expect(applyMembership).toContain('status: "paid"');

    expect(applyMembership).not.toContain(
      "db.userMembership.create",
    );
    expect(applyMembership).not.toContain(
      'data: { status: "expired" }',
    );
    expect(applyMembership).not.toContain("walletBonus");
  });
});
