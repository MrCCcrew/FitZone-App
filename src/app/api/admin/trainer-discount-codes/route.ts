import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireAdminFeature } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const codes = await db.trainerDiscountCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      trainer: { select: { id: true, name: true } },
      targetUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({
    codes: codes.map((c) => ({
      id: c.id,
      code: c.code,
      trainerName: c.trainer.name,
      trainerId: c.trainer.id,
      clientName: c.targetUser.name,
      clientEmail: c.targetUser.email,
      clientId: c.targetUser.id,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscount: c.maxDiscount ?? null,
      note: c.note ?? null,
      isUsed: c.isUsed,
      usedAt: c.usedAt?.toISOString() ?? null,
      monthYear: c.monthYear,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    trainerId?: string;
    targetUserId?: string;
    discountType?: string;
    discountValue?: number;
    maxDiscount?: number;
    note?: string;
  };

  if (!body.trainerId) return NextResponse.json({ error: "المدربة مطلوبة." }, { status: 400 });
  if (!body.targetUserId) return NextResponse.json({ error: "العميل مطلوب." }, { status: 400 });
  if (!body.discountValue || body.discountValue <= 0)
    return NextResponse.json({ error: "قيمة الخصم يجب أن تكون أكبر من صفر." }, { status: 400 });

  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  if (discountType === "percentage" && body.discountValue > 100)
    return NextResponse.json({ error: "نسبة الخصم يجب أن تكون بين 1 و 100." }, { status: 400 });

  const monthYear = new Date().toISOString().slice(0, 7);

  const [trainer, targetUser, monthlyCount] = await Promise.all([
    db.trainer.findUnique({ where: { id: body.trainerId }, select: { id: true } }),
    db.user.findUnique({ where: { id: body.targetUserId }, select: { id: true } }),
    db.trainerDiscountCode.count({ where: { trainerId: body.trainerId, monthYear } }),
  ]);
  if (!trainer) return NextResponse.json({ error: "المدربة غير موجودة." }, { status: 404 });
  if (!targetUser) return NextResponse.json({ error: "العميل غير موجود." }, { status: 404 });
  if (monthlyCount >= 4)
    return NextResponse.json({ error: "وصلت المدربة للحد الأقصى من أكواد الخصم لهذا الشهر (4 أكواد)." }, { status: 422 });

  let code = "";
  for (let i = 0; i < 10; i++) {
    const candidate = `TDC-${randomBytes(3).toString("hex").toUpperCase()}`;
    const exists = await db.trainerDiscountCode.findUnique({ where: { code: candidate } });
    if (!exists) { code = candidate; break; }
  }
  if (!code) return NextResponse.json({ error: "تعذر إنشاء كود فريد." }, { status: 500 });

  const created = await db.trainerDiscountCode.create({
    data: {
      trainerId: body.trainerId,
      code,
      targetUserId: body.targetUserId,
      discountType,
      discountValue: body.discountValue,
      maxDiscount: body.maxDiscount ?? null,
      note: body.note?.trim() ?? null,
      monthYear,
    },
    include: {
      trainer: { select: { id: true, name: true } },
      targetUser: { select: { id: true, name: true, email: true } },
    },
  });

  await db.notification.create({
    data: {
      userId: body.targetUserId,
      title: "لديك كود خصم جديد 🎁",
      body: `المدربة ${created.trainer.name} أرسلت لك كود خصم: ${code}. الخصم: ${discountType === "percentage" ? `${body.discountValue}%` : `${body.discountValue} ج.م`}${body.note ? ` — ${body.note}` : ""}.`,
      type: "success",
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, code: created.code, discount: created }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await requireAdminFeature("trainers");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  await db.trainerDiscountCode.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
