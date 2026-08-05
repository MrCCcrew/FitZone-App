import { describe, expect, it } from "vitest";
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
  it("returns one restricted membership and its class", async () => {
    await expect(resolveMembershipClassEligibility({ userId: "u1", classes, now, memberships: [membership()] }))
      .resolves.toEqual({ hasEligibleMembership: true, unrestricted: false, allowedClassIds: ["yoga"], eligibleMembershipIds: ["m1"] });
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
      .resolves.toEqual({ hasEligibleMembership: false, unrestricted: false, allowedClassIds: [], eligibleMembershipIds: [] });
  });
});
