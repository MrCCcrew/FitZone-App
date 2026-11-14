import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-session";
import { db } from "@/lib/db";
import { parseOffers } from "@/lib/popup/parse-offers";


export const dynamic = "force-dynamic";

function response(
  data: unknown,
  status = 200,
) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function requirePopupAdmin() {
  const session = await getAdminSession();

  if (!session) {
    return response({ error: "Unauthorized" }, 401);
  }

  if (session.role !== "admin") {
    return response({ error: "Forbidden" }, 403);
  }

  return null;
}

export async function GET() {
  const denied = await requirePopupAdmin();
  if (denied) return denied;

  try {
    const offers = await db.popupOffer.findMany({
      orderBy: [
        { sortOrder: "asc" },
        { id: "asc" },
      ],
      include: {
        offer: {
          select: {
            id: true,
            title: true,
            titleEn: true,
            isActive: true,
            expiresAt: true,
            specialPrice: true,
            priceBefore: true,
            durationDays: true,
            sessionsCount: true,
            features: true,
            membershipId: true,
            offerBoxEnabled: true,
            friendOfferConfig: {
              select: { id: true },
            },
          },
        },
      },
    });

    return response({ offers });
  } catch {
    return response(
      { error: "Unable to load popup offers" },
      500,
    );
  }
}

export async function PUT(request: Request) {
  const denied = await requirePopupAdmin();
  if (denied) return denied;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid JSON" }, 400);
  }

  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Number.isInteger((body as Record<string, unknown>).expectedRevision)
  ) {
    return response(
      { error: "Use the atomic popup save endpoint" },
      409,
    );
  }

  const parsed = parseOffers(body);

  if ("error" in parsed) {
    return response({ error: parsed.error }, 400);
  }

  return response(
    { error: "Use the atomic popup save endpoint" },
    409,
  );
}
