import { describe, expect, it } from "vitest";
import { classifyCatalogDomain } from "@/lib/ai-coach/site-taxonomy";
import { understandCoachMessage } from "@/lib/ai-coach/understanding";
import { selectCoachTools } from "@/lib/ai-coach/tool-registry";
import { realtimeToolDefinitions } from "@/lib/ai-coach/voice/realtime-provider";

describe("package and subscription routing", () => {
  it("keeps the catalog head noun distinct", () => {
    expect(classifyCatalogDomain("باقة كيك بوكس")).toBe("packages");
    expect(classifyCatalogDomain("اشتراك كيك بوكس")).toBe("memberships");
    expect(classifyCatalogDomain("عرض كيك بوكس")).toBe("offers");
    expect(classifyCatalogDomain("ميعاد الكيك بوكس")).toBe("schedules");
  });

  it("assigns package requests to the package tool", async () => {
    const result = await understandCoachMessage("إيه الباقات؟", "ar");
    expect(result.domain).toBe("packages");
    expect(result.extractedEntities.catalogType).toBe("package");
    expect(result.allowedTools).toEqual(["searchPackages"]);
    expect(selectCoachTools("pricing", "", false, "package")).toEqual(["searchPackages"]);
  });

  it("assigns subscription requests to the membership tool", async () => {
    const result = await understandCoachMessage("إيه الاشتراكات؟", "ar");
    expect(result.domain).toBe("memberships");
    expect(result.extractedEntities.catalogType).toBe("membership");
    expect(result.allowedTools).toEqual(["searchMemberships"]);
  });

  it("retains package context for price sorting and subscription context for annual filtering", async () => {
    const packages = await understandCoachMessage("طب الأرخص؟", "ar", { lastDomain: "packages", lastIntent: "pricing", contextUpdatedAt: new Date().toISOString() });
    expect(packages).toMatchObject({ domain: "packages", sort: "price_asc", extractedEntities: { catalogType: "package" } });
    const memberships = await understandCoachMessage("والسنوي؟", "ar", { lastDomain: "memberships", lastIntent: "pricing", contextUpdatedAt: new Date().toISOString() });
    expect(memberships).toMatchObject({ domain: "memberships", extractedEntities: { catalogType: "membership", searchTerm: "سنوي" } });
  });

  it("exposes package lookup to realtime without replacing read-only tools", () => {
    expect(realtimeToolDefinitions.map(([name]) => name)).toContain("searchPackages");
    expect(realtimeToolDefinitions.map(([name]) => name)).toContain("searchMemberships");
  });
});
