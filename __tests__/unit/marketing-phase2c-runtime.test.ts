import fs from "node:fs";
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/admin-authorization-server", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/audit-context", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/marketing-conversion-service", () => ({
  assignMarketingConversion: vi.fn(),
  cancelMarketingConversion: vi.fn(),
  reassignMarketingConversion: vi.fn(),
  MarketingConversionError: class MarketingConversionError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));

import { GET } from "@/app/api/admin/marketing-conversions/route";
import { hasAdminPermission } from "@/lib/admin-authorization";

describe("Marketing Phase 2C permissions/runtime contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin always has marketing conversion permission", () => {
    expect(
      hasAdminPermission(
        { role: "admin", permissions: [] },
        "marketing_conversions_manage",
      ),
    ).toBe(true);
  });

  it("staff without permission is denied", () => {
    expect(
      hasAdminPermission(
        { role: "staff", permissions: ["customers"] },
        "marketing_conversions_manage",
      ),
    ).toBe(false);
  });

  it("staff with explicit marketing permission is allowed", () => {
    expect(
      hasAdminPermission(
        {
          role: "staff",
          permissions: [
            "customers",
            "marketing_conversions_manage",
          ],
        },
        "marketing_conversions_manage",
      ),
    ).toBe(true);
  });

  it("marketing employees endpoint keeps forbidden response opaque", async () => {
    mocks.requireAdminPermission.mockResolvedValue({
      error: NextResponse.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    const response = await GET();

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected forbidden response");
    }

    expect(response.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("marketing employees endpoint returns active staff for authorized user", async () => {
    mocks.requireAdminPermission.mockResolvedValue({
      session: {
        id: "admin-test",
        role: "admin",
        permissions: [],
      },
      role: "admin",
      permissions: [],
    });

    mocks.findMany.mockResolvedValue([
      {
        id: "staff-1",
        name: "Marketing Staff",
        email: "staff@example.invalid",
        jobTitle: "Marketing",
        marketingCommissionRate: 0,
        marketingCommissionType: "percentage",
      },
    ]);

    const response = await GET();

    expect(response).toBeDefined();
    if (!response) {
      throw new Error("Expected successful response");
    }

    const payload = await response.json();

    expect(response.status).toBe(200);

    expect(payload).toEqual({
      employees: [
        expect.objectContaining({
          id: "staff-1",
          name: "Marketing Staff",
        }),
      ],
    });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: "staff",
          isActive: true,
        },
      }),
    );
  });

  it("customers UI contains registration filters and marketing/referrer controls", () => {
    const source = fs.readFileSync(
      "src/app/admin/sections/Customers.tsx",
      "utf8",
    );

    expect(source).toContain("joinDateFrom");
    expect(source).toContain("joinDateTo");

    expect(source).toContain('"المحيل الأصلي"');
    expect(source).toContain('"متابعة التسويق"');

    expect(source).toContain("customer.originalReferrer");
    expect(source).toContain("customer.marketingConversion");

    expect(source).toContain("canManageMarketing");
    expect(source).toContain('action: "reassign"');
    expect(source).toContain('action: "cancel"');
  });

  it("customers API exposes persisted referrer and marketing capability", () => {
    const source = fs.readFileSync(
      "src/app/api/admin/customers/route.ts",
      "utf8",
    );

    expect(source).toContain(
      "resolveOriginalReferrer(user.memberships)",
    );

    expect(source).toContain(
      '"marketing_conversions_manage"',
    );

    expect(source).toContain(
      "marketingConversionsAsCustomer",
    );

    // Original attribution must come from persisted membership relations,
    // never transient pending referral state.
    expect(source).toContain("staffReferralLink");
    expect(source).toContain("trainerReferralLink");
    expect(source).toContain("nutritionReferralLink");
    expect(source).toContain("refAgent");
    expect(source).toContain("salesAgent");
    expect(source).toContain("partner");
  });
});
