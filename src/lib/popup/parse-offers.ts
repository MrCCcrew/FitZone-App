import { R2_PUBLIC_URL } from "@/lib/r2";

type PopupOfferInput = {
  offerId: string;
  imageUrl: string | null;
  badge: string | null;
  sortOrder: number;
  isActive: boolean;
};

function validImageUrl(value: string): boolean {
  if (value.length > 2048 || value.trim() !== value) {
    return false;
  }

  if (/^\/offers\/[a-zA-Z0-9/_-]+\.(webp|png|jpg|jpeg|avif)$/i.test(value)) {
    return !value.includes("..");
  }

  if (!R2_PUBLIC_URL) return false;

  try {
    const url = new URL(value);
    const base = new URL(R2_PUBLIC_URL);

    return (
      url.protocol === "https:" &&
      url.origin === base.origin &&
      url.pathname.startsWith(
        `${base.pathname.replace(/\/$/, "")}/popup/`,
      ) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !url.pathname.includes("..")
    );
  } catch {
    return false;
  }
}

export function parseOffers(
  body: unknown,
): { offers: PopupOfferInput[] } | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }

  const input = body as Record<string, unknown>;

  if (
    Object.keys(input).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(input, "offers") ||
    !Array.isArray(input.offers)
  ) {
    return { error: "Expected an offers array" };
  }

  if (input.offers.length > 3) {
    return { error: "Maximum three popup offers" };
  }

  const parsed: PopupOfferInput[] = [];
  const seen = new Set<string>();

  for (const item of input.offers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Invalid offer item" };
    }

    const record = item as Record<string, unknown>;
    const fields = [
      "offerId",
      "imageUrl",
      "badge",
      "sortOrder",
      "isActive",
    ];

    if (
      Object.keys(record).some((key) => !fields.includes(key))
    ) {
      return { error: "Unexpected popup offer field" };
    }

    if (
      typeof record.offerId !== "string" ||
      record.offerId.length === 0 ||
      record.offerId.length > 191 ||
      seen.has(record.offerId)
    ) {
      return { error: "Invalid or duplicate offerId" };
    }

    if (
      record.imageUrl !== null &&
      record.imageUrl !== undefined &&
      (typeof record.imageUrl !== "string" ||
        !validImageUrl(record.imageUrl))
    ) {
      return { error: "Invalid popup image URL" };
    }

    if (
      record.badge !== null &&
      record.badge !== undefined &&
      (typeof record.badge !== "string" ||
        record.badge.length > 100)
    ) {
      return { error: "Invalid popup badge" };
    }

    if (
      record.isActive !== undefined &&
      typeof record.isActive !== "boolean"
    ) {
      return { error: "Invalid isActive value" };
    }

    if (
      record.sortOrder !== undefined &&
      (!Number.isInteger(record.sortOrder) ||
        (record.sortOrder as number) < 0 ||
        (record.sortOrder as number) > 100)
    ) {
      return { error: "Invalid sort order" };
    }

    seen.add(record.offerId);

    parsed.push({
      offerId: record.offerId,
      imageUrl: (record.imageUrl as string | null) ?? null,
      badge: (record.badge as string | null) ?? null,
      sortOrder: parsed.length + 1,
      isActive: (record.isActive as boolean | undefined) ?? true,
    });
  }

  return { offers: parsed };
}
