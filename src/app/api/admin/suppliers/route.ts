import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("inventory");
  return "error" in guard
    ? { error: guard.error, userId: null }
    : { error: null, userId: guard.session.user.id };
}

function fmt(s: {
  id: string; name: string; phone: string | null; address: string | null;
  notes: string | null; isActive: boolean; commissionRate: number | null;
  commissionType: string | null; deletedAt: Date | null;
  createdAt: Date; updatedAt: Date;
  _count?: { products: number; receipts: number };
}) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    address: s.address,
    notes: s.notes,
    isActive: s.isActive,
    commissionRate: s.commissionRate,
    commissionType: s.commissionType,
    deletedAt: s.deletedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    productsCount: s._count?.products ?? 0,
    receiptsCount: s._count?.receipts ?? 0,
  };
}

// GET /api/admin/suppliers
export async function GET(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const includeDeleted = searchParams.get("includeDeleted") === "true";

  const suppliers = await db.supplier.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
    include: { _count: { select: { products: true, receipts: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ suppliers: suppliers.map(fmt) });
}

// POST /api/admin/suppliers — create or update
export async function POST(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    id?: string;
    name: string;
    phone?: string;
    address?: string;
    notes?: string;
    isActive?: boolean;
    commissionRate?: number;
    commissionType?: string;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "اسم المورد مطلوب" }, { status: 400 });
  }

  const data = {
    name: body.name.trim(),
    phone: body.phone?.trim() ?? null,
    address: body.address?.trim() ?? null,
    notes: body.notes?.trim() ?? null,
    isActive: body.isActive ?? true,
    commissionRate: body.commissionRate ?? null,
    commissionType: body.commissionType ?? null,
  };

  let supplier;
  if (body.id) {
    supplier = await db.supplier.update({
      where: { id: body.id },
      data,
      include: { _count: { select: { products: true, receipts: true } } },
    });
    await logAudit({ action: "update_supplier", targetType: "Supplier", targetId: supplier.id });
  } else {
    supplier = await db.supplier.create({
      data,
      include: { _count: { select: { products: true, receipts: true } } },
    });
    await logAudit({ action: "create_supplier", targetType: "Supplier", targetId: supplier.id });
  }

  return NextResponse.json({ supplier: fmt(supplier) });
}

// DELETE /api/admin/suppliers?id=xxx — soft delete
export async function DELETE(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const supplier = await db.supplier.findUnique({ where: { id } });
  if (!supplier) return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 });

  // Soft delete — unlink from products first to keep data clean
  await db.product.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
  await db.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

  await logAudit({ action: "delete_supplier", targetType: "Supplier", targetId: id });
  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/suppliers — toggle active
export async function PATCH(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as { id: string; isActive: boolean };
  if (!body.id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const supplier = await db.supplier.update({
    where: { id: body.id },
    data: { isActive: body.isActive },
    include: { _count: { select: { products: true, receipts: true } } },
  });

  await logAudit({ action: body.isActive ? "activate_supplier" : "deactivate_supplier", targetType: "Supplier", targetId: body.id });
  return NextResponse.json({ supplier: fmt(supplier) });
}
