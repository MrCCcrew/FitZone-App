export const HEALTH_CLASS_TYPE_LABELS: Record<string, string> = {
  fitness: "فيتنس",
  cardio: "كارديو",
  zumba: "زومبا",
  yoga: "يوجا",
  pilates: "بيلاتس",
  strength: "قوة",
  crossfit: "كروس فيت",
  bodybuilding: "بيلدينج",
  building: "بيلدينج",
  boxing: "كيك بوكس",
  kickboxing: "كيك بوكس",
  selfdefense: "سلف ديفنس",
  karate: "كاراتيه",
  kids: "أطفال",
  dance: "رقص شرقي",
};

export const HEALTH_CLASS_TYPE_ALIASES: Record<string, string> =
  Object.entries(HEALTH_CLASS_TYPE_LABELS).reduce(
    (acc, [key, label]) => {
      acc[key] = key;
      acc[label] = key;
      return acc;
    },
    {} as Record<string, string>,
  );

export function normalizeHealthClassTypeKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();

  return (
    HEALTH_CLASS_TYPE_ALIASES[lower] ??
    HEALTH_CLASS_TYPE_ALIASES[trimmed] ??
    lower
  );
}

export function formatHealthClassType(value: string) {
  const key = normalizeHealthClassTypeKey(value);
  return HEALTH_CLASS_TYPE_LABELS[key] ?? value;
}
