import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runPaidMembershipPostActivationReconciliation } from "@/lib/payments/reconciliation-helper";

describe(
  "Manager-Partner paid reconciliation",
  { timeout: 90000 },
  () => {
    it("uses actual PartnerCommission.amount and stays idempotent", async () => {
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      let customerId = "";
      let partnerUserId = "";
      let managerUserId = "";
      let managerId = "";
      let partnerId = "";
      let affiliateLinkId = "";
      let planId = "";
      let userMembershipId = "";
      let paymentId = "";
      let partnerCommissionId = "";

      try {
        // ------------------------------------------------------------
        // 1. Customer
        // ------------------------------------------------------------
        const customer = await db.user.create({
          data: {
            email: `mgr-partner-customer-${stamp}@fitzone.test`,
            name: "Manager Partner Customer",
            gender: "female",
          },
        });
        customerId = customer.id;

        // ------------------------------------------------------------
        // 2. Contracts manager
        // ------------------------------------------------------------
        const managerUser = await db.user.create({
          data: {
            email: `mgr-partner-manager-${stamp}@fitzone.test`,
            name: "Manager Partner Manager",
            role: "staff",
          },
        });
        managerUserId = managerUser.id;

        const manager = await db.contractsManager.create({
          data: {
            userId: managerUserId,
            name: "Manager Partner Integration Manager",
            commissionType: "percentage_of_agents",
            commissionRate: 0,
            isActive: true,
          },
        });
        managerId = manager.id;

        // ------------------------------------------------------------
        // 3. Partner: 10% of listed membership price
        //    Manager: 10% of actual PartnerCommission
        // ------------------------------------------------------------
        const partnerUser = await db.user.create({
          data: {
            email: `mgr-partner-partner-${stamp}@fitzone.test`,
            name: "Manager Partner Test Partner",
            role: "partner",
          },
        });
        partnerUserId = partnerUser.id;

        const partner = await db.partner.create({
          data: {
            userId: partnerUserId,
            name: "Manager Partner Integration Partner",
            category: "other",
            commissionRate: 10,
            commissionType: "percentage",
            isActive: true,
            managerId,
            managerCommissionType: "percentage_of_partner",
            managerCommissionRate: 10,
          },
        });
        partnerId = partner.id;

        const affiliate = await db.partnerAffiliateLink.create({
          data: {
            partnerId,
            token: `MGRPARTNER${stamp}`.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
            label: "Manager partner reconciliation integration test",
            isActive: true,
          },
        });
        affiliateLinkId = affiliate.id;

        // ------------------------------------------------------------
        // 4. Membership listed at 333 EGP
        //    Customer's net paid amount intentionally only 300 EGP.
        // ------------------------------------------------------------
        const plan = await db.membership.create({
          data: {
            name: "Manager Partner Integration Plan",
            nameEn: "Manager Partner Integration Plan",
            duration: 30,
            price: 333,
            sessionsCount: 0,
            walletBonus: 0,
            features: "[]",
          },
        });
        planId = plan.id;

        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + 30 * 86400000);

        const userMembership = await db.userMembership.create({
          data: {
            userId: customerId,
            membershipId: planId,
            status: "active",
            startDate,
            endDate,

            // IMPORTANT:
            // customer net paid amount is deliberately lower than listed price.
            paymentAmount: 300,
            paymentMethod: "card",

            partnerId,
            affiliateLinkId,
            snapshotOriginalPrice: 333,
            snapshotFinalPrice: 300,
          },
        });
        userMembershipId = userMembership.id;

        // ------------------------------------------------------------
        // 5. Existing ACTUAL PartnerCommission.
        //
        // Correct business rule:
        // listed price 333 × 10% = 33.30
        //
        // Old manager bug would recompute from customer paid 300:
        // 300 × 10% × 10% = 3.00  WRONG
        //
        // Correct manager:
        // 33.30 × 10% = 3.33
        // ------------------------------------------------------------
        const partnerCommission = await db.partnerCommission.create({
          data: {
            partnerId,
            userMembershipId,
            amount: 33.3,
            status: "pending",
          },
        });
        partnerCommissionId = partnerCommission.id;

        const payment = await db.paymentTransaction.create({
          data: {
            userId: customerId,
            membershipId: userMembershipId,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 300,
            currency: "EGP",
            status: "paid",
            paymentMethod: "card",
            paidAt: new Date(),
            externalReference: `mgr-partner-${stamp}`,
            metadata: JSON.stringify({}),
          },
        });
        paymentId = payment.id;

        const membershipData = {
          status: "active",
          startDate,
          offerId: null,
          membership: {
            name: plan.name,
            nameEn: plan.nameEn,
            duration: plan.duration,
            walletBonus: plan.walletBonus,
            productRewards: plan.productRewards,
          },
          offer: null,
        };

        // ------------------------------------------------------------
        // 6. First reconciliation
        // ------------------------------------------------------------
        await runPaidMembershipPostActivationReconciliation({
          transactionId: paymentId,
          userId: customerId,
          userMembershipId,
          membershipData,
          paymentAmount: 300,
          paymentMethod: "card",
          paidAt: payment.paidAt,
          transactionMetadata: null,
        });

        const managerCommission =
          await db.managerPartnerCommission.findUnique({
            where: {
              partnerCommissionId,
            },
          });

        expect(managerCommission).toBeTruthy();
        expect(managerCommission?.managerId).toBe(managerId);
        expect(managerCommission?.partnerCommissionId).toBe(
          partnerCommissionId,
        );
        expect(managerCommission?.userMembershipId).toBe(userMembershipId);

        // THE MAIN REGRESSION ASSERTION:
        expect(managerCommission?.amount).toBe(3.33);

        // Explicitly prove the historical wrong value was not used.
        expect(managerCommission?.amount).not.toBe(3);

        // Partner commission itself must remain unchanged.
        const partnerCommissionAfterFirst =
          await db.partnerCommission.findUnique({
            where: {
              id: partnerCommissionId,
            },
          });

        expect(partnerCommissionAfterFirst?.amount).toBe(33.3);
        expect(partnerCommissionAfterFirst?.partnerId).toBe(partnerId);

        // ------------------------------------------------------------
        // 7. Second reconciliation / webhook retry
        // ------------------------------------------------------------
        await runPaidMembershipPostActivationReconciliation({
          transactionId: paymentId,
          userId: customerId,
          userMembershipId,
          membershipData,
          paymentAmount: 300,
          paymentMethod: "card",
          paidAt: payment.paidAt,
          transactionMetadata: null,
        });

        expect(
          await db.managerPartnerCommission.count({
            where: {
              partnerCommissionId,
            },
          }),
        ).toBe(1);

        const managerCommissionAfterRetry =
          await db.managerPartnerCommission.findUnique({
            where: {
              partnerCommissionId,
            },
          });

        expect(managerCommissionAfterRetry?.amount).toBe(3.33);
        expect(managerCommissionAfterRetry?.managerId).toBe(managerId);

        // Partner financial history is still immutable.
        const partnerCommissionAfterRetry =
          await db.partnerCommission.findUnique({
            where: {
              id: partnerCommissionId,
            },
          });

        expect(partnerCommissionAfterRetry?.amount).toBe(33.3);
        expect(partnerCommissionAfterRetry?.partnerId).toBe(partnerId);

        // Reconciliation marker should also show exact-once completion.
        const paymentAfter = await db.paymentTransaction.findUnique({
          where: { id: paymentId },
          select: { metadata: true },
        });

        const paymentMetadata = JSON.parse(
          paymentAfter?.metadata ?? "{}",
        );

        expect(
          paymentMetadata.postActivationReconciliation?.completed,
        ).toBe(true);

        expect(
          paymentMetadata.postActivationReconciliation?.userMembershipId,
        ).toBe(userMembershipId);
      } finally {
        // ------------------------------------------------------------
        // Test-only cleanup — only records created by this test
        // ------------------------------------------------------------

        if (partnerCommissionId) {
          await db.managerPartnerCommission.deleteMany({
            where: { partnerCommissionId },
          });
        }

        if (paymentId) {
          await db.paymentTransaction.deleteMany({
            where: { id: paymentId },
          });
        }

        if (partnerCommissionId) {
          await db.partnerCommission.deleteMany({
            where: { id: partnerCommissionId },
          });
        }

        if (userMembershipId) {
          await db.notification.deleteMany({
            where: { userId: customerId },
          });

          await db.booking.deleteMany({
            where: { userMembershipId },
          });

          await db.userMembership.deleteMany({
            where: { id: userMembershipId },
          });
        }

        if (affiliateLinkId) {
          await db.partnerAffiliateLink.deleteMany({
            where: { id: affiliateLinkId },
          });
        }

        if (partnerId) {
          await db.partner.deleteMany({
            where: { id: partnerId },
          });
        }

        if (managerId) {
          await db.managerPartnerCommission.deleteMany({
            where: { managerId },
          });

          await db.contractsManager.deleteMany({
            where: { id: managerId },
          });
        }

        if (planId) {
          await db.membership.deleteMany({
            where: { id: planId },
          });
        }

        if (customerId) {
          await db.notification.deleteMany({
            where: { userId: customerId },
          });

          await db.user.deleteMany({
            where: { id: customerId },
          });
        }

        if (partnerUserId) {
          await db.user.deleteMany({
            where: { id: partnerUserId },
          });
        }

        if (managerUserId) {
          await db.user.deleteMany({
            where: { id: managerUserId },
          });
        }
      }
    });
  },
);
