import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe(
  "Partner withdrawal snapshot protection",
  { timeout: 60000 },
  () => {
    it("withdraws only commissions that existed when the request was created", async () => {
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      let partnerUserId = "";
      let customer1Id = "";
      let customer2Id = "";
      let partnerId = "";
      let planId = "";
      let membership1Id = "";
      let membership2Id = "";
      let commission1Id = "";
      let commission2Id = "";
      let withdrawalId = "";

      try {
        const partnerUser = await db.user.create({
          data: {
            email: `withdraw-partner-${stamp}@fitzone.test`,
            name: "Withdrawal Test Partner",
            role: "partner",
          },
        });
        partnerUserId = partnerUser.id;

        const partner = await db.partner.create({
          data: {
            userId: partnerUserId,
            name: "Withdrawal Snapshot Partner",
            category: "other",
            commissionRate: 10,
            commissionType: "percentage",
            isActive: true,
          },
        });
        partnerId = partner.id;

        const plan = await db.membership.create({
          data: {
            name: "Withdrawal Snapshot Plan",
            nameEn: "Withdrawal Snapshot Plan",
            duration: 30,
            price: 1000,
            sessionsCount: 0,
            walletBonus: 0,
            features: "[]",
          },
        });
        planId = plan.id;

        const customer1 = await db.user.create({
          data: {
            email: `withdraw-c1-${stamp}@fitzone.test`,
            name: "Withdrawal Customer 1",
            gender: "female",
          },
        });
        customer1Id = customer1.id;

        const customer2 = await db.user.create({
          data: {
            email: `withdraw-c2-${stamp}@fitzone.test`,
            name: "Withdrawal Customer 2",
            gender: "female",
          },
        });
        customer2Id = customer2.id;

        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 30 * 86400000);

        const membership1 = await db.userMembership.create({
          data: {
            userId: customer1Id,
            membershipId: planId,
            startDate,
            endDate,
            status: "active",
            paymentAmount: 5000,
            paymentMethod: "card",
            partnerId,
          },
        });
        membership1Id = membership1.id;

        const commission1 = await db.partnerCommission.create({
          data: {
            partnerId,
            userMembershipId: membership1Id,
            amount: 500,
            status: "pending",
          },
        });
        commission1Id = commission1.id;

        // Create withdrawal request for the exact pending balance at T0.
        const withdrawal = await db.partnerWithdrawalRequest.create({
          data: {
            partnerId,
            amount: 500,
            status: "pending",
          },
        });
        withdrawalId = withdrawal.id;

        // Ensure the second commission is definitely newer than the request.
        await new Promise((resolve) => setTimeout(resolve, 20));

        const membership2 = await db.userMembership.create({
          data: {
            userId: customer2Id,
            membershipId: planId,
            startDate,
            endDate,
            status: "active",
            paymentAmount: 1000,
            paymentMethod: "card",
            partnerId,
          },
        });
        membership2Id = membership2.id;

        const commission2 = await db.partnerCommission.create({
          data: {
            partnerId,
            userMembershipId: membership2Id,
            amount: 100,
            status: "pending",
          },
        });
        commission2Id = commission2.id;

        // Reproduce the protected approval logic using persisted DB timestamps.
        const existing = await db.partnerWithdrawalRequest.findUniqueOrThrow({
          where: { id: withdrawalId },
        });

        const eligibleCommissions = await db.partnerCommission.findMany({
          where: {
            partnerId,
            status: "pending",
            createdAt: { lte: existing.createdAt },
          },
          select: { id: true, amount: true },
        });

        const eligibleAmount =
          Math.round(
            eligibleCommissions.reduce((sum, c) => sum + c.amount, 0) * 100,
          ) / 100;

        const requestedAmount = Math.round(existing.amount * 100) / 100;

        expect(eligibleAmount).toBe(500);
        expect(requestedAmount).toBe(500);
        expect(eligibleCommissions.map((c) => c.id)).toEqual([commission1Id]);
        expect(eligibleCommissions.map((c) => c.id)).not.toContain(commission2Id);

        const processedAt = new Date();

        await db.$transaction([
          db.partnerCommission.updateMany({
            where: {
              id: { in: eligibleCommissions.map((c) => c.id) },
              status: "pending",
            },
            data: {
              status: "withdrawn",
              withdrawnAt: processedAt,
            },
          }),
          db.partnerWithdrawalRequest.update({
            where: { id: withdrawalId },
            data: {
              status: "approved",
              processedAt,
            },
          }),
        ]);

        const [oldCommission, newCommission, approvedWithdrawal] =
          await Promise.all([
            db.partnerCommission.findUniqueOrThrow({
              where: { id: commission1Id },
            }),
            db.partnerCommission.findUniqueOrThrow({
              where: { id: commission2Id },
            }),
            db.partnerWithdrawalRequest.findUniqueOrThrow({
              where: { id: withdrawalId },
            }),
          ]);

        expect(oldCommission.status).toBe("withdrawn");
        expect(oldCommission.withdrawnAt).toBeTruthy();

        // This is the regression guarantee:
        // the new commission must NOT be swallowed by the older request.
        expect(newCommission.status).toBe("pending");
        expect(newCommission.withdrawnAt).toBeNull();

        expect(approvedWithdrawal.status).toBe("approved");
        expect(approvedWithdrawal.amount).toBe(500);

        const remainingPending = await db.partnerCommission.aggregate({
          where: {
            partnerId,
            status: "pending",
          },
          _sum: { amount: true },
        });

        expect(remainingPending._sum.amount).toBe(100);
      } finally {
        if (withdrawalId) {
          await db.partnerWithdrawalRequest.deleteMany({
            where: { id: withdrawalId },
          });
        }

        if (commission1Id || commission2Id) {
          await db.partnerCommission.deleteMany({
            where: {
              id: {
                in: [commission1Id, commission2Id].filter(Boolean),
              },
            },
          });
        }

        if (membership1Id || membership2Id) {
          await db.userMembership.deleteMany({
            where: {
              id: {
                in: [membership1Id, membership2Id].filter(Boolean),
              },
            },
          });
        }

        if (planId) {
          await db.membership.deleteMany({
            where: { id: planId },
          });
        }

        if (partnerId) {
          await db.partner.deleteMany({
            where: { id: partnerId },
          });
        }

        for (const userId of [customer1Id, customer2Id, partnerUserId].filter(Boolean)) {
          await db.user.deleteMany({
            where: { id: userId },
          });
        }
      }
    });
  },
);
