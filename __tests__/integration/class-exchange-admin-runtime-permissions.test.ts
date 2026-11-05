import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
}));

vi.mock("@/lib/admin-authorization-server", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));

import { GET, POST } from "@/app/api/admin/class-exchanges/route";

describe("Admin class exchange runtime authorization", () => {
  beforeEach(() => {
    mocks.requireAdminPermission.mockReset();
  });

  it("lets direct-exchange staff pass GET with execute permission", async () => {
    mocks.requireAdminPermission.mockResolvedValueOnce({
      role: "staff",
      session: {
        id: "staff-1",
        role: "staff",
      },
    });

    const response = await GET(
      new Request("http://localhost/api/admin/class-exchanges"),
    );

    expect(mocks.requireAdminPermission).toHaveBeenCalledWith(
      "class_exchanges_execute",
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error).toBe("الاشتراك مطلوب.");
  });

  it("falls back to review permission for GET when execute permission is denied", async () => {
    mocks.requireAdminPermission
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Forbidden" },
          { status: 403 },
        ),
      })
      .mockResolvedValueOnce({
        role: "staff",
        session: {
          id: "staff-review-1",
          role: "staff",
        },
      });

    const response = await GET(
      new Request("http://localhost/api/admin/class-exchanges"),
    );

    expect(mocks.requireAdminPermission).toHaveBeenNthCalledWith(
      1,
      "class_exchanges_execute",
    );

    expect(mocks.requireAdminPermission).toHaveBeenNthCalledWith(
      2,
      "class_exchanges_review",
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error).toBe("الاشتراك مطلوب.");
  });

  it("returns denial from GET when neither execute nor review permission exists", async () => {
    mocks.requireAdminPermission
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Forbidden" },
          { status: 403 },
        ),
      })
      .mockResolvedValueOnce({
        error: Response.json(
          { error: "Forbidden" },
          { status: 403 },
        ),
      });

    const response = await GET(
      new Request("http://localhost/api/admin/class-exchanges"),
    );

    expect(response.status).toBe(403);
  });

  it("lets delegated staff with execute permission reach POST validation", async () => {
    mocks.requireAdminPermission.mockResolvedValue({
      role: "staff",
      session: {
        id: "staff-execute-1",
        role: "staff",
      },
    });

    const response = await POST(
      new Request("http://localhost/api/admin/class-exchanges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(mocks.requireAdminPermission).toHaveBeenCalledWith(
      "class_exchanges_execute",
    );

    expect(response.status).toBe(400);

    const payload = await response.json();

    expect(payload.error).toBe("الاشتراك والموعد مطلوبان.");
  });

  it("rejects POST when execute permission is missing", async () => {
    mocks.requireAdminPermission.mockResolvedValue({
      error: Response.json(
        { error: "Forbidden" },
        { status: 403 },
      ),
    });

    const response = await POST(
      new Request("http://localhost/api/admin/class-exchanges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(mocks.requireAdminPermission).toHaveBeenCalledWith(
      "class_exchanges_execute",
    );

    expect(response.status).toBe(403);
  });
});
