import { beforeEach, describe, expect, it, vi } from "vitest";

const guardState = vi.hoisted(() => ({
  denied: null as null | Response,
  lastPermission: null as string | null,
}));

const serviceState = vi.hoisted(() => ({
  calculateCalls: [] as unknown[],
  finalizeCalls: [] as unknown[],
}));

vi.mock("@/lib/admin-authorization-server", () => ({
  requireAdminPermission: vi.fn(async (permission: string) => {
    guardState.lastPermission = permission;

    if (guardState.denied) {
      return {
        error: guardState.denied,
      };
    }

    return {
      session: {
        id: "session-1",
        user: {
          id: "admin-1",
          name: "Admin",
          email: "admin@example.com",
          role: "staff",
        },
      },
      role: "staff",
      permissions: [],
    };
  }),
}));

vi.mock("@/lib/employees/fixed-class-earning-service", () => ({
  calculateFixedClassEarning: vi.fn(async (input: unknown, actor: unknown) => {
    serviceState.calculateCalls.push({
      input,
      actor,
    });

    return {
      id: "earning-1",
      monthKey: "2036-03",
      employeeId: "employee-1",
      classId: "class-1",
      status: "calculated",
      earnedAmountMinor: 30000,
      occurrences: [],
    };
  }),

  finalizeFixedClassEarning: vi.fn(async (input: unknown, actor: unknown) => {
    serviceState.finalizeCalls.push({
      input,
      actor,
    });

    return {
      id: "earning-1",
      status: "finalized",
      occurrences: [],
    };
  }),
}));

const dbState = vi.hoisted(() => ({
  rows: [
    {
      id: "earning-1",
      monthKey: "2036-03",
      employeeId: "employee-1",
      classId: "class-1",
      status: "calculated",
      currency: "EGP",
      earnedAmountMinor: 30000,
      blockReason: null,
      employee: {
        id: "employee-1",
        employeeCode: "EMP001",
        name: "Coach One",
      },
      class: {
        id: "class-1",
        name: "Fitness",
      },
      calculatedBy: null,
      finalizedBy: null,
      occurrences: [],
    },
  ],
}));

vi.mock("@/lib/db", () => ({
  db: {
    fixedClassEarning: {
      findMany: vi.fn(async () => dbState.rows),
    },
  },
}));

import { GET, POST } from "@/app/api/admin/fixed-class-earnings/route";

describe("Admin Fixed Class Earnings API", () => {
  beforeEach(() => {
    guardState.denied = null;
    guardState.lastPermission = null;

    serviceState.calculateCalls.length = 0;
    serviceState.finalizeCalls.length = 0;
  });

  it("GET requires fixed_class_earning_view", async () => {
    guardState.denied = Response.json({ error: "Forbidden" }, { status: 403 });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/fixed-class-earnings?month=2036-03",
      ) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("fixed_class_earning_view");
  });

  it("GET returns earnings with supported filters", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/fixed-class-earnings?month=2036-03&employeeId=employee-1&classId=class-1&status=calculated",
      ) as never,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.earnings).toHaveLength(1);

    expect(guardState.lastPermission).toBe("fixed_class_earning_view");
  });

  it("calculate requires fixed_class_earning_calculate", async () => {
    guardState.denied = Response.json({ error: "Forbidden" }, { status: 403 });

    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          monthKey: "2036-03",
          employeeId: "employee-1",
          classId: "class-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("fixed_class_earning_calculate");
  });

  it("calculate calls authoritative service", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          monthKey: "2036-03",
          employeeId: "employee-1",
          classId: "class-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    expect(serviceState.calculateCalls).toHaveLength(1);

    expect(serviceState.calculateCalls[0]).toMatchObject({
      input: {
        monthKey: "2036-03",
        employeeId: "employee-1",
        classId: "class-1",
      },
    });
  });

  it("finalize requires fixed_class_earning_finalize", async () => {
    guardState.denied = Response.json({ error: "Forbidden" }, { status: 403 });

    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "finalize",
          earningId: "earning-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("fixed_class_earning_finalize");
  });

  it("finalize calls authoritative service", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "finalize",
          earningId: "earning-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    expect(serviceState.finalizeCalls).toHaveLength(1);

    expect(serviceState.finalizeCalls[0]).toMatchObject({
      input: {
        earningId: "earning-1",
      },
    });
  });

  it("rejects invalid action", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "delete",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
  });

  it("rejects invalid calculate payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          monthKey: "",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(serviceState.calculateCalls).toHaveLength(0);
  });

  it("rejects invalid finalize payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/fixed-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "finalize",
          earningId: "",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    expect(serviceState.finalizeCalls).toHaveLength(0);
  });
});
