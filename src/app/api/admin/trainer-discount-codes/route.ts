import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

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

export async function DELETE(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  await db.trainerDiscountCode.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
