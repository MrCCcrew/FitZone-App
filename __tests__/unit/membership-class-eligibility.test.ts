import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findClasses: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    class: {
      findMany: mocks.findClasses,
    },
  },
}));

import { resolveMembershipClassEligibility, type MembershipEligibilityRecord } from "@/lib/membership-class-eligibility";

const now = new Date("2026-08-03T12:00:00.000Z");
const classes = [{ id: "yoga", type: "Yoga" }, { id: "boxing", type: "Boxing" }, { id: "dance", type: "Dance" }];

function membership(overrides: Partial<MembershipEligibilityRecord> = {}): MembershipEligibilityRecord {
  return {
    id: "m1", status: "active", startDate: new Date("2026-08-01T00:00:00.000Z"), endDate: new Date("2026-08-31T00:00:00.000Z"),
    allowedClassTypesSnapshot: null, membership: { classSessions: JSON.stringify([{ classId: "yoga" }]) }, ...overrides,
  };
}

describe("resolveMembershipClassEligibility", () => {
  beforeEach(() => {
    mocks.findClasses.mockReset();
    mocks.findClasses.mockResolvedValue([]);
  });

  it("returns one restricted membership and its class", async () => {
    await expect(resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [membership()] }))
      .resolves.toEqual({ hasEligibleMembership: true, unrestricted: false, allowedClassIds: ["yoga"], eligibleMembershipIds: ["m1"], membershipIdsByClass: { yoga: ["m1"] } });
  });

  it("unions and de-duplicates restricted memberships", async () => {
    const result = await resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [membership(), membership({ id: "m2", membership: { classSessions: JSON.stringify([{ classId: "boxing" }, { classId: "yoga" }]) } })] });
    expect(result.allowedClassIds).toEqual(["yoga", "boxing"]);
    expect(result.eligibleMembershipIds).toEqual(["m1", "m2"]);
  });

  it("marks eligibility unrestricted when any active membership is unrestricted", async () => {
    // Unrestricted = classSessions is null (not defined), NOT empty array
    const result = await resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [membership(), membership({ id: "m2", membership: { classSessions: null } })] });
    expect(result).toMatchObject({ hasEligibleMembership: true, unrestricted: true, allowedClassIds: [], eligibleMembershipIds: ["m1", "m2"] });
  });

  it("treats empty classSessions as zero classes (not unrestricted)", async () => {
    // NEW: empty array = zero classes allowed (not all classes)
    const result = await resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [membership({ membership: { classSessions: JSON.stringify([]) } })] });
    expect(result).toMatchObject({ hasEligibleMembership: true, unrestricted: false, allowedClassIds: [] });
  });

  it("classId does not allow other classes of same type", async () => {
    // Test with two yoga classes: yoga-a and yoga-b
    const yogaClasses = [
      { id: "yoga-a", type: "Yoga" },
      { id: "yoga-b", type: "Yoga" },
      { id: "boxing", type: "Boxing" },
    ];
    const result = await resolveMembershipClassEligibility({
      userId: "u1",
      classes: yogaClasses,
      now,
      memberships: [
        membership({
          membership: {
            classSessions: JSON.stringify([{ classId: "yoga-a", classType: "Yoga" }]),
          },
        }),
      ],
    });
    // Only yoga-a should be allowed, NOT yoga-b (even though same type)
    expect(result.allowedClassIds).toEqual(["yoga-a"]);
    expect(result.allowedClassIds).not.toContain("yoga-b");
  });

  it.each([
    membership({ status: "pending_payment" }),
    membership({ status: "expired" }),
    membership({ status: "cancelled" }),
    membership({ endDate: new Date("2026-08-02T23:59:59.000Z") }),
  ])("excludes non-eligible memberships", async (record) => {
    await expect(resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [record] }))
      .resolves.toEqual({ hasEligibleMembership: false, unrestricted: false, allowedClassIds: [], eligibleMembershipIds: [], membershipIdsByClass: {} });
  });
  it("canonical class_ids snapshot overrides broader legacy class type data", async () => {
    const result = await resolveMembershipClassEligibility({
      userId: "u1",
      classes: [
        { id: "yoga-a", type: "Yoga" },
        { id: "yoga-b", type: "Yoga" },
      ],
      now,
      memberships: [
        membership({
          eligibilitySnapshot: JSON.stringify({ mode: "class_ids", classIds: ["yoga-a"], classTypes: [] }),
          allowedClassTypesSnapshot: JSON.stringify(["Yoga"]),
          membership: { classSessions: JSON.stringify([{ classId: "yoga-a", classType: "Yoga" }, { classId: "yoga-b", classType: "Yoga" }]) },
        }),
      ],
    });

    expect(result.allowedClassIds).toEqual(["yoga-a"]);
    expect(result.membershipIdsByClass).toEqual({ "yoga-a": ["m1"] });
  });

  it("legacy bookingPatternSnapshot class_ids is used before mutable classSessions", async () => {
    const result = await resolveMembershipClassEligibility({
      userId: "u1",
      classes: [
        { id: "yoga-a", type: "Yoga" },
        { id: "yoga-b", type: "Yoga" },
      ],
      now,
      memberships: [
        membership({
          bookingPatternSnapshot: JSON.stringify({
            version: 1,
            timezone: "Africa/Cairo",
            eligibility: { mode: "class_ids", classIds: ["yoga-a"], classTypes: [] },
          }),
          membership: { classSessions: JSON.stringify([{ classId: "yoga-a" }, { classId: "yoga-b" }]) },
        }),
      ],
    });

    expect(result.allowedClassIds).toEqual(["yoga-a"]);
  });

  it("expands a transitional package canonical class_ids contract only to the same frozen ClassType IDs", async () => {
    mocks.findClasses.mockResolvedValue([
      { id: "fitness-old", classTypeId: "fitness-type" },
      { id: "weights-old", classTypeId: "weights-type" },
      { id: "dance-old", classTypeId: "dance-type" },
    ]);

    const packageContract = JSON.stringify({
      version: 1,
      timezone: "Africa/Cairo",
      source: {
        type: "package",
        id: "package-adrenaline",
      },
      eligibility: {
        mode: "class_ids",
        classIds: [
          "fitness-old",
          "weights-old",
          "dance-old",
        ],
        classTypes: [],
      },
    });

    const canonical = JSON.stringify({
      mode: "class_ids",
      classIds: [
        "dance-old",
        "fitness-old",
        "weights-old",
      ],
      classTypes: [],
    });

    const result =
      await resolveMembershipClassEligibility({
        userId: "u1",
        now,
        classes: [
          {
            id: "fitness-new",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
          {
            id: "weights-new",
            type: "Weights",
            classTypeId: "weights-type",
          },
          {
            id: "dance-new",
            type: "Dance",
            classTypeId: "dance-type",
          },
          {
            id: "kickboxing",
            type: "Kickboxing",
            classTypeId: "kickboxing-type",
          },
        ],
        memberships: [
          membership({
            eligibilitySnapshot: canonical,
            bookingPatternSnapshot:
              packageContract,
          }),
        ],
      });

    expect(result.allowedClassIds).toEqual([
      "fitness-new",
      "weights-new",
      "dance-new",
    ]);

    expect(result.allowedClassIds)
      .not.toContain("kickboxing");

    expect(result.membershipIdsByClass)
      .toEqual({
        "fitness-new": ["m1"],
        "weights-new": ["m1"],
        "dance-new": ["m1"],
      });
  });

  it("preserves legacy package compatibility when canonical eligibilitySnapshot is absent", async () => {
    mocks.findClasses.mockResolvedValue([
      {
        id: "fitness-old",
        classTypeId: "fitness-type",
      },
    ]);

    const result =
      await resolveMembershipClassEligibility({
        userId: "u1",
        now,
        classes: [
          {
            id: "fitness-new",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
          {
            id: "boxing",
            type: "Boxing",
            classTypeId: "boxing-type",
          },
        ],
        memberships: [
          membership({
            bookingPatternSnapshot:
              JSON.stringify({
                version: 1,
                timezone: "Africa/Cairo",
                source: {
                  type: "package",
                  id: "legacy-package",
                },
                eligibility: {
                  mode: "class_ids",
                  classIds: [
                    "fitness-old",
                  ],
                  classTypes: [],
                },
              }),
          }),
        ],
      });

    expect(result.allowedClassIds)
      .toEqual(["fitness-new"]);

    expect(result.allowedClassIds)
      .not.toContain("boxing");
  });

  it("does not widen a package when canonical class_ids and frozen package contract IDs differ", async () => {
    mocks.findClasses.mockResolvedValue([
      {
        id: "fitness-old",
        classTypeId: "fitness-type",
      },
    ]);

    const result =
      await resolveMembershipClassEligibility({
        userId: "u1",
        now,
        classes: [
          {
            id: "fitness-old",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
          {
            id: "fitness-new",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
        ],
        memberships: [
          membership({
            eligibilitySnapshot:
              JSON.stringify({
                mode: "class_ids",
                classIds: [
                  "fitness-old",
                  "different-id",
                ],
                classTypes: [],
              }),

            bookingPatternSnapshot:
              JSON.stringify({
                version: 1,
                timezone: "Africa/Cairo",
                source: {
                  type: "package",
                  id: "package-1",
                },
                eligibility: {
                  mode: "class_ids",
                  classIds: [
                    "fitness-old",
                  ],
                  classTypes: [],
                },
              }),
          }),
        ],
      });

    expect(result.allowedClassIds)
      .toEqual(["fitness-old"]);

    expect(result.allowedClassIds)
      .not.toContain("fitness-new");
  });

  it("does not widen a non-package canonical class_ids entitlement", async () => {
    mocks.findClasses.mockResolvedValue([
      {
        id: "fitness-old",
        classTypeId: "fitness-type",
      },
    ]);

    const result =
      await resolveMembershipClassEligibility({
        userId: "u1",
        now,
        classes: [
          {
            id: "fitness-old",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
          {
            id: "fitness-new",
            type: "Fitness",
            classTypeId: "fitness-type",
          },
        ],
        memberships: [
          membership({
            eligibilitySnapshot:
              JSON.stringify({
                mode: "class_ids",
                classIds: [
                  "fitness-old",
                ],
                classTypes: [],
              }),

            bookingPatternSnapshot:
              JSON.stringify({
                version: 1,
                timezone: "Africa/Cairo",
                source: {
                  type: "membership",
                  id: "membership-plan",
                },
                eligibility: {
                  mode: "class_ids",
                  classIds: [
                    "fitness-old",
                  ],
                  classTypes: [],
                },
              }),
          }),
        ],
      });

    expect(result.allowedClassIds)
      .toEqual(["fitness-old"]);

    expect(result.allowedClassIds)
      .not.toContain("fitness-new");

    expect(mocks.findClasses)
      .not.toHaveBeenCalled();
  });


});
