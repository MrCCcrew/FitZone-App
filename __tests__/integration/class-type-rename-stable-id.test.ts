import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { renameClassType } from "@/lib/class-type-catalog";
import {
  isClassAllowedByEligibilitySnapshot,
} from "@/lib/get-eligible-classes";

const createdClassIds: string[] = [];
const createdOfferIds: string[] = [];
const createdTrainerIds: string[] = [];
const createdTypeIds: string[] = [];

afterAll(async () => {
  if (createdOfferIds.length > 0) {
    await db.offer.deleteMany({
      where: { id: { in: createdOfferIds } },
    });
  }

  if (createdClassIds.length > 0) {
    await db.class.deleteMany({
      where: { id: { in: createdClassIds } },
    });
  }

  if (createdTrainerIds.length > 0) {
    await db.trainer.deleteMany({
      where: { id: { in: createdTrainerIds } },
    });
  }

  if (createdTypeIds.length > 0) {
    await db.classType.deleteMany({
      where: { id: { in: createdTypeIds } },
    });
  }
});

describe("ClassType rename keeps stable identity", () => {
  it("renames live display mirrors, preserves aliases and stable snapshot", async () => {
    const token = Date.now().toString();

    const trainer = await db.trainer.create({
      data: {
        name: `Rename Trainer ${token}`,
        specialty: "fitness",
      },
    });
    createdTrainerIds.push(trainer.id);

    const classType = await db.classType.create({
      data: {
        key: `ct_test_rename_${token}`,
        nameAr: `نوع قديم ${token}`,
        nameEn: `Old Type ${token}`,
        aliases: {
          create: [
            { alias: `نوع قديم ${token}` },
            { alias: `Old Type ${token}` },
          ],
        },
      },
    });
    createdTypeIds.push(classType.id);

    const gymClass = await db.class.create({
      data: {
        name: `Rename Class ${token}`,
        trainerId: trainer.id,
        type: classType.nameAr,
        typeEn: classType.nameEn,
        classTypeId: classType.id,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
      },
    });
    createdClassIds.push(gymClass.id);

    const offer = await db.offer.create({
      data: {
        title: `Rename Offer ${token}`,
        type: "special",
        discount: 0,
        expiresAt: new Date("2035-01-01T00:00:00.000Z"),
        isActive: true,
        allowedClassTypes: {
          create: [
            {
              classType: classType.nameAr,
              classTypeId: classType.id,
            },
            {
              classType: `legacy alias ${token}`,
              classTypeId: classType.id,
            },
          ],
        },
      },
    });
    createdOfferIds.push(offer.id);

    const frozenSnapshot = {
      mode: "class_type_ids" as const,
      classIds: [] as [],
      classTypes: [] as [],
      classTypeIds: [classType.id],
    };

    expect(
      await isClassAllowedByEligibilitySnapshot(
        frozenSnapshot,
        gymClass.id,
      ),
    ).toBe(true);

    const result = await renameClassType({
      classTypeId: classType.id,
      nameAr: `نوع جديد ${token}`,
      nameEn: `New Type ${token}`,
    });

    expect(result.classType.id).toBe(classType.id);
    expect(result.classType.key).toBe(classType.key);
    expect(result.dedupedOfferRows).toBe(1);

    const refreshedClass = await db.class.findUniqueOrThrow({
      where: { id: gymClass.id },
      select: {
        classTypeId: true,
        type: true,
        typeEn: true,
      },
    });

    expect(refreshedClass.classTypeId).toBe(classType.id);
    expect(refreshedClass.type).toBe(`نوع جديد ${token}`);
    expect(refreshedClass.typeEn).toBe(`New Type ${token}`);

    const offerRows = await db.offerAllowedClassType.findMany({
      where: {
        offerId: offer.id,
        classTypeId: classType.id,
      },
    });

    expect(offerRows).toHaveLength(1);
    expect(offerRows[0].classType).toBe(`نوع جديد ${token}`);

    const aliases = await db.classTypeAlias.findMany({
      where: {
        classTypeId: classType.id,
      },
      select: {
        alias: true,
      },
    });

    const aliasSet = new Set(aliases.map((row) => row.alias));

    expect(aliasSet.has(`نوع قديم ${token}`)).toBe(true);
    expect(aliasSet.has(`Old Type ${token}`)).toBe(true);
    expect(aliasSet.has(`نوع جديد ${token}`)).toBe(true);
    expect(aliasSet.has(`New Type ${token}`)).toBe(true);

    // Frozen entitlement remains based on the immutable stable ID.
    expect(
      await isClassAllowedByEligibilitySnapshot(
        frozenSnapshot,
        gymClass.id,
      ),
    ).toBe(true);
  });
});
