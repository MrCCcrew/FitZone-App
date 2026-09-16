import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "src/app/FitzoneApp.tsx",
  "utf8",
);

function sectionBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

describe("frontend offer canonical eligibility contract", () => {
  it("PublicOffer exposes canonical allowedClassIds", () => {
    const publicOffer = sectionBetween(
      "type PublicOffer = {",
      "type FriendOfferGroupView = {",
    );

    expect(publicOffer).toContain("allowedClassTypes?: string[];");
    expect(publicOffer).toContain("allowedClassIds?: string[];");
  });

  it("linked membership + offer overrides membership eligibility with offer canonical IDs", () => {
    const linkedOfferFlow = sectionBetween(
      "const matchedOffer = offerId",
      "// If membership not found",
    );

    expect(linkedOfferFlow).toContain(
      "allowedClassIds: Array.isArray(matchedOffer.allowedClassIds)",
    );
    expect(linkedOfferFlow).toContain(
      "? matchedOffer.allowedClassIds",
    );

    expect(linkedOfferFlow).toContain(
      "allowedClassTypes: Array.isArray(matchedOffer.allowedClassTypes)",
    );
  });

  it("virtual special offer plan carries canonical offer allowedClassIds", () => {
    const virtualOfferFlow = sectionBetween(
      "const virtualOfferPlan: PlanItem = {",
      "// For special offers, load filtered schedules",
    );

    expect(virtualOfferFlow).toContain(
      "allowedClassIds: Array.isArray(offer.allowedClassIds)",
    );
    expect(virtualOfferFlow).toContain(
      "? offer.allowedClassIds",
    );
  });

  it("canonical IDs take priority over legacy type fallback", () => {
    const eligibilityFlow = sectionBetween(
      "const planAllowedClassIds = useMemo",
      "const scheduleChoices = useMemo",
    );

    expect(eligibilityFlow).toContain(
      "Array.isArray(schedulePlan.allowedClassIds)",
    );

    expect(eligibilityFlow).toContain(
      "new Set(schedulePlan.allowedClassIds)",
    );

    expect(eligibilityFlow).toContain(
      "if (!schedulePlan || Array.isArray(schedulePlan.allowedClassIds))",
    );
  });

  it("schedule choices reject classes outside canonical IDs", () => {
    const scheduleFlow = sectionBetween(
      "const scheduleChoices = useMemo",
      "rows.sort(",
    );

    expect(scheduleFlow).toContain(
      "if (planAllowedClassIds && !planAllowedClassIds.has(c.id)) return;",
    );
  });
});
