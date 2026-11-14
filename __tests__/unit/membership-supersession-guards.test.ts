import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("membership supersession structural guards", () => {
  it("does not supersede an active subscription while payment is pending", () => {
    const source = readSource("src/app/api/subscribe/route.ts");
    const helper = readSource("src/lib/membership-session-carryover.ts");

    expect(source).toContain(
      'if (!needsPaymentConfirmation && plan.kind !== "trial")',
    );
    expect(source).toContain("await supersedeOrdinarySubscriptionsTx(");

    const completedBranch = source.indexOf(
      'if (!needsPaymentConfirmation && plan.kind !== "trial")',
    );
    const carryover = source.indexOf(
      "await applyMembershipSessionCarryoverTx(",
      completedBranch,
    );
    const supersession = source.indexOf(
      "await supersedeOrdinarySubscriptionsTx(",
      carryover,
    );

    expect(completedBranch).toBeGreaterThanOrEqual(0);
    expect(carryover).toBeGreaterThan(completedBranch);
    expect(supersession).toBeGreaterThan(carryover);

    expect(helper).toContain('input.targetKind !== "subscription"');
    expect(helper).toContain("input.targetOfferId !== null");
    expect(helper).toContain('status: "active"');
    expect(helper).toContain("id: { not: input.targetMembershipId }");
    expect(helper).toContain("offerId: null");
    expect(helper).toContain('kind: "subscription"');
    expect(helper).toContain('data: { status: "expired" }');

    const oldUnsafeBlock = `if (plan.kind !== "trial") {
        await tx.userMembership.updateMany({
          where: { userId, status: "active" },
          data: { status: "expired" },
        });
      }`;

    expect(source).not.toContain(oldUnsafeBlock);
  });

  it("supersedes ordinary subscriptions after booking guarantee and carryover", () => {
    const source = readSource("src/lib/payments/service.ts");
    const helper = readSource("src/lib/membership-session-carryover.ts");

    const booking = source.indexOf(
      "await ensureMembershipBookingsFromPaymentMetadataTx(",
    );
    const carryover = source.indexOf(
      "await applyMembershipSessionCarryoverTx(",
      booking,
    );
    const supersession = source.indexOf(
      "await supersedeOrdinarySubscriptionsTx(",
      carryover,
    );

    expect(booking).toBeGreaterThanOrEqual(0);
    expect(carryover).toBeGreaterThan(booking);
    expect(supersession).toBeGreaterThan(carryover);

    const call = source.slice(supersession, supersession + 450);
    expect(call).toContain("userId: membership.userId");
    expect(call).toContain("targetMembershipId: membershipId");
    expect(call).toContain("targetKind: membership.membership.kind");
    expect(call).toContain("targetOfferId: membership.offerId ?? null");

    expect(helper).toContain('input.targetKind !== "subscription"');
    expect(helper).toContain("input.targetOfferId !== null");
    expect(helper).toContain("id: { not: input.targetMembershipId }");
    expect(helper).toContain("offerId: null");
    expect(helper).toContain('kind: "subscription"');
  });
  it("admin editing delegates paid recovery to the transactional recovery service", () => {
    const routeSource = readSource(
      "src/app/api/admin/customers/route.ts",
    );
    const serviceSource = readSource(
      "src/lib/admin-membership-recovery.ts",
    );
    const paymentSource = readSource(
      "src/lib/payments/service.ts",
    );

    const start = routeSource.indexOf(
      "async function applyMembership",
    );
    const end = routeSource.indexOf(
      "async function applyWalletAndRewards",
      start,
    );

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const applyMembership = routeSource.slice(start, end);

    expect(applyMembership).toContain(
      "recoverPaidMembershipForAdmin",
    );
    expect(applyMembership).not.toContain(
      "db.userMembership.create",
    );

    expect(serviceSource).toContain(
      "lockMembershipLifecycleUserTx",
    );
    expect(paymentSource).toContain(
      "lockMembershipLifecycleUserTx",
    );
    expect(serviceSource).toContain(
      "Prisma.TransactionIsolationLevel.Serializable",
    );
    expect(serviceSource).toContain(
      'status: "paid"',
    );
  });
});
