import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getEligibleClassesForSource, isClassAllowedForSource } from "@/lib/get-eligible-classes";

const db = new PrismaClient();

describe("Offer Class Selection - Special vs Regular", () => {
  let specialOfferId: string;
  let regularOfferId: string;
  let fitnessClass1: { id: string };
  let fitnessClass2: { id: string };
  let kickboxingClass: { id: string };
  let zumbaClass: { id: string };
  let trainerId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        name: "Offer Test User",
        email: `offer-test-${Date.now()}@test.com`,
        phone: "01000000088",
        password: "hashed",
        role: "customer",
      },
    });
    userId = user.id;

    const trainer = await db.trainer.create({
      data: {
        userId: userId,
        name: "Test Trainer",
        specialty: "All",
        bio: "Test",
        isActive: true,
      },
    });
    trainerId = trainer.id;

    fitnessClass1 = await db.class.create({
      data: {
        name: "Fitness Class 1",
        trainerId,
        type: "fitness",
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });

    fitnessClass2 = await db.class.create({
      data: {
        name: "Fitness Class 2",
        trainerId,
        type: "fitness",
        duration: 45,
        intensity: "high",
        maxSpots: 8,
        price: 80,
        isActive: true,
      },
    });

    kickboxingClass = await db.class.create({
      data: {
        name: "Kickboxing Class",
        trainerId,
        type: "kickboxing",
        duration: 60,
        intensity: "high",
        maxSpots: 12,
        price: 120,
        isActive: true,
      },
    });

    zumbaClass = await db.class.create({
      data: {
        name: "Zumba Class",
        trainerId,
        type: "zumba",
        duration: 50,
        intensity: "medium",
        maxSpots: 15,
        price: 90,
        isActive: true,
      },
    });

    // Create SPECIAL offer with class types
    specialOfferId = (
      await db.offer.create({
        data: {
          title: "Special Offer - Fitness Only",
          type: "special",
          discount: 0,
          specialPrice: 500,
          expiresAt: new Date("2026-12-31"),
          isActive: true,
          maxSubscribers: 50,
          currentSubscribers: 0,
          showOnHome: true,
          showMaxSubscribers: true,
          showCurrentSubscribers: true,
          allowedClassTypes: {
            create: [{ classType: "fitness" }],
          },
        },
      })
    ).id;

    // Create REGULAR (percentage) offer with direct links
    regularOfferId = (
      await db.offer.create({
        data: {
          title: "Regular Offer - Direct Links",
          type: "percentage",
          discount: 20,
          expiresAt: new Date("2026-12-31"),
          isActive: true,
          maxSubscribers: 30,
          currentSubscribers: 0,
          showOnHome: false,
          showMaxSubscribers: true,
          showCurrentSubscribers: true,
          allowedClasses: {
            create: [
              { classId: kickboxingClass.id },
              { classId: zumbaClass.id },
            ],
          },
        },
      })
    ).id;

    // Simulate OLD backfill: add incorrect direct links to special offer
    // (These should be IGNORED for special offers)
    await db.offerAllowedClass.createMany({
      data: [
        { offerId: specialOfferId, classId: fitnessClass1.id },
        { offerId: specialOfferId, classId: fitnessClass2.id },
        { offerId: specialOfferId, classId: kickboxingClass.id },
        { offerId: specialOfferId, classId: zumbaClass.id },
      ],
    });
  });

  afterAll(async () => {
    await db.offerAllowedClass.deleteMany({
      where: {
        offerId: {
          in: [specialOfferId, regularOfferId],
        },
      },
    });
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: specialOfferId },
    });
    await db.offer.deleteMany({
      where: {
        id: {
          in: [specialOfferId, regularOfferId],
        },
      },
    });
    await db.class.deleteMany({
      where: {
        id: {
          in: [
            fitnessClass1.id,
            fitnessClass2.id,
            kickboxingClass.id,
            zumbaClass.id,
          ],
        },
      },
    });
    await db.trainer.delete({ where: { id: trainerId } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });

  describe("Special Offer - Class Types ONLY", () => {
    it("returns ONLY classes matching allowedClassTypes (ignores direct links)", async () => {
      const eligible = await getEligibleClassesForSource({
        type: "offer",
        id: specialOfferId,
      });

      // Should return ONLY fitness classes (2 classes)
      // Even though we have 4 direct links, special offers ignore them
      expect(eligible.length).toBe(2);
      expect(eligible.every((c) => c.type === "fitness")).toBe(true);

      const ids = eligible.map((c) => c.id).sort();
      const expectedIds = [fitnessClass1.id, fitnessClass2.id].sort();
      expect(ids).toEqual(expectedIds);
    });

    it("validates by class type, NOT direct link", async () => {
      // Fitness classes: ALLOWED (in allowedClassTypes)
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: specialOfferId },
          fitnessClass1.id
        )
      ).toBe(true);

      expect(
        await isClassAllowedForSource(
          { type: "offer", id: specialOfferId },
          fitnessClass2.id
        )
      ).toBe(true);

      // Kickboxing: NOT ALLOWED (not in allowedClassTypes)
      // Even though it has a direct link!
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: specialOfferId },
          kickboxingClass.id
        )
      ).toBe(false);

      // Zumba: NOT ALLOWED
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: specialOfferId },
          zumbaClass.id
        )
      ).toBe(false);
    });

    it("returns ZERO classes when allowedClassTypes is empty", async () => {
      const emptyOfferId = (
        await db.offer.create({
          data: {
            title: "Empty Special Offer",
            type: "special",
            discount: 0,
            specialPrice: 300,
            expiresAt: new Date("2026-12-31"),
            isActive: true,
            maxSubscribers: 20,
            currentSubscribers: 0,
            showOnHome: false,
            showMaxSubscribers: true,
            showCurrentSubscribers: true,
          },
        })
      ).id;

      const eligible = await getEligibleClassesForSource({
        type: "offer",
        id: emptyOfferId,
      });

      expect(eligible.length).toBe(0);

      await db.offer.delete({ where: { id: emptyOfferId } });
    });

    it("changes results immediately when types are updated", async () => {
      const testOfferId = (
        await db.offer.create({
          data: {
            title: "Test Update Offer",
            type: "special",
            discount: 0,
            specialPrice: 400,
            expiresAt: new Date("2026-12-31"),
            isActive: true,
            maxSubscribers: 30,
            currentSubscribers: 0,
            showOnHome: false,
            showMaxSubscribers: true,
            showCurrentSubscribers: true,
            allowedClassTypes: {
              create: [{ classType: "kickboxing" }],
            },
          },
        })
      ).id;

      // Should see kickboxing
      let eligible = await getEligibleClassesForSource({
        type: "offer",
        id: testOfferId,
      });
      expect(eligible.length).toBe(1);
      expect(eligible[0].type).toBe("kickboxing");

      // Update to zumba
      await db.offerAllowedClassType.deleteMany({
        where: { offerId: testOfferId },
      });
      await db.offerAllowedClassType.create({
        data: {
          offerId: testOfferId,
          classType: "zumba",
        },
      });

      // Should now see zumba
      eligible = await getEligibleClassesForSource({
        type: "offer",
        id: testOfferId,
      });
      expect(eligible.length).toBe(1);
      expect(eligible[0].type).toBe("zumba");

      await db.offerAllowedClassType.deleteMany({
        where: { offerId: testOfferId },
      });
      await db.offer.delete({ where: { id: testOfferId } });
    });

    it("has direct links (created by backfill) but ignores them", async () => {
      // Verify direct links exist
      const links = await db.offerAllowedClass.count({
        where: { offerId: specialOfferId },
      });
      expect(links).toBe(4);

      // But special offer ignores them
      const eligible = await getEligibleClassesForSource({
        type: "offer",
        id: specialOfferId,
      });
      expect(eligible.length).toBe(2); // Not 4!
      expect(eligible.every((c) => c.type === "fitness")).toBe(true);
    });
  });

  describe("Regular Offer - Direct Links", () => {
    it("uses direct links (NOT class types)", async () => {
      const eligible = await getEligibleClassesForSource({
        type: "offer",
        id: regularOfferId,
      });

      // Should return kickboxing + zumba (from direct links)
      expect(eligible.length).toBe(2);

      const ids = eligible.map((c) => c.id).sort();
      const expectedIds = [kickboxingClass.id, zumbaClass.id].sort();
      expect(ids).toEqual(expectedIds);
    });

    it("validates by direct link", async () => {
      // Kickboxing: ALLOWED (has direct link)
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: regularOfferId },
          kickboxingClass.id
        )
      ).toBe(true);

      // Zumba: ALLOWED (has direct link)
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: regularOfferId },
          zumbaClass.id
        )
      ).toBe(true);

      // Fitness: NOT ALLOWED (no direct link)
      expect(
        await isClassAllowedForSource(
          { type: "offer", id: regularOfferId },
          fitnessClass1.id
        )
      ).toBe(false);
    });

    it("preserves behavior when allowedClassIds is empty", async () => {
      const emptyRegularOfferId = (
        await db.offer.create({
          data: {
            title: "Empty Regular Offer",
            type: "percentage",
            discount: 15,
            expiresAt: new Date("2026-12-31"),
            isActive: true,
            maxSubscribers: 20,
            currentSubscribers: 0,
            showOnHome: false,
            showMaxSubscribers: true,
            showCurrentSubscribers: true,
          },
        })
      ).id;

      const eligible = await getEligibleClassesForSource({
        type: "offer",
        id: emptyRegularOfferId,
      });

      // Empty direct links = zero classes (not all classes)
      expect(eligible.length).toBe(0);

      await db.offer.delete({ where: { id: emptyRegularOfferId } });
    });
  });
});
