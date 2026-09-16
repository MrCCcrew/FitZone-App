import { describe, expect, it } from "vitest";
import { canAccessAdminSection } from "@/lib/admin-permissions";
import { hasAdminPermission } from "@/lib/admin-authorization";

describe("employee compensation granular permissions", () => {
  it("employee_compensation_view opens employees section", () => {
    expect(
      canAccessAdminSection(
        "staff",
        ["employee_compensation_view"],
        "employees",
      ),
    ).toBe(true);
  });

  it("employee_compensation_manage opens employees section", () => {
    expect(
      canAccessAdminSection(
        "staff",
        ["employee_compensation_manage"],
        "employees",
      ),
    ).toBe(true);
  });

  it("view does not imply manage", () => {
    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: ["employee_compensation_view"],
        },
        "employee_compensation_manage",
      ),
    ).toBe(false);
  });

  it("manage does not imply view unless explicitly granted", () => {
    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: ["employee_compensation_manage"],
        },
        "employee_compensation_view",
      ),
    ).toBe(false);
  });

  it("admin has both compensation permissions", () => {
    expect(
      hasAdminPermission(
        { role: "admin", permissions: [] },
        "employee_compensation_view",
      ),
    ).toBe(true);

    expect(
      hasAdminPermission(
        { role: "admin", permissions: [] },
        "employee_compensation_manage",
      ),
    ).toBe(true);
  });

  it("attendance-only admin cannot manage compensation", () => {
    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: [
            "employee_attendance_view",
            "employee_attendance_manage",
          ],
        },
        "employee_compensation_manage",
      ),
    ).toBe(false);
  });

  it("non-admin-side role cannot enter employees via compensation permission", () => {
    expect(
      canAccessAdminSection(
        "member",
        ["employee_compensation_manage"],
        "employees",
      ),
    ).toBe(false);
  });
});
