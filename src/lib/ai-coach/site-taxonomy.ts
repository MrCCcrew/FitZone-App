/**
 * Shared vocabulary for routing a question to the correct public data source.
 * It deliberately describes concepts, not database queries or model prompts.
 */
export const FITZONE_TAXONOMY = {
  offers: { aliases: ["عرض", "عروض", "خصم", "خصومات", "promo", "promotion", "offer"], subtypes: ["standard", "customization"] },
  memberships: { aliases: ["اشتراك", "اشتراكات", "عضوية", "عضويات", "شهري", "سنوي", "ربع سنوي", "نصف سنوي", "membership"] },
  packages: { aliases: ["باقة", "باقات", "bundle", "package"] },
  classes: { aliases: ["كلاس", "كلاسات", "حصة", "حصص", "kick boxing", "كيك بوكس", "يوجا", "بيلاتس", "كاراتيه", "جمباز"] },
  schedules: { aliases: ["ميعاد", "مواعيد", "امتى", "الجدول", "بكرة", "النهارده", "schedule"] },
  goals: { aliases: ["تخسيس", "شد الجسم", "لياقة", "قوة عضلية", "أطفال"] },
  trainers: { aliases: ["مدربة", "مدربات", "trainer", "coach"] },
  nutrition: { aliases: ["دكتورة تغذية", "تغذية", "دايت", "nutrition"] },
  products: { aliases: ["منتج", "منتجات", "المتجر", "الشوب", "shop", "store"] },
  product_categories: { aliases: ["قسم", "أقسام", "تصنيف", "فئة"] },
} as const;

export type SiteTaxonomyDomain = keyof typeof FITZONE_TAXONOMY;

export function classifyCatalogDomain(text: string): SiteTaxonomyDomain | null {
  const value = text.toLowerCase();
  // The head noun wins: "عرض كيك بوكس" is an offer, while "ميعاد كيك بوكس" is a schedule.
  if (FITZONE_TAXONOMY.offers.aliases.some((word) => value.includes(word))) return "offers";
  if (FITZONE_TAXONOMY.schedules.aliases.some((word) => value.includes(word))) return "schedules";
  if (FITZONE_TAXONOMY.memberships.aliases.some((word) => value.includes(word))) return "memberships";
  if (FITZONE_TAXONOMY.packages.aliases.some((word) => value.includes(word))) return "packages";
  if (FITZONE_TAXONOMY.classes.aliases.some((word) => value.includes(word))) return "classes";
  if (FITZONE_TAXONOMY.products.aliases.some((word) => value.includes(word))) return "products";
  return null;
}

export function requestedOfferSubtype(text: string): "customization" | "standard" | null {
  const value = text.toLowerCase();
  if (/تخصيص|مخصص|custom(?:ization)?|personalized/.test(value)) return "customization";
  if (/عادي|عادية|standard/.test(value)) return "standard";
  return null;
}
