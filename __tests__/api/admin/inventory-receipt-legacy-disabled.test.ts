import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: vi.fn(async () => ({
    session: {
      user: {
        id: null,
        role: "admin",
      },
    },
  })),
}));

describe("legacy inventory receipt mutation route", () => {
  it("disables PATCH", async () => {
    const { PATCH } =
      await import("@/app/api/admin/inventory/receipts/[id]/route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/inventory/receipts/fake-id", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          items: [],
        }),
      }),
      {
        params: Promise.resolve({
          id: "fake-id",
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.error).toMatch(/غير مسموح/);
  });

  it("disables DELETE", async () => {
    const { DELETE } =
      await import("@/app/api/admin/inventory/receipts/[id]/route");

    const response = await DELETE(
      new Request("http://localhost/api/admin/inventory/receipts/fake-id", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({
          id: "fake-id",
        }),
      },
    );

    const body = await response.json();

    expect(response.status).toBe(405);
    expect(body.error).toMatch(/غير مسموح/);
  });
});
