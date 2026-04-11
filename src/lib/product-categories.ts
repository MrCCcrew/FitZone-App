import { db } from "@/lib/db";

const globalForProductCategories = globalThis as unknown as {
  fitzoneDefaultProductCategoriesEnsured?: boolean;
};

export const DEFAULT_PRODUCT_CATEGORIES = [
  { key: "supplement", label: "مكملات", labelEn: "Supplements", sizeType: "none", sortOrder: 1 },
  { key: "gear", label: "معدات", labelEn: "Equipment", sizeType: "none", sortOrder: 2 },
  { key: "clothing", label: "ملابس", labelEn: "Clothing", sizeType: "clothing", sortOrder: 3 },
  { key: "accessory", label: "إكسسوار", labelEn: "Accessories", sizeType: "none", sortOrder: 4 },
  { key: "shoes", label: "أحذية", labelEn: "Shoes", sizeType: "shoes", sortOrder: 5 },
] as const;

export async function ensureDefaultProductCategories() {
  if (globalForProductCategories.fitzoneDefaultProductCategoriesEnsured) return;

  const count = await db.productCategory.count();
  if (count > 0) {
    globalForProductCategories.fitzoneDefaultProductCategoriesEnsured = true;
    return;
  }

  await db.productCategory.createMany({
    data: DEFAULT_PRODUCT_CATEGORIES.map((category) => ({
      ...category,
      isActive: true,
    })),
  });

  globalForProductCategories.fitzoneDefaultProductCategoriesEnsured = true;
}
