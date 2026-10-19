import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { evaluateEgyptianNationalIdAgeEligibility } from "@/lib/offer-age-eligibility";

export async function POST(req: Request) {
  const noStore = { "Cache-Control": "no-store" };

  const user = await getCurrentAppUser();

  if (!user?.id) {
    return NextResponse.json(
      { eligible: false, error: "يرجى تسجيل الدخول أولًا." },
      { status: 401, headers: noStore },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    offerId?: unknown;
    egyptianNationalId?: unknown;
  } | null;

  if (
    typeof body?.offerId !== "string" ||
    !body.offerId.trim()
  ) {
    return NextResponse.json(
      { eligible: false, error: "يرجى اختيار العرض أولًا." },
      { status: 400, headers: noStore },
    );
  }

  const offer = await db.offer.findUnique({
    where: { id: body.offerId },
    select: {
      isActive: true,
      expiresAt: true,
      requiresEgyptianNationalId: true,
      minAgeYears: true,
      maxAgeYears: true,
    },
  });

  if (
    !offer ||
    !offer.isActive ||
    offer.expiresAt <= new Date() ||
    !offer.requiresEgyptianNationalId
  ) {
    return NextResponse.json(
      {
        eligible: false,
        error: "هذا العرض غير متاح للتحقق حاليًا.",
      },
      { status: 400, headers: noStore },
    );
  }

  const eligibility = evaluateEgyptianNationalIdAgeEligibility({
    egyptianNationalId: body.egyptianNationalId,
    minAgeYears: offer.minAgeYears,
    maxAgeYears: offer.maxAgeYears,
    now: new Date(),
  });

  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        eligible: false,
        code: eligibility.code,
        error: eligibility.message,
      },
      { status: 400, headers: noStore },
    );
  }

  // No ID storage, payment transaction, membership or booking.
  return NextResponse.json(
    { eligible: true },
    { headers: noStore },
  );
}
