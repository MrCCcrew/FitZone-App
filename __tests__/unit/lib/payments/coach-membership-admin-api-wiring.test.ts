import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Coach Membership admin API wiring", () => {
  const permissions = fs.readFileSync(
    path.join(process.cwd(), "src/lib/admin-permissions.ts"),
    "utf8",
  );

  const route = fs.readFileSync(
    path.join(
      process.cwd(),
      "src/app/api/admin/coach-membership-earnings/route.ts",
    ),
    "utf8",
  );

  it("defines independent view and finalize permissions only", () => {
    expect(permissions).toContain('"coach_membership_earning_view"');

    expect(permissions).toContain('"coach_membership_earning_finalize"');

    expect(permissions).not.toContain('"coach_membership_earning_calculate"');
  });

  it("GET is protected by view permission", () => {
    expect(route).toContain(
      'requireAdminPermission("coach_membership_earning_view")',
    );
  });

  it("POST finalize is protected independently", () => {
    expect(route).toMatch(
      /requireAdminPermission\(\s*["']coach_membership_earning_finalize["']\s*,?\s*\)/,
    );

    expect(route).toContain("finalizeCoachMembershipEarning");
  });

  it("does not expose manual calculation", () => {
    expect(route).not.toContain("calculateCoachMembership");

    expect(route).toContain('action !== "finalize"');
  });

  it("supports month employee trainer status and membership filters", () => {
    expect(route).toContain('get("month")');

    expect(route).toContain('get("employeeId")');

    expect(route).toContain('get("trainerId")');

    expect(route).toContain('get("status")');

    expect(route).toContain('get("membershipId")');
  });
});
