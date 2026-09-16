import type { Prisma } from "@prisma/client";
import { db, asDbTransactionClient } from "@/lib/db";

type Tx = Prisma.TransactionClient;

type ActorSnapshot = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

async function writeMandatoryAudit(
  tx: Tx,
  actor: ActorSnapshot,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    details: Record<string, unknown>;
  },
) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorName: actor.name ?? null,
      actorEmail: actor.email ?? null,
      actorRole: actor.role ?? null,
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      details: JSON.stringify(input.details),
    },
  });
}

export async function linkTrainerToEmployee(
  trainerId: string,
  employeeId: string,
  actor: ActorSnapshot,
) {
  if (!trainerId?.trim()) {
    throw new Error("TRAINER_EMPLOYEE_LINK_TRAINER_REQUIRED");
  }

  if (!employeeId?.trim()) {
    throw new Error("TRAINER_EMPLOYEE_LINK_EMPLOYEE_REQUIRED");
  }

  if (!actor.userId?.trim()) {
    throw new Error("TRAINER_EMPLOYEE_LINK_ACTOR_REQUIRED");
  }

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const trainer = await tx.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        name: true,
        employeeId: true,
      },
    });

    if (!trainer) {
      throw new Error("TRAINER_EMPLOYEE_LINK_TRAINER_NOT_FOUND");
    }

    const employee = await tx.employeeProfile.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeCode: true,
        name: true,
        employmentStatus: true,
        payrollEnabled: true,
      },
    });

    if (!employee) {
      throw new Error("TRAINER_EMPLOYEE_LINK_EMPLOYEE_NOT_FOUND");
    }

    if (trainer.employeeId === employeeId) {
      return {
        trainerId: trainer.id,
        employeeId,
        idempotent: true,
      };
    }

    const existingTrainer = await tx.trainer.findUnique({
      where: {
        employeeId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (existingTrainer && existingTrainer.id !== trainer.id) {
      throw new Error("TRAINER_EMPLOYEE_LINK_EMPLOYEE_ALREADY_LINKED");
    }

    const previousEmployeeId = trainer.employeeId;

    const updated = await tx.trainer.update({
      where: { id: trainer.id },
      data: {
        employeeId,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
      },
    });

    await writeMandatoryAudit(tx, actor, {
      action: previousEmployeeId
        ? "trainer_employee_relink"
        : "trainer_employee_link",
      targetType: "Trainer",
      targetId: trainer.id,
      details: {
        trainerId: trainer.id,
        trainerName: trainer.name,
        previousEmployeeId,
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.name,
      },
    });

    return {
      trainerId: updated.id,
      employeeId: updated.employeeId,
      idempotent: false,
    };
  });
}

export async function unlinkTrainerFromEmployee(
  trainerId: string,
  reason: string,
  actor: ActorSnapshot,
) {
  if (!trainerId?.trim()) {
    throw new Error("TRAINER_EMPLOYEE_LINK_TRAINER_REQUIRED");
  }

  if (!actor.userId?.trim()) {
    throw new Error("TRAINER_EMPLOYEE_LINK_ACTOR_REQUIRED");
  }

  const cleanReason = reason?.trim();

  if (!cleanReason || cleanReason.length < 3) {
    throw new Error("TRAINER_EMPLOYEE_UNLINK_REASON_REQUIRED");
  }

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const trainer = await tx.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        name: true,
        employeeId: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            name: true,
          },
        },
      },
    });

    if (!trainer) {
      throw new Error("TRAINER_EMPLOYEE_LINK_TRAINER_NOT_FOUND");
    }

    if (!trainer.employeeId) {
      return {
        trainerId: trainer.id,
        employeeId: null,
        idempotent: true,
      };
    }

    const previousEmployee = trainer.employee;

    await tx.trainer.update({
      where: { id: trainer.id },
      data: {
        employeeId: null,
      },
    });

    await writeMandatoryAudit(tx, actor, {
      action: "trainer_employee_unlink",
      targetType: "Trainer",
      targetId: trainer.id,
      details: {
        trainerId: trainer.id,
        trainerName: trainer.name,
        previousEmployeeId: previousEmployee?.id ?? null,
        previousEmployeeCode: previousEmployee?.employeeCode ?? null,
        previousEmployeeName: previousEmployee?.name ?? null,
        reason: cleanReason,
      },
    });

    return {
      trainerId: trainer.id,
      employeeId: null,
      idempotent: false,
    };
  });
}
