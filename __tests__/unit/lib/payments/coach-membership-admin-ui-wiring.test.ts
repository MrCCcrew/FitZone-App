import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership admin UI wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/admin/sections/EmployeesHR.tsx"),
    "utf8",
  );

  it("adds dedicated Coach Membership earning tab", () => {
    expect(source).toContain('"coach-membership-earnings"');

    expect(source).toContain("مستحقات اشتراكات المدربين");
  });

  it("loads only official earning API values", () => {
    expect(source).toContain("/api/admin/coach-membership-earnings");

    expect(source).toContain("coachMembershipEarningRows");
  });

  it("has no manual calculate action", () => {
    expect(source).not.toContain("runCoachMembershipCalculate");

    expect(source).not.toContain("coach_membership_earning_calculate");
  });

  it("supports month employee and status filters", () => {
    expect(source).toContain("coachMembershipEarningMonth");

    expect(source).toContain("coachMembershipEarningEmployeeId");

    expect(source).toContain("coachMembershipEarningStatus");
  });

  it("finalizes only calculated rows and shows finalized rows read-only", () => {
    expect(source).toContain('row.status === "calculated"');

    expect(source).toContain("runCoachMembershipFinalize");

    expect(source).toContain("معتمد - قراءة فقط");
  });

  it("displays frozen base rate and commission fields", () => {
    expect(source).toContain("paymentAmountMinor");

    expect(source).toContain("commissionRateBps");

    expect(source).toContain("commissionAmountMinor");

    expect(source).toContain("employeeCodeSnapshot");

    expect(source).toContain("trainerNameSnapshot");
  });
});
