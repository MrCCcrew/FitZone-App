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

vi.mock("@/lib/employees/trainee-class-earning-service", () => ({
  calculateTraineeClassEarning: vi.fn(
    async (input: unknown, actor: unknown) => {
      serviceState.calculateCalls.push({
        input,
        actor,
      });

      return {
        id: "earning-1",
        attendanceCheckInId: "checkin-1",
        monthKey: "2037-05",
        status: "calculated",
        commissionAmountMinor: 2000,
      };
    },
  ),

  finalizeTraineeClassEarning: vi.fn(async (input: unknown, actor: unknown) => {
    serviceState.finalizeCalls.push({
      input,
      actor,
    });

    return {
      id: "earning-1",
      status: "finalized",
    };
  }),
}));

const dbState = vi.hoisted(() => ({
  rows: [
    {
      id: "earning-1",
      attendanceCheckInId: "checkin-1",
      monthKey: "2037-05",
      userMembershipId: "membership-user-1",
      bookingId: "booking-1",
      scheduleId: "schedule-1",
      actualEmployeeId: "employee-1",
      status: "calculated",
      commissionAmountMinor: 2000,
      blockReason: null,
    },
  ],
}));

const findMany = vi.hoisted(() =>
  vi.fn(
    async (_args?: { where?: Record<string, unknown>; orderBy?: unknown }) =>
      dbState.rows,
  ),
);

vi.mock("@/lib/db", () => ({
  db: {
    traineeClassEarning: {
      findMany,
    },
  },
}));

import { GET, POST } from "@/app/api/admin/trainee-class-earnings/route";

describe("Admin Trainee Class Earnings API", () => {
  beforeEach(() => {
    guardState.denied = null;
    guardState.lastPermission = null;

    serviceState.calculateCalls.length = 0;
    serviceState.finalizeCalls.length = 0;

    findMany.mockClear();
  });

  it("GET requires trainee_class_earning_view", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await GET(
      new Request(
        "http://localhost/api/admin/trainee-class-earnings?month=2037-05",
      ) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("trainee_class_earning_view");
  });

  it("GET returns earnings with supported filters", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/trainee-class-earnings?month=2037-05&employeeId=employee-1&status=calculated&membershipId=membership-user-1&bookingId=booking-1&scheduleId=schedule-1",
      ) as never,
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.earnings).toHaveLength(1);

    expect(guardState.lastPermission).toBe("trainee_class_earning_view");

    expect(findMany).toHaveBeenCalledTimes(1);

    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        monthKey: "2037-05",
        actualEmployeeId: "employee-1",
        status: "calculated",
        userMembershipId: "membership-user-1",
        bookingId: "booking-1",
        scheduleId: "schedule-1",
      },
    });
  });

  it("calculate requires trainee_class_earning_calculate", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await POST(
      new Request("http://localhost/api/admin/trainee-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          attendanceCheckInId: "checkin-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("trainee_class_earning_calculate");
  });

  it("calculate calls authoritative service", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/trainee-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          attendanceCheckInId: "checkin-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(200);

    expect(serviceState.calculateCalls).toHaveLength(1);

    expect(serviceState.calculateCalls[0]).toMatchObject({
      input: {
        attendanceCheckInId: "checkin-1",
      },
      actor: {
        userId: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        role: "staff",
      },
    });
  });

  it("finalize requires trainee_class_earning_finalize", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await POST(
      new Request("http://localhost/api/admin/trainee-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "finalize",
          earningId: "earning-1",
        }),
      }) as never,
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("trainee_class_earning_finalize");
  });

  it("finalize calls authoritative service", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/trainee-class-earnings", {
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
      new Request("http://localhost/api/admin/trainee-class-earnings", {
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
      new Request("http://localhost/api/admin/trainee-class-earnings", {
        method: "POST",
        body: JSON.stringify({
          action: "calculate",
          attendanceCheckInId: "",
        }),
      }) as never,
    );

    expect(response.status).toBe(400);

    expect(serviceState.calculateCalls).toHaveLength(0);
  });

  it("rejects invalid finalize payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/trainee-class-earnings", {
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

  it("rejects invalid month filter", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/trainee-class-earnings?month=2037-13",
      ) as never,
    );

    expect(response.status).toBe(400);

    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects invalid status filter", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/trainee-class-earnings?status=deleted",
      ) as never,
    );

    expect(response.status).toBe(400);

    expect(findMany).not.toHaveBeenCalled();
  });
});
