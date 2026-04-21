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
      trainer: {
        select: { id: true, name: true, specialty: true, image: true },
      },
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
    availability?: Record<string, unknown>;
    notes?: string;
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

  // Prevent duplicate pending applications
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
      availability: body.availability ? JSON.stringify(body.availability) : null,
      notes: body.notes?.trim() || null,
    },
    include: {
      trainer: { select: { id: true, name: true, specialty: true, image: true } },
    },
  });

  return NextResponse.json({ success: true, application }, { status: 201 });
}
