import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit-context";

async function checkAdmin() {
  const guard = await requireAdminFeature("orders");
  return "error" in guard
    ? { error: guard.error }
    : { error: null };
}

function fmtCompany(c: {
  id: string; name: string; type: string; phone: string | null;
  contactPerson: string | null; defaultFee: number; estimatedDays: string | null;
  supportsCOD: boolean; codFeeType: string | null; codFeeValue: number | null;
  collectsPayment: boolean; isActive: boolean; notes: string | null;
  deletedAt: Date | null; createdAt: Date; updatedAt: Date;
  zones?: { id: string; governorate: string; fee: number; estimatedDays: string | null; isActive: boolean }[];
  _count?: { orders: number };
}) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone,
    contactPerson: c.contactPerson,
    defaultFee: c.defaultFee,
    estimatedDays: c.estimatedDays,
    supportsCOD: c.supportsCOD,
    codFeeType: c.codFeeType,
    codFeeValue: c.codFeeValue,
    collectsPayment: c.collectsPayment,
    isActive: c.isActive,
    notes: c.notes,
    deletedAt: c.deletedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    zones: c.zones ?? [],
    ordersCount: c._count?.orders ?? 0,
  };
}

// GET /api/admin/delivery-companies
export async function GET(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const withZones = searchParams.get("withZones") === "true";

  const companies = await db.deliveryCompany.findMany({
    where: { deletedAt: null },
    include: {
      zones: withZones ? { orderBy: { governorate: "asc" } } : false,
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ companies: companies.map(fmtCompany) });
}

// POST /api/admin/delivery-companies — create or update
export async function POST(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as {
    id?: string;
    name: string;
    type?: string;
    phone?: string;
    contactPerson?: string;
    defaultFee?: number;
    estimatedDays?: string;
    supportsCOD?: boolean;
    codFeeType?: string;
    codFeeValue?: number;
    collectsPayment?: boolean;
    isActive?: boolean;
    notes?: string;
    zones?: { governorate: string; fee: number; estimatedDays?: string; isActive?: boolean }[];
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "اسم شركة التوصيل مطلوب" }, { status: 400 });
  }

  const data = {
    name: body.name.trim(),
    type: body.type ?? "courier",
    phone: body.phone?.trim() ?? null,
    contactPerson: body.contactPerson?.trim() ?? null,
    defaultFee: body.defaultFee ?? 0,
    estimatedDays: body.estimatedDays?.trim() ?? null,
    supportsCOD: body.supportsCOD ?? true,
    codFeeType: body.codFeeType ?? null,
    codFeeValue: body.codFeeValue ?? null,
    collectsPayment: body.collectsPayment ?? true,
    isActive: body.isActive ?? true,
    notes: body.notes?.trim() ?? null,
  };

  const include = { zones: true, _count: { select: { orders: true } } } as const;

  let company = body.id
    ? await db.deliveryCompany.update({ where: { id: body.id }, data, include })
    : await db.deliveryCompany.create({ data, include });

  await logAudit({
    action: body.id ? "update_delivery_company" : "create_delivery_company",
    targetType: "DeliveryCompany",
    targetId: company.id,
  });

  // Upsert zones if provided
  if (body.zones !== undefined) {
    await db.deliveryZone.deleteMany({ where: { companyId: company.id } });
    if (body.zones.length > 0) {
      await db.deliveryZone.createMany({
        data: body.zones.map((z) => ({
          companyId: company.id,
          governorate: z.governorate.trim(),
          fee: z.fee,
          estimatedDays: z.estimatedDays?.trim() ?? null,
          isActive: z.isActive ?? true,
        })),
      });
    }
    // Re-fetch with zones sorted
    const refetched = await db.deliveryCompany.findUniqueOrThrow({
      where: { id: company.id },
      include: { zones: { orderBy: { governorate: "asc" } }, _count: { select: { orders: true } } },
    });
    return NextResponse.json({ company: fmtCompany(refetched) });
  }

  return NextResponse.json({ company: fmtCompany(company) });
}

// DELETE /api/admin/delivery-companies?id=xxx — soft delete
export async function DELETE(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  await db.deliveryCompany.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await logAudit({ action: "delete_delivery_company", targetType: "DeliveryCompany", targetId: id });
  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/delivery-companies — toggle active
export async function PATCH(req: Request) {
  const { error } = await checkAdmin();
  if (error) return error;

  const body = await req.json() as { id: string; isActive: boolean };
  if (!body.id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const company = await db.deliveryCompany.update({
    where: { id: body.id },
    data: { isActive: body.isActive },
    include: { zones: true, _count: { select: { orders: true } } },
  });

  await logAudit({
    action: body.isActive ? "activate_delivery_company" : "deactivate_delivery_company",
    targetType: "DeliveryCompany",
    targetId: body.id,
  });
  return NextResponse.json({ company: fmtCompany(company) });
}
