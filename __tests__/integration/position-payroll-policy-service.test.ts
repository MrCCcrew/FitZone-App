import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, asDbTransactionClient } from "@/lib/db";
import {
  resolvePositionPayrollPolicyTx,
  savePositionPayrollPolicyTx,
} from "@/lib/employees/position-payroll-policy-service";

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
    "REFUSING: position payroll policy tests require fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let normalId = "";
let leaderId = "";
let headId = "";

async function position(code: string, name: string) {
  return db.position.create({
    data: {
      code: `${code}_${stamp}`,
      name,
      nameEn: name,
      isActive: true,
    },
  });
}

beforeAll(async () => {
  const normal = await position("NORMAL_TEST", "Normal Test");
  normalId = normal.id;

  const leader = await position("LEADER_TEST", "Leader Test");
  leaderId = leader.id;

  const head = await db.position.create({
    data: {
      code: "HEAD_COACH_OWNER",
      name: `Head Test ${stamp}`,
      nameEn: "Head Coach Owner",
      isActive: true,
    },
  }).catch(async () => {
    const existing = await db.position.findUnique({
      where: { code: "HEAD_COACH_OWNER" },
    });

    if (!existing) throw new Error("HEAD_POSITION_REQUIRED");
    return existing;
  });

  headId = head.id;
});

afterAll(async () => {
  await db.positionPayrollPolicy.deleteMany({
    where: {
      positionId: {
        in: [normalId, leaderId, headId].filter(Boolean),
      },
      notes: {
        contains: stamp,
      },
    },
  });

  await db.position.deleteMany({
    where: {
      id: {
        in: [normalId, leaderId].filter(Boolean),
      },
    },
  });
});

describe("PositionPayrollPolicy foundation", () => {
  it("stores approved editable Head Coach settings without hardcoding", async () => {
    const created = await db.$transaction((rawTx) =>
      savePositionPayrollPolicyTx(
        asDbTransactionClient(rawTx),
        {
          positionId: headId,
          effectiveFrom: "2098-01-01",

          fixedSalaryMinor: 250000,
          defaultFixedClassMonthlyMinor: 25000,

          traineeClassCommissionBps: 2500,
          privateSessionCommissionBps: 6000,
          coachMembershipCommissionBps: 4000,

          headCoachMonthlyBaseMinutes: 32 * 60,
          headCoachWeeklyMinMinutes: 5 * 60,
          headCoachWeeklyCapMinutes: 8 * 60,

          currency: "EGP",
          notes: `test-${stamp}`,
        },
      ),
    );

    expect(created.fixedSalaryMinor).toBe(250000);
    expect(created.defaultFixedClassMonthlyMinor).toBe(25000);

    expect(created.traineeClassCommissionBps).toBe(2500);
    expect(created.privateSessionCommissionBps).toBe(6000);
    expect(created.coachMembershipCommissionBps).toBe(4000);

    expect(created.headCoachMonthlyBaseMinutes).toBe(1920);
    expect(created.headCoachWeeklyMinMinutes).toBe(300);
    expect(created.headCoachWeeklyCapMinutes).toBe(480);
  });

  it("stores Leader percentages as editable data", async () => {
    const created = await db.$transaction((rawTx) =>
      savePositionPayrollPolicyTx(
        asDbTransactionClient(rawTx),
        {
          positionId: leaderId,
          effectiveFrom: "2098-01-01",
          traineeClassCommissionBps: 2250,
          privateSessionCommissionBps: 5000,
          coachMembershipCommissionBps: 4000,
          notes: `test-${stamp}`,
        },
      ),
    );

    expect(created.traineeClassCommissionBps).toBe(2250);
    expect(created.privateSessionCommissionBps).toBe(5000);
    expect(created.coachMembershipCommissionBps).toBe(4000);
  });

  it("stores Normal percentages as editable data", async () => {
    const created = await db.$transaction((rawTx) =>
      savePositionPayrollPolicyTx(
        asDbTransactionClient(rawTx),
        {
          positionId: normalId,
          effectiveFrom: "2098-01-01",
          traineeClassCommissionBps: 2000,
          privateSessionCommissionBps: 4000,
          coachMembershipCommissionBps: 4000,
          notes: `test-${stamp}`,
        },
      ),
    );

    expect(created.traineeClassCommissionBps).toBe(2000);
    expect(created.privateSessionCommissionBps).toBe(4000);
    expect(created.coachMembershipCommissionBps).toBe(4000);
  });

  it("rejects incomplete Head Coach weekly rule", async () => {
    await expect(
      db.$transaction((rawTx) =>
        savePositionPayrollPolicyTx(
          asDbTransactionClient(rawTx),
          {
            positionId: headId,
            effectiveFrom: "2097-01-01",
            headCoachMonthlyBaseMinutes: 1920,
            headCoachWeeklyMinMinutes: 300,
            notes: `test-${stamp}`,
          },
        ),
      ),
    ).rejects.toThrow(
      "POSITION_PAYROLL_POLICY_INCOMPLETE_HEAD_COACH_RULE",
    );
  });

  it("rejects weekly minimum above weekly cap", async () => {
    await expect(
      db.$transaction((rawTx) =>
        savePositionPayrollPolicyTx(
          asDbTransactionClient(rawTx),
          {
            positionId: headId,
            effectiveFrom: "2097-02-01",
            headCoachMonthlyBaseMinutes: 1920,
            headCoachWeeklyMinMinutes: 540,
            headCoachWeeklyCapMinutes: 480,
            notes: `test-${stamp}`,
          },
        ),
      ),
    ).rejects.toThrow(
      "POSITION_PAYROLL_POLICY_HEAD_MIN_EXCEEDS_CAP",
    );
  });

  it("rejects Head Coach weekly rule on another position", async () => {
    await expect(
      db.$transaction((rawTx) =>
        savePositionPayrollPolicyTx(
          asDbTransactionClient(rawTx),
          {
            positionId: normalId,
            effectiveFrom: "2097-03-01",
            headCoachMonthlyBaseMinutes: 1920,
            headCoachWeeklyMinMinutes: 300,
            headCoachWeeklyCapMinutes: 480,
            notes: `test-${stamp}`,
          },
        ),
      ),
    ).rejects.toThrow(
      "POSITION_PAYROLL_POLICY_HEAD_RULE_POSITION_REQUIRED",
    );
  });

  it("closes one earlier open policy and creates an immutable economic successor", async () => {
    const position =
      await db.position.create({
        data: {
          code: `SUCCESSOR_${stamp}`,
          name: "Successor Test",
          nameEn: "Successor Test",
          isActive: true,
        },
      });

    try {
      const first =
        await db.$transaction((rawTx) =>
          savePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            {
              positionId: position.id,
              effectiveFrom: "2099-01-01",

              fixedSalaryMinor: 100000,
              traineeClassCommissionBps: 2000,
              privateSessionCommissionBps: 4000,
              coachMembershipCommissionBps: 4000,

              currency: "EGP",
              notes: `successor-old-${stamp}`,
            },
          ),
        );

      const successor =
        await db.$transaction((rawTx) =>
          savePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            {
              positionId: position.id,
              effectiveFrom: "2099-02-01",

              fixedSalaryMinor: 200000,
              traineeClassCommissionBps: 2250,
              privateSessionCommissionBps: 5000,
              coachMembershipCommissionBps: 4500,

              currency: "EGP",
              notes: `successor-new-${stamp}`,
            },
          ),
        );

      const old =
        await db.positionPayrollPolicy.findUniqueOrThrow({
          where: {
            id: first.id,
          },
        });

      expect(
        old.effectiveTo?.toISOString().slice(0, 10),
      ).toBe("2099-01-31");

      /*
       * Only the lifecycle boundary may change.
       * Historical economics remain untouched.
       */
      expect(old.fixedSalaryMinor).toBe(100000);
      expect(old.traineeClassCommissionBps).toBe(2000);
      expect(old.privateSessionCommissionBps).toBe(4000);
      expect(old.coachMembershipCommissionBps).toBe(4000);
      expect(old.isActive).toBe(true);

      expect(
        successor.effectiveFrom.toISOString().slice(0, 10),
      ).toBe("2099-02-01");

      expect(successor.fixedSalaryMinor).toBe(200000);
      expect(successor.traineeClassCommissionBps).toBe(2250);

      const january =
        await db.$transaction((rawTx) =>
          resolvePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            position.id,
            new Date("2099-01-15T00:00:00.000Z"),
          ),
        );

      const february =
        await db.$transaction((rawTx) =>
          resolvePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            position.id,
            new Date("2099-02-15T00:00:00.000Z"),
          ),
        );

      expect(january?.id).toBe(first.id);
      expect(february?.id).toBe(successor.id);
    } finally {
      await db.positionPayrollPolicy.deleteMany({
        where: {
          positionId: position.id,
        },
      });

      await db.position.delete({
        where: {
          id: position.id,
        },
      });
    }
  });

  it("still rejects bounded overlap instead of rewriting history", async () => {
    const position =
      await db.position.create({
        data: {
          code: `BOUNDED_${stamp}`,
          name: "Bounded Overlap Test",
          nameEn: "Bounded Overlap Test",
          isActive: true,
        },
      });

    try {
      const existing =
        await db.positionPayrollPolicy.create({
          data: {
            positionId: position.id,

            effectiveFrom:
              new Date("2099-03-01T00:00:00.000Z"),

            effectiveTo:
              new Date("2099-03-31T00:00:00.000Z"),

            fixedSalaryMinor: 100000,
            currency: "EGP",
            isActive: true,
          },
        });

      await expect(
        db.$transaction((rawTx) =>
          savePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            {
              positionId: position.id,
              effectiveFrom: "2099-03-15",
              effectiveTo: "2099-04-15",
              fixedSalaryMinor: 200000,
            },
          ),
        ),
      ).rejects.toThrow(
        "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP",
      );

      const unchanged =
        await db.positionPayrollPolicy.findUniqueOrThrow({
          where: {
            id: existing.id,
          },
        });

      expect(
        unchanged.effectiveTo?.toISOString().slice(0, 10),
      ).toBe("2099-03-31");

      expect(unchanged.fixedSalaryMinor).toBe(100000);
    } finally {
      await db.positionPayrollPolicy.deleteMany({
        where: {
          positionId: position.id,
        },
      });

      await db.position.delete({
        where: {
          id: position.id,
        },
      });
    }
  });

  it("rejects a successor with the same start date", async () => {
    const position =
      await db.position.create({
        data: {
          code: `SAME_DATE_${stamp}`,
          name: "Same Date Test",
          nameEn: "Same Date Test",
          isActive: true,
        },
      });

    try {
      await db.positionPayrollPolicy.create({
        data: {
          positionId: position.id,

          effectiveFrom:
            new Date("2099-04-01T00:00:00.000Z"),

          effectiveTo: null,

          fixedSalaryMinor: 100000,
          currency: "EGP",
          isActive: true,
        },
      });

      await expect(
        db.$transaction((rawTx) =>
          savePositionPayrollPolicyTx(
            asDbTransactionClient(rawTx),
            {
              positionId: position.id,
              effectiveFrom: "2099-04-01",
              fixedSalaryMinor: 200000,
            },
          ),
        ),
      ).rejects.toThrow(
        "POSITION_PAYROLL_POLICY_EFFECTIVE_RANGE_OVERLAP",
      );
    } finally {
      await db.positionPayrollPolicy.deleteMany({
        where: {
          positionId: position.id,
        },
      });

      await db.position.delete({
        where: {
          id: position.id,
        },
      });
    }
  });

  it("resolves the effective policy by date", async () => {
    const resolved = await db.$transaction((rawTx) =>
      resolvePositionPayrollPolicyTx(
        asDbTransactionClient(rawTx),
        headId,
        new Date("2098-01-15T12:00:00.000Z"),
      ),
    );

    expect(resolved).not.toBeNull();
    expect(resolved?.fixedSalaryMinor).toBe(250000);
    expect(resolved?.traineeClassCommissionBps).toBe(2500);
  });
});
