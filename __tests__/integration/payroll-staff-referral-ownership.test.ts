import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient, User } from "@prisma/client";

import { asDbTransactionClient } from "@/lib/db";
import { settleCommissionsTx } from "@/lib/commissions/commission-settlement-service";

let db: PrismaClient;
let actor: User;

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createdUserIds: string[] = [];
const createdEmployeeIds: string[] = [];
const createdPayoutIds: string[] = [];
const createdMonthKeys: string[] = [];

function actorInput() {
  return {
    userId: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
  };
}

function monthEnd(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0));
}

async function createPayrollEmployee(
  code: string,
  monthKey: string,
  fixedSalaryMinor = 100000,
) {
  const user = await db.user.create({
    data: {
      email: `c16-${code}-${stamp}@fitzone.test`,
      name: `C16 ${code}`,
      role: "staff",
    },
  });

  createdUserIds.push(user.id);

  const employee = await db.employeeProfile.create({
    data: {
      userId: user.id,
      employeeCode: `C16-${code}-${stamp}`.slice(0, 45),
      name: `C16 ${code}`,
      employmentStatus: "active",
      payrollEnabled: true,
      hireDate: new Date(`${monthKey}-01T00:00:00.000Z`),
      employmentEndDate: monthEnd(monthKey),
    },
  });

  createdEmployeeIds.push(employee.id);

  await db.employeePayrollEligibilityTerm.create({
    data: {
      employeeId: employee.id,
      effectiveFrom: new Date(`${monthKey}-01T00:00:00.000Z`),
      effectiveTo: monthEnd(monthKey),
      enabled: true,
      createdById: actor.id,
    },
  });

  await db.employeeCompensationTerm.create({
    data: {
      employeeId: employee.id,
      effectiveFrom: new Date(`${monthKey}-01T00:00:00.000Z`),
      effectiveTo: monthEnd(monthKey),
      fixedSalaryMinor,
      currency: "EGP",
      createdById: actor.id,
    },
  });

  return { user, employee };
}

async function createReferralCommission(
  staffUserId: string,
  earnedAt: Date,
  amount: number,
) {
  return db.staffCommission.create({
    data: {
      staffUserId,
      amount,
      status: "earned",
      earnedAt,
    },
  });
}

async function payoutStaffCommission(
  staffUserId: string,
  commissionId: string,
) {
  const result = await db.$transaction(async (tx) =>
    settleCommissionsTx(asDbTransactionClient(tx), {
      commissionType: "staff",
      beneficiaryId: staffUserId,
      commissionIds: [commissionId],
      actorUserId: actor.id,
      paymentMethod: "integration_test",
    }),
  );

  createdPayoutIds.push(result.payout.id);

  return result;
}

beforeAll(async () => {
  const mod = await import("@/lib/db");
  db = mod.db as PrismaClient;

  const current = await db.$queryRawUnsafe<Array<{ db: string }>>(
    "SELECT DATABASE() AS db",
  );

  if (
    process.env.APP_ENV !== "test" ||
    current[0]?.db !== "fitzone_test"
  ) {
    throw new Error("REFUSING_NON_TEST_DB");
  }

  actor = await db.user.create({
    data: {
      email: `c16-actor-${stamp}@fitzone.test`,
      name: "C16 Payroll Actor",
      role: "super_admin",
    },
  });

  createdUserIds.push(actor.id);
});

afterAll(async () => {
  if (!db) return;

  const runs = await db.payrollRun.findMany({
    where: {
      monthKey: {
        in: createdMonthKeys,
      },
    },
    select: {
      id: true,
    },
  });

  const runIds = runs.map((row) => row.id);

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
        in: runEmployees.map((row) => row.id),
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

  if (createdPayoutIds.length > 0) {
    await db.commissionPayout.deleteMany({
      where: {
        id: {
          in: createdPayoutIds,
        },
      },
    });
  }

  await db.staffCommission.deleteMany({
    where: {
      staffUserId: {
        in: createdUserIds,
      },
    },
  });

  await db.employeeCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: createdEmployeeIds,
      },
    },
  });

  await db.employeePayrollEligibilityTerm.deleteMany({
    where: {
      employeeId: {
        in: createdEmployeeIds,
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
        in: createdEmployeeIds,
      },
    },
  });

  await db.user.deleteMany({
    where: {
      id: {
        in: createdUserIds,
      },
    },
  });
});

describe(
  "C16 Staff Referral Commission -> Payroll ownership",
  { timeout: 90_000 },
  () => {
    it("includes referral commission in calculated payroll but does not settle it", async () => {
      const monthKey = "2054-01";
      createdMonthKeys.push(monthKey);

      const { user, employee } = await createPayrollEmployee(
        "CALCULATE",
        monthKey,
      );

      const commission = await createReferralCommission(
        user.id,
        new Date("2054-01-15T10:00:00.000Z"),
        25,
      );

      const { calculatePayrollRun } =
        await import("@/lib/employees/payroll-run-service");

      const run = await calculatePayrollRun(
        monthKey,
        actorInput(),
      );

      const row = run.employees.find(
        (item) => item.employeeId === employee.id,
      );

      expect(row?.referralCommissionEarningMinor).toBe(2500);
      expect(row?.grossEarningsMinor).toBe(102500);
      expect(row?.netPayMinor).toBe(102500);

      const item = row?.items.find(
        (source) =>
          source.sourceType === "staff_referral" &&
          source.sourceId === commission.id,
      );

      expect(item?.amountMinor).toBe(2500);

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("earned");
      expect(after.settlementOwnerType).toBeNull();
      expect(after.settlementOwnerId).toBeNull();
      expect(after.settledAt).toBeNull();
    });

    it("payroll finalize wins ownership and payout cannot settle same commission", async () => {
      const monthKey = "2054-02";
      createdMonthKeys.push(monthKey);

      const { user } = await createPayrollEmployee(
        "PAYROLL-WINS",
        monthKey,
      );

      const commission = await createReferralCommission(
        user.id,
        new Date("2054-02-10T10:00:00.000Z"),
        30,
      );

      const {
        calculatePayrollRun,
        finalizePayrollRun,
      } = await import("@/lib/employees/payroll-run-service");

      const calculated = await calculatePayrollRun(
        monthKey,
        actorInput(),
      );

      const finalized = await finalizePayrollRun(
        monthKey,
        actorInput(),
      );

      expect(finalized.status).toBe("finalized");

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settlementOwnerType).toBe("payroll");
      expect(after.settlementOwnerId).toBe(calculated.id);
      expect(after.settledAt).toBeTruthy();

      await expect(
        payoutStaffCommission(user.id, commission.id),
      ).rejects.toThrow("COMMISSION_SETTLEMENT_NOT_OPEN");

      expect(
        await db.commissionPayoutItem.count({
          where: {
            commissionType: "staff",
            commissionId: commission.id,
          },
        }),
      ).toBe(0);
    });

    it("payout wins before payroll finalize and payroll fails stale atomically", async () => {
      const monthKey = "2054-03";
      createdMonthKeys.push(monthKey);

      const { user } = await createPayrollEmployee(
        "PAYOUT-WINS",
        monthKey,
      );

      const commission = await createReferralCommission(
        user.id,
        new Date("2054-03-12T10:00:00.000Z"),
        35,
      );

      const {
        calculatePayrollRun,
        finalizePayrollRun,
      } = await import("@/lib/employees/payroll-run-service");

      await calculatePayrollRun(monthKey, actorInput());

      const payout = await payoutStaffCommission(
        user.id,
        commission.id,
      );

      await expect(
        finalizePayrollRun(monthKey, actorInput()),
      ).rejects.toThrow("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: commission.id },
      });

      expect(after.status).toBe("settled");
      expect(after.settlementOwnerType).toBe("payout");
      expect(after.settlementOwnerId).toBe(payout.payout.id);

      const run = await db.payrollRun.findUniqueOrThrow({
        where: { monthKey },
      });

      expect(run.status).toBe("calculated");
      expect(run.finalizedAt).toBeNull();
    });

    it("new referral commission after Calculate makes Finalize stale", async () => {
      const monthKey = "2054-04";
      createdMonthKeys.push(monthKey);

      const { user } = await createPayrollEmployee(
        "STALE-NEW",
        monthKey,
      );

      const first = await createReferralCommission(
        user.id,
        new Date("2054-04-05T10:00:00.000Z"),
        20,
      );

      const {
        calculatePayrollRun,
        finalizePayrollRun,
      } = await import("@/lib/employees/payroll-run-service");

      await calculatePayrollRun(monthKey, actorInput());

      const second = await createReferralCommission(
        user.id,
        new Date("2054-04-20T10:00:00.000Z"),
        15,
      );

      await expect(
        finalizePayrollRun(monthKey, actorInput()),
      ).rejects.toThrow("PAYROLL_RUN_SOURCE_SNAPSHOT_STALE");

      for (const id of [first.id, second.id]) {
        const after = await db.staffCommission.findUniqueOrThrow({
          where: { id },
        });

        expect(after.status).toBe("earned");
        expect(after.settlementOwnerType).toBeNull();
        expect(after.settlementOwnerId).toBeNull();
        expect(after.settledAt).toBeNull();
      }

      const run = await db.payrollRun.findUniqueOrThrow({
        where: { monthKey },
      });

      expect(run.status).toBe("calculated");
    });

    it("ignores historical referral rows without immutable earnedAt", async () => {
      const monthKey = "2054-05";
      createdMonthKeys.push(monthKey);

      const { user, employee } = await createPayrollEmployee(
        "LEGACY-NULL-DATE",
        monthKey,
      );

      const legacy = await db.staffCommission.create({
        data: {
          staffUserId: user.id,
          amount: 99,
          status: "earned",
          earnedAt: null,
        },
      });

      const { calculatePayrollRun } =
        await import("@/lib/employees/payroll-run-service");

      const run = await calculatePayrollRun(
        monthKey,
        actorInput(),
      );

      const row = run.employees.find(
        (item) => item.employeeId === employee.id,
      );

      expect(row?.referralCommissionEarningMinor).toBe(0);
      expect(row?.items.some(
        (item) =>
          item.sourceType === "staff_referral" &&
          item.sourceId === legacy.id,
      )).toBe(false);

      const after = await db.staffCommission.findUniqueOrThrow({
        where: { id: legacy.id },
      });

      expect(after.status).toBe("earned");
      expect(after.settlementOwnerType).toBeNull();
    });
  },
);
