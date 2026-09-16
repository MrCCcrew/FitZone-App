import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getEligibleClassesForSource,
  getEligibilityPolicySnapshotForSource,
  isClassAllowedByEligibilitySnapshot,
  isClassAllowedForSource,
} from "@/lib/get-eligible-classes";

describe("Membership/Package eligibility canonical contract", () => {
  let trainerId = "";
  let fitnessTypeId = "";
  let yogaTypeId = "";
  let fitnessAId = "";
  let fitnessBId = "";
  let yogaId = "";

  const membershipIds: string[] = [];
  const createdClassIds: string[] = [];
  const createdTypeIds: string[] = [];

  async function createMembership(input: {
    name: string;
    kind?: string;
    classSessions: unknown[];
  }) {
    const membership = await db.membership.create({
      data: {
        name: input.name,
        nameEn: input.name,
        duration: 30,
        price: 100,
        kind: input.kind ?? "subscription",
        sessionsCount: 4,
        walletBonus: 0,
        features: "[]",
        classSessions: JSON.stringify(input.classSessions),
      },
    });

    membershipIds.push(membership.id);
    return membership;
  }

  async function assertContractAgreement(
    source: { type: "membership" | "package"; id: string },
    expectedAllowedIds: string[],
  ) {
    const knownClassIds = [fitnessAId, fitnessBId, yogaId];

    const eligible = await getEligibleClassesForSource(source);
    const listedIds = eligible.map((row) => row.id).sort();

    expect(listedIds).toEqual(expectedAllowedIds.slice().sort());

    const snapshot = await getEligibilityPolicySnapshotForSource(source);

    for (const classId of knownClassIds) {
      const expected = expectedAllowedIds.includes(classId);

      const liveAllowed = await isClassAllowedForSource(
        source,
        classId,
      );

      const frozenAllowed =
        await isClassAllowedByEligibilitySnapshot(
          snapshot,
          classId,
        );

      expect(
        liveAllowed,
        `live validation mismatch for ${source.type}:${source.id}:${classId}`,
      ).toBe(expected);

      expect(
        frozenAllowed,
        `snapshot validation mismatch for ${source.type}:${source.id}:${classId}`,
      ).toBe(expected);
    }
  }

  beforeAll(async () => {
    const token = Date.now().toString();

    const trainer = await db.trainer.create({
      data: {
        name: `Eligibility Contract Trainer ${token}`,
        specialty: "fitness",
        bio: "integration test",
        isActive: true,
      },
    });
    trainerId = trainer.id;

    const fitnessType = await db.classType.create({
      data: {
        key: `eligibility_contract_fitness_${token}`,
        nameAr: `فيتنس عقد ${token}`,
        nameEn: `Fitness Contract ${token}`,
        aliases: {
          create: [
            { alias: `فيتنس قديم ${token}` },
          ],
        },
      },
    });
    fitnessTypeId = fitnessType.id;
    createdTypeIds.push(fitnessType.id);

    const yogaType = await db.classType.create({
      data: {
        key: `eligibility_contract_yoga_${token}`,
        nameAr: `يوجا عقد ${token}`,
        nameEn: `Yoga Contract ${token}`,
      },
    });
    yogaTypeId = yogaType.id;
    createdTypeIds.push(yogaType.id);

    const fitnessA = await db.class.create({
      data: {
        name: `Fitness A ${token}`,
        trainerId,
        type: fitnessType.nameAr,
        typeEn: fitnessType.nameEn,
        classTypeId: fitnessType.id,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });
    fitnessAId = fitnessA.id;
    createdClassIds.push(fitnessA.id);

    const fitnessB = await db.class.create({
      data: {
        name: `Fitness B ${token}`,
        trainerId,
        type: fitnessType.nameAr,
        typeEn: fitnessType.nameEn,
        classTypeId: fitnessType.id,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });
    fitnessBId = fitnessB.id;
    createdClassIds.push(fitnessB.id);

    const yoga = await db.class.create({
      data: {
        name: `Yoga ${token}`,
        trainerId,
        type: yogaType.nameAr,
        typeEn: yogaType.nameEn,
        classTypeId: yogaType.id,
        duration: 60,
        intensity: "medium",
        maxSpots: 10,
        price: 100,
        isActive: true,
      },
    });
    yogaId = yoga.id;
    createdClassIds.push(yoga.id);
  });

  afterAll(async () => {
    if (membershipIds.length > 0) {
      await db.membership.deleteMany({
        where: { id: { in: membershipIds } },
      });
    }

    if (createdClassIds.length > 0) {
      await db.class.deleteMany({
        where: { id: { in: createdClassIds } },
      });
    }

    if (trainerId) {
      await db.trainer.deleteMany({
        where: { id: trainerId },
      });
    }

    if (createdTypeIds.length > 0) {
      await db.classType.deleteMany({
        where: { id: { in: createdTypeIds } },
      });
    }
  });

  it("subscription exact Class.id does not widen to sibling classes of same type", async () => {
    const membership = await createMembership({
      name: "Exact subscription",
      kind: "subscription",
      classSessions: [
        {
          classId: fitnessAId,
          classType: "metadata only",
          sessions: 4,
        },
      ],
    });

    const snapshot =
      await getEligibilityPolicySnapshotForSource({
        type: "membership",
        id: membership.id,
      });

    expect(snapshot.mode).toBe("class_ids");

    await assertContractAgreement(
      { type: "membership", id: membership.id },
      [fitnessAId],
    );
  });

  it("package stable ClassType.id allows all current classes of that stable type", async () => {
    const membership = await createMembership({
      name: "Stable type package",
      kind: "package",
      classSessions: [
        {
          classTypeId: fitnessTypeId,
          classType: "display text is not authoritative",
          sessions: 4,
        },
      ],
    });

    const snapshot =
      await getEligibilityPolicySnapshotForSource({
        type: "package",
        id: membership.id,
      });

    expect(snapshot).toMatchObject({
      mode: "class_type_ids",
      classTypeIds: [fitnessTypeId],
    });

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [fitnessAId, fitnessBId],
    );
  });

  it("legacy package textual type stored in classId resolves without rewriting DB", async () => {
    const fitnessType = await db.classType.findUniqueOrThrow({
      where: { id: fitnessTypeId },
      select: { nameAr: true },
    });

    const membership = await createMembership({
      name: "Legacy textual package",
      kind: "package",
      classSessions: [
        {
          classId: fitnessType.nameAr,
          classType: fitnessType.nameAr,
          sessions: 4,
        },
      ],
    });

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [fitnessAId, fitnessBId],
    );

    const persisted = await db.membership.findUniqueOrThrow({
      where: { id: membership.id },
      select: { classSessions: true },
    });

    const stored = JSON.parse(persisted.classSessions ?? "[]");
    expect(stored[0].classId).toBe(fitnessType.nameAr);
  });

  it("stale historical Class.id uses preserved classType semantics", async () => {
    const fitnessType = await db.classType.findUniqueOrThrow({
      where: { id: fitnessTypeId },
      select: { nameAr: true },
    });

    const membership = await createMembership({
      name: "Stale historical package",
      kind: "package",
      classSessions: [
        {
          classId: "stale-class-id-that-no-longer-exists",
          classType: fitnessType.nameAr,
          sessions: 4,
        },
      ],
    });

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [fitnessAId, fitnessBId],
    );
  });

  it("legacy alias resolves to one stable ClassType without entitlement widening", async () => {
    const alias = await db.classTypeAlias.findFirstOrThrow({
      where: { classTypeId: fitnessTypeId },
      select: { alias: true },
    });

    const membership = await createMembership({
      name: "Alias package",
      kind: "package",
      classSessions: [
        {
          classId: "stale-class-id-for-alias",
          classType: alias.alias,
          sessions: 4,
        },
      ],
    });

    const snapshot =
      await getEligibilityPolicySnapshotForSource({
        type: "package",
        id: membership.id,
      });

    expect(snapshot).toMatchObject({
      mode: "class_type_ids",
      classTypeIds: [fitnessTypeId],
    });

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [fitnessAId, fitnessBId],
    );
  });

  it("mixed historical config preserves exact Class.id plus stable type semantics", async () => {
    const yogaType = await db.classType.findUniqueOrThrow({
      where: { id: yogaTypeId },
      select: { nameAr: true },
    });

    const membership = await createMembership({
      name: "Mixed historical package",
      kind: "package",
      classSessions: [
        {
          classId: fitnessAId,
          classType: "metadata only",
          sessions: 2,
        },
        {
          classId: "stale-yoga-class-id",
          classType: yogaType.nameAr,
          sessions: 2,
        },
      ],
    });

    const snapshot =
      await getEligibilityPolicySnapshotForSource({
        type: "package",
        id: membership.id,
      });

    expect(snapshot.mode).toBe("mixed");

    if (snapshot.mode !== "mixed") {
      throw new Error(`Unexpected snapshot mode: ${snapshot.mode}`);
    }

    expect(snapshot.classIds).toEqual([fitnessAId]);
    expect(snapshot.classTypeIds).toEqual([yogaTypeId]);

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [fitnessAId, yogaId],
    );
  });

  it("empty configuration means zero eligible classes everywhere", async () => {
    const membership = await createMembership({
      name: "Empty package",
      kind: "package",
      classSessions: [],
    });

    const snapshot =
      await getEligibilityPolicySnapshotForSource({
        type: "package",
        id: membership.id,
      });

    expect(snapshot).toEqual({
      mode: "class_ids",
      classIds: [],
      classTypes: [],
    });

    await assertContractAgreement(
      { type: "package", id: membership.id },
      [],
    );
  });
});
