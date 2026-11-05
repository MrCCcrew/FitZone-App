import { beforeEach, describe, expect, it, vi } from "vitest";

const guardState = {
  denied: null as Response | null,
  lastPermission: "",
};

const serviceState = {
  calculateCalls: [] as unknown[],
  finalizeCalls: [] as unknown[],
};

const dbState = {
  findManyCalls: [] as unknown[],
};

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
        id: "admin-1",
        user: {
          id: "admin-1",
          name: "Payroll Admin",
          email: "payroll@example.test",
          role: "admin",
        },
        role: "admin",
        permissions: [],
      },
      role: "admin",
      permissions: [],
    };
  }),
}));

vi.mock("@/lib/employees/payroll-run-service", () => ({
  calculatePayrollRun: vi.fn(async (monthKey: string, actor: unknown) => {
    serviceState.calculateCalls.push({
      monthKey,
      actor,
    });

    return {
      id: "run-1",
      monthKey,
      status: "calculated",
    };
  }),

  finalizePayrollRun: vi.fn(async (monthKey: string, actor: unknown) => {
    serviceState.finalizeCalls.push({
      monthKey,
      actor,
    });

    return {
      id: "run-1",
      monthKey,
      status: "finalized",
    };
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    payrollRun: {
      findMany: vi.fn(async (args: unknown) => {
        dbState.findManyCalls.push(args);

        return [
          {
            id: "run-1",
            monthKey: "2052-01",
            status: "calculated",
            employees: [],
          },
        ];
      }),
    },
  },
}));

import { GET, POST } from "@/app/api/admin/payroll-runs/route";

function request(url: string, init?: RequestInit) {
  return new Request(url, init) as never;
}

describe("admin payroll-runs API", () => {
  beforeEach(() => {
    guardState.denied = null;

    guardState.lastPermission = "";

    serviceState.calculateCalls.length = 0;

    serviceState.finalizeCalls.length = 0;

    dbState.findManyCalls.length = 0;
  });

  it("GET requires payroll_run_view", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await GET(
      request("http://localhost/api/admin/payroll-runs?month=2052-01"),
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("payroll_run_view");

    expect(dbState.findManyCalls).toHaveLength(0);
  });

  it("GET returns payroll runs with filters", async () => {
    const response = await GET(
      request(
        "http://localhost/api/admin/payroll-runs?month=2052-01&status=calculated&employeeId=employee-1",
      ),
    );

    expect(response.status).toBe(200);

    const body = await response.json();

    expect(body.runs).toHaveLength(1);

    expect(guardState.lastPermission).toBe("payroll_run_view");

    expect(dbState.findManyCalls).toHaveLength(1);

    expect(dbState.findManyCalls[0]).toMatchObject({
      where: {
        monthKey: "2052-01",
        status: "calculated",
        employees: {
          some: {
            employeeId: "employee-1",
          },
        },
      },
    });
  });

  it("GET rejects invalid month", async () => {
    const response = await GET(
      request("http://localhost/api/admin/payroll-runs?month=bad"),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("PAYROLL_INVALID_MONTH");
  });

  it("GET rejects invalid status", async () => {
    const response = await GET(
      request("http://localhost/api/admin/payroll-runs?status=paid"),
    );

    expect(response.status).toBe(400);

    const body = await response.json();

    expect(body.error).toBe("PAYROLL_INVALID_STATUS");
  });

  it("calculate requires payroll_run_calculate", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "calculate",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("payroll_run_calculate");

    expect(serviceState.calculateCalls).toHaveLength(0);
  });

  it("calculate calls authoritative payroll service", async () => {
    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "calculate",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(serviceState.calculateCalls).toHaveLength(1);

    expect(serviceState.calculateCalls[0]).toMatchObject({
      monthKey: "2052-01",
      actor: {
        userId: "admin-1",
        role: "admin",
      },
    });
  });

  it("finalize requires payroll_run_finalize", async () => {
    guardState.denied = Response.json(
      {
        error: "Forbidden",
      },
      {
        status: 403,
      },
    );

    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "finalize",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(403);

    expect(guardState.lastPermission).toBe("payroll_run_finalize");

    expect(serviceState.finalizeCalls).toHaveLength(0);
  });

  it("finalize calls authoritative payroll service", async () => {
    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "finalize",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(200);

    expect(serviceState.finalizeCalls).toHaveLength(1);

    expect(serviceState.finalizeCalls[0]).toMatchObject({
      monthKey: "2052-01",
      actor: {
        userId: "admin-1",
        role: "admin",
      },
    });
  });

  it("maps stale source snapshot to conflict", async () => {
    const mod = await import("@/lib/employees/payroll-run-service");

    vi.mocked(mod.finalizePayrollRun).mockRejectedValueOnce(
      new Error("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE"),
    );

    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "finalize",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(409);

    const body = await response.json();

    expect(body.error).toBe("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");
  });

  it("rejects invalid action", async () => {
    const response = await POST(
      request("http://localhost/api/admin/payroll-runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          monthKey: "2052-01",
        }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
