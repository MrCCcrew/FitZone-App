import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminFeature: vi.fn(),
  requireAdminPermission: vi.fn(),
  scheduleFindMany: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.requireAdminFeature,
}));

vi.mock("@/lib/admin-authorization-server", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));

vi.mock("@/lib/db", () => ({
  db: {
    schedule: {
      findMany: mocks.scheduleFindMany,
    },
    trainer: {
      findFirst: vi.fn(),
    },
  },
}));

import { GET } from "@/app/api/admin/schedules/route";

describe("class exchange schedule read permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduleFindMany.mockResolvedValue([]);
  });

  it("allows normal bookings feature access unchanged", async () => {
    mocks.requireAdminFeature.mockResolvedValue({
      role: "staff",
      permissions: ["bookings"],
      session: {
        user: {
          id: "staff-bookings",
        },
      },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/schedules"),
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);

    expect(
      mocks.requireAdminPermission,
    ).not.toHaveBeenCalled();
  });

  it("allows execute-only staff to read schedules without bookings feature", async () => {
    mocks.requireAdminFeature.mockResolvedValue({
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    mocks.requireAdminPermission.mockResolvedValue({
      role: "staff",
      permissions: ["class_exchanges_execute"],
      session: {
        id: "staff-exchange",
        role: "staff",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/schedules"),
    );

    expect(
      mocks.requireAdminPermission,
    ).toHaveBeenCalledWith(
      "class_exchanges_execute",
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(200);
  });

  it("still rejects users with neither bookings nor execute permission", async () => {
    mocks.requireAdminFeature.mockResolvedValue({
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    mocks.requireAdminPermission.mockResolvedValue({
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    const response = await GET(
      new Request("http://localhost/api/admin/schedules"),
    );

    expect(response).toBeDefined();
    expect(response!.status).toBe(403);
  });
});
