import { describe, expect, it } from "vitest";
import { db, asDbTransactionClient } from "@/lib/db";
import {
  applyMembershipSessionCarryoverTx,
  supersedeOrdinarySubscriptionsTx,
} from "@/lib/membership-session-carryover";

function assertSandbox() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value || value !== process.env.DATABASE_URL) {
    throw new Error("EXACT_TEST_DATABASE_REQUIRED");
  }

  const url = new URL(value);
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.APP_ENV !== "test" ||
    url.protocol !== "mysql:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== "3306" ||
    decodeURIComponent(url.username) !== "fitzone_test_user" ||
    url.pathname !== "/fitzone_test"
  ) {
    throw new Error("REFUSING_NON_TEST_DATABASE");
  }
}

assertSandbox();

const DAY = 86400000;

describe("commercial purchase lifecycle isolation", () => {
  const scenarios = [
    "package",
    "offer",
    "package-renewal",
    "subscription-renewal",
  ] as const;

  for (const scenario of scenarios) {
    it(`preserves unrelated rights during ${scenario}`, async () => {
      const rollback = new Error("EXPECTED_FIXTURE_ROLLBACK");
      let reachedAssertions = false;

      try {
        await db.$transaction(async (rawTx) => {
          const tx = asDbTransactionClient(rawTx);

          const stamp = `${Date.now()}-${Math.random()
            .toString(36).slice(2)}`;

          const startDate = new Date(Date.now() - DAY);
          const endDate = new Date(Date.now() + 30 * DAY);

          const user = await tx.user.create({
            data: {
              name: "Commercial isolation test",
              email: `commercial-${stamp}@test.local`,
              role: "member",
              isActive: true,
            },
          });

          await tx.$queryRaw`
            SELECT id
            FROM User
            WHERE id = ${user.id}
            FOR UPDATE
          `;

          const regularPlan = await tx.membership.create({
            data: {
              name: `Regular-${stamp}`,
              kind: "subscription",
              price: 1200,
              duration: 30,
              sessionsCount: 12,
              features: "[]",
              isActive: true,
            },
          });

          const packagePlan = await tx.membership.create({
            data: {
              name: `Package-${stamp}`,
              kind: "package",
              price: 600,
              duration: 30,
              sessionsCount: 6,
              features: "[]",
              isActive: true,
            },
          });

          const offer = await tx.offer.create({
            data: {
              title: `Offer-${stamp}`,
              discount: 10,
              membershipId: regularPlan.id,
              expiresAt: endDate,
              isActive: true,
            },
          });

          async function createRight(
            membershipId: string,
            totalSessions: number,
            offerId: string | null = null,
          ) {
            return tx.userMembership.create({
              data: {
                userId: user.id,
                membershipId,
                offerId,
                status: "active",
                startDate,
                endDate,
                activatedAt: new Date(),
                paymentAmount: 600,
                paymentMethod: "cash",
                totalSessions,
                baseSessions: totalSessions,
                eligibilitySnapshot: null,
                allowedClassTypesSnapshot: null,
              },
            });
          }

          const oldSubscription = await createRight(
            regularPlan.id,
            12,
          );

          const oldPackage = await createRight(
            packagePlan.id,
            6,
          );

          const oldOffer = await createRight(
            regularPlan.id,
            8,
            offer.id,
          );

          const trainer = await tx.trainer.create({
            data: {
              name: `Trainer-${stamp}`,
              specialty: "fitness",
              isActive: true,
            },
          });

          const gymClass = await tx.class.create({
            data: {
              name: `Class-${stamp}`,
              trainerId: trainer.id,
              type: "fitness",
              duration: 60,
              intensity: "medium",
              maxSpots: 10,
              price: 100,
              isActive: true,
            },
          });

          const schedule = await tx.schedule.create({
            data: {
              classId: gymClass.id,
              date: new Date(Date.now() + 3 * DAY),
              time: "10:00",
              availableSpots: 9,
              isActive: true,
            },
          });

          const oldPackageBooking = await tx.booking.create({
            data: {
              userId: user.id,
              userMembershipId: oldPackage.id,
              scheduleId: schedule.id,
              status: "confirmed",
              paidAmount: 0,
              paymentMethod: "membership",
              entitlementUnits: 1,
              isMakeup: false,
            },
          });

          const targetIsPackage =
            scenario === "package" ||
            scenario === "package-renewal";

          const targetOfferId =
            scenario === "offer" ? offer.id : null;

          const target = await createRight(
            targetIsPackage
              ? packagePlan.id
              : regularPlan.id,
            targetIsPackage ? 6 : 12,
            targetOfferId,
          );

          const beforePackage =
            await tx.userMembership.findUniqueOrThrow({
              where: { id: oldPackage.id },
            });

          const beforeOffer =
            await tx.userMembership.findUniqueOrThrow({
              where: { id: oldOffer.id },
            });

          const beforeSubscription =
            await tx.userMembership.findUniqueOrThrow({
              where: { id: oldSubscription.id },
            });

          const carryover =
            await applyMembershipSessionCarryoverTx(tx, {
              userId: user.id,
              targetMembershipId: target.id,
            });

          const expired =
            await supersedeOrdinarySubscriptionsTx(tx, {
              userId: user.id,
              targetMembershipId: target.id,
              targetKind: targetIsPackage
                ? "package"
                : "subscription",
              targetOfferId,
            });

          const renewed =
            await tx.userMembership.findUniqueOrThrow({
              where: { id: target.id },
            });

          if (scenario === "subscription-renewal") {
            expect(carryover.reason).toBe("applied");

            expect(carryover.sourceMembershipId).toBe(
              oldSubscription.id,
            );

            expect(carryover.carryoverSessions).toBe(12);
            expect(renewed.totalSessions).toBe(24);
            expect(expired).toBe(1);

            expect(
              await tx.userMembership.findUniqueOrThrow({
                where: { id: oldSubscription.id },
              }),
            ).toMatchObject({
              status: "expired",
            });

            const retry =
              await applyMembershipSessionCarryoverTx(tx, {
                userId: user.id,
                targetMembershipId: target.id,
              });

            expect(retry.reason).toBe("already_applied");
            expect(retry.expectedTotalSessions).toBe(24);
          } else {
            expect(carryover.reason).toBe("no_source");
            expect(carryover.carryoverSessions).toBe(0);
            expect(renewed.totalSessions).toBe(
              targetIsPackage ? 6 : 12,
            );
            expect(expired).toBe(0);

            expect(
              await tx.userMembership.findUniqueOrThrow({
                where: { id: oldSubscription.id },
              }),
            ).toEqual(beforeSubscription);
          }

          expect(renewed.status).toBe("active");

          expect(
            await tx.userMembership.findUniqueOrThrow({
              where: { id: oldPackage.id },
            }),
          ).toEqual(beforePackage);

          expect(
            await tx.userMembership.findUniqueOrThrow({
              where: { id: oldOffer.id },
            }),
          ).toEqual(beforeOffer);

          expect(
            await tx.booking.findUniqueOrThrow({
              where: { id: oldPackageBooking.id },
            }),
          ).toEqual(oldPackageBooking);

          expect(
            await tx.schedule.findUniqueOrThrow({
              where: { id: schedule.id },
            }),
          ).toEqual(schedule);

          expect(
            await supersedeOrdinarySubscriptionsTx(tx, {
              userId: user.id,
              targetMembershipId: target.id,
              targetKind: targetIsPackage
                ? "package"
                : "subscription",
              targetOfferId,
            }),
          ).toBe(0);

          reachedAssertions = true;

          // Roll back every fixture and mutation.
          throw rollback;
        }, { timeout: 30000 });

        throw new Error("FIXTURE_TRANSACTION_MUST_ROLL_BACK");
      } catch (error) {
        if (error !== rollback || !reachedAssertions) {
          throw error;
        }
      }

      expect(reachedAssertions).toBe(true);
    }, 30000);
  }
});