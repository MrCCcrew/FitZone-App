export type TrainerFileLink = {
  url: string;
  label: string;
};

function toCleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseTrainerTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function parseStoredTrainerTextList(value: string | null) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseStoredTrainerFileLinks(value: string | null) {
  if (!value) return [] as TrainerFileLink[];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (typeof item === "string") {
          const url = item.trim();
          return url ? { url, label: "" } : null;
        }

        if (item && typeof item === "object") {
          const url = toCleanString((item as { url?: unknown }).url);
          const label = toCleanString((item as { label?: unknown }).label);
          return url ? { url, label } : null;
        }

        return null;
      })
      .filter((item): item is TrainerFileLink => Boolean(item));
  } catch {
    return [];
  }
}

export function serializeTrainerFileLinks(value: unknown) {
  if (!Array.isArray(value)) return JSON.stringify([]);

  const normalized = value
    .map((item) => {
      if (typeof item === "string") {
        const url = item.trim();
        return url ? { url, label: "" } : null;
      }

      if (item && typeof item === "object") {
        const url = toCleanString((item as { url?: unknown }).url);
        const label = toCleanString((item as { label?: unknown }).label);
        return url ? { url, label } : null;
      }

      return null;
    })
    .filter((item): item is TrainerFileLink => Boolean(item));

  return JSON.stringify(normalized);
}
