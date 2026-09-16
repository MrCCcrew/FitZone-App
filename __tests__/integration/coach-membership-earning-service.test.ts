import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { asDbTransactionClient } from "@/lib/db";
import {
  accrueCoachMembershipEarningTx,
  finalizeCoachMembershipEarning,
} from "@/lib/employees/coach-membership-earning-service";
import { buildCoachMembershipAttributionTx } from "@/lib/employees/coach-membership-attribution-service";

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
  throw new Error(
    "REFUSING: Coach Membership Earning integration requires fitzone_test",
  );
}

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let actorId = "";
let customerId = "";
let membershipId = "";

const userMembershipIds: string[] = [];
const earningIds: string[] = [];

function actor() {
  return {
    userId: actorId,
    name: "Coach Membership Earning Test Admin",
    email: `cme-admin-${stamp}@test.local`,
    role: "admin",
  };
}

async function cleanupScenario() {
  if (earningIds.length > 0) {
    await db.auditLog.deleteMany({
      where: {
        targetType: "CoachMembershipEarning",
        targetId: {
          in: earningIds,
        },
      },
    });

    await db.coachMembershipEarning.deleteMany({
      where: {
        id: {
          in: earningIds,
        },
      },
    });

    earningIds.splice(0, earningIds.length);
  }

  if (userMembershipIds.length > 0) {
    await db.coachMembershipEarning.deleteMany({
      where: {
        userMembershipId: {
          in: userMembershipIds,
        },
      },
    });

    await db.userMembership.deleteMany({
      where: {
        id: {
          in: userMembershipIds,
        },
      },
    });

    userMembershipIds.splice(0, userMembershipIds.length);
  }
}

async function cleanupAll() {
  await cleanupScenario();

  await db.auditLog.deleteMany({
    where: {
      OR: [
        {
          actorUserId: actorId || "__none__",
          targetType: "CoachMembershipEarning",
        },
        {
          actorName: "system:coach-membership-accrual",
          targetType: "CoachMembershipEarning",
          details: {
            contains: stamp,
          },
        },
      ],
    },
  });

  if (membershipId) {
    await db.membership.deleteMany({
      where: {
        id: membershipId,
      },
    });
  }

  const ids = [actorId, customerId].filter(Boolean);

  if (ids.length > 0) {
    await db.user.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });
  }
}

async function createUserMembership(options?: {
  ordinary?: boolean;
  partialSnapshot?: boolean;
  rateBps?: number;
  paymentAmount?: number;
}) {
  const ordinary = options?.ordinary === true;
  const partial = options?.partialSnapshot === true;

  const row = await db.userMembership.create({
    data: {
      userId: customerId,
      membershipId,

      startDate: new Date("2038-09-01T00:00:00.000Z"),

      endDate: new Date("2038-09-30T23:59:59.000Z"),

      status: "active",

      activatedAt: new Date("2038-09-01T00:00:00.000Z"),

      paymentAmount: options?.paymentAmount ?? 0,

      paymentMethod: "paymob",

      ...(ordinary
        ? {}
        : {
            coachMembershipTrainerIdSnapshot: `trainer-${stamp}`,

            coachMembershipTrainerNameSnapshot: "Coach Membership Test Coach",

            coachMembershipEmployeeIdSnapshot: `employee-${stamp}`,

            coachMembershipEmployeeCodeSnapshot: partial
              ? null
              : `EMP-CME-${stamp}`,

            coachMembershipEmployeeNameSnapshot:
              "Coach Membership Test Employee",

            coachMembershipCompensationTermIdSnapshot: `term-${stamp}`,

            coachMembershipCommissionBpsSnapshot: options?.rateBps ?? 4000,

            coachMembershipCurrencySnapshot: "EGP",
          }),
    },
  });

  userMembershipIds.push(row.id);

  return row;
}

async function accrue(
  userMembershipId: string,
  input?: {
    externalPaidAmount?: number;
    walletAmount?: number;
    pointsAmount?: number;
    finalizedAt?: Date;
  },
) {
  return db.$transaction(async (tx) => {
    return accrueCoachMembershipEarningTx(asDbTransactionClient(tx), {
      userMembershipId,

      finalizedAt: input?.finalizedAt ?? new Date("2038-09-08T12:00:00.000Z"),

      consideration: {
        externalPaidAmount: input?.externalPaidAmount ?? 0,

        walletAmount: input?.walletAmount ?? 0,

        pointsAmount: input?.pointsAmount ?? 0,
      },
    });
  });
}

beforeAll(async () => {
  const actorUser = await db.user.create({
    data: {
      name: "Coach Membership Earning Test Admin",

      email: `cme-admin-${stamp}@test.local`,

      role: "admin",
      adminAccess: true,
      isActive: true,
    },
  });

  actorId = actorUser.id;

  const customer = await db.user.create({
    data: {
      name: "Coach Membership Earning Customer",

      email: `cme-customer-${stamp}@test.local`,

      role: "member",
      isActive: true,
    },
  });

  customerId = customer.id;

  const membership = await db.membership.create({
    data: {
      name: `TEST Coach Membership ${stamp}`,

      kind: "subscription",
      price: 1000,
      duration: 30,
      sessionsCount: 10,
      features: "[]",
      maxClasses: -1,

      isActive: true,
      coachMembershipEnabled: true,
    },
  });

  membershipId = membership.id;
});

beforeEach(async () => {
  await cleanupScenario();
});

afterAll(async () => {
  await cleanupAll();
});

describe("CoachMembershipEarningService — real fitzone_test integration", () => {
  it("stores full economic consideration and frozen 40% commission", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 500,
      walletAmount: 300,
      pointsAmount: 200,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    expect(earning.paymentAmountMinor).toBe(100000);

    expect(earning.commissionRateBps).toBe(4000);

    expect(earning.commissionAmountMinor).toBe(40000);

    // 100,000 total consideration - 40,000 coach commission.
    expect(earning.gymShareAmountMinor).toBe(60000);

    expect(
      earning.commissionAmountMinor + (earning.gymShareAmountMinor ?? 0),
    ).toBe(earning.paymentAmountMinor);

    expect(earning.currency).toBe("EGP");

    expect(earning.status).toBe("calculated");
  });

  it("uses purchase-time snapshots without live Trainer or Employee rows", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    expect(earning.trainerIdSnapshot).toBe(`trainer-${stamp}`);

    expect(earning.employeeIdSnapshot).toBe(`employee-${stamp}`);

    expect(earning.employeeCodeSnapshot).toBe(`EMP-CME-${stamp}`);

    expect(earning.coachCompensationTermIdSnapshot).toBe(`term-${stamp}`);
  });

  it("keeps purchase-time PositionPayrollPolicy snapshots frozen after the live policy changes", async () => {
    const purchaseAt =
      new Date("2038-09-05T12:00:00.000Z");

    let employeeId = "";
    let trainerId = "";
    let positionId = "";
    let positionTermId = "";
    let positionPolicyId = "";

    try {
      const employee =
        await db.employeeProfile.create({
          data: {
            employeeCode:
              `CME-POS-${stamp}`,

            name:
              "Coach Membership Position Coach",

            employmentStatus:
              "active",

            payrollEnabled:
              true,
          },
        });

      employeeId = employee.id;

      const trainer =
        await db.trainer.create({
          data: {
            name:
              `CME Position Trainer ${stamp}`,

            specialty:
              "fitness",

            isActive:
              true,

            employeeId:
              employee.id,
          },
        });

      trainerId = trainer.id;

      const position =
        await db.position.create({
          data: {
            code:
              `CME-POSITION-${stamp}`,

            name:
              "Coach Membership Position",

            nameEn:
              "Coach Membership Position",

            isActive:
              true,

            sortOrder:
              994,
          },
        });

      positionId = position.id;

      const positionTerm =
        await db.employeePositionTerm.create({
          data: {
            employeeId:
              employee.id,

            positionId:
              position.id,

            effectiveFrom:
              new Date(
                "2038-09-01T00:00:00.000Z",
              ),

            effectiveTo:
              null,
          },
        });

      positionTermId =
        positionTerm.id;

      const policy =
        await db.positionPayrollPolicy.create({
          data: {
            positionId:
              position.id,

            effectiveFrom:
              new Date(
                "2038-09-01T00:00:00.000Z",
              ),

            effectiveTo:
              null,

            /*
             * 40% at purchase time.
             */
            coachMembershipCommissionBps:
              4000,

            currency:
              "EGP",

            isActive:
              true,
          },
        });

      positionPolicyId =
        policy.id;

      const attribution =
        await db.$transaction(
          async (tx) =>
            buildCoachMembershipAttributionTx(
              asDbTransactionClient(tx),
              {
                membershipId,
                trainerId:
                  trainer.id,

                purchaseAt,
              },
            ),
        );

      expect(attribution).not.toBeNull();

      if (!attribution) {
        throw new Error(
          "EXPECTED_POSITION_ATTRIBUTION",
        );
      }

      expect(
        attribution.coachMembershipCommissionSourceSnapshot,
      ).toBe(
        "position_payroll_policy",
      );

      expect(
        attribution.coachMembershipCommissionBpsSnapshot,
      ).toBe(4000);

      expect(
        attribution.coachMembershipPositionPayrollPolicyIdSnapshot,
      ).toBe(policy.id);

      const purchasedMembership =
        await db.userMembership.create({
          data: {
            userId:
              customerId,

            membershipId,

            startDate:
              new Date(
                "2038-09-05T00:00:00.000Z",
              ),

            endDate:
              new Date(
                "2038-10-04T23:59:59.000Z",
              ),

            status:
              "active",

            activatedAt:
              purchaseAt,

            paymentAmount:
              1000,

            paymentMethod:
              "paymob",

            coachMembershipTrainerIdSnapshot:
              attribution.trainerIdSnapshot,

            coachMembershipTrainerNameSnapshot:
              attribution.trainerNameSnapshot,

            coachMembershipEmployeeIdSnapshot:
              attribution.employeeIdSnapshot,

            coachMembershipEmployeeCodeSnapshot:
              attribution.employeeCodeSnapshot,

            coachMembershipEmployeeNameSnapshot:
              attribution.employeeNameSnapshot,

            coachMembershipCompensationTermIdSnapshot:
              attribution.coachCompensationTermIdSnapshot,

            coachMembershipCommissionSourceSnapshot:
              attribution.coachMembershipCommissionSourceSnapshot,

            coachMembershipPositionTermIdSnapshot:
              attribution.coachMembershipPositionTermIdSnapshot,

            coachMembershipPositionIdSnapshot:
              attribution.coachMembershipPositionIdSnapshot,

            coachMembershipPositionPayrollPolicyIdSnapshot:
              attribution.coachMembershipPositionPayrollPolicyIdSnapshot,

            coachMembershipCommissionBpsSnapshot:
              attribution.coachMembershipCommissionBpsSnapshot,

            coachMembershipCurrencySnapshot:
              attribution.coachMembershipCurrencySnapshot,
          },
        });

      userMembershipIds.push(
        purchasedMembership.id,
      );

      /*
       * Mutate the LIVE policy after purchase:
       * 40% -> 90%.
       *
       * The earning MUST remain 40%.
       */
      await db.positionPayrollPolicy.update({
        where: {
          id:
            policy.id,
        },

        data: {
          coachMembershipCommissionBps:
            9000,
        },
      });

      const earning =
        await accrue(
          purchasedMembership.id,
          {
            externalPaidAmount:
              1000,

            finalizedAt:
              new Date(
                "2038-09-08T12:00:00.000Z",
              ),
          },
        );

      expect(earning).not.toBeNull();

      if (!earning) {
        throw new Error(
          "EXPECTED_POSITION_COACH_MEMBERSHIP_EARNING",
        );
      }

      earningIds.push(
        earning.id,
      );

      /*
       * The immutable purchase contract wins.
       */
      expect(
        earning.commissionSourceSnapshot,
      ).toBe(
        "position_payroll_policy",
      );

      expect(
        earning.coachCompensationTermIdSnapshot,
      ).toBeNull();

      expect(
        earning.positionTermIdSnapshot,
      ).toBe(
        positionTerm.id,
      );

      expect(
        earning.positionIdSnapshot,
      ).toBe(
        position.id,
      );

      expect(
        earning.positionPayrollPolicyIdSnapshot,
      ).toBe(
        policy.id,
      );

      /*
       * Frozen 40%, NOT the live 90%.
       */
      expect(
        earning.commissionRateBps,
      ).toBe(4000);

      expect(
        earning.paymentAmountMinor,
      ).toBe(100000);

      expect(
        earning.commissionAmountMinor,
      ).toBe(40000);

      expect(
        earning.gymShareAmountMinor,
      ).toBe(60000);

      /*
       * Prove the live policy really changed.
       */
      const livePolicy =
        await db.positionPayrollPolicy.findUniqueOrThrow({
          where: {
            id:
              policy.id,
          },
        });

      expect(
        livePolicy.coachMembershipCommissionBps,
      ).toBe(9000);
    } finally {
      /*
       * UserMembership + earning are tracked by the existing
       * test cleanup. Remove live source records here.
       */

      if (positionPolicyId) {
        await db.positionPayrollPolicy.deleteMany({
          where: {
            id:
              positionPolicyId,
          },
        });
      }

      if (positionTermId) {
        await db.employeePositionTerm.deleteMany({
          where: {
            id:
              positionTermId,
          },
        });
      }

      if (trainerId) {
        await db.trainer.deleteMany({
          where: {
            id:
              trainerId,
          },
        });
      }

      if (employeeId) {
        await db.employeeProfile.deleteMany({
          where: {
            id:
              employeeId,
          },
        });
      }

      if (positionId) {
        await db.position.deleteMany({
          where: {
            id:
              positionId,
          },
        });
      }
    }
  });

  it("does not create earning for ordinary membership", async () => {
    const membership = await createUserMembership({
      ordinary: true,
    });

    const result = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(result).toBeNull();

    expect(
      await db.coachMembershipEarning.count({
        where: {
          userMembershipId: membership.id,
        },
      }),
    ).toBe(0);
  });

  it("creates zero earning for genuinely zero consideration", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id);

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    expect(earning.paymentAmountMinor).toBe(0);

    expect(earning.commissionAmountMinor).toBe(0);

    expect(earning.gymShareAmountMinor).toBe(0);
  });

  it("is exact-once and idempotent for identical retries", async () => {
    const membership = await createUserMembership();

    const first = await accrue(membership.id, {
      externalPaidAmount: 500,
      walletAmount: 300,
      pointsAmount: 200,
    });

    expect(first).not.toBeNull();

    if (!first) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(first.id);

    const second = await accrue(membership.id, {
      externalPaidAmount: 500,
      walletAmount: 300,
      pointsAmount: 200,
    });

    expect(second?.id).toBe(first.id);

    expect(
      await db.coachMembershipEarning.count({
        where: {
          userMembershipId: membership.id,
        },
      }),
    ).toBe(1);

    expect(
      await db.auditLog.count({
        where: {
          targetType: "CoachMembershipEarning",
          targetId: first.id,
          action: "coach_membership_earning_calculate",
        },
      }),
    ).toBe(1);
  });

  it("rejects retry with different economic consideration", async () => {
    const membership = await createUserMembership();

    const first = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(first).not.toBeNull();

    if (!first) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(first.id);

    await expect(
      accrue(membership.id, {
        externalPaidAmount: 999,
      }),
    ).rejects.toThrow("COACH_MEMBERSHIP_EARNING_EXISTING_MISMATCH");

    const persisted = await db.coachMembershipEarning.findUniqueOrThrow({
      where: {
        id: first.id,
      },
    });

    expect(persisted.paymentAmountMinor).toBe(100000);
  });

  it("rejects incomplete Coach Membership snapshot and rolls back", async () => {
    const membership = await createUserMembership({
      partialSnapshot: true,
    });

    await expect(
      accrue(membership.id, {
        externalPaidAmount: 1000,
      }),
    ).rejects.toThrow("COACH_MEMBERSHIP_EARNING_INCOMPLETE_SNAPSHOT");

    expect(
      await db.coachMembershipEarning.count({
        where: {
          userMembershipId: membership.id,
        },
      }),
    ).toBe(0);
  });

  it("writes automatic calculation audit with frozen economics", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 500,
      walletAmount: 300,
      pointsAmount: 200,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    const audit = await db.auditLog.findFirst({
      where: {
        targetType: "CoachMembershipEarning",

        targetId: earning.id,

        action: "coach_membership_earning_calculate",
      },
    });

    expect(audit).not.toBeNull();

    expect(audit?.actorUserId).toBeNull();

    expect(audit?.actorRole).toBe("system");

    const details = JSON.parse(audit?.details ?? "{}");

    expect(details.economicConsiderationMinor).toBe(100000);

    expect(details.commissionAmountMinor).toBe(40000);
  });

  it("uses Cairo calendar month boundary", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 1000,

      // Sep 30 22:30 UTC = Oct 1 in Cairo.
      finalizedAt: new Date("2038-09-30T22:30:00.000Z"),
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    expect(earning.monthKey).toBe("2038-10");
  });

  it("finalizes calculated earning and writes admin audit", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    const finalized = await finalizeCoachMembershipEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    expect(finalized.status).toBe("finalized");

    expect(finalized.finalizedAt).not.toBeNull();

    expect(finalized.finalizedById).toBe(actorId);

    expect(
      await db.auditLog.count({
        where: {
          targetType: "CoachMembershipEarning",

          targetId: earning.id,

          action: "coach_membership_earning_finalize",

          actorUserId: actorId,
        },
      }),
    ).toBe(1);
  });

  it("finalize retry is idempotent and does not duplicate audit", async () => {
    const membership = await createUserMembership();

    const earning = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    const first = await finalizeCoachMembershipEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    const second = await finalizeCoachMembershipEarning(
      {
        earningId: earning.id,
      },
      actor(),
    );

    expect(second.id).toBe(first.id);
    expect(second.status).toBe("finalized");

    expect(
      await db.auditLog.count({
        where: {
          targetType: "CoachMembershipEarning",

          targetId: earning.id,

          action: "coach_membership_earning_finalize",

          actorUserId: actorId,
        },
      }),
    ).toBe(1);
  });

  it("freezes rate independently from later external configuration", async () => {
    const membership = await createUserMembership({
      rateBps: 2250,
    });

    const earning = await accrue(membership.id, {
      externalPaidAmount: 1000,
    });

    expect(earning).not.toBeNull();

    if (!earning) {
      throw new Error("EXPECTED_COACH_MEMBERSHIP_EARNING");
    }

    earningIds.push(earning.id);

    expect(earning.commissionRateBps).toBe(2250);

    expect(earning.commissionAmountMinor).toBe(22500);
  });
});
