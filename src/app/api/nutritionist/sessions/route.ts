import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function getNutritionistProfile(userId: string) {
  return db.nutritionistProfile.findUnique({ where: { userId } });
}

async function checkNutritionist() {
  const guard = await requireAdminFeature("nutrition");
  if ("error" in guard) return { error: guard.error, userId: null, profileId: null };
  const profile = await getNutritionistProfile(guard.session.user.id);
  if (!profile) return { error: NextResponse.json({ error: "ملف الدكتورة غير موجود" }, { status: 403 }), userId: null, profileId: null };
  return { error: null, userId: guard.session.user.id, profileId: profile.id };
}

function formatSession(s: {
  id: string;
  type: string;
  status: string;
  isGymMember: boolean;
  price: number;
  formJson: string | null;
  selectedSlot: string | null;
  proposedSlots: string | null;
  doctorNote: string | null;
  paidAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string | null; phone: string | null; avatar: string | null };
}) {
  return {
    id: s.id,
    type: s.type,
    status: s.status,
    isGymMember: s.isGymMember,
    price: s.price,
    formData: s.formJson ? JSON.parse(s.formJson) : null,
    selectedSlot: s.selectedSlot,
    proposedSlots: s.proposedSlots ? (JSON.parse(s.proposedSlots) as string[]) : [],
    doctorNote: s.doctorNote,
    paidAt: s.paidAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    user: s.user,
  };
}

// GET /api/nutritionist/sessions
export async function GET(req: Request) {
  const { error, profileId } = await checkNutritionist();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  const where: Record<string, unknown> = { nutritionistId: profileId! };
  if (status !== "all") where.status = status;

  const sessions = await db.nutritionSession.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sessions: sessions.map(formatSession) });
}

// PATCH /api/nutritionist/sessions — doctor responds: propose slots, approve, reject, complete
export async function PATCH(req: Request) {
  const { error, profileId, userId } = await checkNutritionist();
  if (error) return error;

  const body = await req.json() as {
    sessionId: string;
    action: "propose_slots" | "approve" | "reject" | "complete";
    proposedSlots?: string[];
    doctorNote?: string;
  };

  if (!body.sessionId || !body.action) {
    return NextResponse.json({ error: "sessionId و action مطلوبان" }, { status: 400 });
  }

  const session = await db.nutritionSession.findFirst({
    where: { id: body.sessionId, nutritionistId: profileId! },
  });
  if (!session) return NextResponse.json({ error: "الجلسة غير موجودة" }, { status: 404 });

  let updateData: Record<string, unknown> = {};

  if (body.action === "propose_slots") {
    if (!body.proposedSlots?.length) return NextResponse.json({ error: "proposedSlots مطلوب" }, { status: 400 });
    updateData = {
      status: "awaiting_slot",
      proposedSlots: JSON.stringify(body.proposedSlots),
      doctorNote: body.doctorNote ?? session.doctorNote,
    };
  } else if (body.action === "approve") {
    updateData = { status: "approved", doctorNote: body.doctorNote ?? session.doctorNote };
  } else if (body.action === "reject") {
    updateData = { status: "rejected", doctorNote: body.doctorNote ?? null };
  } else if (body.action === "complete") {
    updateData = { status: "completed" };
  }

  const updated = await db.nutritionSession.update({
    where: { id: body.sessionId },
    data: updateData,
    include: { user: { select: { id: true, name: true, email: true, phone: true, avatar: true } } },
  });

  await logAudit({ action: `nutritionist_${body.action}`, targetType: "NutritionSession", targetId: body.sessionId });
  return NextResponse.json({ session: formatSession(updated) });
}
