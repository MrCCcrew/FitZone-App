import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

import { savePayrollEligibilityTerm } from "@/lib/employees/payroll-eligibility-service";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.protocol !== "mysql:" ||
  url.hostname !== "127.0.0.1" ||
  url.port !== "3306" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: payroll eligibility integration requires fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";
let employee1Id = "";
let employee2Id = "";

const actor = () => ({
  userId: actorId,
  name: "Eligibility Test Admin",
  email: `eligibility-${stamp}@test.local`,
  role: "admin",
});

async function cleanupTerms() {
  await db.employeePayrollEligibilityTerm.deleteMany({
    where: {
      employeeId: {
        in: [employee1Id, employee2Id].filter(Boolean),
      },
    },
  });

  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
        targetType: "EmployeePayrollEligibilityTerm",
      },
    });
  }
}

async function cleanup() {
  await cleanupTerms();

  if (employee1Id || employee2Id) {
    await db.employeeProfile.deleteMany({
      where: {
        id: {
          in: [employee1Id, employee2Id].filter(Boolean),
        },
      },
    });
  }

  if (actorId) {
    await db.user.deleteMany({
      where: {
        id: actorId,
      },
    });
  }
}

beforeAll(async () => {
  await cleanup();

  const user = await db.user.create({
    data: {
      name: "Eligibility Test Admin",
      email: `eligibility-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = user.id;

  const e1 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-ELIG-1-${stamp}`,
      name: "Eligibility Employee 1",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee1Id = e1.id;

  const e2 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-ELIG-2-${stamp}`,
      name: "Eligibility Employee 2",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee2Id = e2.id;
});

beforeEach(async () => {
  await cleanupTerms();
});

afterAll(async () => {
  await cleanup();
});

describe("PayrollEligibilityService — real fitzone_test", () => {
  it("creates effective-dated eligibility with mandatory audit", async () => {
    const term = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-01-01",
        enabled: true,
      },
      actor(),
    );

    expect(term.enabled).toBe(true);

    const audit = await db.auditLog.findFirst({
      where: {
        targetType: "EmployeePayrollEligibilityTerm",
        targetId: term.id,
      },
    });

    expect(audit?.action).toBe("payroll_eligibility_term_create");
  });

  it("rejects invalid date range", async () => {
    await expect(
      savePayrollEligibilityTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2050-02-01",
          effectiveTo: "2050-01-31",
          enabled: true,
        },
        actor(),
      ),
    ).rejects.toThrow("PAYROLL_ELIGIBILITY_EFFECTIVE_TO_BEFORE_FROM");
  });

  it("rejects overlapping terms", async () => {
    await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-01-01",
        effectiveTo: "2050-01-31",
        enabled: true,
      },
      actor(),
    );

    await expect(
      savePayrollEligibilityTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2050-01-15",
          effectiveTo: "2050-02-15",
          enabled: false,
        },
        actor(),
      ),
    ).rejects.toThrow("PAYROLL_ELIGIBILITY_TERM_OVERLAP");
  });

  it("allows adjacent eligibility terms", async () => {
    await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-01-01",
        effectiveTo: "2050-01-31",
        enabled: true,
      },
      actor(),
    );

    const second = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-02-01",
        enabled: false,
      },
      actor(),
    );

    expect(second.enabled).toBe(false);
  });

  it("requires edit reason", async () => {
    const term = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-01-01",
        enabled: true,
      },
      actor(),
    );

    await expect(
      savePayrollEligibilityTerm(
        {
          termId: term.id,
          employeeId: employee1Id,
          effectiveFrom: "2050-01-01",
          enabled: false,
        },
        actor(),
      ),
    ).rejects.toThrow("PAYROLL_ELIGIBILITY_EDIT_REASON_REQUIRED");
  });

  it("keeps employee identity immutable", async () => {
    const term = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2050-01-01",
        enabled: true,
      },
      actor(),
    );

    await expect(
      savePayrollEligibilityTerm(
        {
          termId: term.id,
          employeeId: employee2Id,
          effectiveFrom: "2050-01-01",
          enabled: true,
          editReason: "Wrong employee",
        },
        actor(),
      ),
    ).rejects.toThrow("PAYROLL_ELIGIBILITY_TERM_EMPLOYEE_IMMUTABLE");
  });

  it("rolls back eligibility mutation when mandatory audit fails", async () => {
    await expect(
      savePayrollEligibilityTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2051-01-01",
          enabled: true,
        },
        {
          ...actor(),
          name: "X".repeat(1000),
        },
      ),
    ).rejects.toThrow();

    expect(
      await db.employeePayrollEligibilityTerm.count({
        where: {
          employeeId: employee1Id,
        },
      }),
    ).toBe(0);
  });

  it("preserves independent historical enabled and disabled periods", async () => {
    const january = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2052-01-01",
        effectiveTo: "2052-02-29",
        enabled: true,
      },
      actor(),
    );

    const march = await savePayrollEligibilityTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2052-03-01",
        enabled: false,
      },
      actor(),
    );

    expect(january.enabled).toBe(true);

    expect(march.enabled).toBe(false);

    const rows = await db.employeePayrollEligibilityTerm.findMany({
      where: {
        employeeId: employee1Id,
      },
      orderBy: {
        effectiveFrom: "asc",
      },
    });

    expect(rows.map((x) => x.enabled)).toEqual([true, false]);
  });
});
