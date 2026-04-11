import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

function mapDeliveryOption(option: {
  id: string;
  name: string;
  nameEn: string | null;
  type: string;
  description: string | null;
  descriptionEn: string | null;
  fee: number;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isActive: boolean;
  showCashOnDelivery: boolean;
  sortOrder: number;
}) {
  return {
    id: option.id,
    name: option.name,
    nameEn: option.nameEn,
    type: option.type,
    description: option.description,
    descriptionEn: option.descriptionEn,
    fee: option.fee,
    estimatedDaysMin: option.estimatedDaysMin,
    estimatedDaysMax: option.estimatedDaysMax,
    active: option.isActive,
    showCashOnDelivery: option.showCashOnDelivery,
    sortOrder: option.sortOrder,
  };
}

export async function GET() {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const options = await db.deliveryOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: { orders: true },
      },
    },
  });

  return NextResponse.json(
    options.map((option) => ({
      ...mapDeliveryOption(option),
      ordersCount: option._count.orders,
    })),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    name?: string;
    nameEn?: string | null;
    type?: string;
    description?: string | null;
    descriptionEn?: string | null;
    fee?: number;
    estimatedDaysMin?: number | null;
    estimatedDaysMax?: number | null;
    active?: boolean;
    showCashOnDelivery?: boolean;
    sortOrder?: number;
  };

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "اسم وسيلة التوصيل مطلوب." }, { status: 400 });
  }

  const created = await db.deliveryOption.create({
    data: {
      name,
      nameEn: body.nameEn?.trim() || null,
      type: body.type?.trim() || "courier",
      description: body.description?.trim() || null,
      descriptionEn: body.descriptionEn?.trim() || null,
      fee: body.fee == null ? 0 : Number(body.fee),
      estimatedDaysMin: body.estimatedDaysMin == null ? null : Number(body.estimatedDaysMin),
      estimatedDaysMax: body.estimatedDaysMax == null ? null : Number(body.estimatedDaysMax),
      isActive: body.active ?? true,
      showCashOnDelivery: body.showCashOnDelivery ?? false,
      sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
    },
  });

  clearPublicApiCache();
  return NextResponse.json(mapDeliveryOption(created));
}

export async function PATCH(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as {
    id?: string;
    name?: string;
    nameEn?: string | null;
    type?: string;
    description?: string | null;
    descriptionEn?: string | null;
    fee?: number;
    estimatedDaysMin?: number | null;
    estimatedDaysMax?: number | null;
    active?: boolean;
    showCashOnDelivery?: boolean;
    sortOrder?: number;
  };

  if (!body.id) {
    return NextResponse.json({ error: "معرّف وسيلة التوصيل مطلوب." }, { status: 400 });
  }

  const updated = await db.deliveryOption.update({
    where: { id: body.id },
    data: {
      name: body.name?.trim() ?? undefined,
      nameEn: body.nameEn === undefined ? undefined : body.nameEn?.trim() || null,
      type: body.type?.trim() ?? undefined,
      description: body.description === undefined ? undefined : body.description?.trim() || null,
      descriptionEn: body.descriptionEn === undefined ? undefined : body.descriptionEn?.trim() || null,
      fee: body.fee === undefined ? undefined : Number(body.fee),
      estimatedDaysMin:
        body.estimatedDaysMin === undefined ? undefined : body.estimatedDaysMin == null ? null : Number(body.estimatedDaysMin),
      estimatedDaysMax:
        body.estimatedDaysMax === undefined ? undefined : body.estimatedDaysMax == null ? null : Number(body.estimatedDaysMax),
      isActive: body.active,
      showCashOnDelivery: body.showCashOnDelivery,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    },
  });

  clearPublicApiCache();
  return NextResponse.json(mapDeliveryOption(updated));
}

export async function DELETE(req: Request) {
  const guard = await requireAdminFeature("orders");
  if ("error" in guard) return guard.error;

  const body = (await req.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "معرّف وسيلة التوصيل مطلوب." }, { status: 400 });
  }

  const linkedOrders = await db.order.count({ where: { deliveryOptionId: body.id } });
  if (linkedOrders > 0) {
    return NextResponse.json({ error: "لا يمكن حذف وسيلة توصيل مرتبطة بطلبات سابقة." }, { status: 400 });
  }

  await db.deliveryOption.delete({ where: { id: body.id } });
  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
