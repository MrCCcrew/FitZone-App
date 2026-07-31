/** Display-only labels for legacy/internal class type keys. */
const ARABIC_CLASS_TYPE_LABELS: Record<string, string> = {
  "children's fitness": "فيتنس أطفال", "childrens fitness": "فيتنس أطفال",
  building: "حديد وأجهزة", "iron on devices": "حديد وأجهزة", "zumba mix": "زومبا ميكس",
  "belly dance": "رقص شرقي", fitness: "فيتنس", kickbox: "كيك بوكس", kickboxing: "كيك بوكس",
  "yoga and pilates": "يوجا وبيلاتس", yoga: "يوجا", pilates: "بيلاتس", zumba: "زومبا",
  boxing: "كيك بوكس", cardio: "كارديو", strength: "قوة", crossfit: "كروس فيت", dance: "رقص شرقي", kids: "أطفال",
  bodybuilding: "حديد وأجهزة", karate: "كاراتيه", selfdefense: "سلف ديفنس",
};

export function getClassTypeArabicLabel(classType: string | null | undefined) {
  const original = classType?.trim() ?? "";
  return ARABIC_CLASS_TYPE_LABELS[original.toLowerCase()] ?? original;
}
