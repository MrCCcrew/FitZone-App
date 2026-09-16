import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createClassType,
  renameClassType,
  resolveOrCreateClassType,
  setClassTypeActive,
} from "@/lib/class-type-catalog";

const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) {
    await db.classType.deleteMany({
      where: {
        id: { in: createdIds },
      },
    });
  }
});

describe("ClassType lifecycle", () => {
  it("creates, renames, deactivates and reactivates without changing identity", async () => {
    const token = Date.now().toString();

    const created = await createClassType({
      nameAr: `نوع دورة ${token}`,
      nameEn: `Lifecycle ${token}`,
    });

    createdIds.push(created.id);

    const stableId = created.id;
    const stableKey = created.key;

    expect(created.isActive).toBe(true);

    const renamed = await renameClassType({
      classTypeId: stableId,
      nameAr: `نوع دورة جديد ${token}`,
      nameEn: `Lifecycle New ${token}`,
    });

    expect(renamed.classType.id).toBe(stableId);
    expect(renamed.classType.key).toBe(stableKey);

    const inactive = await setClassTypeActive({
      classTypeId: stableId,
      isActive: false,
    });

    expect(inactive.id).toBe(stableId);
    expect(inactive.key).toBe(stableKey);
    expect(inactive.isActive).toBe(false);

    await expect(
      resolveOrCreateClassType({
        label: `نوع دورة جديد ${token}`,
      }),
    ).rejects.toThrow("CLASS_TYPE_INACTIVE:");

    // Explicit stable identity remains resolvable for existing/historical links.
    const explicit = await resolveOrCreateClassType({
      classTypeId: stableId,
    });

    expect(explicit.id).toBe(stableId);

    const activeAgain = await setClassTypeActive({
      classTypeId: stableId,
      isActive: true,
    });

    expect(activeAgain.id).toBe(stableId);
    expect(activeAgain.key).toBe(stableKey);
    expect(activeAgain.isActive).toBe(true);

    const aliases = await db.classTypeAlias.findMany({
      where: { classTypeId: stableId },
      select: { alias: true },
    });

    const aliasSet = new Set(aliases.map((row) => row.alias));

    expect(aliasSet.has(`نوع دورة ${token}`)).toBe(true);
    expect(aliasSet.has(`نوع دورة جديد ${token}`)).toBe(true);
  });

  it("rejects duplicate canonical names instead of silently merging identities", async () => {
    const token = `${Date.now()}_conflict`;

    const first = await createClassType({
      nameAr: `نوع تعارض ${token}`,
    });

    createdIds.push(first.id);

    await expect(
      createClassType({
        nameAr: `نوع تعارض ${token}`,
      }),
    ).rejects.toThrow(/CLASS_TYPE_(ALIAS|NAME)_CONFLICT:/);
  });
});
