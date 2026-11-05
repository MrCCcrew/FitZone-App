import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  saveCoachClassCompensationTerm,
  saveCoachCompensationTerm,
  saveEmployeeCompensationTerm,
} from "@/lib/employees/compensation-service";

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
  throw new Error("REFUSING: Compensation integration requires fitzone_test");
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";
let employee1Id = "";
let employee2Id = "";
let employee3Id = "";

let trainer1Id = "";
let trainer3Id = "";

let class1Id = "";
let class3Id = "";

const actor = () => ({
  userId: actorId,
  name: "Compensation Test Admin",
  email: `comp-${stamp}@test.local`,
  role: "admin",
});

async function deleteTermsAndAudits() {
  await db.coachClassCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: [employee1Id, employee2Id, employee3Id].filter(Boolean),
      },
    },
  });

  await db.coachCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: [employee1Id, employee2Id, employee3Id].filter(Boolean),
      },
    },
  });

  await db.employeeCompensationTerm.deleteMany({
    where: {
      employeeId: {
        in: [employee1Id, employee2Id, employee3Id].filter(Boolean),
      },
    },
  });

  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
        targetType: {
          in: [
            "EmployeeCompensationTerm",
            "CoachCompensationTerm",
            "CoachClassCompensationTerm",
          ],
        },
      },
    });
  }
}

async function cleanup() {
  await deleteTermsAndAudits();

  if (class1Id || class3Id) {
    await db.class.deleteMany({
      where: {
        id: {
          in: [class1Id, class3Id].filter(Boolean),
        },
      },
    });
  }

  if (trainer1Id || trainer3Id) {
    await db.trainer.deleteMany({
      where: {
        id: {
          in: [trainer1Id, trainer3Id].filter(Boolean),
        },
      },
    });
  }

  if (employee1Id || employee2Id || employee3Id) {
    await db.employeeProfile.deleteMany({
      where: {
        id: {
          in: [employee1Id, employee2Id, employee3Id].filter(Boolean),
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
      name: "Compensation Test Admin",
      email: `comp-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = user.id;

  const employee1 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-COMP-E1-${stamp}`,
      name: "Compensation Employee 1",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee1Id = employee1.id;

  const employee2 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-COMP-E2-${stamp}`,
      name: "Compensation Employee 2",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee2Id = employee2.id;

  const employee3 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-COMP-E3-${stamp}`,
      name: "Compensation Employee 3",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee3Id = employee3.id;

  const trainer1 = await db.trainer.create({
    data: {
      name: `TEST Comp Trainer 1 ${stamp}`,
      specialty: "fitness",
      employeeId: employee1Id,
    },
  });

  trainer1Id = trainer1.id;

  const trainer3 = await db.trainer.create({
    data: {
      name: `TEST Comp Trainer 3 ${stamp}`,
      specialty: "fitness",
      employeeId: employee3Id,
    },
  });

  trainer3Id = trainer3.id;

  const class1 = await db.class.create({
    data: {
      name: `TEST Comp Class 1 ${stamp}`,
      trainerId: trainer1Id,
      type: "fitness",
      duration: 60,
      intensity: "medium",
      maxSpots: 10,
    },
  });

  class1Id = class1.id;

  const class3 = await db.class.create({
    data: {
      name: `TEST Comp Class 3 ${stamp}`,
      trainerId: trainer3Id,
      type: "fitness",
      duration: 45,
      intensity: "medium",
      maxSpots: 10,
    },
  });

  class3Id = class3.id;
});

beforeEach(async () => {
  await deleteTermsAndAudits();
});

afterAll(async () => {
  await cleanup();
});

describe("CompensationService — real fitzone_test integration", () => {
  it("creates employee fixed salary term with mandatory audit", async () => {
    const term = await saveEmployeeCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        fixedSalaryMinor: 250000,
      },
      actor(),
    );

    expect(term.fixedSalaryMinor).toBe(250000);

    const audit = await db.auditLog.findFirst({
      where: {
        targetType: "EmployeeCompensationTerm",
        targetId: term.id,
      },
    });

    expect(audit).not.toBeNull();
    expect(audit?.action).toBe("employee_compensation_term_create");
  });

  it("rejects negative fixed salary", async () => {
    await expect(
      saveEmployeeCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-01-01",
          fixedSalaryMinor: -1,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_INVALID_FIXED_SALARY_MINOR");
  });

  it("rejects invalid effective date range", async () => {
    await expect(
      saveEmployeeCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-02-01",
          effectiveTo: "2035-01-31",
          fixedSalaryMinor: 100000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_EFFECTIVE_TO_BEFORE_FROM");
  });

  it("rejects overlapping employee terms", async () => {
    await saveEmployeeCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        effectiveTo: "2035-01-31",
        fixedSalaryMinor: 100000,
      },
      actor(),
    );

    await expect(
      saveEmployeeCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-01-15",
          effectiveTo: "2035-02-15",
          fixedSalaryMinor: 120000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_EMPLOYEE_TERM_OVERLAP");
  });

  it("allows adjacent employee terms", async () => {
    await saveEmployeeCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        effectiveTo: "2035-01-31",
        fixedSalaryMinor: 100000,
      },
      actor(),
    );

    const second = await saveEmployeeCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-02-01",
        fixedSalaryMinor: 120000,
      },
      actor(),
    );

    expect(second).toBeTruthy();
  });

  it("requires coach employee to be linked to Trainer", async () => {
    await expect(
      saveCoachCompensationTerm(
        {
          employeeId: employee2Id,
          effectiveFrom: "2035-01-01",
          coachLevel: "normal",
          defaultFixedClassMonthlyMinor: 25000,
          traineeClassCommissionBps: 2000,
          privateSessionCommissionBps: 4000,
          coachMembershipCommissionBps: 4000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_EMPLOYEE_NOT_LINKED_TO_TRAINER");
  });

  it("rejects coach percentage above 10000 bps", async () => {
    await expect(
      saveCoachCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-01-01",
          coachLevel: "normal",
          defaultFixedClassMonthlyMinor: 25000,
          traineeClassCommissionBps: 10001,
          privateSessionCommissionBps: 4000,
          coachMembershipCommissionBps: 4000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_INVALID_TRAINEE_CLASS_COMMISSION_BPS");
  });

  it("creates coach term and blocks overlap", async () => {
    await saveCoachCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        effectiveTo: "2035-06-30",
        coachLevel: "leader",
        defaultFixedClassMonthlyMinor: 30000,
        traineeClassCommissionBps: 2250,
        privateSessionCommissionBps: 5000,
        coachMembershipCommissionBps: 4000,
      },
      actor(),
    );

    await expect(
      saveCoachCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-06-01",
          coachLevel: "head_coach",
          defaultFixedClassMonthlyMinor: 35000,
          traineeClassCommissionBps: 2500,
          privateSessionCommissionBps: 6000,
          coachMembershipCommissionBps: 4000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_COACH_TERM_OVERLAP");
  });

  it("rejects class override when class belongs to another coach employee", async () => {
    await expect(
      saveCoachClassCompensationTerm(
        {
          employeeId: employee1Id,
          classId: class3Id,
          effectiveFrom: "2035-01-01",
          monthlyAmountMinor: 30000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_CLASS_EMPLOYEE_MISMATCH");
  });

  it("creates class-specific override with audit", async () => {
    const term = await saveCoachClassCompensationTerm(
      {
        employeeId: employee1Id,
        classId: class1Id,
        effectiveFrom: "2035-01-01",
        monthlyAmountMinor: 30000,
      },
      actor(),
    );

    expect(term.monthlyAmountMinor).toBe(30000);

    const audit = await db.auditLog.findFirst({
      where: {
        targetType: "CoachClassCompensationTerm",
        targetId: term.id,
      },
    });

    expect(audit).not.toBeNull();
  });

  it("requires edit reason when changing an existing term", async () => {
    const term = await saveEmployeeCompensationTerm(
      {
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        fixedSalaryMinor: 100000,
      },
      actor(),
    );

    await expect(
      saveEmployeeCompensationTerm(
        {
          termId: term.id,
          employeeId: employee1Id,
          effectiveFrom: "2035-01-01",
          fixedSalaryMinor: 110000,
        },
        actor(),
      ),
    ).rejects.toThrow("COMPENSATION_EDIT_REASON_REQUIRED");

    const updated = await saveEmployeeCompensationTerm(
      {
        termId: term.id,
        employeeId: employee1Id,
        effectiveFrom: "2035-01-01",
        fixedSalaryMinor: 110000,
        editReason: "Salary correction",
      },
      actor(),
    );

    expect(updated.fixedSalaryMinor).toBe(110000);
  });

  it("mandatory AuditLog failure rolls back term mutation", async () => {
    const before = await db.employeeCompensationTerm.count({
      where: {
        employeeId: employee1Id,
      },
    });

    await expect(
      saveEmployeeCompensationTerm(
        {
          employeeId: employee1Id,
          effectiveFrom: "2035-01-01",
          fixedSalaryMinor: 100000,
        },
        {
          ...actor(),
          name: "X".repeat(1000),
        },
      ),
    ).rejects.toThrow();

    const after = await db.employeeCompensationTerm.count({
      where: {
        employeeId: employee1Id,
      },
    });

    expect(after).toBe(before);
  });
});
