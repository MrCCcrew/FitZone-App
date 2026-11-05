import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership public API wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/public/route.ts"),
    "utf8",
  );

  it("exposes coachMembershipEnabled on memberships", () => {
    expect(source).toContain("coachMembershipEnabled: boolean");

    expect(source).toContain("membership.coachMembershipEnabled === true");
  });

  it("exposes server-owned Coach Membership trainer eligibility", () => {
    expect(source).toContain("coachMembershipEligible: boolean");

    expect(source).toContain('trainer.employee.employmentStatus === "active"');

    expect(source).toContain("trainer.employee.payrollEnabled === true");
  });

  it("requires the Trainer to have an EmployeeProfile link", () => {
    expect(source).toContain("trainer.employeeId != null");

    expect(source).toContain("trainer.employee != null");
  });

  it("requires an effective Coach Compensation Term using the Cairo calendar date", () => {
    expect(source).toContain(
      'import { cairoCalendarDateKey } from "@/lib/fitzone-time"',
    );

    expect(source).toContain("cairoCalendarDateKey(scheduleNow)");

    expect(source).toContain("coachCompensationTerms:");

    expect(source).toContain("lte: coachMembershipDateAnchor");

    expect(source).toContain("gte: coachMembershipDateAnchor");

    expect(source).toContain(
      "trainer.employee.coachCompensationTerms.length > 0",
    );
  });

  it("loads employee eligibility fields server-side", () => {
    expect(source).toContain("employmentStatus: true");

    expect(source).toContain("payrollEnabled: true");
  });

  it("does not remove trainers from the public directory based on Coach Membership eligibility", () => {
    expect(source).toContain("trainers: trainers.map((trainer) =>");

    expect(source).not.toContain(
      "trainers.filter((trainer) => trainer.coachMembershipEligible",
    );
  });
});
