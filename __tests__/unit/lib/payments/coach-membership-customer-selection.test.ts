import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership customer selection wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/FitzoneApp.tsx"),
    "utf8",
  );

  it("carries Coach Membership flags into client types", () => {
    expect(source).toContain("coachMembershipEnabled: boolean");

    expect(source).toContain("coachMembershipEligible: boolean");

    expect(source).toContain("coachMembershipEnabled?: boolean");
  });

  it("maps membership Coach Membership classification into PlanItem", () => {
    expect(source).toContain("membership.coachMembershipEnabled === true");
  });

  it("only exposes server-approved trainers to Coach Membership selection", () => {
    expect(source).toContain("trainer.coachMembershipEligible === true");
  });

  it("clears the selected coach whenever a new checkout is opened", () => {
    expect(source).toContain("setSelectedCoachMembershipTrainerId(null)");
  });

  it("sends only the selected trainer id to subscribe", () => {
    expect(source).toContain("coachMembershipTrainerId:");

    expect(source).toContain("plan.coachMembershipEnabled === true");
  });

  it("preserves coach selection through email verification retry", () => {
    expect(source).toContain("pendingPlan.coachMembershipTrainerId ?? null");
  });

  it("blocks Coach Membership confirmation without an eligible selected coach", () => {
    expect(source).toContain("membershipTrainers.length === 0");

    expect(source).toContain("!selectedCoachMembershipTrainerId");
  });

  it("does not create Coach Membership earnings in the customer UI", () => {
    expect(source).not.toContain("coachMembershipEarning.create");

    expect(source).not.toContain("coachMembershipEarning.upsert");
  });
});
