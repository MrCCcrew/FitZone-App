import type { Prisma } from "@prisma/client";
import { db, asDbTransactionClient } from "@/lib/db";
import {
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";

type Tx = Prisma.TransactionClient;

export const COACH_COMPENSATION_LEVELS = [
  "normal",
  "leader",
  "head_coach",
] as const;

export type CoachCompensationLevel = (typeof COACH_COMPENSATION_LEVELS)[number];

export type CompensationActorSnapshot = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type CommonTermInput = {
  effectiveFrom: string;
  effectiveTo?: string | null;
  currency?: string | null;
  notes?: string | null;
  editReason?: string | null;
};

export type SaveEmployeeCompensationTermInput = CommonTermInput & {
  termId?: string | null;
  employeeId: string;
  fixedSalaryMinor: number;
};

export type SaveCoachCompensationTermInput = CommonTermInput & {
  termId?: string | null;
  employeeId: string;
  coachLevel: CoachCompensationLevel;
  defaultFixedClassMonthlyMinor: number;
  traineeClassCommissionBps: number;
  privateSessionCommissionBps: number;
  coachMembershipCommissionBps: number;
};

export type SaveCoachClassCompensationTermInput = CommonTermInput & {
  termId?: string | null;
  employeeId: string;
  classId: string;
  monthlyAmountMinor: number;
};

function assertActor(actor: CompensationActorSnapshot) {
  if (!actor.userId?.trim()) {
    throw new Error("COMPENSATION_ACTOR_REQUIRED");
  }
}

function assertDateKey(value: string, field: string) {
  if (!value?.trim()) {
    throw new Error(`COMPENSATION_${field}_REQUIRED`);
  }

  const instant = cairoDateStartInstant(value);

  if (cairoCalendarDateKey(instant) !== value) {
    throw new Error(`COMPENSATION_INVALID_${field}`);
  }

  return instant;
}

function normalizeDateRange(
  effectiveFromRaw: string,
  effectiveToRaw?: string | null,
) {
  const effectiveFrom = assertDateKey(effectiveFromRaw, "EFFECTIVE_FROM");

  const effectiveTo =
    effectiveToRaw == null || effectiveToRaw.trim() === ""
      ? null
      : assertDateKey(effectiveToRaw, "EFFECTIVE_TO");

  if (effectiveTo && effectiveTo.getTime() < effectiveFrom.getTime()) {
    throw new Error("COMPENSATION_EFFECTIVE_TO_BEFORE_FROM");
  }

  return {
    effectiveFrom,
    effectiveTo,
  };
}

function normalizeNotes(value: string | null | undefined) {
  if (value == null) return null;
  return value.trim() || null;
}

function normalizeCurrency(value: string | null | undefined) {
  const currency = (value?.trim() || "EGP").toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("COMPENSATION_INVALID_CURRENCY");
  }

  return currency;
}

function assertMoneyMinor(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`COMPENSATION_INVALID_${field}`);
  }
}

function assertBps(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error(`COMPENSATION_INVALID_${field}`);
  }
}

function assertCoachLevel(
  value: string,
): asserts value is CoachCompensationLevel {
  if (!COACH_COMPENSATION_LEVELS.includes(value as CoachCompensationLevel)) {
    throw new Error("COMPENSATION_INVALID_COACH_LEVEL");
  }
}

function normalizeEditReason(
  existing: boolean,
  value: string | null | undefined,
) {
  const reason = value?.trim() || null;

  if (existing && (!reason || reason.length < 3)) {
    throw new Error("COMPENSATION_EDIT_REASON_REQUIRED");
  }

  return reason;
}

function dateKey(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function termSnapshot(row: Record<string, unknown>) {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    if (key === "createdAt" || key === "updatedAt") {
      continue;
    }

    if (
      value instanceof Date &&
      (key === "effectiveFrom" || key === "effectiveTo")
    ) {
      result[key] = dateKey(value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

async function writeMandatoryAudit(
  tx: Tx,
  actor: CompensationActorSnapshot,
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

async function assertEmployeeExists(tx: Tx, employeeId: string) {
  const employee = await tx.employeeProfile.findUnique({
    where: {
      id: employeeId,
    },
    select: {
      id: true,
      employeeCode: true,
      name: true,
      employmentStatus: true,
      payrollEnabled: true,
      trainerProfile: {
        select: {
          id: true,
          isActive: true,
        },
      },
    },
  });

  if (!employee) {
    throw new Error("COMPENSATION_EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

async function assertCoachEmployee(tx: Tx, employeeId: string) {
  const employee = await assertEmployeeExists(tx, employeeId);

  if (!employee.trainerProfile) {
    throw new Error("COMPENSATION_EMPLOYEE_NOT_LINKED_TO_TRAINER");
  }

  return employee;
}

function overlapDateWhere(effectiveFrom: Date, effectiveTo: Date | null) {
  return {
    ...(effectiveTo
      ? {
          effectiveFrom: {
            lte: effectiveTo,
          },
        }
      : {}),
    OR: [
      {
        effectiveTo: null,
      },
      {
        effectiveTo: {
          gte: effectiveFrom,
        },
      },
    ],
  };
}

export async function saveEmployeeCompensationTerm(
  input: SaveEmployeeCompensationTermInput,
  actor: CompensationActorSnapshot,
) {
  assertActor(actor);

  if (!input.employeeId?.trim()) {
    throw new Error("COMPENSATION_EMPLOYEE_REQUIRED");
  }

  assertMoneyMinor(input.fixedSalaryMinor, "FIXED_SALARY_MINOR");

  const { effectiveFrom, effectiveTo } = normalizeDateRange(
    input.effectiveFrom,
    input.effectiveTo,
  );

  const currency = normalizeCurrency(input.currency);

  const notes = normalizeNotes(input.notes);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const employee = await assertEmployeeExists(tx, input.employeeId);

    const existing = input.termId
      ? await tx.employeeCompensationTerm.findUnique({
          where: {
            id: input.termId,
          },
        })
      : null;

    if (input.termId && !existing) {
      throw new Error("COMPENSATION_TERM_NOT_FOUND");
    }

    if (existing && existing.employeeId !== input.employeeId) {
      throw new Error("COMPENSATION_TERM_EMPLOYEE_IMMUTABLE");
    }

    const editReason = normalizeEditReason(Boolean(existing), input.editReason);

    const overlap = await tx.employeeCompensationTerm.findFirst({
      where: {
        employeeId: input.employeeId,
        ...(existing
          ? {
              id: {
                not: existing.id,
              },
            }
          : {}),
        ...overlapDateWhere(effectiveFrom, effectiveTo),
      },
      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new Error("COMPENSATION_EMPLOYEE_TERM_OVERLAP");
    }

    const data = {
      effectiveFrom,
      effectiveTo,
      fixedSalaryMinor: input.fixedSalaryMinor,
      currency,
      notes,
      createdById: actor.userId,
    };

    const term = existing
      ? await tx.employeeCompensationTerm.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await tx.employeeCompensationTerm.create({
          data: {
            employeeId: input.employeeId,
            ...data,
          },
        });

    await writeMandatoryAudit(tx, actor, {
      action: existing
        ? "employee_compensation_term_update"
        : "employee_compensation_term_create",
      targetType: "EmployeeCompensationTerm",
      targetId: term.id,
      details: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        editReason,
        before: existing ? termSnapshot(existing) : null,
        after: termSnapshot(term),
      },
    });

    return term;
  });
}

export async function saveCoachCompensationTerm(
  input: SaveCoachCompensationTermInput,
  actor: CompensationActorSnapshot,
) {
  assertActor(actor);

  if (!input.employeeId?.trim()) {
    throw new Error("COMPENSATION_EMPLOYEE_REQUIRED");
  }

  assertCoachLevel(input.coachLevel);

  assertMoneyMinor(
    input.defaultFixedClassMonthlyMinor,
    "DEFAULT_FIXED_CLASS_MONTHLY_MINOR",
  );

  assertBps(input.traineeClassCommissionBps, "TRAINEE_CLASS_COMMISSION_BPS");

  assertBps(
    input.privateSessionCommissionBps,
    "PRIVATE_SESSION_COMMISSION_BPS",
  );

  assertBps(
    input.coachMembershipCommissionBps,
    "COACH_MEMBERSHIP_COMMISSION_BPS",
  );

  const { effectiveFrom, effectiveTo } = normalizeDateRange(
    input.effectiveFrom,
    input.effectiveTo,
  );

  const currency = normalizeCurrency(input.currency);

  const notes = normalizeNotes(input.notes);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const employee = await assertCoachEmployee(tx, input.employeeId);

    const existing = input.termId
      ? await tx.coachCompensationTerm.findUnique({
          where: {
            id: input.termId,
          },
        })
      : null;

    if (input.termId && !existing) {
      throw new Error("COMPENSATION_TERM_NOT_FOUND");
    }

    if (existing && existing.employeeId !== input.employeeId) {
      throw new Error("COMPENSATION_TERM_EMPLOYEE_IMMUTABLE");
    }

    const editReason = normalizeEditReason(Boolean(existing), input.editReason);

    const overlap = await tx.coachCompensationTerm.findFirst({
      where: {
        employeeId: input.employeeId,
        ...(existing
          ? {
              id: {
                not: existing.id,
              },
            }
          : {}),
        ...overlapDateWhere(effectiveFrom, effectiveTo),
      },
      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new Error("COMPENSATION_COACH_TERM_OVERLAP");
    }

    const data = {
      effectiveFrom,
      effectiveTo,
      coachLevel: input.coachLevel,
      defaultFixedClassMonthlyMinor: input.defaultFixedClassMonthlyMinor,
      traineeClassCommissionBps: input.traineeClassCommissionBps,
      privateSessionCommissionBps: input.privateSessionCommissionBps,
      coachMembershipCommissionBps: input.coachMembershipCommissionBps,
      currency,
      notes,
      createdById: actor.userId,
    };

    const term = existing
      ? await tx.coachCompensationTerm.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await tx.coachCompensationTerm.create({
          data: {
            employeeId: input.employeeId,
            ...data,
          },
        });

    await writeMandatoryAudit(tx, actor, {
      action: existing
        ? "coach_compensation_term_update"
        : "coach_compensation_term_create",
      targetType: "CoachCompensationTerm",
      targetId: term.id,
      details: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        trainerId: employee.trainerProfile?.id ?? null,
        editReason,
        before: existing ? termSnapshot(existing) : null,
        after: termSnapshot(term),
      },
    });

    return term;
  });
}

export async function saveCoachClassCompensationTerm(
  input: SaveCoachClassCompensationTermInput,
  actor: CompensationActorSnapshot,
) {
  assertActor(actor);

  if (!input.employeeId?.trim()) {
    throw new Error("COMPENSATION_EMPLOYEE_REQUIRED");
  }

  if (!input.classId?.trim()) {
    throw new Error("COMPENSATION_CLASS_REQUIRED");
  }

  assertMoneyMinor(input.monthlyAmountMinor, "CLASS_MONTHLY_AMOUNT_MINOR");

  const { effectiveFrom, effectiveTo } = normalizeDateRange(
    input.effectiveFrom,
    input.effectiveTo,
  );

  const currency = normalizeCurrency(input.currency);

  const notes = normalizeNotes(input.notes);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    const employee = await assertCoachEmployee(tx, input.employeeId);

    const classRow = await tx.class.findUnique({
      where: {
        id: input.classId,
      },
      select: {
        id: true,
        name: true,
        trainerId: true,
        trainer: {
          select: {
            id: true,
            employeeId: true,
          },
        },
      },
    });

    if (!classRow) {
      throw new Error("COMPENSATION_CLASS_NOT_FOUND");
    }

    if (classRow.trainer.employeeId !== input.employeeId) {
      throw new Error("COMPENSATION_CLASS_EMPLOYEE_MISMATCH");
    }

    const existing = input.termId
      ? await tx.coachClassCompensationTerm.findUnique({
          where: {
            id: input.termId,
          },
        })
      : null;

    if (input.termId && !existing) {
      throw new Error("COMPENSATION_TERM_NOT_FOUND");
    }

    if (existing && existing.employeeId !== input.employeeId) {
      throw new Error("COMPENSATION_TERM_EMPLOYEE_IMMUTABLE");
    }

    if (existing && existing.classId !== input.classId) {
      throw new Error("COMPENSATION_TERM_CLASS_IMMUTABLE");
    }

    const editReason = normalizeEditReason(Boolean(existing), input.editReason);

    const overlap = await tx.coachClassCompensationTerm.findFirst({
      where: {
        employeeId: input.employeeId,
        classId: input.classId,
        ...(existing
          ? {
              id: {
                not: existing.id,
              },
            }
          : {}),
        ...overlapDateWhere(effectiveFrom, effectiveTo),
      },
      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new Error("COMPENSATION_COACH_CLASS_TERM_OVERLAP");
    }

    const data = {
      effectiveFrom,
      effectiveTo,
      monthlyAmountMinor: input.monthlyAmountMinor,
      currency,
      notes,
      createdById: actor.userId,
    };

    const term = existing
      ? await tx.coachClassCompensationTerm.update({
          where: {
            id: existing.id,
          },
          data,
        })
      : await tx.coachClassCompensationTerm.create({
          data: {
            employeeId: input.employeeId,
            classId: input.classId,
            ...data,
          },
        });

    await writeMandatoryAudit(tx, actor, {
      action: existing
        ? "coach_class_compensation_term_update"
        : "coach_class_compensation_term_create",
      targetType: "CoachClassCompensationTerm",
      targetId: term.id,
      details: {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        trainerId: employee.trainerProfile?.id ?? null,
        classId: classRow.id,
        className: classRow.name,
        editReason,
        before: existing ? termSnapshot(existing) : null,
        after: termSnapshot(term),
      },
    });

    return term;
  });
}
