import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

// GET: client views their own applications
export async function GET() {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });

  const applications = await db.privateSessionApplication.findMany({
    where: { userId: user.id },
    include: {
      trainer: { select: { id: true, name: true, specialty: true, image: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}

// POST: client submits a new application
export async function POST(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });

  const body = (await req.json()) as {
    trainerId?: string;
    type?: string;
    goals?: string[];
    injuries?: string;
    notes?: string;
    formData?: Record<string, unknown>; // full 11-section form
  };

  if (!body.trainerId) return NextResponse.json({ error: "يجب تحديد المدربة." }, { status: 400 });
  if (!["private", "mini_private"].includes(body.type ?? ""))
    return NextResponse.json({ error: "نوع الجلسة يجب أن يكون private أو mini_private." }, { status: 400 });

  const trainer = await db.trainer.findUnique({
    where: { id: body.trainerId },
    select: { id: true, isActive: true },
  });
  if (!trainer || !trainer.isActive)
    return NextResponse.json({ error: "المدربة غير متاحة حالياً." }, { status: 404 });

  const existing = await db.privateSessionApplication.findFirst({
    where: { userId: user.id, trainerId: body.trainerId, type: body.type, status: { in: ["pending", "approved"] } },
  });
  if (existing)
    return NextResponse.json(
      { error: "لديك طلب قيد المراجعة مع هذه المدربة بالفعل. انتظر الرد قبل تقديم طلب جديد." },
      { status: 400 },
    );

  const application = await db.privateSessionApplication.create({
    data: {
      userId: user.id,
      trainerId: body.trainerId,
      type: body.type ?? "private",
      goalsJson: body.goals?.length ? JSON.stringify(body.goals) : null,
      injuries: body.injuries?.trim() || null,
      notes: body.notes?.trim() || null,
      applicationFormJson: body.formData ? JSON.stringify(body.formData) : null,
    },
    include: {
      trainer: { select: { id: true, name: true, specialty: true, image: true } },
    },
  });

  return NextResponse.json({ success: true, application }, { status: 201 });
}

// PATCH: client selects a time slot
export async function PATCH(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });

  const body = (await req.json()) as { applicationId?: string; selectedSlot?: string };
  if (!body.applicationId || !body.selectedSlot?.trim())
    return NextResponse.json({ error: "بيانات غير مكتملة." }, { status: 400 });

  const app = await db.privateSessionApplication.findFirst({
    where: { id: body.applicationId, userId: user.id, status: "approved" },
  });
  if (!app) return NextResponse.json({ error: "الطلب غير موجود أو غير مؤهل." }, { status: 404 });

  const ext = app as typeof app & { trainerSlots?: string | null };
  const slots: string[] = ext.trainerSlots ? (JSON.parse(ext.trainerSlots) as string[]) : [];

  if (slots.length > 0 && !slots.includes(body.selectedSlot.trim()))
    return NextResponse.json({ error: "الموعد المختار غير ضمن المواعيد المتاحة." }, { status: 400 });

  await db.privateSessionApplication.update({
    where: { id: body.applicationId },
    data: { selectedSlot: body.selectedSlot.trim() } as Record<string, unknown>,
  });

  return NextResponse.json({ success: true });
}

// DELETE: client cancels their own application (pending or approved, not paid)
export async function DELETE(req: Request) {
  const user = await getCurrentAppUser();
  if (!user?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 });

  const body = (await req.json()) as { applicationId?: string };
  if (!body.applicationId) return NextResponse.json({ error: "معرّف الطلب مطلوب." }, { status: 400 });

  const app = await db.privateSessionApplication.findFirst({
    where: { id: body.applicationId, userId: user.id, status: { in: ["pending", "approved"] } },
    include: { trainer: { select: { name: true } } },
  });
  if (!app) return NextResponse.json({ error: "الطلب غير موجود أو لا يمكن إلغاؤه." }, { status: 404 });

  await db.privateSessionApplication.update({
    where: { id: app.id },
    data: { status: "cancelled" } as Record<string, unknown>,
  });

  return NextResponse.json({ success: true });
}
