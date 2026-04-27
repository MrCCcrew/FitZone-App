import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("trainers");
  return "error" in guard
    ? { error: guard.error, role: null, userId: null }
    : { error: null, role: guard.role, userId: guard.session.user.id };
}

async function getOwnTrainerId(userId: string): Promise<string | null> {
  const t = await db.trainer.findFirst({ where: { userId }, select: { id: true } });
  return t?.id ?? null;
}

export async function GET(req: Request) {
  const { error, role, userId } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "all";
  let trainerId = searchParams.get("trainerId") || undefined;

  // Trainer can only see their own applications
  if (role === "trainer") {
    const ownId = await getOwnTrainerId(userId!);
    if (!ownId) return NextResponse.json({ applications: [] });
    trainerId = ownId;
  }

  const where: Record<string, unknown> = {};
  if (status !== "all") where.status = status;
  if (trainerId) where.trainerId = trainerId;

  const applications = await db.privateSessionApplication.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      trainer: { select: { id: true, name: true, specialty: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    applications: applications.map((app) => ({
      id: app.id,
      type: app.type,
      status: app.status,
      trainerPrice: app.trainerPrice,
      trainerNote: app.trainerNote,
      paidAt: app.paidAt?.toISOString() ?? null,
      createdAt: app.createdAt.toISOString(),
      goals: app.goalsJson ? (JSON.parse(app.goalsJson) as string[]) : [],
      injuries: app.injuries ?? null,
      notes: app.notes ?? null,
      formData: app.applicationFormJson ? JSON.parse(app.applicationFormJson) : null,
      user: app.user,
      trainer: app.trainer,
    })),
  });
}

export async function PATCH(req: Request) {
  const { error, role, userId } = await checkAdmin();
  if (error) return error;

  const body = (await req.json()) as {
    applicationId?: string;
    action?: "approve" | "reject";
    trainerPrice?: number;
    trainerNote?: string;
  };

  if (!body.applicationId) return NextResponse.json({ error: "معرّف الطلب مطلوب." }, { status: 400 });
  if (!body.action || !["approve", "reject"].includes(body.action))
    return NextResponse.json({ error: "الإجراء يجب أن يكون approve أو reject." }, { status: 400 });

  const app = await db.privateSessionApplication.findUnique({
    where: { id: body.applicationId },
    include: {
      user: { select: { id: true, name: true } },
      trainer: { select: { name: true } },
    },
  });
  if (!app) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });

  // Trainer can only approve/reject applications assigned to them
  if (role === "trainer") {
    const ownId = await getOwnTrainerId(userId!);
    if (app.trainerId !== ownId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (app.status !== "pending")
    return NextResponse.json({ error: "لا يمكن تعديل طلب تمت معالجته بالفعل." }, { status: 400 });

  const isApproval = body.action === "approve";

  if (isApproval && (!body.trainerPrice || body.trainerPrice <= 0))
    return NextResponse.json({ error: "يجب تحديد السعر عند الموافقة." }, { status: 400 });

  await db.privateSessionApplication.update({
    where: { id: body.applicationId },
    data: {
      status: isApproval ? "approved" : "rejected",
      trainerPrice: isApproval ? body.trainerPrice : null,
      trainerNote: body.trainerNote?.trim() ?? null,
    },
  });

  await db.notification.create({
    data: {
      userId: app.user.id,
      title: isApproval ? "تمت الموافقة على طلبك ✅" : "تم رفض طلبك",
      body: isApproval
        ? `تمت الموافقة على طلب ${app.type === "mini_private" ? "الميني برايفيت" : "البرايفيت"} مع ${app.trainer.name}. السعر: ${body.trainerPrice} ج.م. يمكنك إتمام الدفع الآن.`
        : `تم رفض طلب ${app.type === "mini_private" ? "الميني برايفيت" : "البرايفيت"} مع ${app.trainer.name}.${body.trainerNote ? ` ملاحظة: ${body.trainerNote}` : ""}`,
      type: isApproval ? "success" : "info",
    },
  }).catch(() => {});

  void logAudit({
    action: body.action,
    targetType: "private_session_application",
    targetId: body.applicationId,
    details: { userId: app.user.id, trainerName: app.trainer.name, price: body.trainerPrice },
  });

  return NextResponse.json({ success: true });
}
