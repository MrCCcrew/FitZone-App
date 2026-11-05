export function normalizeCatalogCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_-]/g, "");
}

export function normalizeRequiredName(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizeSortOrder(value: unknown) {
  if (value == null || value === "") return 0;

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error("INVALID_SORT_ORDER");
  }

  return parsed;
}
