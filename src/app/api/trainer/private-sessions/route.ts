import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";

async function getTrainerOrError() {
  const user = await getCurrentAppUser();
  if (!user?.id) return { error: NextResponse.json({ error: "يجب تسجيل الدخول أولاً." }, { status: 401 }) };

  const trainer = await db.trainer.findFirst({ where: { userId: user.id }, select: { id: true } });
  if (!trainer) return { error: NextResponse.json({ error: "هذا الحساب غير مرتبط بمدربة." }, { status: 403 }) };

  return { userId: user.id, trainerId: trainer.id };
}

// GET: trainer lists all applications for them
export async function GET() {
  const result = await getTrainerOrError();
  if ("error" in result) return result.error;

  const applications = await db.privateSessionApplication.findMany({
    where: { trainerId: result.trainerId },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}

// PATCH: trainer approves/rejects and optionally sets custom price
export async function PATCH(req: Request) {
  const result = await getTrainerOrError();
  if ("error" in result) return result.error;

  const body = (await req.json()) as {
    applicationId?: string;
    status?: string; // "approved" | "rejected"
    trainerPrice?: number;
    trainerNote?: string;
  };

  if (!body.applicationId) return NextResponse.json({ error: "معرّف الطلب مطلوب." }, { status: 400 });
  if (!["approved", "rejected"].includes(body.status ?? ""))
    return NextResponse.json({ error: "الحالة يجب أن تكون approved أو rejected." }, { status: 400 });

  const app = await db.privateSessionApplication.findUnique({
    where: { id: body.applicationId },
    select: { id: true, trainerId: true, status: true, type: true },
  });
  if (!app) return NextResponse.json({ error: "الطلب غير موجود." }, { status: 404 });
  if (app.trainerId !== result.trainerId)
    return NextResponse.json({ error: "غير مصرح لك بإدارة هذا الطلب." }, { status: 403 });
  if (app.status !== "pending")
    return NextResponse.json({ error: "لا يمكن تغيير حالة طلب تمت معالجته بالفعل." }, { status: 400 });

  const isApproval = body.status === "approved";

  if (isApproval && (!body.trainerPrice || body.trainerPrice <= 0))
    return NextResponse.json({ error: "يجب تحديد السعر عند الموافقة على الطلب." }, { status: 400 });

  const updated = await db.privateSessionApplication.update({
    where: { id: body.applicationId },
    data: {
      status: isApproval ? "approved" : "rejected",
      trainerPrice: isApproval ? body.trainerPrice : null,
      trainerNote: body.trainerNote?.trim() ?? null,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // Notify the user
  await db.notification.create({
    data: {
      userId: updated.user.id,
      title: isApproval ? "تمت الموافقة على طلبك" : "تم رفض طلبك",
      body: isApproval
        ? `تمت الموافقة على طلب ${app.type === "mini_private" ? "الميني برايفيت" : "البرايفيت"}. السعر: ${body.trainerPrice} ج.م. يمكنك الآن إتمام الدفع.`
        : `تم رفض طلب ${app.type === "mini_private" ? "الميني برايفيت" : "البرايفيت"}. ${body.trainerNote ? `ملاحظة: ${body.trainerNote}` : ""}`,
      type: "info",
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, application: updated });
}
