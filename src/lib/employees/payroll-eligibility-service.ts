import "server-only";

import { db, asDbTransactionClient } from "@/lib/db";
import {
  cairoCalendarDateKey,
  cairoDateStartInstant,
} from "@/lib/fitzone-time";

type Tx = ReturnType<typeof asDbTransactionClient>;

export type PayrollEligibilityActor = {
  userId: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type SavePayrollEligibilityTermInput = {
  termId?: string;
  employeeId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  enabled: boolean;
  notes?: string | null;
  editReason?: string | null;
};

function assertActor(actor: PayrollEligibilityActor) {
  if (!actor.userId?.trim()) {
    throw new Error("PAYROLL_ELIGIBILITY_ACTOR_REQUIRED");
  }
}

function assertDateKey(
  value: string,
  field: "EFFECTIVE_FROM" | "EFFECTIVE_TO",
) {
  if (!value?.trim()) {
    throw new Error(`PAYROLL_ELIGIBILITY_${field}_REQUIRED`);
  }

  const instant = cairoDateStartInstant(value);

  if (cairoCalendarDateKey(instant) !== value) {
    throw new Error(`PAYROLL_ELIGIBILITY_INVALID_${field}`);
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
    throw new Error("PAYROLL_ELIGIBILITY_EFFECTIVE_TO_BEFORE_FROM");
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

function normalizeEditReason(
  existing: boolean,
  value: string | null | undefined,
) {
  const reason = value?.trim() || null;

  if (existing && (!reason || reason.length < 3)) {
    throw new Error("PAYROLL_ELIGIBILITY_EDIT_REASON_REQUIRED");
  }

  return reason;
}

function dateKey(value: Date | null | undefined) {
  if (!value) return null;

  return value.toISOString().slice(0, 10);
}

function snapshot(row: {
  id: string;
  employeeId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  enabled: boolean;
  notes: string | null;
  createdById: string | null;
}) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    effectiveFrom: dateKey(row.effectiveFrom),
    effectiveTo: dateKey(row.effectiveTo),
    enabled: row.enabled,
    notes: row.notes,
    createdById: row.createdById,
  };
}

async function writeAudit(
  tx: Tx,
  actor: PayrollEligibilityActor,
  input: {
    action: string;
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
      targetType: "EmployeePayrollEligibilityTerm",
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
    },
  });

  if (!employee) {
    throw new Error("PAYROLL_ELIGIBILITY_EMPLOYEE_NOT_FOUND");
  }

  return employee;
}

function overlapWhere(effectiveFrom: Date, effectiveTo: Date | null) {
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

export async function savePayrollEligibilityTerm(
  input: SavePayrollEligibilityTermInput,
  actor: PayrollEligibilityActor,
) {
  assertActor(actor);

  if (!input.employeeId?.trim()) {
    throw new Error("PAYROLL_ELIGIBILITY_EMPLOYEE_REQUIRED");
  }

  const { effectiveFrom, effectiveTo } = normalizeDateRange(
    input.effectiveFrom,
    input.effectiveTo,
  );

  const notes = normalizeNotes(input.notes);

  return db.$transaction(async (rawTx) => {
    const tx = asDbTransactionClient(rawTx);

    await assertEmployeeExists(tx, input.employeeId);

    const existing = input.termId
      ? await tx.employeePayrollEligibilityTerm.findUnique({
          where: {
            id: input.termId,
          },
        })
      : null;

    if (input.termId && !existing) {
      throw new Error("PAYROLL_ELIGIBILITY_TERM_NOT_FOUND");
    }

    if (existing && existing.employeeId !== input.employeeId) {
      throw new Error("PAYROLL_ELIGIBILITY_TERM_EMPLOYEE_IMMUTABLE");
    }

    const editReason = normalizeEditReason(Boolean(existing), input.editReason);

    /*
     * Serialize eligibility edits for one employee.
     * This prevents concurrent overlapping terms
     * from both passing the overlap check.
     */
    await tx.$queryRaw`
        SELECT id
        FROM EmployeeProfile
        WHERE id = ${input.employeeId}
        FOR UPDATE
      `;

    const overlap = await tx.employeePayrollEligibilityTerm.findFirst({
      where: {
        employeeId: input.employeeId,

        ...(existing
          ? {
              id: {
                not: existing.id,
              },
            }
          : {}),

        ...overlapWhere(effectiveFrom, effectiveTo),
      },

      select: {
        id: true,
      },
    });

    if (overlap) {
      throw new Error("PAYROLL_ELIGIBILITY_TERM_OVERLAP");
    }

    const saved = existing
      ? await tx.employeePayrollEligibilityTerm.update({
          where: {
            id: existing.id,
          },
          data: {
            effectiveFrom,
            effectiveTo,
            enabled: Boolean(input.enabled),
            notes,
          },
        })
      : await tx.employeePayrollEligibilityTerm.create({
          data: {
            employeeId: input.employeeId,
            effectiveFrom,
            effectiveTo,
            enabled: Boolean(input.enabled),
            notes,
            createdById: actor.userId,
          },
        });

    await writeAudit(tx, actor, {
      action: existing
        ? "payroll_eligibility_term_update"
        : "payroll_eligibility_term_create",

      targetId: saved.id,

      details: existing
        ? {
            before: snapshot(existing),
            after: snapshot(saved),
            editReason,
          }
        : {
            after: snapshot(saved),
          },
    });

    return saved;
  });
}

export async function listPayrollEligibilityTerms(employeeId?: string | null) {
  return db.employeePayrollEligibilityTerm.findMany({
    where: {
      ...(employeeId
        ? {
            employeeId,
          }
        : {}),
    },

    orderBy: [
      {
        employeeId: "asc",
      },
      {
        effectiveFrom: "desc",
      },
    ],

    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          name: true,
          payrollEnabled: true,
        },
      },
    },
  });
}
