import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

// GET /api/me/nutrition — list client's own nutrition sessions
export async function GET() {
  const currentUser = await getCurrentAppUser();
  if (!currentUser?.id) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const sessions = await db.nutritionSession.findMany({
    where: { userId: currentUser.id },
    include: { nutritionist: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.type,
      status: s.status,
      isGymMember: s.isGymMember,
      price: s.price,
      selectedSlot: s.selectedSlot,
      proposedSlots: s.proposedSlots ? (JSON.parse(s.proposedSlots) as string[]) : [],
      doctorNote: s.doctorNote,
      paidAt: s.paidAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      nutritionist: s.nutritionist,
    })),
  });
}

// POST /api/me/nutrition — submit a new booking request
export async function POST(req: Request) {
  const currentUser = await getCurrentAppUser();
  if (!currentUser?.id) return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });

  const body = await req.json() as {
    nutritionistId: string;
    type: "consultation" | "followup";
    formData: Record<string, unknown>;
    selectedSlot?: string;
  };

  if (!body.nutritionistId || !body.type || !body.formData) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const profile = await db.nutritionistProfile.findUnique({
    where: { id: body.nutritionistId },
    select: { id: true, consultationFee: true, consultationFeeMember: true, followupFee: true, followupFeeMember: true },
  });
  if (!profile) return NextResponse.json({ error: "الدكتورة غير موجودة" }, { status: 404 });

  // Check if client has active gym membership
  const activeMembership = await db.userMembership.findFirst({
    where: { userId: currentUser.id, status: "active" },
    select: { id: true },
  });
  const isGymMember = !!activeMembership;

  // Calculate price
  let price = 0;
  if (body.type === "consultation") {
    price = isGymMember ? profile.consultationFeeMember : profile.consultationFee;
  } else {
    price = isGymMember ? profile.followupFeeMember : profile.followupFee;
  }

  // Determine initial status
  // If client picked a pre-set slot → approved (ready to pay)
  // If no slot → pending (waiting for doctor)
  const status = body.selectedSlot ? "approved" : "pending";

  const session = await db.nutritionSession.create({
    data: {
      userId: currentUser.id,
      nutritionistId: body.nutritionistId,
      type: body.type,
      status,
      isGymMember,
      price,
      formJson: JSON.stringify(body.formData),
      selectedSlot: body.selectedSlot ?? null,
    },
    include: { nutritionist: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({
    session: {
      id: session.id,
      type: session.type,
      status: session.status,
      isGymMember: session.isGymMember,
      price: session.price,
      selectedSlot: session.selectedSlot,
      proposedSlots: [],
      doctorNote: null,
      paidAt: null,
      createdAt: session.createdAt.toISOString(),
      nutritionist: session.nutritionist,
    },
  });
}

// PATCH /api/me/nutrition — client selects a slot from proposed slots
export async function PATCH(req: Request) {
  const currentUser = await getCurrentAppUser();
  if (!currentUser?.id) return NextResponse.json({ error: "غير مسجل" }, { status: 401 });

  const body = await req.json() as { sessionId: string; selectedSlot: string };
  if (!body.sessionId || !body.selectedSlot) {
    return NextResponse.json({ error: "sessionId و selectedSlot مطلوبان" }, { status: 400 });
  }

  const session = await db.nutritionSession.findFirst({
    where: { id: body.sessionId, userId: currentUser.id, status: "awaiting_slot" },
  });
  if (!session) return NextResponse.json({ error: "الجلسة غير موجودة أو لا يمكن تعديلها" }, { status: 404 });

  // Validate slot is in proposed list
  const proposedSlots = session.proposedSlots ? (JSON.parse(session.proposedSlots) as string[]) : [];
  if (!proposedSlots.includes(body.selectedSlot)) {
    return NextResponse.json({ error: "الموعد المختار غير متاح" }, { status: 400 });
  }

  const updated = await db.nutritionSession.update({
    where: { id: body.sessionId },
    data: { selectedSlot: body.selectedSlot, status: "approved" },
    include: { nutritionist: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({
    session: {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      price: updated.price,
      selectedSlot: updated.selectedSlot,
      proposedSlots,
      doctorNote: updated.doctorNote,
      paidAt: null,
      createdAt: updated.createdAt.toISOString(),
      nutritionist: updated.nutritionist,
    },
  });
}
