import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { getEligibleClassesForSource, isClassAllowedForSource } from "@/lib/get-eligible-classes";

const db = new PrismaClient();

describe("Offer Class Eligibility Integration", () => {
  let testUserId: string;
  let testTrainerId: string;
  let classYoga: { id: string };
  let classPilates: { id: string };
  let classCardio: { id: string };
  let offerWithDirectLinks: { id: string };
  let offerWithLegacyTypes: { id: string };
  let offerEmpty: { id: string };

  beforeAll(async () => {
    // Create test user
    const user = await db.user.create({
      data: {
        name: "Test User Eligibility",
        email: `test-eligibility-${Date.now()}@fitzone.test`,
        phone: "01000000001",
        password: "hashed",
        role: "customer",
      },
    });
    testUserId = user.id;

    // Create trainer
    const trainer = await db.trainer.create({
      data: {
        userId: testUserId,
        name: "Test Trainer",
        specialty: "Yoga",
        bio: "Test",
        isActive: true,
      },
    });
    testTrainerId = trainer.id;

    // Create classes
    classYoga = await db.class.create({
      data: {
        name: "Yoga Class",
        trainerId: testTrainerId,
        type: "yoga",
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });

    classPilates = await db.class.create({
      data: {
        name: "Pilates Class",
        trainerId: testTrainerId,
        type: "pilates",
        duration: 60,
        intensity: "high",
        maxSpots: 8,
        price: 120,
        isActive: true,
      },
    });

    classCardio = await db.class.create({
      data: {
        name: "Cardio Class",
        trainerId: testTrainerId,
        type: "cardio",
        duration: 45,
        intensity: "high",
        maxSpots: 15,
        price: 80,
        isActive: true,
      },
    });

    // Create offer with direct class links
    offerWithDirectLinks = await db.offer.create({
      data: {
        title: "Yoga Only Offer",
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
        allowedClasses: {
          create: [{ classId: classYoga.id }],
        },
      },
    });

    // Create offer with legacy types only
    offerWithLegacyTypes = await db.offer.create({
      data: {
        title: "Cardio Legacy Offer",
        type: "percentage",
        discount: 20,
        expiresAt: new Date("2026-12-31"),
        isActive: true,
        maxSubscribers: 30,
        currentSubscribers: 0,
        showOnHome: true,
        showMaxSubscribers: true,
        showCurrentSubscribers: true,
        allowedClassTypes: {
          create: [{ classType: "cardio" }],
        },
      },
    });

    // Create offer with empty relations
    offerEmpty = await db.offer.create({
      data: {
        title: "Empty Offer",
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
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.offerAllowedClass.deleteMany({
      where: { offerId: { in: [offerWithDirectLinks.id] } },
    });
    await db.offerAllowedClassType.deleteMany({
      where: { offerId: { in: [offerWithLegacyTypes.id] } },
    });
    await db.offer.deleteMany({
      where: { id: { in: [offerWithDirectLinks.id, offerWithLegacyTypes.id, offerEmpty.id] } },
    });
    await db.class.deleteMany({
      where: { id: { in: [classYoga.id, classPilates.id, classCardio.id] } },
    });
    await db.trainer.delete({ where: { id: testTrainerId } });
    await db.user.delete({ where: { id: testUserId } });
    await db.$disconnect();
  });

  it("returns only direct-linked classes for offer with OfferAllowedClass", async () => {
    const eligible = await getEligibleClassesForSource({
      type: "offer",
      id: offerWithDirectLinks.id,
    });

    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe(classYoga.id);
    expect(eligible[0].name).toBe("Yoga Class");
  });

  it("validates class allowed for offer with direct link", async () => {
    const yogaAllowed = await isClassAllowedForSource(
      { type: "offer", id: offerWithDirectLinks.id },
      classYoga.id
    );
    const pilatesAllowed = await isClassAllowedForSource(
      { type: "offer", id: offerWithDirectLinks.id },
      classPilates.id
    );

    expect(yogaAllowed).toBe(true);
    expect(pilatesAllowed).toBe(false);
  });

  it("falls back to legacy types for offer without direct links", async () => {
    const eligible = await getEligibleClassesForSource({
      type: "offer",
      id: offerWithLegacyTypes.id,
    });

    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.every((c) => c.type === "cardio")).toBe(true);
    expect(eligible.some((c) => c.id === classCardio.id)).toBe(true);
  });

  it("returns ZERO classes for offer with no relations", async () => {
    const eligible = await getEligibleClassesForSource({
      type: "offer",
      id: offerEmpty.id,
    });

    expect(eligible).toHaveLength(0);
  });

  it("validates ZERO classes allowed for empty offer", async () => {
    const yogaAllowed = await isClassAllowedForSource(
      { type: "offer", id: offerEmpty.id },
      classYoga.id
    );
    const cardioAllowed = await isClassAllowedForSource(
      { type: "offer", id: offerEmpty.id },
      classCardio.id
    );

    expect(yogaAllowed).toBe(false);
    expect(cardioAllowed).toBe(false);
  });
});
