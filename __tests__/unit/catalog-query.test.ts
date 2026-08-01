import { describe, expect, it } from "vitest";
import { extractCatalogSearchQuery } from "@/lib/catalog-query";

describe("catalog query extraction", () => {
  it.each([
    ["membership", "إيه أسعار الاشتراكات؟", "", true],
    ["membership", "إيه الاشتراكات المتاحة؟", "", true],
    ["product", "عندكم منتجات للتخسيس؟", "تخسيس", false],
    ["product", "إيه الموجود في المتجر؟", "", true],
    ["class", "مواعيد كلاس الكيك بوكس إيه؟", "كيك بوكس", false],
    ["class", "مواعيد الكلاسات إيه؟", "", true],
    ["product", "عايز أشوف المنتجات", "", true],
    ["product", "منتجات فيت زون", "", true],
    ["membership", "عايز أشوف الاشتراكات", "", true],
    ["class", "وريني الكلاسات", "", true],
    ["product", "عندكم منتجات للتخسيس؟", "تخسيس", false],
  ] as const)("extracts $kind question $question without conversational filler", (kind, question, searchTerm, isListAll) => {
    expect(extractCatalogSearchQuery(kind, question)).toEqual({ searchTerm, isListAll });
  });
});
