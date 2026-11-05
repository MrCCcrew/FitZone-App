import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership subscribe wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/subscribe/route.ts"),
    "utf8",
  );

  it("invokes Coach Membership attribution before UserMembership creation", () => {
    const attributionIndex = source.indexOf(
      "buildCoachMembershipAttributionTx(",
    );

    const createIndex = source.indexOf("tx.userMembership.create({");

    expect(attributionIndex).toBeGreaterThan(-1);
    expect(createIndex).toBeGreaterThan(-1);
    expect(attributionIndex).toBeLessThan(createIndex);
  });

  it("uses the checkout-selected coach identity", () => {
    expect(source).toContain("trainerId: coachMembershipTrainerId ?? null");
  });

  it("passes the active transaction client to attribution resolution", () => {
    const compact = source.replace(/\s+/g, " ");

    expect(compact).toContain(
      "buildCoachMembershipAttributionTx(asDbTransactionClient(tx), {",
    );
  });

  it("persists all immutable Coach Membership snapshots", () => {
    const requiredFields = [
      "coachMembershipTrainerIdSnapshot",
      "coachMembershipTrainerNameSnapshot",
      "coachMembershipEmployeeIdSnapshot",
      "coachMembershipEmployeeCodeSnapshot",
      "coachMembershipEmployeeNameSnapshot",
      "coachMembershipCompensationTermIdSnapshot",
      "coachMembershipCommissionBpsSnapshot",
      "coachMembershipCurrencySnapshot",
    ];

    for (const field of requiredFields) {
      expect(source).toContain(field);
    }
  });

  it("does not create CoachMembershipEarning during checkout", () => {
    expect(source).not.toContain("coachMembershipEarning.create");

    expect(source).not.toContain("coachMembershipEarning.upsert");
  });

  it("does not reinterpret trainer referral attribution as Coach Membership ownership", () => {
    expect(source).toContain("trainerReferralLinkId: trainerLinkRecord.id");

    expect(source).toContain("trainerId: coachMembershipTrainerId ?? null");
  });
});
