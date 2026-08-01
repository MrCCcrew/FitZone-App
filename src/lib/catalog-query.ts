export type CatalogSearchKind = "membership" | "product" | "class";

export type CatalogSearchQuery = { searchTerm: string; isListAll: boolean };

const ARABIC_DIACRITICS = /[\u064B-\u065F\u0670]/g;
const PUNCTUATION = /[^\p{L}\p{N}\s-]/gu;

function normalize(value: string) {
  return value.toLowerCase().replace(ARABIC_DIACRITICS, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(PUNCTUATION, " ").replace(/\s+/g, " ").trim();
}

const COMMON_WORDS = new Set(["ايه", "اي", "ما", "ماهي", "ماهو", "هل", "عندكم", "عندك", "في", "من", "عن", "على", "و", "او", "طب", "بس", "وريني", "اعرض", "كل", "وال", "بكام", "موجود", "الموجود", "متاح", "المتاح", "متاحه", "المتاحه", "الحالي", "حاليا", "دلوقتي", "عايز", "عايزه", "اريد", "اشوف", "شوف", "عايزة", "عاوز", "عاوزه", "افتح", "افتحلي", "الحاجات", "اللي", "بتتباع", "فيت", "زون", "fitzone"]);
const KIND_WORDS: Record<CatalogSearchKind, Set<string>> = {
  membership: new Set(["اسعار", "سعر", "الاشتراكات", "اشتراكات", "اشتراك", "الباقات", "باقات", "الباقه", "باقة", "عضوية", "عضويات"]),
  product: new Set(["المنتجات", "المنتج", "منتجات", "منتج", "المتجر", "متجر", "الشوب", "شوب", "shop", "store", "الموجود"]),
  class: new Set(["مواعيد", "ميعاد", "كلاس", "كلاسات", "الكلاسات", "الجدول", "جدول", "الحصص", "حصص", "الكلاس"]),
};

/** Extracts the catalog subject, never passing the full conversational question to a text filter. */
export function extractCatalogSearchQuery(kind: CatalogSearchKind, question: string): CatalogSearchQuery {
  const terms = normalize(question)
    .split(" ")
    .map((term) => term === "الكيك" ? "كيك" : term.startsWith("لل") && term.length > 3 ? term.slice(2) : term)
    .filter((term) => term.length > 1 && !COMMON_WORDS.has(term) && !KIND_WORDS[kind].has(term));
  return { searchTerm: terms.join(" "), isListAll: terms.length === 0 };
}

export function normalizeCatalogText(value: string) { return normalize(value); }
