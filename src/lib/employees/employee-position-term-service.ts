import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type SaveEmployeePositionTermInput = {
  employeeId: string;
  positionId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string | null;
  createdById?: string | null;
};

function dateOnly(value: string, field: string): Date {
  const raw = value?.trim();

  if (!raw) {
    throw new Error(`EMPLOYEE_POSITION_TERM_${field}_REQUIRED`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);

  if (!match) {
    throw new Error(`EMPLOYEE_POSITION_TERM_INVALID_${field}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`EMPLOYEE_POSITION_TERM_INVALID_${field}`);
  }

  return date;
}

export async function saveEmployeePositionTermTx(
  tx: Tx,
  input: SaveEmployeePositionTermInput,
) {
  const employeeId = input.employeeId?.trim();
  const positionId = input.positionId?.trim();

  if (!employeeId) {
    throw new Error("EMPLOYEE_POSITION_TERM_EMPLOYEE_REQUIRED");
  }

  if (!positionId) {
    throw new Error("EMPLOYEE_POSITION_TERM_POSITION_REQUIRED");
  }

  const effectiveFrom = dateOnly(
    input.effectiveFrom,
    "EFFECTIVE_FROM",
  );

  const effectiveTo =
    input.effectiveTo == null || input.effectiveTo.trim() === ""
      ? null
      : dateOnly(input.effectiveTo, "EFFECTIVE_TO");

  if (
    effectiveTo &&
    effectiveTo.getTime() < effectiveFrom.getTime()
  ) {
    throw new Error(
      "EMPLOYEE_POSITION_TERM_EFFECTIVE_TO_BEFORE_FROM",
    );
  }

  const [employee, position] = await Promise.all([
    tx.employeeProfile.findUnique({
      where: { id: employeeId },
      select: { id: true },
    }),

    tx.position.findUnique({
      where: { id: positionId },
      select: { id: true },
    }),
  ]);

  if (!employee) {
    throw new Error("EMPLOYEE_POSITION_TERM_EMPLOYEE_NOT_FOUND");
  }

  if (!position) {
    throw new Error("EMPLOYEE_POSITION_TERM_POSITION_NOT_FOUND");
  }

  const overlap = await tx.employeePositionTerm.findFirst({
    where: {
      employeeId,

      effectiveFrom: {
        lte:
          effectiveTo ??
          new Date("9999-12-31T00:00:00.000Z"),
      },

      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gte: effectiveFrom,
          },
        },
      ],
    },

    select: {
      id: true,
    },
  });

  if (overlap) {
    throw new Error(
      "EMPLOYEE_POSITION_TERM_EFFECTIVE_RANGE_OVERLAP",
    );
  }

  return tx.employeePositionTerm.create({
    data: {
      employeeId,
      positionId,
      effectiveFrom,
      effectiveTo,
      notes: input.notes?.trim() || null,
      createdById: input.createdById?.trim() || null,
    },
  });
}

export async function resolveEmployeePositionTermTx(
  tx: Tx,
  employeeId: string,
  date: Date,
) {
  return tx.employeePositionTerm.findFirst({
    where: {
      employeeId,

      effectiveFrom: {
        lte: date,
      },

      OR: [
        { effectiveTo: null },
        {
          effectiveTo: {
            gte: date,
          },
        },
      ],
    },

    include: {
      position: true,
    },

    orderBy: {
      effectiveFrom: "desc",
    },
  });
}
