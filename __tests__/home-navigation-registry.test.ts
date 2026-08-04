import { describe, expect, it } from "vitest";
import { COACH_PAGES } from "@/lib/ai-coach/page-registry";

describe("homepage navigation registry", () => {
  it("uses the real classes section and homepage route", () => {
    expect(COACH_PAGES.find((page) => page.id === "classes")).toMatchObject({
      route: "/#classes",
      spaPage: "home",
      sectionId: "classes",
    });
  });

  it("does not register an unknown classes hash", () => {
    expect(COACH_PAGES.some((page) => String(page.route) === "/#missing-classes")).toBe(false);
  });
});
