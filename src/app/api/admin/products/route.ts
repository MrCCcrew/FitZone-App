import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

async function checkAdmin() {
  const guard = await requireAdminFeature("products");
  return "error" in guard ? guard.error : null;
}

const EMOJI: Record<string, string> = { supplement: "💊", gear: "🏋️", clothing: "👕", accessory: "🎽" };

function parseJsonList(value: string | null) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const err = await checkAdmin(); if (err) return err;

  const products = await db.product.findMany({ orderBy: { name: "asc" } });

  const result = await Promise.all(products.map(async (p) => {
    const sold = await db.orderItem.aggregate({ where: { productId: p.id }, _sum: { quantity: true } });
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      oldPrice: p.oldPrice,
      stock: p.stock,
      sold: sold._sum.quantity ?? 0,
      active: p.isActive,
      emoji: EMOJI[p.category] ?? "📦",
      description: p.description ?? "",
      images: parseJsonList(p.images),
      sizes: parseJsonList(p.sizes),
    };
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { name, category, price, oldPrice, stock, description, images, sizes } = body;
  if (!name || price == null) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const p = await db.product.create({
    data: {
      name,
      category: category ?? "gear",
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
      stock: Number(stock ?? 0),
      description: description ?? null,
      images: Array.isArray(images) ? JSON.stringify(images.filter(Boolean)) : null,
      sizes: Array.isArray(sizes) ? JSON.stringify(sizes.filter(Boolean)) : null,
      isActive: true,
    },
  });

  return NextResponse.json({
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    oldPrice: p.oldPrice,
    stock: p.stock,
    sold: 0,
    active: p.isActive,
    emoji: EMOJI[p.category] ?? "📦",
    description: p.description ?? "",
    images: Array.isArray(images) ? images.filter(Boolean) : [],
    sizes: Array.isArray(sizes) ? sizes.filter(Boolean) : [],
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const body = await req.json();
  const { id, active, ...rest } = body;
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (active !== undefined) data.isActive = active;
  if (rest.name !== undefined) data.name = rest.name;
  if (rest.price !== undefined) data.price = Number(rest.price);
  if (rest.oldPrice !== undefined) data.oldPrice = rest.oldPrice ? Number(rest.oldPrice) : null;
  if (rest.stock !== undefined) data.stock = Number(rest.stock);
  if (rest.category !== undefined) data.category = rest.category;
  if (rest.description !== undefined) data.description = rest.description || null;
  if (rest.images !== undefined) data.images = Array.isArray(rest.images) ? JSON.stringify(rest.images.filter(Boolean)) : null;
  if (rest.sizes !== undefined) data.sizes = Array.isArray(rest.sizes) ? JSON.stringify(rest.sizes.filter(Boolean)) : null;

  await db.product.update({ where: { id }, data });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin(); if (err) return err;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id مطلوب" }, { status: 400 });
  await db.product.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
