import { describe, expect, it } from "vitest";
import { classifyCatalogDomain, requestedOfferSubtype } from "@/lib/ai-coach/site-taxonomy";

describe("FitZone site taxonomy", () => {
  it("uses the head noun to distinguish a class, schedule, package, membership, and offer", () => {
    expect(classifyCatalogDomain("ميعاد الكيك بوكس")).toBe("schedules");
    expect(classifyCatalogDomain("باقة كيك بوكس")).toBe("packages");
    expect(classifyCatalogDomain("اشتراك الكيك بوكس")).toBe("memberships");
    expect(classifyCatalogDomain("عرض الكيك بوكس")).toBe("offers");
  });

  it("recognizes customization as a distinct offer subtype", () => {
    expect(requestedOfferSubtype("إيه عروض التخصيص؟")).toBe("customization");
    expect(requestedOfferSubtype("العروض العادية لسه شغالة؟")).toBe("standard");
  });
});
