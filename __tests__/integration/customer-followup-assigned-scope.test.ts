import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSION_KEYS,
  MARKETING_PERMISSIONS,
} from "@/lib/admin-permissions";

import { hasAdminPermission } from "@/lib/admin-authorization";

const customersRoute = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/admin/customers/route.ts",
  ),
  "utf8",
);

const exportRoute = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/admin/customers/export/route.ts",
  ),
  "utf8",
);

const settingsUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/admin/sections/Settings.tsx",
  ),
  "utf8",
);

const customersUi = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/app/admin/sections/Customers.tsx",
  ),
  "utf8",
);

describe("Customer follow-up assigned-only permission", () => {
  it("registers the dedicated permission as a valid saved permission", () => {
    expect(MARKETING_PERMISSIONS).toContain(
      "customer_followup_assigned_only",
    );

    expect(ADMIN_PERMISSION_KEYS).toContain(
      "customer_followup_assigned_only",
    );
  });

  it("does not restrict ordinary staff unless explicitly enabled", () => {
    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: ["customers"],
        },
        "customer_followup_assigned_only",
      ),
    ).toBe(false);

    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: [
            "customers",
            "customer_followup_assigned_only",
          ],
        },
        "customer_followup_assigned_only",
      ),
    ).toBe(true);
  });

  it("keeps full admin authorization for the dedicated permission", () => {
    expect(
      hasAdminPermission(
        {
          role: "admin",
          permissions: [],
        },
        "customer_followup_assigned_only",
      ),
    ).toBe(true);
  });

  it("scopes customer GET only when staff has the dedicated permission", () => {
    expect(customersRoute).toContain(
      'userRole === "staff"',
    );

    expect(customersRoute).toContain(
      '"customer_followup_assigned_only"',
    );

    expect(customersRoute).toContain(
      "assignedStaffUserId: guard.session.user.id",
    );

    expect(customersRoute).toContain(
      "activeKey: { not: null }",
    );
  });

  it("uses the same server-side ownership boundary for XLSX export", () => {
    expect(exportRoute).toContain(
      'userRole === "staff"',
    );

    expect(exportRoute).toContain(
      '"customer_followup_assigned_only"',
    );

    expect(exportRoute).toContain(
      "assignedStaffUserId: guard.session.user.id",
    );

    expect(exportRoute).toContain(
      "activeKey: { not: null }",
    );

    expect(exportRoute).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("exposes the permission in Arabic settings UI", () => {
    expect(settingsUi).toContain(
      'customer_followup_assigned_only: "عرض عملاء المتابعة المسندين فقط"',
    );
  });

  it("wires the existing Excel button to the protected XLSX route", () => {
    expect(customersUi).toContain(
      'window.location.href = "/api/admin/customers/export"',
    );

    expect(customersUi).toContain(
      "تصدير Excel",
    );

    expect(customersUi).not.toContain(
      'link.download = `customers-report-${new Date().toISOString().slice(0, 10)}.csv`',
    );
  });
});
