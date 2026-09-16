import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, asDbTransactionClient } from "@/lib/db";
import { resolveStaffReferralPolicyTx } from "@/lib/commissions/staff-referral-policy";
import { buildMembershipCommissionSnapshotTx } from "@/lib/commissions/membership-commission-snapshot-builder";
import { parseMembershipCommissionSnapshot } from "@/lib/commissions/membership-commission-contract";

describe(
  "staff referral policy engine",
  { timeout: 120000 },
  () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const asOfDate = new Date("2026-09-10T12:00:00.000Z");

    let staffUserId = "";
    let customerUserId = "";
    let positionId = "";
    let employeeId = "";
    let policyId = "";
    let staffReferralLinkId = "";
    let membershipPlanId = "";

    const createdMembershipIds: string[] = [];
    const createdPaymentIds: string[] = [];
    const createdAttendancePassIds: string[] = [];
    const createdBookingIds: string[] = [];
    const createdScheduleIds: string[] = [];
    const createdClassIds: string[] = [];
    const createdTrainerIds: string[] = [];

    function testDbGuard() {
      const url = new URL(process.env.DATABASE_URL ?? "");

      if (
        process.env.APP_ENV !== "test" ||
        url.pathname.replace(/^\//, "") !== "fitzone_test"
      ) {
        throw new Error("REFUSING: fitzone_test required");
      }
    }

    async function createHistoricalMembership(input: {
      endDate: Date;
      status?: string;
      activatedAt?: Date | null;
      evidence?:
        | "none"
        | "paid"
        | "attendance_pass"
        | "attended_booking";
    }) {
      const startDate = new Date(
        input.endDate.getTime() - 30 * 86400000,
      );

      const membership = await db.userMembership.create({
        data: {
          userId: customerUserId,
          membershipId: membershipPlanId,
          startDate,
          endDate: input.endDate,
          status: input.status ?? "cancelled",
          activatedAt: input.activatedAt ?? null,
          paymentAmount: 500,
        },
      });

      createdMembershipIds.push(membership.id);

      if (input.evidence === "paid") {
        const payment = await db.paymentTransaction.create({
          data: {
            userId: customerUserId,
            membershipId: membership.id,
            purpose: "membership",
            businessUnit: "club",
            provider: "paymob",
            amount: 500,
            currency: "EGP",
            status: "paid",
            paidAt: new Date(),
          },
        });

        createdPaymentIds.push(payment.id);
      }

      if (input.evidence === "attendance_pass") {
        const pass = await db.attendancePass.create({
          data: {
            userId: customerUserId,
            userMembershipId: membership.id,
            code: `REFPASS-${suffix}-${createdAttendancePassIds.length}`,
            kind: "membership",
          },
        });

        createdAttendancePassIds.push(pass.id);
      }

      if (input.evidence === "attended_booking") {
        const trainer = await db.trainer.create({
          data: {
            name: `Referral Test Trainer ${suffix}`,
            specialty: "fitness",
            bio: "referral policy test",
          },
        });

        createdTrainerIds.push(trainer.id);

        const classRow = await db.class.create({
          data: {
            name: `Referral Test Class ${suffix}`,
            trainerId: trainer.id,
            type: "fitness",
            duration: 60,
            intensity: "medium",
            maxSpots: 10,
            price: 100,
          },
        });

        createdClassIds.push(classRow.id);

        const schedule = await db.schedule.create({
          data: {
            classId: classRow.id,
            date: new Date("2026-08-01T10:00:00.000Z"),
            time: "10:00",
            availableSpots: 9,
            isActive: true,
          },
        });

        createdScheduleIds.push(schedule.id);

        const booking = await db.booking.create({
          data: {
            userId: customerUserId,
            scheduleId: schedule.id,
            userMembershipId: membership.id,
            status: "attended",
            paidAmount: 0,
            entitlementUnits: 1,
          },
        });

        createdBookingIds.push(booking.id);
      }

      return membership;
    }

    beforeAll(async () => {
      testDbGuard();

      const position = await db.position.create({
        data: {
          code: `REFPOS-${suffix}`,
          name: `Referral Position ${suffix}`,
          nameEn: `Referral Position ${suffix}`,
          isActive: true,
        },
      });

      positionId = position.id;

      const staff = await db.user.create({
        data: {
          email: `referral-staff-${suffix}@example.test`,
          name: "Referral Staff",
          role: "staff",

          // Deliberately different from policy.
          commissionRate: 99,
          commissionType: "percentage",
        },
      });

      staffUserId = staff.id;

      const employee = await db.employeeProfile.create({
        data: {
          userId: staffUserId,
          employeeCode: `REFEMP-${suffix}`,
          name: "Referral Staff",
          positionId,
          employmentStatus: "active",
        },
      });

      employeeId = employee.id;

      const customer = await db.user.create({
        data: {
          email: `referral-customer-${suffix}@example.test`,
          name: "Referral Customer",
        },
      });

      customerUserId = customer.id;

      const link = await db.staffReferralLink.create({
        data: {
          userId: staffUserId,
          token: `REF-${suffix}`.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
          label: "Referral policy test",
          isActive: true,
        },
      });

      staffReferralLinkId = link.id;

      const plan = await db.membership.create({
        data: {
          name: `Referral Plan ${suffix}`,
          nameEn: `Referral Plan ${suffix}`,
          kind: "subscription",
          duration: 30,
          price: 1000,
          priceAfter: 1000,
          sessionsCount: 0,
          walletBonus: 0,
          features: "[]",
          isActive: true,
        },
      });

      membershipPlanId = plan.id;

      const policy = await db.referralCommissionPolicy.create({
        data: {
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          minimumShortTermGapDays: 15,
          shortTermMaxMonths: 3,

          // <15 days => 0%
          underMinimumGapBps: 0,

          // 15-90 days => 2.5%
          shortTermBps: 250,

          isActive: true,

          rates: {
            create: {
              positionId,

              // New customer => 5%
              newCustomerBps: 500,

              // >90 days => 6%
              longTermBps: 600,
            },
          },
        },
      });

      policyId = policy.id;
    });

    afterAll(async () => {
      testDbGuard();

      await db.staffCommission.deleteMany({
        where: { staffUserId },
      });

      if (createdBookingIds.length) {
        await db.booking.deleteMany({
          where: { id: { in: createdBookingIds } },
        });
      }

      if (createdScheduleIds.length) {
        await db.schedule.deleteMany({
          where: { id: { in: createdScheduleIds } },
        });
      }

      if (createdClassIds.length) {
        await db.class.deleteMany({
          where: { id: { in: createdClassIds } },
        });
      }

      if (createdTrainerIds.length) {
        await db.trainer.deleteMany({
          where: { id: { in: createdTrainerIds } },
        });
      }

      if (createdAttendancePassIds.length) {
        await db.attendancePass.deleteMany({
          where: { id: { in: createdAttendancePassIds } },
        });
      }

      if (createdPaymentIds.length) {
        await db.paymentTransaction.deleteMany({
          where: { id: { in: createdPaymentIds } },
        });
      }

      if (createdMembershipIds.length) {
        await db.userMembership.deleteMany({
          where: { id: { in: createdMembershipIds } },
        });
      }

      if (policyId) {
        await db.referralCommissionPolicyRate.deleteMany({
          where: { policyId },
        });

        await db.referralCommissionPolicy.deleteMany({
          where: { id: policyId },
        });
      }

      if (staffReferralLinkId) {
        await db.staffReferralLink.deleteMany({
          where: { id: staffReferralLinkId },
        });
      }

      if (employeeId) {
        await db.employeeProfile.deleteMany({
          where: { id: employeeId },
        });
      }

      if (membershipPlanId) {
        await db.membership.deleteMany({
          where: { id: membershipPlanId },
        });
      }

      if (customerUserId || staffUserId) {
        await db.user.deleteMany({
          where: {
            id: {
              in: [customerUserId, staffUserId].filter(Boolean),
            },
          },
        });
      }

      if (positionId) {
        await db.position.deleteMany({
          where: { id: positionId },
        });
      }
    });

    it("classifies a customer with no real membership as new_customer", async () => {
      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe("new_customer");
      expect(result.previousMembershipId).toBeNull();
      expect(result.previousMembershipEndDate).toBeNull();
      expect(result.gapDays).toBeNull();
      expect(result.policyId).toBe(policyId);
      expect(result.positionId).toBe(positionId);
      expect(result.rateBps).toBe(500);
    });

    it("ignores an unpaid cancelled checkout as customer history", async () => {
      const old = await createHistoricalMembership({
        endDate: new Date("2026-09-05T00:00:00.000Z"),
        status: "cancelled",
        evidence: "none",
      });

      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe("new_customer");
      expect(result.previousMembershipId).toBeNull();

      await db.userMembership.delete({ where: { id: old.id } });
      createdMembershipIds.splice(
        createdMembershipIds.indexOf(old.id),
        1,
      );
    });

    it("classifies gap below minimum as short_term_under_minimum with 0%", async () => {
      const old = await createHistoricalMembership({
        endDate: new Date("2026-09-05T00:00:00.000Z"),
        status: "active",
      });

      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe(
        "short_term_under_minimum",
      );
      expect(result.previousMembershipId).toBe(old.id);
      expect(result.gapDays).toBe(5);
      expect(result.rateBps).toBe(0);

      await db.userMembership.delete({ where: { id: old.id } });
      createdMembershipIds.splice(
        createdMembershipIds.indexOf(old.id),
        1,
      );
    });

    it("classifies 15-90 day gap as short_term", async () => {
      const old = await createHistoricalMembership({
        endDate: new Date("2026-08-20T00:00:00.000Z"),
        status: "active",
      });

      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe("short_term");
      expect(result.previousMembershipId).toBe(old.id);
      expect(result.gapDays).toBe(21);
      expect(result.rateBps).toBe(250);

      await db.userMembership.delete({ where: { id: old.id } });
      createdMembershipIds.splice(
        createdMembershipIds.indexOf(old.id),
        1,
      );
    });

    it("classifies gap above maximum as long_term", async () => {
      const old = await createHistoricalMembership({
        endDate: new Date("2026-05-01T00:00:00.000Z"),
        status: "active",
      });

      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe("long_term");
      expect(result.previousMembershipId).toBe(old.id);
      expect(result.gapDays).toBe(132);
      expect(result.rateBps).toBe(600);

      await db.userMembership.delete({ where: { id: old.id } });
      createdMembershipIds.splice(
        createdMembershipIds.indexOf(old.id),
        1,
      );
    });

    it.each([
      ["paid", "paid"],
      ["attendance pass", "attendance_pass"],
      ["attended booking", "attended_booking"],
    ] as const)(
      "treats %s evidence as a real previous membership",
      async (_label, evidence) => {
        const old = await createHistoricalMembership({
          endDate: new Date("2026-08-20T00:00:00.000Z"),
          status: "cancelled",
          evidence,
        });

        const result = await db.$transaction((tx) =>
          resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
            customerUserId,
            staffUserId,
            asOfDate,
          }),
        );

        expect(result.classification).toBe("short_term");
        expect(result.previousMembershipId).toBe(old.id);
        expect(result.gapDays).toBe(21);

        await db.booking.deleteMany({
          where: { userMembershipId: old.id },
        });

        await db.attendancePass.deleteMany({
          where: { userMembershipId: old.id },
        });

        await db.paymentTransaction.deleteMany({
          where: { membershipId: old.id },
        });

        await db.userMembership.delete({
          where: { id: old.id },
        });

        createdMembershipIds.splice(
          createdMembershipIds.indexOf(old.id),
          1,
        );
      },
    );

    it("treats activatedAt as real historical activation evidence", async () => {
      const old = await createHistoricalMembership({
        endDate: new Date("2026-08-20T00:00:00.000Z"),
        status: "cancelled",
        activatedAt: new Date("2026-07-20T00:00:00.000Z"),
      });

      const result = await db.$transaction((tx) =>
        resolveStaffReferralPolicyTx(asDbTransactionClient(tx), {
          customerUserId,
          staffUserId,
          asOfDate,
        }),
      );

      expect(result.classification).toBe("short_term");
      expect(result.previousMembershipId).toBe(old.id);
      expect(result.gapDays).toBe(21);

      await db.userMembership.delete({
        where: { id: old.id },
      });

      createdMembershipIds.splice(
        createdMembershipIds.indexOf(old.id),
        1,
      );
    });

    it("freezes policy classification and rate inside purchase snapshot", async () => {
      const raw = await db.$transaction((tx) =>
        buildMembershipCommissionSnapshotTx(
          asDbTransactionClient(tx),
          {
            staffReferralLinkId,
            customerUserId,
            staffReferralAsOfDate: asOfDate,
            partnerCommissionBase: 1000,
            customerPaidAmount: 1000,
          },
        ),
      );

      const snapshot =
        parseMembershipCommissionSnapshot(raw);

      expect(snapshot.staff).toBeDefined();
      expect(snapshot.staff?.staffUserId).toBe(staffUserId);

      expect(snapshot.staff?.terms).toEqual({
        type: "percentage",
        rate: 5,
        baseAmount: 1000,
      });

      expect(snapshot.staff?.policy).toMatchObject({
        classification: "new_customer",
        previousMembershipId: null,
        previousMembershipEndDate: null,
        gapDays: null,
        policyId,
        positionId,
        rateBps: 500,
      });

      // Changing legacy User.commissionRate must not alter frozen policy snapshot.
      await db.user.update({
        where: { id: staffUserId },
        data: {
          commissionRate: 1,
          commissionType: "fixed",
        },
      });

      const parsedAgain =
        parseMembershipCommissionSnapshot(raw);

      expect(parsedAgain.staff?.terms).toEqual({
        type: "percentage",
        rate: 5,
        baseAmount: 1000,
      });
    });
  },
);
