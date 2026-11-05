import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getEligibilityPolicySnapshotForSource,
  isClassAllowedByEligibilitySnapshot,
} from "@/lib/get-eligible-classes";

describe("ClassType stable ID migration smoke", () => {
  let trainerId = "";
  let gymClassId = "";
  let offerId = "";

  beforeAll(async () => {
    const token = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const fitnessType = await db.classType.findUniqueOrThrow({
      where: { key: "fitness" },
      select: {
        id: true,
        key: true,
        nameAr: true,
        nameEn: true,
      },
    });

    const historicalAlias = await db.classTypeAlias.findUniqueOrThrow({
      where: { alias: "فيتنيس" },
      select: { classTypeId: true },
    });

    if (historicalAlias.classTypeId !== fitnessType.id) {
      throw new Error("FITNESS_HISTORICAL_ALIAS_RELATION_INVALID");
    }

    const trainer = await db.trainer.create({
      data: {
        name: `Stable ID Trainer ${token}`,
        specialty: "fitness",
      },
    });

    trainerId = trainer.id;

    const gymClass = await db.class.create({
      data: {
        name: `Stable ID Fitness Class ${token}`,
        trainerId,
        type: fitnessType.nameAr,
        typeEn: fitnessType.nameEn,
        classTypeId: fitnessType.id,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 0,
        isActive: true,
      },
    });

    gymClassId = gymClass.id;

    const offer = await db.offer.create({
      data: {
        title: `Stable ID Direct Class Offer ${token}`,
        type: "special",
        discount: 0,
        expiresAt: new Date("2035-01-01T00:00:00.000Z"),
        isActive: true,
        allowedClasses: {
          create: [{ classId: gymClass.id }],
        },
      },
    });

    offerId = offer.id;
  });

  afterAll(async () => {
    if (offerId) {
      await db.offer.deleteMany({
        where: { id: offerId },
      });
    }

    if (gymClassId) {
      await db.class.deleteMany({
        where: { id: gymClassId },
      });
    }

    if (trainerId) {
      await db.trainer.deleteMany({
        where: { id: trainerId },
      });
    }
  });

  it("special offer snapshot uses exact admin-selected Class IDs", async () => {
    const snapshot = await getEligibilityPolicySnapshotForSource({
      type: "offer",
      id: offerId,
    });

    expect(snapshot.mode).toBe("class_ids");

    if (snapshot.mode !== "class_ids") {
      throw new Error(`Unexpected snapshot mode: ${snapshot.mode}`);
    }

    const directLinks = await db.offerAllowedClass.findMany({
      where: { offerId },
      select: { classId: true },
      orderBy: { classId: "asc" },
    });

    const expectedClassIds = directLinks.map((row) => row.classId).sort();

    expect(expectedClassIds.length).toBeGreaterThan(0);
    expect(snapshot.classIds.slice().sort()).toEqual(expectedClassIds);
    expect(new Set(snapshot.classIds).size).toBe(snapshot.classIds.length);
  });

  it("legacy textual snapshot resolves through alias to stable ClassType", async () => {
    const gymClass = await db.class.findUniqueOrThrow({
      where: { id: gymClassId },
      select: {
        id: true,
        type: true,
        classTypeId: true,
        classType: { select: { key: true } },
      },
    });

    expect(gymClass.classType?.key).toBe("fitness");

    // Historical typo/label variant:
    const allowed = await isClassAllowedByEligibilitySnapshot(
      {
        mode: "class_types",
        classIds: [],
        classTypes: ["فيتنيس"],
      },
      gymClass.id,
    );

    expect(allowed).toBe(true);
  });

  it("stable snapshot is independent from mutable display text", async () => {
    const gymClass = await db.class.findUniqueOrThrow({
      where: { id: gymClassId },
      select: { id: true, classTypeId: true },
    });

    expect(gymClass.classTypeId).not.toBeNull();

    const allowed = await isClassAllowedByEligibilitySnapshot(
      {
        mode: "class_type_ids",
        classIds: [],
        classTypes: [],
        classTypeIds: [gymClass.classTypeId!],
      },
      gymClass.id,
    );

    expect(allowed).toBe(true);
  });
});