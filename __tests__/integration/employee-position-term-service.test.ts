import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import {
  asDbTransactionClient,
  db,
} from "@/lib/db";

import {
  resolveEmployeePositionTermTx,
  saveEmployeePositionTermTx,
} from "@/lib/employees/employee-position-term-service";

const raw = process.env.DATABASE_URL;

if (!raw) throw new Error("DATABASE_URL_REQUIRED");

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  process.env.NODE_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: position history tests require fitzone_test",
  );
}

const stamp =
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let employeeId = "";
let position1Id = "";
let position2Id = "";

beforeAll(async () => {
  const p1 = await db.position.create({
    data: {
      code: `POS-HIST-1-${stamp}`,
      name: "Position History One",
      isActive: true,
    },
  });

  const p2 = await db.position.create({
    data: {
      code: `POS-HIST-2-${stamp}`,
      name: "Position History Two",
      isActive: true,
    },
  });

  position1Id = p1.id;
  position2Id = p2.id;

  const employee = await db.employeeProfile.create({
    data: {
      employeeCode: `POS-HIST-${stamp}`,
      name: "Position History Employee",
      positionId: position2Id,
      employmentStatus: "active",
      payrollEnabled: true,
    },
  });

  employeeId = employee.id;
});

afterAll(async () => {
  if (employeeId) {
    await db.employeePositionTerm.deleteMany({
      where: {
        employeeId,
      },
    });

    await db.employeeProfile.deleteMany({
      where: {
        id: employeeId,
      },
    });
  }

  await db.position.deleteMany({
    where: {
      id: {
        in: [position1Id, position2Id].filter(Boolean),
      },
    },
  });
});

describe("EmployeePositionTerm foundation", () => {
  it("preserves historical position independently from current EmployeeProfile.positionId", async () => {
    const created = await db.$transaction((rawTx) =>
      saveEmployeePositionTermTx(
        asDbTransactionClient(rawTx),
        {
          employeeId,
          positionId: position1Id,
          effectiveFrom: "2095-01-01",
          effectiveTo: "2095-01-31",
          notes: `history-${stamp}`,
        },
      ),
    );

    expect(created.positionId).toBe(position1Id);

    const current = await db.employeeProfile.findUniqueOrThrow({
      where: { id: employeeId },
    });

    expect(current.positionId).toBe(position2Id);

    const historical = await db.$transaction((rawTx) =>
      resolveEmployeePositionTermTx(
        asDbTransactionClient(rawTx),
        employeeId,
        new Date("2095-01-15T00:00:00.000Z"),
      ),
    );

    expect(historical?.positionId).toBe(position1Id);
  });

  it("stores exact MySQL DATE values", async () => {
    const created = await db.$transaction((rawTx) =>
      saveEmployeePositionTermTx(
        asDbTransactionClient(rawTx),
        {
          employeeId,
          positionId: position2Id,
          effectiveFrom: "2095-02-01",
          effectiveTo: "2095-02-28",
          notes: `date-${stamp}`,
        },
      ),
    );

    expect(created.effectiveFrom.toISOString()).toBe(
      "2095-02-01T00:00:00.000Z",
    );

    expect(created.effectiveTo?.toISOString()).toBe(
      "2095-02-28T00:00:00.000Z",
    );
  });

  it("rejects overlapping position history", async () => {
    await expect(
      db.$transaction((rawTx) =>
        saveEmployeePositionTermTx(
          asDbTransactionClient(rawTx),
          {
            employeeId,
            positionId: position1Id,
            effectiveFrom: "2095-02-15",
            effectiveTo: "2095-03-15",
            notes: `overlap-${stamp}`,
          },
        ),
      ),
    ).rejects.toThrow(
      "EMPLOYEE_POSITION_TERM_EFFECTIVE_RANGE_OVERLAP",
    );
  });
});
