import { describe, expect, it } from "vitest";
import { getSiteCapability, siteCapabilities } from "@/lib/ai-coach/site-capability-registry";

describe("site capability registry", () => {
  it("uses only allowlisted routes and read-only tool names", () => {
    expect(siteCapabilities.length).toBeGreaterThan(8);
    for (const capability of siteCapabilities) {
      expect(["/", "/store", "/account"]).toContain(capability.route);
      expect(capability.tools.every((tool) => !/delete|update|write|sql|payment/i.test(tool))).toBe(true);
    }
  });

  it("maps visual domains to their page sections", () => {
    expect(getSiteCapability("store")).toMatchObject({ route: "/store", sectionId: "shop-products" });
    expect(getSiteCapability("trainers")).toMatchObject({ sectionId: "trainers-list" });
    expect(getSiteCapability("account")?.requiresAuthentication).toBe(true);
  });
});
