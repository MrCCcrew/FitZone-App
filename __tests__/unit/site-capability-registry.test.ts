import { describe, expect, it } from "vitest";
import { COACH_PAGES } from "@/lib/ai-coach/page-registry";
import { capabilityPageIds, siteCapabilities } from "@/lib/ai-coach/site-capability-registry";

describe("site capability registry", () => {
  it("resolves every capability through the central page registry", () => {
    for (const capability of siteCapabilities) {
      const page = COACH_PAGES.find((item) => item.id === capabilityPageIds[capability.id]);
      expect(page).toBeDefined();
      expect(capability.sectionId).toBe(page?.sectionId ?? null);
      expect(capability.route).toBe(page?.route === "/?page=shop" ? "/?page=shop" : page?.route === "/account" ? "/account" : "/");
    }
  });

  it("does not expose a raw route or hash as an action", () => {
    expect(siteCapabilities.every((capability) => capability.actions.includes("navigate"))).toBe(true);
    expect(Object.values(capabilityPageIds).every((pageId) => COACH_PAGES.some((page) => page.id === pageId))).toBe(true);
  });
});
