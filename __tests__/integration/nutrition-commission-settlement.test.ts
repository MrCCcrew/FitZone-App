import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe(
  "Nutrition commission settlement",
  { timeout: 60000 },
  () => {
    it("settles earned commission once and preserves settledAt on retry", async () => {
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

      let nutritionistUserId = "";
      let commissionId = "";

      try {
        const nutritionist = await db.user.create({
          data: {
            email: `nutrition-settle-${stamp}@fitzone.test`,
            name: "Nutrition Settlement Test",
            role: "nutritionist",
          },
        });

        nutritionistUserId = nutritionist.id;

        const commission = await db.nutritionCommission.create({
          data: {
            nutritionistUserId,
            amount: 125.5,
            status: "earned",
          },
        });

        commissionId = commission.id;

        const firstSettledAt = new Date();

        const first = await db.nutritionCommission.updateMany({
          where: {
            nutritionistUserId,
            status: "earned",
            id: { in: [commissionId] },
          },
          data: {
            status: "settled",
            settledAt: firstSettledAt,
          },
        });

        expect(first.count).toBe(1);

        const afterFirst =
          await db.nutritionCommission.findUniqueOrThrow({
            where: { id: commissionId },
          });

        expect(afterFirst.status).toBe("settled");
        expect(afterFirst.settledAt?.getTime()).toBe(
          firstSettledAt.getTime(),
        );

        await new Promise((resolve) => setTimeout(resolve, 25));

        const retryAttemptAt = new Date();

        const second = await db.nutritionCommission.updateMany({
          where: {
            nutritionistUserId,
            status: "earned",
            id: { in: [commissionId] },
          },
          data: {
            status: "settled",
            settledAt: retryAttemptAt,
          },
        });

        expect(second.count).toBe(0);

        const afterSecond =
          await db.nutritionCommission.findUniqueOrThrow({
            where: { id: commissionId },
          });

        expect(afterSecond.status).toBe("settled");

        // Critical regression guarantee:
        // retry must not rewrite settlement timestamp.
        expect(afterSecond.settledAt?.getTime()).toBe(
          firstSettledAt.getTime(),
        );

        expect(afterSecond.settledAt?.getTime()).not.toBe(
          retryAttemptAt.getTime(),
        );

        expect(afterSecond.amount).toBe(125.5);
        expect(afterSecond.nutritionistUserId).toBe(
          nutritionistUserId,
        );
      } finally {
        if (commissionId) {
          await db.nutritionCommission.deleteMany({
            where: { id: commissionId },
          });
        }

        if (nutritionistUserId) {
          await db.user.deleteMany({
            where: { id: nutritionistUserId },
          });
        }
      }
    });
  },
);
