import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  linkTrainerToEmployee,
  unlinkTrainerFromEmployee,
} from "@/lib/employees/trainer-employee-link-service";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error("REFUSING: trainer employee link tests require fitzone_test");
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";
let trainer1Id = "";
let trainer2Id = "";
let employee1Id = "";
let employee2Id = "";

const actor = () => ({
  userId: actorId,
  name: "HR Link Test Admin",
  email: `hr-link-${stamp}@test.local`,
  role: "admin",
});

async function cleanup() {
  if (actorId) {
    await db.auditLog.deleteMany({
      where: {
        actorUserId: actorId,
        targetType: "Trainer",
      },
    });
  }

  if (trainer1Id || trainer2Id) {
    await db.trainer.deleteMany({
      where: {
        id: {
          in: [trainer1Id, trainer2Id].filter(Boolean),
        },
      },
    });
  }

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

  const actorUser = await db.user.create({
    data: {
      name: "HR Link Test Admin",
      email: `hr-link-${stamp}@test.local`,
      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = actorUser.id;

  const employee1 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-LINK-E1-${stamp}`,
      name: "Employee One",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee1Id = employee1.id;

  const employee2 = await db.employeeProfile.create({
    data: {
      employeeCode: `TEST-LINK-E2-${stamp}`,
      name: "Employee Two",
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employee2Id = employee2.id;

  const trainer1 = await db.trainer.create({
    data: {
      name: `TEST Trainer One ${stamp}`,
      specialty: "Test",
    },
  });

  trainer1Id = trainer1.id;

  const trainer2 = await db.trainer.create({
    data: {
      name: `TEST Trainer Two ${stamp}`,
      specialty: "Test",
    },
  });

  trainer2Id = trainer2.id;
});

afterAll(async () => {
  await cleanup();
});

describe("Trainer ↔ EmployeeProfile linking service", () => {
  it("links trainer to employee and writes audit", async () => {
    const result = await linkTrainerToEmployee(
      trainer1Id,
      employee1Id,
      actor(),
    );

    expect(result.employeeId).toBe(employee1Id);
    expect(result.idempotent).toBe(false);

    const trainer = await db.trainer.findUniqueOrThrow({
      where: {
        id: trainer1Id,
      },
    });

    expect(trainer.employeeId).toBe(employee1Id);

    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: actorId,
        targetType: "Trainer",
        targetId: trainer1Id,
        action: "trainer_employee_link",
      },
    });

    expect(audit).toBeTruthy();
  });

  it("same link retry is idempotent", async () => {
    const result = await linkTrainerToEmployee(
      trainer1Id,
      employee1Id,
      actor(),
    );

    expect(result.idempotent).toBe(true);
  });

  it("prevents same employee from linking to another trainer", async () => {
    await expect(
      linkTrainerToEmployee(trainer2Id, employee1Id, actor()),
    ).rejects.toThrow("TRAINER_EMPLOYEE_LINK_EMPLOYEE_ALREADY_LINKED");
  });

  it("allows explicit relink to different unclaimed employee", async () => {
    const result = await linkTrainerToEmployee(
      trainer1Id,
      employee2Id,
      actor(),
    );

    expect(result.idempotent).toBe(false);
    expect(result.employeeId).toBe(employee2Id);

    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: actorId,
        targetId: trainer1Id,
        action: "trainer_employee_relink",
      },
    });

    expect(audit).toBeTruthy();
  });

  it("requires reason for unlink", async () => {
    await expect(
      unlinkTrainerFromEmployee(trainer1Id, "", actor()),
    ).rejects.toThrow("TRAINER_EMPLOYEE_UNLINK_REASON_REQUIRED");
  });

  it("unlinks explicitly and audits it", async () => {
    const result = await unlinkTrainerFromEmployee(
      trainer1Id,
      "Wrong HR identity",
      actor(),
    );

    expect(result.employeeId).toBeNull();
    expect(result.idempotent).toBe(false);

    const trainer = await db.trainer.findUniqueOrThrow({
      where: {
        id: trainer1Id,
      },
    });

    expect(trainer.employeeId).toBeNull();

    const audit = await db.auditLog.findFirst({
      where: {
        actorUserId: actorId,
        targetId: trainer1Id,
        action: "trainer_employee_unlink",
      },
    });

    expect(audit).toBeTruthy();
  });

  it("unlink retry is idempotent", async () => {
    const result = await unlinkTrainerFromEmployee(
      trainer1Id,
      "Already unlinked",
      actor(),
    );

    expect(result.idempotent).toBe(true);
    expect(result.employeeId).toBeNull();
  });
});
