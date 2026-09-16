import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyMembershipBookingPlanTx } from "@/lib/payments/membership-booking-plan";

describe(
  "ClassType ID frozen booking contract recovery",
  { timeout: 90000 },
  () => {
    let userId = "";
    let trainerId = "";
    let membershipId = "";
    let offerId = "";
    let classId = "";
    let scheduleId = "";
    let userMembershipId = "";

    afterAll(async () => {
      if (userMembershipId) {
        await db.booking.deleteMany({
          where: { userMembershipId },
        });

        await db.userMembership.deleteMany({
          where: { id: userMembershipId },
        });
      }

      if (offerId) {
        await db.offerAllowedClassType.deleteMany({
          where: { offerId },
        });

        await db.offerAllowedClass.deleteMany({
          where: { offerId },
        });

        await db.offer.deleteMany({
          where: { id: offerId },
        });
      }

      if (scheduleId) {
        await db.schedule.deleteMany({
          where: { id: scheduleId },
        });
      }

      if (classId) {
        await db.class.deleteMany({
          where: { id: classId },
        });
      }

      if (trainerId) {
        await db.trainer.deleteMany({
          where: { id: trainerId },
        });
      }

      if (membershipId) {
        await db.membership.deleteMany({
          where: { id: membershipId },
        });
      }

      if (userId) {
        await db.user.deleteMany({
          where: { id: userId },
        });
      }
    });

    it("keeps purchase-time class_ids entitlement after offer configuration changes", async () => {
      const fitnessType = await db.classType.findUniqueOrThrow({
        where: { key: "fitness" },
        select: {
          id: true,
          nameAr: true,
        },
      });

      const kickboxingType = await db.classType.findUniqueOrThrow({
        where: { key: "kickboxing" },
        select: {
          id: true,
          nameAr: true,
        },
      });

      const user = await db.user.create({
        data: {
          name: "Frozen ClassType Recovery Test",
          phone: `+201${Math.floor(Math.random() * 1_000_000_000)}`,
          gender: "female",
        },
      });
      userId = user.id;

      const trainer = await db.trainer.create({
        data: {
          name: "Frozen ClassType Recovery Trainer",
          specialty: "fitness",
          bio: "integration test",
        },
      });
      trainerId = trainer.id;

      const membership = await db.membership.create({
        data: {
          name: "Frozen ClassType Recovery Membership",
          nameEn: "Frozen ClassType Recovery Membership",
          duration: 30,
          price: 100,
          sessionsCount: 1,
          walletBonus: 0,
          features: "[]",
        },
      });
      membershipId = membership.id;

      const gymClass = await db.class.create({
        data: {
          name: "Frozen Fitness Class",
          trainerId,
          type: fitnessType.nameAr,
          classTypeId: fitnessType.id,
          duration: 60,
          intensity: "medium",
          maxSpots: 10,
          price: 100,
          isActive: true,
        },
      });
      classId = gymClass.id;

      const scheduleDate = new Date();
      scheduleDate.setUTCDate(scheduleDate.getUTCDate() + 2);
      scheduleDate.setUTCHours(0, 0, 0, 0);

      const schedule = await db.schedule.create({
        data: {
          classId,
          date: scheduleDate,
          time: "16:00",
          availableSpots: 10,
          isActive: true,
        },
      });
      scheduleId = schedule.id;

      const expiresAt = new Date();
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 60);

      const offer = await db.offer.create({
        data: {
          title: "Frozen ClassType Recovery Offer",
          type: "special",
          discount: 0,
          specialPrice: 100,
          membershipId,
          sessionsCount: 1,
          durationDays: 30,
          expiresAt,
          isActive: true,
          maxSubscribers: 100,
          currentSubscribers: 0,
          allowedClasses: {
            create: [
              {
                classId,
              },
            ],
          },
          // Keep the legacy row too so the test proves exact Class IDs win.
          allowedClassTypes: {
            create: [
              {
                classType: fitnessType.nameAr,
                classTypeId: fitnessType.id,
              },
            ],
          },
        },
      });
      offerId = offer.id;

      const membershipStart = new Date();
      membershipStart.setTime(membershipStart.getTime() - 60 * 60 * 1000);

      const membershipEnd = new Date(membershipStart);
      membershipEnd.setUTCDate(membershipEnd.getUTCDate() + 30);

      const userMembership = await db.userMembership.create({
        data: {
          userId,
          membershipId,
          offerId,
          status: "active",
          paymentAmount: 100,
          totalSessions: 1,
          snapshotDurationDays: 30,
          startDate: membershipStart,
          endDate: membershipEnd,
        },
      });
      userMembershipId = userMembership.id;

      /*
       * First successful purchase validation freezes entitlement.
       */
      const first = await db.$transaction(async (tx) =>
        applyMembershipBookingPlanTx({
          tx,
          userId,
          userMembershipId,
          startDate: membershipStart,
          endDate: membershipEnd,
          source: {
            type: "offer",
            id: offerId,
          },
          selectedScheduleIds: [scheduleId],
          plan: {
            kind: "standard",
            sessionsCount: 1,
            duration: 30,
          },
        }),
      );

      expect(first.createdCount).toBe(1);

      const frozen = await db.userMembership.findUniqueOrThrow({
        where: { id: userMembershipId },
        select: { bookingPatternSnapshot: true },
      });

      expect(frozen.bookingPatternSnapshot).toBeTruthy();

      const contract = JSON.parse(frozen.bookingPatternSnapshot!) as {
        eligibility?: {
          mode?: string;
          classIds?: string[];
        };
      };

      expect(contract.eligibility?.mode).toBe("class_ids");
      expect(contract.eligibility?.classIds).toEqual([classId]);

      const frozenBeforeConfigChange =
        frozen.bookingPatternSnapshot!;

      /*
       * Simulate an admin changing the LIVE offer AFTER purchase:
       * Fitness removed, Kickboxing becomes the newly allowed type.
       */
      await db.offerAllowedClass.deleteMany({
        where: { offerId },
      });

      await db.offerAllowedClassType.deleteMany({
        where: { offerId },
      });

      await db.offerAllowedClassType.create({
        data: {
          offerId,
          classType: kickboxingType.nameAr,
          classTypeId: kickboxingType.id,
        },
      });

      /*
       * Recovery/retry must use the immutable purchase contract,
       * not the newly changed live OfferAllowedClassType rows.
       *
       * selectedScheduleIds deliberately empty:
       * contract-first recovery must not need purchase seed IDs.
       *
       * plan values deliberately wrong:
       * frozen purchase policy remains authoritative.
       */
      const retry = await db.$transaction(async (tx) =>
        applyMembershipBookingPlanTx({
          tx,
          userId,
          userMembershipId,
          startDate: membershipStart,
          endDate: membershipEnd,
          source: {
            type: "offer",
            id: offerId,
          },
          selectedScheduleIds: [],
          plan: {
            kind: "standard",
            sessionsCount: 999,
            duration: 1,
          },
        }),
      );

      expect(retry.createdCount).toBe(0);

      expect(
        await db.booking.count({
          where: {
            userMembershipId,
            scheduleId,
          },
        }),
      ).toBe(1);

      const afterRetry = await db.userMembership.findUniqueOrThrow({
        where: { id: userMembershipId },
        select: { bookingPatternSnapshot: true },
      });

      /*
       * Absolutely no rewrite/recalculation of the purchase snapshot.
       */
      expect(afterRetry.bookingPatternSnapshot).toBe(
        frozenBeforeConfigChange,
      );

      const afterContract = JSON.parse(
        afterRetry.bookingPatternSnapshot!,
      ) as {
        eligibility?: {
          mode?: string;
          classIds?: string[];
        };
      };

      expect(afterContract.eligibility?.mode).toBe("class_ids");
      expect(afterContract.eligibility?.classIds).toEqual([classId]);
    });
  },
);
