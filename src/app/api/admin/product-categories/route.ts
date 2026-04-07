import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { ensureDefaultProductCategories } from "@/lib/product-categories";

async function checkAdmin() {
  const guard = await requireAdminFeature("products");
  return "error" in guard ? guard.error : null;
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  await ensureDefaultProductCategories();

  const categories = await db.productCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(
    categories.map((category) => ({
      id: category.id,
      key: category.key,
      label: category.label,
      sizeType: category.sizeType,
      sortOrder: category.sortOrder,
      active: category.isActive,
    })),
  );
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json();
  const label = String(body.label ?? "").trim();
  const key = normalizeKey(String(body.key ?? label));
  const sizeType = ["none", "clothing", "shoes"].includes(body.sizeType) ? body.sizeType : "none";
  const sortOrder = Number(body.sortOrder ?? 0);

  if (!label || !key) {
    return NextResponse.json({ error: "label and key are required" }, { status: 400 });
  }

  const exists = await db.productCategory.findUnique({ where: { key } });
  if (exists) {
    return NextResponse.json({ error: "Category key already exists" }, { status: 409 });
  }

  const category = await db.productCategory.create({
    data: {
      key,
      label,
      sizeType,
      sortOrder,
      isActive: body.active !== false,
    },
  });

  return NextResponse.json({
    id: category.id,
    key: category.key,
    label: category.label,
    sizeType: category.sizeType,
    sortOrder: category.sortOrder,
    active: category.isActive,
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json();
  const id = String(body.id ?? "");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = String(body.label).trim();
  if (body.key !== undefined) data.key = normalizeKey(String(body.key));
  if (body.sizeType !== undefined && ["none", "clothing", "shoes"].includes(body.sizeType)) data.sizeType = body.sizeType;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);
  if (body.active !== undefined) data.isActive = Boolean(body.active);

  await db.productCategory.update({
    where: { id },
    data,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const category = await db.productCategory.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const productsCount = await db.product.count({ where: { category: category.key } });
  if (productsCount > 0) {
    return NextResponse.json({ error: "Cannot delete category with products" }, { status: 400 });
  }

  await db.productCategory.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
