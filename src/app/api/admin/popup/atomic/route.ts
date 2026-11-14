import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAdminSession } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseOffers } from "@/lib/popup/parse-offers";

export const dynamic = "force-dynamic";

const MAIN = "main";

const DEFAULTS = {
  enabled: false,
  ribbonText: "💗 PINK FRIDAY — لفترة محدودة",
  endDate: null as Date | null,
  showDelaySeconds: 2.5,
  hideHours: 24,
  revision: 0,
};

function respond(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function authorize() {
  const session = await getAdminSession();
  if (!session) return respond({ error: "Unauthorized" }, 401);
  if (session.role !== "admin") {
    return respond({ error: "Forbidden" }, 403);
  }
  return null;
}

class RevisionConflict extends Error {}

export async function GET() {
  const denied = await authorize();
  if (denied) return denied;

  try {
    const [settings, offers] = await db.$transaction(
      [
        db.popupSettings.findUnique({ where: { id: MAIN } }),
        db.popupOffer.findMany({
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return respond({
      settings: settings ?? {
        id: MAIN,
        ...DEFAULTS,
        updatedAt: null,
      },
      offers,
    });
  } catch {
    return respond({ error: "Unable to load popup campaign" }, 500);
  }
}

export async function PUT(request: Request) {
  const denied = await authorize();
  if (denied) return denied;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ error: "Invalid request body" }, 400);
  }

  const input = body as Record<string, unknown>;
  const allowed = new Set([
    "expectedRevision",
    "settings",
    "offers",
  ]);

  if (
    Object.keys(input).length !== 3 ||
    Object.keys(input).some((key) => !allowed.has(key))
  ) {
    return respond({ error: "Invalid campaign payload" }, 400);
  }

  const expectedRevision = input.expectedRevision;

  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0
  ) {
    return respond({ error: "Invalid expectedRevision" }, 400);
  }

  const settingsInput = input.settings;

  if (
    !settingsInput ||
    typeof settingsInput !== "object" ||
    Array.isArray(settingsInput)
  ) {
    return respond({ error: "Invalid settings" }, 400);
  }

  const settings = settingsInput as Record<string, unknown>;
  const settingKeys = [
    "enabled",
    "ribbonText",
    "endDate",
    "showDelaySeconds",
    "hideHours",
  ];

  if (
    Object.keys(settings).length !== settingKeys.length ||
    Object.keys(settings).some((key) => !settingKeys.includes(key)) ||
    typeof settings.enabled !== "boolean" ||
    typeof settings.ribbonText !== "string" ||
    settings.ribbonText.trim().length === 0 ||
    settings.ribbonText.length > 191 ||
    typeof settings.showDelaySeconds !== "number" ||
    !Number.isFinite(settings.showDelaySeconds) ||
    settings.showDelaySeconds < 0 ||
    settings.showDelaySeconds > 60 ||
    typeof settings.hideHours !== "number" ||
    !Number.isInteger(settings.hideHours) ||
    settings.hideHours < 0 ||
    settings.hideHours > 720
  ) {
    return respond({ error: "Invalid campaign settings" }, 400);
  }

  let endDate: Date | null = null;

  if (settings.endDate !== null) {
    if (
      typeof settings.endDate !== "string" ||
      !/(Z|[+-]\d{2}:\d{2})$/i.test(settings.endDate)
    ) {
      return respond({ error: "End date requires timezone" }, 400);
    }

    endDate = new Date(settings.endDate);

    if (!Number.isFinite(endDate.getTime())) {
      return respond({ error: "Invalid end date" }, 400);
    }
  }

  if (
    settings.enabled &&
    (!endDate || endDate.getTime() <= Date.now())
  ) {
    return respond({ error: "Active campaign requires a future end date" }, 400);
  }

  const parsed = parseOffers({ offers: input.offers });

  if ("error" in parsed) {
    return respond({ error: parsed.error }, 400);
  }

  const values = {
    enabled: settings.enabled as boolean,
    ribbonText: (settings.ribbonText as string).trim(),
    endDate,
    showDelaySeconds: settings.showDelaySeconds as number,
    hideHours: settings.hideHours as number,
  };

  try {
    const result = await db.$transaction(
      async (tx) => {
        await tx.popupSettings.upsert({
          where: { id: MAIN },
          create: { id: MAIN, enabled: false },
          update: {},
        });

        // Compare-and-swap occurs INSIDE the transaction.
        // A stale writer must never modify the offer list.
        const claim = await tx.popupSettings.updateMany({
          where: {
            id: MAIN,
            revision: expectedRevision,
          },
          data: {
            ...values,
            revision: { increment: 1 },
          },
        });

        if (claim.count !== 1) {
          throw new RevisionConflict("Popup campaign changed");
        }

        const ids = parsed.offers.map((item) => item.offerId);

        const existing = await tx.offer.findMany({
          where: { id: { in: ids } },
          select: { id: true },
        });

        if (existing.length !== ids.length) {
          throw new Error("INVALID_LINKED_OFFERS");
        }

        await tx.popupOffer.deleteMany({});

        if (parsed.offers.length > 0) {
          await tx.popupOffer.createMany({
            data: parsed.offers,
          });
        }

        const savedSettings = await tx.popupSettings.findUniqueOrThrow({
          where: { id: MAIN },
        });

        const savedOffers = await tx.popupOffer.findMany({
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });

        return {
          settings: savedSettings,
          offers: savedOffers,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return respond(result);
  } catch (error) {
    if (error instanceof RevisionConflict) {
      return respond({
        error: "Popup campaign changed. Reload before saving.",
      }, 409);
    }

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2034"
    ) {
      return respond({
        error: "Concurrent popup save. Reload before retrying.",
      }, 409);
    }

    if (error instanceof Error && error.message === "INVALID_LINKED_OFFERS") {
      return respond({ error: "Invalid linked offers" }, 400);
    }

    return respond({ error: "Unable to save popup campaign" }, 500);
  }
}