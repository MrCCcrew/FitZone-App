import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-session";
import { enterAuditActor, logAudit } from "@/lib/audit-context";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const codes = await db.discountCode.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { usages: true } } },
  });

  return NextResponse.json(
    codes.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      descriptionEn: c.descriptionEn,
      type: c.type,
      value: c.value,
      minAmount: c.minAmount,
      maxUses: c.maxUses,
      usedCount: c._count.usages,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  enterAuditActor({ userId: auth.session.user.id, name: auth.session.user.name, email: auth.session.user.email, role: auth.session.user.role });

  const body = await req.json();
  const {
    code,
    description,
    descriptionEn,
    type = "percentage",
    value,
    minAmount,
    maxUses,
    expiresAt,
    isActive = true,
  } = body as Record<string, unknown>;

  const codeStr = String(code ?? "").trim().toUpperCase();
  if (!codeStr) return NextResponse.json({ error: "الكود مطلوب" }, { status: 400 });
  if (!value || isNaN(Number(value))) return NextResponse.json({ error: "القيمة مطلوبة" }, { status: 400 });
  if (type === "percentage" && (Number(value) <= 0 || Number(value) > 100)) {
    return NextResponse.json({ error: "نسبة الخصم يجب أن تكون بين 1 و 100" }, { status: 400 });
  }

  const existing = await db.discountCode.findUnique({ where: { code: codeStr } });
  if (existing) return NextResponse.json({ error: "هذا الكود موجود بالفعل" }, { status: 409 });

  const created = await db.discountCode.create({
    data: {
      code: codeStr,
      description: String(description ?? "").trim() || null,
      descriptionEn: String(descriptionEn ?? "").trim() || null,
      type: String(type),
      value: Number(value),
      minAmount: minAmount ? Number(minAmount) : null,
      maxUses: maxUses ? Number(maxUses) : null,
      expiresAt: expiresAt ? new Date(String(expiresAt)) : null,
      isActive: Boolean(isActive),
    },
  });

  void logAudit({ action: "create", targetType: "discount_code", targetId: created.id, details: { code: created.code, type: created.type, value: created.value } });
  return NextResponse.json({ success: true, id: created.id }, { status: 201 });
}
