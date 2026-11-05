import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import {
  recoverPaidMembershipForAdmin,
} from "@/lib/admin-membership-recovery";
import {
  recoverPaidMembershipActivation,
} from "@/lib/payments/service";

const raw = process.env.DATABASE_URL;

if (!raw) {
  throw new Error("REFUSING: DATABASE_URL missing");
}

const url = new URL(raw);

if (
  process.env.APP_ENV !== "test" ||
  url.hostname !== "127.0.0.1" ||
  decodeURIComponent(url.username) !== "fitzone_test_user" ||
  url.pathname !== "/fitzone_test"
) {
  throw new Error(
    "REFUSING: membership recovery integration requires " +
      "fitzone_test as fitzone_test_user on 127.0.0.1",
  );
}

const cleanupIds = {
  users: new Set<string>(),
  memberships: new Set<string>(),
  plans: new Set<string>(),
  payments: new Set<string>(),
};

async function cleanup() {
  if (cleanupIds.payments.size) {
    await db.paymentTransaction.deleteMany({
      where: {
        id: {
          in: [...cleanupIds.payments],
        },
      },
    });
  }

  if (cleanupIds.users.size) {
    await db.notification.deleteMany({
      where: {
        userId: {
          in: [...cleanupIds.users],
        },
      },
    });
  }

  if (cleanupIds.memberships.size) {
    await db.userMembership.deleteMany({
      where: {
        id: {
          in: [...cleanupIds.memberships],
        },
      },
    });
  }

  if (cleanupIds.plans.size) {
    await db.membership.deleteMany({
      where: {
        id: {
          in: [...cleanupIds.plans],
        },
      },
    });
  }

  if (cleanupIds.users.size) {
    await db.user.deleteMany({
      where: {
        id: {
          in: [...cleanupIds.users],
        },
      },
    });
  }

  cleanupIds.users.clear();
  cleanupIds.memberships.clear();
  cleanupIds.plans.clear();
  cleanupIds.payments.clear();
}

async function createPlan(name: string) {
  const plan = await db.membership.create({
    data: {
      name,
      nameEn: name,
      kind: "subscription",
      duration: 30,
      price: 300,
      walletBonus: 0,
      features: "[]",
    },
  });

  cleanupIds.plans.add(plan.id);
  return plan;
}

async function createUser(stamp: string) {
  const user = await db.user.create({
    data: {
      name: `Membership Race ${stamp}`,
      phone: `+201${stamp.replace(/\D/g, "").slice(-9).padStart(9, "0")}`,
      gender: "female",
    },
  });

  cleanupIds.users.add(user.id);
  return user;
}

async function createPaidExpiredMembership(
  userId: string,
  planId: string,
  stamp: string,
) {
  const membership = await db.userMembership.create({
    data: {
      userId,
      membershipId: planId,
      status: "expired",
      activatedAt: new Date(Date.now() - 10 * 86400000),
      startDate: new Date(Date.now() - 10 * 86400000),
      endDate: new Date(Date.now() + 20 * 86400000),
      paymentAmount: 300,
      paymentMethod: "card",
    },
  });

  cleanupIds.memberships.add(membership.id);

  const payment = await db.paymentTransaction.create({
    data: {
      userId,
      membershipId: membership.id,
      purpose: "membership",
      businessUnit: "club",
      provider: "paymob",
      amount: 300,
      currency: "EGP",
      status: "paid",
      paymentMethod: "card",
      paidAt: new Date(),
      externalReference: `admin-recovery-old-${stamp}`,
    },
  });

  cleanupIds.payments.add(payment.id);

  return membership;
}

async function createPendingPaidReplacement(
  userId: string,
  planId: string,
  stamp: string,
) {
  const membership = await db.userMembership.create({
    data: {
      userId,
      membershipId: planId,
      status: "pending_payment",
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 86400000),
      pendingExpiresAt: new Date(Date.now() + 3600000),
      paymentAmount: 300,
      paymentMethod: "card",
      snapshotDurationDays: 30,
    },
  });

  cleanupIds.memberships.add(membership.id);

  const payment = await db.paymentTransaction.create({
    data: {
      userId,
      membershipId: membership.id,
      purpose: "membership",
      businessUnit: "club",
      provider: "paymob",
      amount: 300,
      currency: "EGP",
      status: "paid",
      paymentMethod: "card",
      paidAt: new Date(),
      externalReference: `admin-recovery-new-${stamp}`,
    },
  });

  cleanupIds.payments.add(payment.id);

  return {
    membership,
    payment,
  };
}

afterAll(async () => {
  await cleanup();
});

describe(
  "admin paid-membership recovery - real fitzone_test integration",
  { timeout: 90000 },
  () => {
    it("does not restore an expired paid plan while another plan is active", async () => {
      await cleanup();

      const stamp = `${Date.now()}1`;
      const user = await createUser(stamp);
      const oldPlan = await createPlan(`Recovery Old ${stamp}`);
      const replacementPlan = await createPlan(
        `Recovery Active ${stamp}`,
      );

      const oldMembership =
        await createPaidExpiredMembership(
          user.id,
          oldPlan.id,
          stamp,
        );

      const replacement = await db.userMembership.create({
        data: {
          userId: user.id,
          membershipId: replacementPlan.id,
          status: "active",
          activatedAt: new Date(),
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 86400000),
        },
      });

      cleanupIds.memberships.add(replacement.id);

      const result =
        await recoverPaidMembershipForAdmin({
          userId: user.id,
          planName: oldPlan.name,
        });

      expect(result).toBe(
        "blocked_by_active_membership",
      );

      const rows = await db.userMembership.findMany({
        where: {
          userId: user.id,
        },
        orderBy: {
          startDate: "asc",
        },
      });

      expect(
        rows.filter((row) => row.status === "active"),
      ).toHaveLength(1);

      expect(
        rows.find((row) => row.id === oldMembership.id)
          ?.status,
      ).toBe("expired");

      expect(
        rows.find((row) => row.id === replacement.id)
          ?.status,
      ).toBe("active");
    });

    it("concurrent admin recovery and successful payment finish with exactly one active membership", async () => {
      await cleanup();

      const stamp = `${Date.now()}2`;
      const user = await createUser(stamp);

      const oldPlan = await createPlan(
        `Recovery Race Old ${stamp}`,
      );

      const newPlan = await createPlan(
        `Recovery Race New ${stamp}`,
      );

      const oldMembership =
        await createPaidExpiredMembership(
          user.id,
          oldPlan.id,
          stamp,
        );

      const replacement =
        await createPendingPaidReplacement(
          user.id,
          newPlan.id,
          stamp,
        );

      const [adminResult, paymentResult] =
        await Promise.all([
          recoverPaidMembershipForAdmin({
            userId: user.id,
            planName: oldPlan.name,
          }),
          recoverPaidMembershipActivation(
            replacement.payment.id,
          ),
        ]);

      expect([
        "recovered",
        "blocked_by_active_membership",
      ]).toContain(adminResult);

      expect(paymentResult.status).toBe("paid");

      const memberships =
        await db.userMembership.findMany({
          where: {
            userId: user.id,
          },
        });

      const active = memberships.filter(
        (membership) =>
          membership.status === "active",
      );

      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(
        replacement.membership.id,
      );

      expect(
        memberships.find(
          (membership) =>
            membership.id === oldMembership.id,
        )?.status,
      ).toBe("expired");
    });
  },
);
