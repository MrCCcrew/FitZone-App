import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient, User } from "@prisma/client";

let db: PrismaClient;
let actor: User;

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const employeeIds: string[] = [];

beforeAll(async () => {
  const mod = await import("@/lib/db");

  db = mod.db as PrismaClient;

  const current = await db.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  if (current[0]?.db !== "fitzone_test") {
    throw new Error("REFUSING_NON_TEST_DB");
  }

  actor = await db.user.create({
    data: {
      email: `payroll-${stamp}@example.test`,
      name: "Payroll Test Actor",
      role: "super_admin",
    },
  });
});

afterAll(async () => {
  if (!db) return;

  const runs = await db.payrollRun.findMany({
    where: {
      monthKey: {
        startsWith: "205",
      },
    },
    select: {
      id: true,
    },
  });

  const runIds = runs.map((r) => r.id);

  const runEmployees = await db.payrollRunEmployee.findMany({
    where: {
      payrollRunId: {
        in: runIds,
      },
    },
    select: {
      id: true,
    },
  });

  await db.payrollRunItem.deleteMany({
    where: {
      payrollRunEmployeeId: {
        in: runEmployees.map((r) => r.id),
      },
    },
  });

  await db.payrollRunEmployee.deleteMany({
    where: {
      payrollRunId: {
        in: runIds,
      },
    },
  });

  await db.payrollRun.deleteMany({
    where: {
      id: {
        in: runIds,
      },
    },
  });

  await db.payrollAdjustment.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.employeeLoanInstallment.deleteMany({
    where: {
      loan: {
        employeeId: {
          in: employeeIds,
        },
      },
    },
  });

  await db.employeeLoan.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.attendanceDeductionOccurrence.deleteMany({
    where: {
      deduction: {
        employeeId: {
          in: employeeIds,
        },
      },
    },
  });

  await db.attendanceDeduction.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.privateSessionEarning.deleteMany({
    where: {
      employeeIdSnapshot: {
        in: employeeIds,
      },
    },
  });

  await db.coachMembershipEarning.deleteMany({
    where: {
      employeeIdSnapshot: {
        in: employeeIds,
      },
    },
  });

  await db.traineeClassEarning.deleteMany({
    where: {
      actualEmployeeId: {
        in: employeeIds,
      },
    },
  });

  await db.fixedClassEarningOccurrence.deleteMany({
    where: {
      earning: {
        employeeId: {
          in: employeeIds,
        },
      },
    },
  });

  await db.fixedClassEarning.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.employeeCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.employeePayrollEligibilityTerm.deleteMany({
    where: {
      employeeId: {
        in: employeeIds,
      },
    },
  });

  await db.auditLog.deleteMany({
    where: {
      actorUserId: actor?.id,
    },
  });

  await db.employeeProfile.deleteMany({
    where: {
      id: {
        in: employeeIds,
      },
    },
  });

  if (actor?.id) {
    await db.user.delete({
      where: {
        id: actor.id,
      },
    });
  }
});

describe("PayrollRunService — real fitzone_test", () => {
  const service = () => import("@/lib/employees/payroll-run-service");

  const actorInput = () => ({
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  });

  async function createEmployee(code: string, monthKey: string) {
    const employee = await db.employeeProfile.create({
      data: {
        employeeCode: `${code}-${stamp}`.slice(0, 45),
        name: `Payroll ${code}`,
        employmentStatus: "active",
        payrollEnabled: true,

        // Test isolation: employee covers the full owned month only.
        // Using the real calendar month-end keeps the new partial-month
        // payroll guard valid without leaking employees into later tests.
        hireDate: new Date(`${monthKey}-01T00:00:00.000Z`),
        employmentEndDate: (() => {
          const [year, month] = monthKey.split("-").map(Number);

          return new Date(Date.UTC(year, month, 0));
        })(),
      },
    });

    employeeIds.push(employee.id);

    await db.employeePayrollEligibilityTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date(`${monthKey}-01T00:00:00.000Z`),
        effectiveTo: (() => {
          const [year, month] = monthKey.split("-").map(Number);

          return new Date(Date.UTC(year, month, 0));
        })(),
        enabled: true,
        createdById: actor.id,
      },
    });

    return employee;
  }

  async function createCompensation(
    employeeId: string,
    monthKey: string,
    fixedSalaryMinor: number,
  ) {
    return db.employeeCompensationTerm.create({
      data: {
        employeeId,
        effectiveFrom: new Date(`${monthKey}-01T00:00:00.000Z`),
        fixedSalaryMinor,
        currency: "EGP",
        createdById: actor.id,
      },
    });
  }

  it("blocks employee when historical payroll eligibility is missing", async () => {
    const monthKey = "2058-04";

    const employee = await createEmployee("ELIG-MISSING", monthKey);

    await db.employeePayrollEligibilityTerm.deleteMany({
      where: {
        employeeId: employee.id,
      },
    });

    await createCompensation(employee.id, monthKey, 450000);

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun(monthKey, actorInput());

    const row = run.employees.find((item) => item.employeeId === employee.id);

    expect(run.status).toBe("blocked");

    expect(run.blockedEmployeeCount).toBe(1);

    expect(row?.status).toBe("blocked");

    expect(row?.blockReason).toBe("MISSING_PAYROLL_ELIGIBILITY_TERM");

    expect(row?.fixedSalaryMinor).toBe(0);
  });

  it("excludes employee with full-month disabled eligibility", async () => {
    const monthKey = "2058-05";

    const employee = await createEmployee("ELIG-DISABLED", monthKey);

    await db.employeePayrollEligibilityTerm.updateMany({
      where: {
        employeeId: employee.id,
      },
      data: {
        enabled: false,
      },
    });

    await createCompensation(employee.id, monthKey, 450000);

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun(monthKey, actorInput());

    expect(run.employees.some((item) => item.employeeId === employee.id)).toBe(
      false,
    );

    expect(run.employeeCount).toBe(0);

    expect(run.blockedEmployeeCount).toBe(0);

    expect(run.totalGrossEarningsMinor).toBe(0);

    expect(run.totalNetPayMinor).toBe(0);

    expect(run.status).toBe("calculated");
  });

  it("keeps January payroll unchanged after later disable and current switch change", async () => {
    const january = "2058-01";

    const employee = await db.employeeProfile.create({
      data: {
        employeeCode: `HIST-ELIG-${stamp}`.slice(0, 45),
        name: "Historical Eligibility Employee",
        employmentStatus: "active",

        // Current operational value is not
        // historical payroll evidence.
        payrollEnabled: true,

        hireDate: new Date("2058-01-01T00:00:00.000Z"),

        employmentEndDate: new Date("2058-03-31T00:00:00.000Z"),
      },
    });

    employeeIds.push(employee.id);

    await db.employeePayrollEligibilityTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2058-01-01T00:00:00.000Z"),
        effectiveTo: new Date("2058-02-28T00:00:00.000Z"),
        enabled: true,
        createdById: actor.id,
      },
    });

    await createCompensation(employee.id, january, 600000);

    const { calculatePayrollRun } = await service();

    const first = await calculatePayrollRun(january, actorInput());

    const firstRow = first.employees.find(
      (item) => item.employeeId === employee.id,
    );

    expect(firstRow?.status).toBe("calculated");

    expect(firstRow?.fixedSalaryMinor).toBe(600000);

    expect(firstRow?.netPayMinor).toBe(600000);

    /*
     * Later business decision:
     * employee is no longer payroll-eligible
     * starting in March.
     */
    await db.employeePayrollEligibilityTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2058-03-01T00:00:00.000Z"),
        effectiveTo: new Date("2058-03-31T00:00:00.000Z"),
        enabled: false,
        createdById: actor.id,
      },
    });

    /*
     * Also flip the CURRENT operational switch.
     * Historical January payroll must not change.
     */
    await db.employeeProfile.update({
      where: {
        id: employee.id,
      },
      data: {
        payrollEnabled: false,
      },
    });

    const recalculated = await calculatePayrollRun(january, actorInput());

    const recalculatedRow = recalculated.employees.find(
      (item) => item.employeeId === employee.id,
    );

    expect(recalculatedRow?.status).toBe("calculated");

    expect(recalculatedRow?.fixedSalaryMinor).toBe(600000);

    expect(recalculatedRow?.netPayMinor).toBe(600000);

    expect(recalculated.employeeCount).toBe(1);

    /*
     * March itself is explicitly disabled
     * and therefore excluded, not blocked.
     */
    const march = await calculatePayrollRun("2058-03", actorInput());

    expect(
      march.employees.some((item) => item.employeeId === employee.id),
    ).toBe(false);
  });

  it("blocks mid-month hire pending proration policy", async () => {
    const monthKey = "2057-01";
    const employee = await createEmployee("PARTIAL-HIRE", monthKey);

    await db.employeeProfile.update({
      where: {
        id: employee.id,
      },
      data: {
        hireDate: new Date("2057-01-15T00:00:00.000Z"),
        employmentEndDate: new Date("2057-01-31T00:00:00.000Z"),
      },
    });

    await createCompensation(employee.id, monthKey, 500000);

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun(monthKey, actorInput());

    expect(run.status).toBe("blocked");
    expect(run.blockedEmployeeCount).toBe(1);

    const row = run.employees.find((item) => item.employeeId === employee.id);

    expect(row?.status).toBe("blocked");
    expect(row?.blockReason).toBe(
      "PARTIAL_EMPLOYMENT_MONTH_REQUIRES_PRORATION_POLICY",
    );

    expect(row?.fixedSalaryMinor).toBe(0);
    expect(row?.netPayMinor).toBe(0);
  });

  it("blocks mid-month employment end pending proration policy", async () => {
    const monthKey = "2057-02";
    const employee = await createEmployee("PARTIAL-END", monthKey);

    await db.employeeProfile.update({
      where: {
        id: employee.id,
      },
      data: {
        hireDate: new Date("2057-02-01T00:00:00.000Z"),
        employmentEndDate: new Date("2057-02-14T00:00:00.000Z"),
      },
    });

    await createCompensation(employee.id, monthKey, 500000);

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun(monthKey, actorInput());

    expect(run.status).toBe("blocked");

    const row = run.employees.find((item) => item.employeeId === employee.id);

    expect(row?.status).toBe("blocked");
    expect(row?.blockReason).toBe(
      "PARTIAL_EMPLOYMENT_MONTH_REQUIRES_PRORATION_POLICY",
    );
  });

  it("blocks negative net pay pending explicit policy", async () => {
    const monthKey = "2057-03";
    const employee = await createEmployee("NEG-NET", monthKey);

    await createCompensation(employee.id, monthKey, 100000);

    await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey,
        direction: "deduction",
        sourceType: "manual",
        amountMinor: 150000,
        currency: "EGP",
        reason: "Negative net policy test",
        status: "approved",
        createdById: actorInput().userId,
        approvedAt: new Date(),
        approvedById: actorInput().userId,
      },
    });

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun(monthKey, actorInput());

    expect(run.status).toBe("blocked");
    expect(run.blockedEmployeeCount).toBe(1);

    const row = run.employees.find((item) => item.employeeId === employee.id);

    expect(row?.status).toBe("blocked");
    expect(row?.blockReason).toBe("NEGATIVE_NET_PAY_REQUIRES_POLICY");

    expect(row?.grossEarningsMinor).toBe(100000);
    expect(row?.totalDeductionsMinor).toBe(150000);
    expect(row?.netPayMinor).toBe(-50000);
  });

  it("blocks employee with no full-month compensation term", async () => {
    const employee = await createEmployee("BLOCK", "2050-01");

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun("2050-01", actorInput());

    const row = run.employees.find((x) => x.employeeId === employee.id);

    expect(row?.status).toBe("blocked");

    expect(row?.blockReason).toBe("MISSING_COMPENSATION_TERM");

    expect(run.status).toBe("blocked");
  });

  it("blocks ambiguous mid-month salary change", async () => {
    const employee = await createEmployee("MID", "2050-02");

    await db.employeeCompensationTerm.createMany({
      data: [
        {
          employeeId: employee.id,
          effectiveFrom: new Date("2050-02-01T00:00:00.000Z"),
          effectiveTo: new Date("2050-02-14T00:00:00.000Z"),
          fixedSalaryMinor: 300000,
          currency: "EGP",
          createdById: actor.id,
        },
        {
          employeeId: employee.id,
          effectiveFrom: new Date("2050-02-15T00:00:00.000Z"),
          fixedSalaryMinor: 400000,
          currency: "EGP",
          createdById: actor.id,
        },
      ],
    });

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun("2050-02", actorInput());

    const row = run.employees.find((x) => x.employeeId === employee.id);

    expect(row?.status).toBe("blocked");

    expect(row?.blockReason).toBe("MULTIPLE_COMPENSATION_TERMS_IN_MONTH");
  });

  it("aggregates fixed salary and approved adjustment", async () => {
    const employee = await createEmployee("BASE", "2051-01");

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2051-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 500000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    const adjustment = await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey: "2051-01",
        direction: "earning",
        sourceType: "manual",
        amountMinor: 25000,
        currency: "EGP",
        reason: "Performance bonus",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun("2051-01", actorInput());

    const row = run.employees.find((x) => x.employeeId === employee.id);

    expect(row?.status).toBe("calculated");

    expect(row?.fixedSalaryMinor).toBe(500000);

    expect(row?.adjustmentEarningMinor).toBe(25000);

    expect(row?.grossEarningsMinor).toBe(525000);

    expect(row?.netPayMinor).toBe(525000);

    expect(row?.items.some((item) => item.sourceId === adjustment.id)).toBe(
      true,
    );
  });

  it("aggregates approved loan and deduction adjustment", async () => {
    const employee = await createEmployee("DED", "2052-01");

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2052-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 400000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    const loan = await db.employeeLoan.create({
      data: {
        employeeId: employee.id,
        principalMinor: 100000,
        currency: "EGP",
        startMonthKey: "2052-01",
        status: "active",
        reason: "Employee loan",
        createdById: actor.id,
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });

    await db.employeeLoanInstallment.create({
      data: {
        loanId: loan.id,
        monthKey: "2052-01",
        amountMinor: 30000,
        currency: "EGP",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });

    await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey: "2052-01",
        direction: "deduction",
        sourceType: "manual",
        amountMinor: 10000,
        currency: "EGP",
        reason: "Manual deduction",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    const { calculatePayrollRun } = await service();

    const run = await calculatePayrollRun("2052-01", actorInput());

    const row = run.employees.find((x) => x.employeeId === employee.id);

    expect(row?.loanDeductionMinor).toBe(30000);

    expect(row?.adjustmentDeductionMinor).toBe(10000);

    expect(row?.totalDeductionsMinor).toBe(40000);

    expect(row?.netPayMinor).toBe(360000);
  });

  it("recalculation replaces payroll items without duplication", async () => {
    const { calculatePayrollRun } = await service();

    const first = await calculatePayrollRun("2052-01", actorInput());

    const second = await calculatePayrollRun("2052-01", actorInput());

    expect(second.id).toBe(first.id);

    const duplicateGroups = await db.$queryRawUnsafe<
      Array<{
        c: bigint;
      }>
    >(`
            SELECT COUNT(*) AS c
            FROM (
              SELECT
                payrollRunEmployeeId,
                sourceType,
                sourceId,
                COUNT(*) AS n
              FROM PayrollRunItem
              WHERE payrollRunEmployeeId IN (
                SELECT id
                FROM PayrollRunEmployee
                WHERE payrollRunId='${second.id}'
              )
              GROUP BY
                payrollRunEmployeeId,
                sourceType,
                sourceId
              HAVING COUNT(*) > 1
            ) x
          `);

    expect(Number(duplicateGroups[0]?.c ?? 0)).toBe(0);
  });

  it("rejects finalization when a new approved source appears after calculate", async () => {
    const employee = await createEmployee("LATE", "2054-01");

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2054-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 400000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey: "2054-01",
        direction: "earning",
        sourceType: "manual",
        amountMinor: 10000,
        currency: "EGP",
        reason: "Included before calculate",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    const { calculatePayrollRun, finalizePayrollRun } = await service();

    const calculated = await calculatePayrollRun("2054-01", actorInput());

    expect(calculated.status).toBe("calculated");

    const lateAdjustment = await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey: "2054-01",
        direction: "earning",
        sourceType: "manual",
        amountMinor: 5000,
        currency: "EGP",
        reason: "Approved after calculate",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    await expect(finalizePayrollRun("2054-01", actorInput())).rejects.toThrow(
      "PAYROLL_RUN_SOURCE_SNAPSHOT_STALE",
    );

    const run = await db.payrollRun.findUniqueOrThrow({
      where: {
        monthKey: "2054-01",
      },
    });

    expect(run.status).toBe("calculated");

    expect(
      await db.payrollAdjustment.findUniqueOrThrow({
        where: {
          id: lateAdjustment.id,
        },
      }),
    ).toMatchObject({
      status: "approved",
      payrollRunId: null,
    });
  });

  it("rejects finalization when a snapshotted source changes after calculate", async () => {
    const employee = await createEmployee("STALE", "2055-01");

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2055-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 400000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    const adjustment = await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey: "2055-01",
        direction: "deduction",
        sourceType: "manual",
        amountMinor: 12000,
        currency: "EGP",
        reason: "Snapshot source",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    const { calculatePayrollRun, finalizePayrollRun } = await service();

    const calculated = await calculatePayrollRun("2055-01", actorInput());

    expect(calculated.status).toBe("calculated");

    await db.payrollAdjustment.update({
      where: {
        id: adjustment.id,
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledById: actor.id,
        cancellationReason: "Changed after payroll calculate",
      },
    });

    await expect(finalizePayrollRun("2055-01", actorInput())).rejects.toThrow(
      "PAYROLL_RUN_SOURCE_SNAPSHOT_STALE",
    );

    const run = await db.payrollRun.findUniqueOrThrow({
      where: {
        monthKey: "2055-01",
      },
    });

    expect(run.status).toBe("calculated");
  });

  it("finalization applies owned approved adjustment and loan sources", async () => {
    const { calculatePayrollRun, finalizePayrollRun } = await service();

    const run = await calculatePayrollRun("2052-01", actorInput());

    expect(run.status).toBe("calculated");

    const finalized = await finalizePayrollRun("2052-01", actorInput());

    expect(finalized.status).toBe("finalized");

    expect(
      await db.payrollAdjustment.count({
        where: {
          monthKey: "2052-01",
          status: "applied",
          payrollRunId: finalized.id,
        },
      }),
    ).toBe(1);

    expect(
      await db.employeeLoanInstallment.count({
        where: {
          monthKey: "2052-01",
          status: "applied",
          payrollRunId: finalized.id,
        },
      }),
    ).toBe(1);
  });

  it("finalization is idempotent", async () => {
    const { finalizePayrollRun } = await service();

    const a = await finalizePayrollRun("2052-01", actorInput());

    const b = await finalizePayrollRun("2052-01", actorInput());

    expect(b.id).toBe(a.id);

    expect(
      await db.auditLog.count({
        where: {
          targetId: a.id,
          action: "payroll_run_finalize",
        },
      }),
    ).toBe(1);
  });

  it("finalized run is immutable", async () => {
    const { calculatePayrollRun } = await service();

    await expect(calculatePayrollRun("2052-01", actorInput())).rejects.toThrow(
      "PAYROLL_RUN_FINALIZED_IMMUTABLE",
    );
  });

  it("mandatory audit failure rolls back finalization and owned source application", async () => {
    const monthKey = "2056-01";

    const employee = await createEmployee("FINAL-AUDIT", monthKey);

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2056-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 500000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    const adjustment = await db.payrollAdjustment.create({
      data: {
        employeeId: employee.id,
        monthKey,
        direction: "deduction",
        sourceType: "manual",
        amountMinor: 10000,
        currency: "EGP",
        reason: "Finalize audit rollback adjustment",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
        createdById: actor.id,
      },
    });

    const loan = await db.employeeLoan.create({
      data: {
        employeeId: employee.id,
        principalMinor: 30000,
        currency: "EGP",
        startMonthKey: monthKey,
        status: "active",
        reason: "Finalize audit rollback loan",
        createdById: actor.id,
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });

    const installment = await db.employeeLoanInstallment.create({
      data: {
        loanId: loan.id,
        monthKey,
        amountMinor: 30000,
        currency: "EGP",
        status: "approved",
        approvedAt: new Date(),
        approvedById: actor.id,
      },
    });

    const { calculatePayrollRun, finalizePayrollRun } = await service();

    const calculated = await calculatePayrollRun(monthKey, actorInput());

    expect(calculated.status).toBe("calculated");

    await expect(
      finalizePayrollRun(monthKey, {
        ...actorInput(),
        name: "X".repeat(1000),
      }),
    ).rejects.toThrow();

    const run = await db.payrollRun.findUniqueOrThrow({
      where: {
        monthKey,
      },
    });

    expect(run.status).toBe("calculated");
    expect(run.finalizedAt).toBeNull();
    expect(run.finalizedById).toBeNull();

    const adjustmentAfter = await db.payrollAdjustment.findUniqueOrThrow({
      where: {
        id: adjustment.id,
      },
    });

    expect(adjustmentAfter.status).toBe("approved");
    expect(adjustmentAfter.payrollRunId).toBeNull();
    expect(adjustmentAfter.appliedAt).toBeNull();

    const installmentAfter = await db.employeeLoanInstallment.findUniqueOrThrow(
      {
        where: {
          id: installment.id,
        },
      },
    );

    expect(installmentAfter.status).toBe("approved");
    expect(installmentAfter.payrollRunId).toBeNull();
    expect(installmentAfter.appliedAt).toBeNull();

    expect(
      await db.auditLog.count({
        where: {
          targetId: run.id,
          action: "payroll_run_finalize",
        },
      }),
    ).toBe(0);
  });

  it("mandatory audit failure rolls back calculation", async () => {
    const employee = await createEmployee("AUDIT", "2053-01");

    await db.employeeCompensationTerm.create({
      data: {
        employeeId: employee.id,
        effectiveFrom: new Date("2053-01-01T00:00:00.000Z"),
        fixedSalaryMinor: 300000,
        currency: "EGP",
        createdById: actor.id,
      },
    });

    const { calculatePayrollRun } = await service();

    await expect(
      calculatePayrollRun("2053-01", {
        ...actorInput(),
        name: "X".repeat(1000),
      }),
    ).rejects.toThrow();

    expect(
      await db.payrollRun.count({
        where: {
          monthKey: "2053-01",
        },
      }),
    ).toBe(0);
  });
});
