import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("orders");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const orders = await db.order.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      user:  { select: { id: true, name: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });

  return NextResponse.json(orders.map(o => ({
    id:           o.id,
    customerId:   o.userId,
    customerName: o.user.name ?? "—",
    product:      o.items.map(i => i.product.name).join("، "),
    quantity:     o.items.reduce((s, i) => s + i.quantity, 0),
    total:        o.total,
    status:       o.status,
    date:         o.createdAt.toISOString().slice(0, 10),
  })));
}

export async function PATCH(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  await db.order.update({ where: { id }, data: { status } });
  return NextResponse.json({ success: true });
}
