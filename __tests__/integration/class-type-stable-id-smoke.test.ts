import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getEligibilityPolicySnapshotForSource,
  isClassAllowedByEligibilitySnapshot,
} from "@/lib/get-eligible-classes";

describe("ClassType stable ID migration smoke", () => {
  it("special offer snapshot uses exact admin-selected Class IDs", async () => {
    const offerId = "cmo90s22z0007l1wpsne35ty4";

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
      where: { id: "cmsus05s7000el1feac8jwyoj" },
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
      where: { id: "cmsus05s7000el1feac8jwyoj" },
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
