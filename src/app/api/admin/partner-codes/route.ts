import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId");
  if (!partnerId) return NextResponse.json({ error: "partnerId مطلوب." }, { status: 400 });

  const codes = await db.partnerCode.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    codes.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxUsage: c.maxUsage,
      usageCount: c.usageCount,
      isActive: c.isActive,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      partnerId?: string;
      code?: string;
      discountType?: string;
      discountValue?: number;
      maxUsage?: number | null;
      expiresAt?: string | null;
    };

    if (!body.partnerId) return NextResponse.json({ error: "partnerId مطلوب." }, { status: 400 });

    const discountValue = Number(body.discountValue ?? 0);
    if (!discountValue || discountValue <= 0) {
      return NextResponse.json({ error: "قيمة الخصم مطلوبة." }, { status: 400 });
    }

    const code = body.code?.trim().toUpperCase() || Math.random().toString(36).slice(2, 8).toUpperCase();

    const existing = await db.partnerCode.findUnique({ where: { code } });
    if (existing) return NextResponse.json({ error: "الكود موجود بالفعل، جرّب كوداً آخر." }, { status: 409 });

    const created = await db.partnerCode.create({
      data: {
        partnerId: body.partnerId,
        code,
        discountType: body.discountType === "fixed" ? "fixed" : "percentage",
        discountValue,
        maxUsage: body.maxUsage ? Number(body.maxUsage) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return NextResponse.json({
      id: created.id,
      code: created.code,
      discountType: created.discountType,
      discountValue: created.discountValue,
      maxUsage: created.maxUsage,
      usageCount: created.usageCount,
      isActive: created.isActive,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("[ADMIN_PARTNER_CODES_POST]", err);
    return NextResponse.json({ error: "تعذر إنشاء الكود." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("partners");
  if ("error" in guard) return guard.error;
  if (guard.role !== "admin" && guard.role !== "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "معرّف الكود مطلوب." }, { status: 400 });

    const code = await db.partnerCode.findUnique({ where: { id }, select: { usageCount: true } });
    if (!code) return NextResponse.json({ error: "الكود غير موجود." }, { status: 404 });

    if (code.usageCount > 0) {
      return NextResponse.json({ error: "لا يمكن حذف كود تم استخدامه." }, { status: 400 });
    }

    await db.partnerCode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ADMIN_PARTNER_CODES_DELETE]", err);
    return NextResponse.json({ error: "تعذر حذف الكود." }, { status: 500 });
  }
}
