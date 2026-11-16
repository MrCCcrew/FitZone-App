import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  adminGuard: vi.fn(),
  measurementFindMany: vi.fn(),
  measurementCreate: vi.fn(),
  userFindFirst: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  getCurrentAppUser: mocks.currentUser,
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminFeature: mocks.adminGuard,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customerBodyMeasurement: {
      findMany: mocks.measurementFindMany,
      create: mocks.measurementCreate,
    },
    user: {
      findFirst: mocks.userFindFirst,
    },
  },
}));

import {
  GET as selfGET,
  POST as selfPOST,
} from "@/app/api/me/body-measurements/route";

import {
  GET as adminGET,
} from "@/app/api/admin/body-measurements/route";

const post = (body: unknown) =>
  selfPOST(
    new Request("http://localhost/api/me/body-measurements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const adminRequest = (userId: string) =>
  new Request(
    `http://localhost/api/admin/body-measurements?userId=${userId}`,
  );

beforeEach(() => {
  vi.resetAllMocks();
});

describe("R19 body measurements ownership and authorization", () => {
  it("rejects anonymous reads", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await selfGET();

    expect(response.status).toBe(401);
    expect(mocks.measurementFindMany).not.toHaveBeenCalled();
  });

  it("rejects anonymous writes", async () => {
    mocks.currentUser.mockResolvedValue(null);

    const response = await post({ weightKg: 70 });

    expect(response.status).toBe(401);
    expect(mocks.measurementCreate).not.toHaveBeenCalled();
  });

  it("reads only the authenticated customer's measurements", async () => {
    mocks.currentUser.mockResolvedValue({ id: "customer-a" });
    mocks.measurementFindMany.mockResolvedValue([]);

    const response = await selfGET();

    expect(response.status).toBe(200);
    expect(mocks.measurementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "customer-a" },
      }),
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("rejects userId spoofing in a write request", async () => {
    mocks.currentUser.mockResolvedValue({ id: "customer-a" });

    const response = await post({
      userId: "customer-b",
      weightKg: 70,
    });

    expect(response.status).toBe(400);
    expect(mocks.measurementCreate).not.toHaveBeenCalled();
  });

  it("writes validated measurements under the session owner", async () => {
    mocks.currentUser.mockResolvedValue({ id: "customer-a" });
    mocks.measurementCreate.mockResolvedValue({
      id: "measurement-1",
      userId: "customer-a",
      weightKg: 70,
    });

    const response = await post({
      weightKg: 70,
      heightCm: 165,
    });

    expect(response.status).toBe(201);
    expect(mocks.measurementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "customer-a",
        weightKg: 70,
        heightCm: 165,
      }),
    });
  });

  it("rejects invalid measurements before writing", async () => {
    mocks.currentUser.mockResolvedValue({ id: "customer-a" });

    const response = await post({ weightKg: -10 });

    expect(response.status).toBe(400);
    expect(mocks.measurementCreate).not.toHaveBeenCalled();
  });

  it("rejects anonymous administration access", async () => {
    mocks.adminGuard.mockResolvedValue({
      error: new Response("Unauthorized", { status: 401 }),
    });

    const response = await adminGET(adminRequest("customer-a"));
    if (!response) throw new Error("ADMIN_MEASUREMENTS_NO_RESPONSE");

    expect(response.status).toBe(401);
    expect(mocks.measurementFindMany).not.toHaveBeenCalled();
  });

  it.each(["staff", "trainer", "accountant"])(
    "denies %s access to body measurements",
    async (role) => {
      mocks.adminGuard.mockResolvedValue({
        role,
        permissions: ["customers"],
        session: { user: { id: "staff-a" } },
      });

      const response = await adminGET(adminRequest("customer-a"));
      if (!response) throw new Error("ADMIN_MEASUREMENTS_NO_RESPONSE");

      expect(response.status).toBe(403);
      expect(mocks.userFindFirst).not.toHaveBeenCalled();
      expect(mocks.measurementFindMany).not.toHaveBeenCalled();
    },
  );

  it("allows an authorized admin to read the selected customer only", async () => {
    mocks.adminGuard.mockResolvedValue({
      role: "admin",
      permissions: [],
      session: { user: { id: "admin-a" } },
    });

    mocks.userFindFirst.mockResolvedValue({ id: "customer-b" });
    mocks.measurementFindMany.mockResolvedValue([]);

    const response = await adminGET(adminRequest("customer-b"));
    if (!response) throw new Error("ADMIN_MEASUREMENTS_NO_RESPONSE");

    expect(response.status).toBe(200);
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: { id: "customer-b", role: "member" },
      select: { id: true },
    });
    expect(mocks.measurementFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "customer-b" },
      }),
    );
  });

  it("does not return measurements for an unknown customer", async () => {
    mocks.adminGuard.mockResolvedValue({
      role: "admin",
      permissions: [],
      session: { user: { id: "admin-a" } },
    });
    mocks.userFindFirst.mockResolvedValue(null);

    const response = await adminGET(adminRequest("missing-user"));
    if (!response) throw new Error("ADMIN_MEASUREMENTS_NO_RESPONSE");

    expect(response.status).toBe(404);
    expect(mocks.measurementFindMany).not.toHaveBeenCalled();
  });
});