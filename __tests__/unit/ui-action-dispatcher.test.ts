import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  actionsFromNavigationTarget,
  COACH_SECTION_IDS,
  parseCoachUiActionBatch,
} from "@/lib/ai-coach/ui-action-dispatcher";

describe("AI Coach UI action dispatcher", () => {
  it("accepts only declared actions, pages, and registry sections", () => {
    const batch = parseCoachUiActionBatch({
      actions: [
        { type: "navigateToPage", page: "shop" },
        { type: "openSection", sectionId: "shop-products" },
        { type: "setProductFilters", searchTerm: "تخسيس", sort: "price_asc" },
      ],
    });
    expect(batch?.actions).toHaveLength(3);
    expect(COACH_SECTION_IDS).toContain("shop-products");
  });

  it("rejects raw URLs, selectors, callbacks, and write actions", () => {
    expect(parseCoachUiActionBatch({ actions: [{ type: "navigateToPage", page: "https://bad.example" }] })).toBeNull();
    expect(parseCoachUiActionBatch({ actions: [{ type: "openSection", sectionId: "#anything > script" }] })).toBeNull();
    expect(parseCoachUiActionBatch({ actions: [{ type: "executeJavaScript", code: "alert(1)" }] })).toBeNull();
    expect(parseCoachUiActionBatch({ actions: [{ type: "setProductFilters", searchTerm: "x", callback: "evil" }] })).toBeNull();
  });

  it("creates a constrained navigation sequence from an interactive tool target", () => {
    const batch = actionsFromNavigationTarget({ page: "/", sectionId: "trainers-list" });
    expect(batch?.actions).toEqual([
      { type: "clearPreviousCoachState" },
      { type: "navigateToPage", page: "trainers" },
      { type: "openSection", sectionId: "trainers-list" },
      { type: "scrollToSection", sectionId: "trainers-list" },
    ]);
  });

  it("does not create a client action for unknown or unavailable targets", () => {
    expect(actionsFromNavigationTarget({ page: "/evil", sectionId: "evil" })).toBeNull();
    expect(actionsFromNavigationTarget(null)).toBeNull();
  });

  it("keeps every Registry section target backed by a rendered FitzoneApp target", () => {
    const source = readFileSync(join(process.cwd(), "src/app/FitzoneApp.tsx"), "utf8");
    for (const sectionId of COACH_SECTION_IDS) {
      expect(source).toContain(`id="${sectionId}"`);
    }
  });
});
