import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Offer Box frozen eligibility contract", () => {
  it("prefers the persisted eligibility snapshot over mutable live offer eligibility", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/payments/membership-booking-plan.ts",
      ),
      "utf8",
    ).replace(/\r\n/g, "\n");

    const functionStart = source.indexOf(
      "export async function applyMembershipBookingPlanTx",
    );

    const functionEnd = source.indexOf(
      "export async function ensureMembershipBookingsTx",
      functionStart,
    );

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);

    const region = source.slice(
      functionStart,
      functionEnd,
    );

    /*
     * Offer Box creates UserMembership with eligibilitySnapshot already
     * frozen at purchase time. The first booking/redemption call must
     * prefer that snapshot before consulting mutable Offer configuration.
     */
    expect(region).toMatch(
      /const preexistingFrozenEligibility\s*=\s*parseEligibilityPolicySnapshot\(\s*preexistingContractRecord\?\.eligibilitySnapshot,\s*\);/,
    );

    expect(region).toMatch(
      /const liveEligibilitySnapshot\s*=\s*!hasFrozenBookingContract\s*\?\s*preexistingFrozenEligibility\s*\?\?\s*await getEligibilityPolicySnapshotForSource\(source,\s*tx\)\s*:\s*null;/,
    );

    /*
     * Final class validation must again start from the persisted
     * UserMembership eligibilitySnapshot.
     */
    expect(region).toMatch(
      /let frozenEligibility:[\s\S]*?=\s*parseEligibilityPolicySnapshot\(\s*existingMembershipSnapshot\?\.eligibilitySnapshot,\s*\);/,
    );

    expect(region).toMatch(
      /if \(!frozenEligibility\)[\s\S]*?frozenEligibility\s*=\s*liveEligibilitySnapshot\s*\?\?\s*await getEligibilityPolicySnapshotForSource\(source,\s*tx\);/,
    );

    expect(region).toMatch(
      /isClassAllowedByEligibilitySnapshot\(\s*frozenEligibility,\s*classId,\s*tx,\s*\)/,
    );

    const persistedSnapshotIndex =
      region.indexOf(
        "const preexistingFrozenEligibility =",
      );

    const liveLookupIndex =
      region.indexOf(
        "await getEligibilityPolicySnapshotForSource(source, tx)",
        persistedSnapshotIndex,
      );

    const finalFrozenIndex =
      region.indexOf(
        "let frozenEligibility",
      );

    const finalLiveFallbackIndex =
      region.indexOf(
        "if (!frozenEligibility)",
        finalFrozenIndex,
      );

    const eligibilityGateIndex =
      region.indexOf(
        "await isClassAllowedByEligibilitySnapshot(",
        finalFrozenIndex,
      );

    expect(persistedSnapshotIndex)
      .toBeGreaterThanOrEqual(0);

    expect(liveLookupIndex)
      .toBeGreaterThan(persistedSnapshotIndex);

    expect(finalFrozenIndex)
      .toBeGreaterThanOrEqual(0);

    expect(finalLiveFallbackIndex)
      .toBeGreaterThan(finalFrozenIndex);

    expect(eligibilityGateIndex)
      .toBeGreaterThan(finalLiveFallbackIndex);
  });
});