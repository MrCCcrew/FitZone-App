import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkNutritionist() {
  const guard = await requireAdminFeature("nutrition");
  if ("error" in guard) return { error: guard.error, userId: null };
  return { error: null, userId: guard.session.user.id };
}

// GET /api/nutritionist/slots — get own profile + slots + questions
export async function GET() {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const profile = await (db as any).nutritionistProfile.findUnique({
    where: { userId: userId! },
    select: {
      id: true,
      name: true,
      slotsJson: true,
      questionsJson: true,
      consultationFee: true,
      consultationFeeMember: true,
      followupFee: true,
      followupFeeMember: true,
      commissionRate: true,
      commissionType: true,
    },
  });
  if (!profile) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });

  return NextResponse.json({
    profile: {
      ...profile,
      slots: profile.slotsJson ? (JSON.parse(profile.slotsJson) as { label: string; day: string; time: string }[]) : [],
      questions: profile.questionsJson ? JSON.parse(profile.questionsJson) : [],
    },
  });
}

// PATCH /api/nutritionist/slots — update slots and/or questions
export async function PATCH(req: Request) {
  const { error, userId } = await checkNutritionist();
  if (error) return error;

  const body = await req.json() as {
    slots?: { label: string; day: string; time: string }[];
    questions?: { id: string; label: string; type: string; required: boolean; options?: string[] }[];
  };

  const profile = await db.nutritionistProfile.findUnique({ where: { userId: userId! } });
  if (!profile) return NextResponse.json({ error: "الملف غير موجود" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.slots !== undefined) {
    if (!Array.isArray(body.slots)) return NextResponse.json({ error: "slots يجب أن يكون مصفوفة" }, { status: 400 });
    data.slotsJson = JSON.stringify(body.slots);
  }
  if (body.questions !== undefined) {
    if (!Array.isArray(body.questions)) return NextResponse.json({ error: "questions يجب أن يكون مصفوفة" }, { status: 400 });
    data.questionsJson = JSON.stringify(body.questions);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
  }

  await (db as any).nutritionistProfile.update({
    where: { userId: userId! },
    data,
  });

  await clearPublicApiCache();
  return NextResponse.json({ ok: true });
}
