import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("offers");
  return "error" in guard ? guard.error : null;
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const rows = await db.offer.findMany({ orderBy: { expiresAt: "asc" } });

  return NextResponse.json(rows.map(o => ({
    id:          o.id,
    title:       o.title,
    discount:    o.discount,
    type:        "percentage",
    appliesTo:   o.description ?? "جميع الباقات",
    validUntil:  o.expiresAt.toISOString().slice(0, 10),
    active:      o.isActive,
    usedCount:   0,
  })));
}

export async function POST(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { title, discount, type, appliesTo, validUntil } = body;
  if (!title || discount == null || !validUntil)
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const o = await db.offer.create({
    data: {
      title,
      discount:    Number(discount),
      description: appliesTo ?? "جميع الباقات",
      expiresAt:   new Date(validUntil),
      isActive:    true,
    },
  });
  return NextResponse.json({ id: o.id, title: o.title, discount: o.discount, type: type ?? "percentage", appliesTo: o.description ?? "", validUntil: o.expiresAt.toISOString().slice(0,10), active: o.isActive, usedCount: 0 });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { id, title, discount, appliesTo, validUntil, active } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (title      !== undefined) data.title       = title;
  if (discount   !== undefined) data.discount    = Number(discount);
  if (appliesTo  !== undefined) data.description = appliesTo;
  if (validUntil !== undefined) data.expiresAt   = new Date(validUntil);
  if (active     !== undefined) data.isActive    = active;

  const o = await db.offer.update({ where: { id }, data });
  return NextResponse.json({ id: o.id, title: o.title, discount: o.discount, type: "percentage", appliesTo: o.description ?? "", validUntil: o.expiresAt.toISOString().slice(0,10), active: o.isActive, usedCount: 0 });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  await db.offer.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
