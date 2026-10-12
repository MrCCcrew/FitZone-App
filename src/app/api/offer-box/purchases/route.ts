import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

const PAGE_SIZE = 20;
const responseHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

function parseSnapshot(raw: string) {
  try {
    const value = JSON.parse(raw) as {
      offer?: {
        title?: unknown;
        titleEn?: unknown;
        sessionsCount?: unknown;
        durationDays?: unknown;
      };
      membershipTemplate?: {
        name?: unknown;
      };
      eligibilitySnapshot?: {
        classIds?: unknown;
      };
    };

    const offer = value?.offer;
    const fallback = value?.membershipTemplate;

    const title =
      typeof offer?.title === "string" && offer.title.trim()
        ? offer.title
        : typeof fallback?.name === "string" && fallback.name.trim()
          ? fallback.name
          : "عرض مشتَرى";

    const titleEn =
      typeof offer?.titleEn === "string" ? offer.titleEn : null;

    const sessionsCount =
      typeof offer?.sessionsCount === "number" &&
      Number.isInteger(offer.sessionsCount) &&
      offer.sessionsCount >= 0
        ? offer.sessionsCount
        : null;

    const durationDays =
      typeof offer?.durationDays === "number" &&
      Number.isInteger(offer.durationDays) &&
      offer.durationDays > 0
        ? offer.durationDays
        : null;

    // Frozen canonical class rights, never the current offer configuration.
    // Missing or malformed rights fail closed.
    const rawClassIds = value?.eligibilitySnapshot?.classIds;

    const allowedClassIds = Array.isArray(rawClassIds)
      ? [
          ...new Set(
            rawClassIds
              .filter(
                (id): id is string =>
                  typeof id === "string" && id.trim().length > 0,
              )
              .map((id) => id.trim()),
          ),
        ]
      : [];

    return {
      title,
      titleEn,
      sessionsCount,
      durationDays,
      allowedClassIds,
    };
  } catch {
    return {
      title: "عرض مشتَرى",
      titleEn: null,
      sessionsCount: null,
      durationDays: null,
      allowedClassIds: [],
    };
  }
}

function errorResponse(status: number, message: string) {
  return NextResponse.json(
    { error: message },
    { status, headers: responseHeaders },
  );
}

export async function GET(req: Request) {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return errorResponse(401, "يجب تسجيل الدخول أولًا.");
  }

  const pageRaw = new URL(req.url).searchParams.get("page") ?? "0";

  if (!/^\d+$/.test(pageRaw)) {
    return errorResponse(400, "رقم الصفحة غير صالح.");
  }

  const page = Number(pageRaw);

  if (!Number.isSafeInteger(page) || page > 1000) {
    return errorResponse(400, "رقم الصفحة غير صالح.");
  }

  try {
    const rows = await db.offerBoxPurchase.findMany({
      where: {
        userId: user.id,
        status: { in: ["available", "redeemed"] },
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        userId: true,
        status: true,
        offerSnapshot: true,
        priceSnapshot: true,
        currency: true,
        paidAt: true,
        redeemedAt: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > PAGE_SIZE;

    const items = rows
      .slice(0, PAGE_SIZE)
      .filter((item) => item.userId === user.id)
      .map((item) => ({
        purchaseId: item.id,
        status: item.status,
        canRedeem: item.status === "available",
        ...parseSnapshot(item.offerSnapshot),
        price: item.priceSnapshot,
        currency: item.currency,
        paidAt: item.paidAt?.toISOString() ?? null,
        redeemedAt: item.redeemedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      }));

    return NextResponse.json(
      {
        items,
        page,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
      { headers: responseHeaders },
    );
  } catch (error) {
    console.error("[OFFER_BOX_PURCHASES_GET]", error);
    return errorResponse(
      500,
      "تعذر تحميل العروض المشتراة حاليًا.",
    );
  }
}