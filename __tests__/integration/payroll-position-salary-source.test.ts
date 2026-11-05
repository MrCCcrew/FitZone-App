import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import type {
  PrismaClient,
  User,
} from "@prisma/client";

let db: PrismaClient;
let actor: User;

const stamp =
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const employeeIds: string[] = [];
const positionIds: string[] = [];

function actorInput() {
  return {
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  };
}

async function createEmployee(
  code: string,
  monthKey: string,
) {
  const [year, month] =
    monthKey.split("-").map(Number);

  const row =
    await db.employeeProfile.create({
      data: {
        employeeCode:
          `${code}-${stamp}`,
        name:
          `${code} ${stamp}`,

        hireDate:
          new Date(
            Date.UTC(year, month - 1, 1),
          ),

        employmentEndDate:
          new Date(
            Date.UTC(year, month, 0),
          ),

        employmentStatus: "active",
        payrollEnabled: true,
      },
    });

  employeeIds.push(row.id);

  await db.employeePayrollEligibilityTerm.create({
    data: {
      employeeId: row.id,

      effectiveFrom:
        new Date(
          Date.UTC(year, month - 1, 1),
        ),

      effectiveTo:
        new Date(
          Date.UTC(year, month, 0),
        ),

      enabled: true,
      createdById: actor.id,
    },
  });

  return row;
}

async function createPosition(
  code: string,
) {
  const row =
    await db.position.create({
      data: {
        code:
          `${code}-${stamp}`,
        name:
          `${code} ${stamp}`,
        isActive: true,
      },
    });

  positionIds.push(row.id);

  return row;
}

beforeAll(async () => {
  const mod =
    await import("@/lib/db");

  db = mod.db as PrismaClient;

  const current =
    await db.$queryRawUnsafe<
      Array<{ db: string }>
    >("SELECT DATABASE() AS db");

  if (
    current[0]?.db !== "fitzone_test"
  ) {
    throw new Error(
      "REFUSING_NON_TEST_DB",
    );
  }

  actor =
    await db.user.create({
      data: {
        email:
          `c10-source-${stamp}@example.test`,
        name:
          "C10 Source Test Actor",
        role:
          "super_admin",
      },
    });
});

afterAll(async () => {
  if (!db) return;

  const months = [
    "2091-01",
    "2091-02",
    "2091-03",
  ];

  const runs =
    await db.payrollRun.findMany({
      where: {
        monthKey: {
          in: months,
        },
      },
      select: {
        id: true,
      },
    });

  const runIds =
    runs.map((x) => x.id);

  const runEmployees =
    await db.payrollRunEmployee.findMany({
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
        in: runEmployees.map(
          (x) => x.id,
        ),
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

  await db.employeePositionTerm.deleteMany({
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

  await db.employeeProfile.deleteMany({
    where: {
      id: {
        in: employeeIds,
      },
    },
  });

  await db.positionPayrollPolicy.deleteMany({
    where: {
      positionId: {
        in: positionIds,
      },
    },
  });

  await db.position.deleteMany({
    where: {
      id: {
        in: positionIds,
      },
    },
  });

  await db.user.deleteMany({
    where: {
      id: actor.id,
    },
  });
});

describe(
  "C10 Job Title payroll salary authority",
  () => {
    it(
      "keeps legacy compensation before Position History begins",
      async () => {
        const employee =
          await createEmployee(
            "C10-LEGACY",
            "2091-01",
          );

        const compensation =
          await db.employeeCompensationTerm.create({
            data: {
              employeeId:
                employee.id,

              effectiveFrom:
                new Date(
                  "2091-01-01T00:00:00.000Z",
                ),

              effectiveTo:
                new Date(
                  "2091-01-31T00:00:00.000Z",
                ),

              fixedSalaryMinor:
                600000,

              currency:
                "EGP",

              createdById:
                actor.id,
            },
          });

        const {
          calculatePayrollRun,
        } =
          await import(
            "@/lib/employees/payroll-run-service"
          );

        const run =
          await calculatePayrollRun(
            "2091-01",
            actorInput(),
          );

        const row =
          run.employees.find(
            (x) =>
              x.employeeId ===
              employee.id,
          );

        expect(row?.status).toBe(
          "calculated",
        );

        expect(
          row?.salarySourceSnapshot,
        ).toBe(
          "legacy_compensation_term",
        );

        expect(
          row?.compensationTermIdSnapshot,
        ).toBe(
          compensation.id,
        );

        expect(
          row?.positionTermIdSnapshot,
        ).toBeNull();

        expect(
          row?.fixedSalaryMinor,
        ).toBe(600000);
      },
    );

    it(
      "uses PositionPayrollPolicy after Position History begins",
      async () => {
        const employee =
          await createEmployee(
            "C10-POSITION",
            "2091-02",
          );

        const position =
          await createPosition(
            "C10-ACCOUNTANT",
          );

        /*
         * Deliberately create conflicting legacy salary.
         * Policy must win.
         */
        await db.employeeCompensationTerm.create({
          data: {
            employeeId:
              employee.id,

            effectiveFrom:
              new Date(
                "2091-02-01T00:00:00.000Z",
              ),

            effectiveTo:
              new Date(
                "2091-02-28T00:00:00.000Z",
              ),

            fixedSalaryMinor:
              111111,

            currency:
              "EGP",

            createdById:
              actor.id,
          },
        });

        const positionTerm =
          await db.employeePositionTerm.create({
            data: {
              employeeId:
                employee.id,

              positionId:
                position.id,

              effectiveFrom:
                new Date(
                  "2091-02-01T00:00:00.000Z",
                ),

              effectiveTo:
                new Date(
                  "2091-02-28T00:00:00.000Z",
                ),

              createdById:
                actor.id,
            },
          });

        const policy =
          await db.positionPayrollPolicy.create({
            data: {
              positionId:
                position.id,

              effectiveFrom:
                new Date(
                  "2091-02-01T00:00:00.000Z",
                ),

              effectiveTo:
                new Date(
                  "2091-02-28T00:00:00.000Z",
                ),

              fixedSalaryMinor:
                725000,

              currency:
                "EGP",

              isActive:
                true,

              createdById:
                actor.id,
            },
          });

        const {
          calculatePayrollRun,
        } =
          await import(
            "@/lib/employees/payroll-run-service"
          );

        const run =
          await calculatePayrollRun(
            "2091-02",
            actorInput(),
          );

        const row =
          run.employees.find(
            (x) =>
              x.employeeId ===
              employee.id,
          );

        expect(row?.status).toBe(
          "calculated",
        );

        expect(
          row?.salarySourceSnapshot,
        ).toBe(
          "position_payroll_policy",
        );

        expect(
          row?.compensationTermIdSnapshot,
        ).toBeNull();

        expect(
          row?.positionTermIdSnapshot,
        ).toBe(
          positionTerm.id,
        );

        expect(
          row?.positionIdSnapshot,
        ).toBe(
          position.id,
        );

        expect(
          row?.positionPayrollPolicyIdSnapshot,
        ).toBe(
          policy.id,
        );

        expect(
          row?.fixedSalaryMinor,
        ).toBe(725000);

        expect(
          row?.netPayMinor,
        ).toBe(725000);
      },
    );

    it(
      "fails closed after Position History begins when policy is missing",
      async () => {
        const employee =
          await createEmployee(
            "C10-NO-POLICY",
            "2091-03",
          );

        const position =
          await createPosition(
            "C10-NO-POLICY",
          );

        await db.employeeCompensationTerm.create({
          data: {
            employeeId:
              employee.id,

            effectiveFrom:
              new Date(
                "2091-03-01T00:00:00.000Z",
              ),

            effectiveTo:
              new Date(
                "2091-03-31T00:00:00.000Z",
              ),

            fixedSalaryMinor:
              999999,

            currency:
              "EGP",

            createdById:
              actor.id,
          },
        });

        await db.employeePositionTerm.create({
          data: {
            employeeId:
              employee.id,

            positionId:
              position.id,

            effectiveFrom:
              new Date(
                "2091-03-01T00:00:00.000Z",
              ),

            effectiveTo:
              new Date(
                "2091-03-31T00:00:00.000Z",
              ),

            createdById:
              actor.id,
          },
        });

        const {
          calculatePayrollRun,
        } =
          await import(
            "@/lib/employees/payroll-run-service"
          );

        const run =
          await calculatePayrollRun(
            "2091-03",
            actorInput(),
          );

        const row =
          run.employees.find(
            (x) =>
              x.employeeId ===
              employee.id,
          );

        expect(row?.status).toBe(
          "blocked",
        );

        expect(
          row?.blockReason,
        ).toBe(
          "MISSING_POSITION_PAYROLL_POLICY",
        );

        expect(
          row?.salarySourceSnapshot,
        ).toBe(
          "position_payroll_policy",
        );

        expect(
          row?.compensationTermIdSnapshot,
        ).toBeNull();

        /*
         * Must not silently use 999999.
         */
        expect(
          row?.fixedSalaryMinor,
        ).toBe(0);
      },
    );
  },
);
