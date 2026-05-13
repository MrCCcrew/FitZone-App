import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkNutritionist() {
  const guard = await requireAdminFeature("nutrition");
  if ("error" in guard) return { error: guard.error, userId: null };
  return { error: null, userId: guard.session.user.id };
}

// GET /api/nutritionist/slots — get own profile + slots
export async function GET() {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const profile = await db.nutritionistProfile.findUnique({
    where: { userId: userId! },
    select: { id: true, name: true, slotsJson: true, consultationFee: true, consultationFeeMember: true, followupFee: true, followupFeeMember: true },
  });
  if (!profile) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });

  return NextResponse.json({
    profile: {
      ...profile,
      slots: profile.slotsJson ? (JSON.parse(profile.slotsJson) as { label: string; day: string; time: string }[]) : [],
    },
  });
}

// PATCH /api/nutritionist/slots — update available slots
export async function PATCH(req: Request) {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const body = await req.json() as { slots: { label: string; day: string; time: string }[] };
  if (!Array.isArray(body.slots)) return NextResponse.json({ error: "slots مطلوب" }, { status: 400 });

  const profile = await db.nutritionistProfile.findUnique({ where: { userId: userId! } });
  if (!profile) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });

  await db.nutritionistProfile.update({
    where: { userId: userId! },
    data: { slotsJson: JSON.stringify(body.slots) },
  });

  await clearPublicApiCache();
  return NextResponse.json({ ok: true, slots: body.slots });
}
