import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findMany: mocks.userFindMany,
    },
    paymentTransaction: {
      findMany: vi.fn(),
    },
    attendancePass: {
      findMany: vi.fn(),
    },
    booking: {
      groupBy: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/admin/customers/route";

function guard(
  role: string,
  permissions: string[],
  userId = "staff-1",
) {
  return {
    role,
    permissions,
    session: {
      user: {
        id: userId,
        role,
        permissions,
        email: "test@example.com",
        name: "Test",
        jobTitle: null,
      },
    },
  };
}

describe("customers GET assigned follow-up scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([]);
  });

  it("does NOT restrict ordinary staff without assigned-only permission", async () => {
    mocks.requireAdminFeature.mockResolvedValue(
      guard("staff", ["customers"]),
    );

    const response = await GET();
    expect(response).toBeDefined();
    expect(response!.status).toBe(200);

    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);

    const args = mocks.userFindMany.mock.calls[0][0];

    expect(args.where).toEqual({
      role: "member",
    });

    expect(
      args.where.marketingConversionsAsCustomer,
    ).toBeUndefined();
  });

  it("restricts assigned-only staff to their own active follow-up customers", async () => {
    mocks.requireAdminFeature.mockResolvedValue(
      guard(
        "staff",
        [
          "customers",
          "customer_followup_assigned_only",
        ],
        "staff-owner-77",
      ),
    );

    const response = await GET();
    expect(response).toBeDefined();
    expect(response!.status).toBe(200);

    const args = mocks.userFindMany.mock.calls[0][0];

    expect(args.where).toEqual({
      role: "member",
      pendingApproval: false,
      marketingConversionsAsCustomer: {
        some: {
          assignedStaffUserId: "staff-owner-77",
          activeKey: {
            not: null,
          },
        },
      },
    });
  });

  it("keeps admin customer query unrestricted", async () => {
    mocks.requireAdminFeature.mockResolvedValue(
      guard("admin", [], "admin-1"),
    );

    const response = await GET();
    expect(response).toBeDefined();
    expect(response!.status).toBe(200);

    const args = mocks.userFindMany.mock.calls[0][0];

    expect(args.where).toEqual({
      role: "member",
    });
  });
});
