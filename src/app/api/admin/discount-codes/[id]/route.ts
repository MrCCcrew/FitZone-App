import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-session";
import { enterAuditActor, logAudit } from "@/lib/audit-context";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  enterAuditActor({ userId: auth.session.user.id, name: auth.session.user.name, email: auth.session.user.email, role: auth.session.user.role });

  const { id } = await params;
  const body = await req.json();
  const { description, descriptionEn, type, value, minAmount, maxUses, expiresAt, isActive } =
    body as Record<string, unknown>;

  const existing = await db.discountCode.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "الكود غير موجود" }, { status: 404 });

  await db.discountCode.update({
    where: { id },
    data: {
      description: description !== undefined ? (String(description ?? "").trim() || null) : undefined,
      descriptionEn: descriptionEn !== undefined ? (String(descriptionEn ?? "").trim() || null) : undefined,
      type: type !== undefined ? String(type) : undefined,
      value: value !== undefined ? Number(value) : undefined,
      minAmount: minAmount !== undefined ? (minAmount ? Number(minAmount) : null) : undefined,
      maxUses: maxUses !== undefined ? (maxUses ? Number(maxUses) : null) : undefined,
      expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(String(expiresAt)) : null) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    },
  });

  void logAudit({ action: "update", targetType: "discount_code", targetId: id, details: { code: existing.code } });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  enterAuditActor({ userId: auth.session.user.id, name: auth.session.user.name, email: auth.session.user.email, role: auth.session.user.role });

  const { id } = await params;
  const existing = await db.discountCode.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "الكود غير موجود" }, { status: 404 });

  await db.discountCode.delete({ where: { id } });
  void logAudit({ action: "delete", targetType: "discount_code", targetId: id, details: { code: existing.code } });
  return NextResponse.json({ success: true });
}
