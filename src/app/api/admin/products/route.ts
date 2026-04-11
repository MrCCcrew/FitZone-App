import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { ensureDefaultProductCategories } from "@/lib/product-categories";
import { clearPublicApiCache } from "@/lib/public-cache";

async function checkAdmin() {
  const guard = await requireAdminFeature("products");
  return "error" in guard ? guard.error : null;
}

const EMOJI: Record<string, string> = {
  supplement: "🧴",
  gear: "🏋️",
  clothing: "👕",
  accessory: "🧢",
  shoes: "👟",
};

function parseJsonList(value: string | null) {
  try {
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const err = await checkAdmin();
  if (err) return err;

  await ensureDefaultProductCategories();

  const [products, categories] = await Promise.all([
    db.product.findMany({ orderBy: { name: "asc" } }),
    db.productCategory.findMany(),
  ]);

  const result = await Promise.all(
    products.map(async (product) => {
      const sold = await db.orderItem.aggregate({
        where: { productId: product.id },
        _sum: { quantity: true },
      });

      const category = categories.find((entry) => entry.key === product.category);

      return {
        id: product.id,
        name: product.name,
        nameEn: product.nameEn,
        category: product.category,
        categoryLabel: category?.label ?? product.category,
        categoryLabelEn: category?.labelEn ?? category?.label ?? product.category,
        sizeType: (category?.sizeType ?? "none") as "none" | "clothing" | "shoes",
        price: product.price,
        oldPrice: product.oldPrice,
        stock: product.stock,
        averageCost: product.averageCost,
        lastPurchaseCost: product.lastPurchaseCost,
        sold: sold._sum.quantity ?? 0,
        active: product.isActive,
        emoji: EMOJI[product.category] ?? "🛍️",
        description: product.description ?? "",
        descriptionEn: product.descriptionEn ?? "",
        images: parseJsonList(product.images),
        sizes: parseJsonList(product.sizes),
        colors: parseJsonList(product.colors),
      };
    }),
  );

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  await ensureDefaultProductCategories();

  const body = await req.json();
  const { name, nameEn, category, price, oldPrice, stock, description, descriptionEn, images, sizes, colors } = body;

  if (!name || price == null) {
    return NextResponse.json({ error: "بيانات المنتج ناقصة." }, { status: 400 });
  }

  const categoryRecord = await db.productCategory.findFirst({
    where: { key: String(category ?? "gear") },
  });

  const product = await db.product.create({
    data: {
      name: String(name),
      nameEn: nameEn ? String(nameEn) : null,
      category: categoryRecord?.key ?? "gear",
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : null,
      stock: Number(stock ?? 0),
      description: description ? String(description) : null,
      descriptionEn: descriptionEn ? String(descriptionEn) : null,
      images: Array.isArray(images) ? JSON.stringify(images.filter(Boolean)) : null,
      sizes: Array.isArray(sizes) ? JSON.stringify(sizes.filter(Boolean)) : null,
      colors: Array.isArray(colors) ? JSON.stringify(colors.filter(Boolean)) : null,
      isActive: true,
    },
  });

  clearPublicApiCache();
  return NextResponse.json({
    id: product.id,
    name: product.name,
    nameEn: product.nameEn,
    category: product.category,
    categoryLabel: categoryRecord?.label ?? product.category,
    categoryLabelEn: categoryRecord?.labelEn ?? categoryRecord?.label ?? product.category,
    sizeType: (categoryRecord?.sizeType ?? "none") as "none" | "clothing" | "shoes",
    price: product.price,
    oldPrice: product.oldPrice,
    stock: product.stock,
    sold: 0,
    active: product.isActive,
    emoji: EMOJI[product.category] ?? "🛍️",
    description: product.description ?? "",
    descriptionEn: product.descriptionEn ?? "",
    images: Array.isArray(images) ? images.filter(Boolean) : [],
    sizes: Array.isArray(sizes) ? sizes.filter(Boolean) : [],
    colors: Array.isArray(colors) ? colors.filter(Boolean) : [],
  });
}

export async function PATCH(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const body = await req.json();
  const { id, active, ...rest } = body;

  if (!id) {
    return NextResponse.json({ error: "معرّف المنتج مطلوب." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (active !== undefined) data.isActive = Boolean(active);
  if (rest.name !== undefined) data.name = String(rest.name);
  if (rest.nameEn !== undefined) data.nameEn = rest.nameEn ? String(rest.nameEn) : null;
  if (rest.price !== undefined) data.price = Number(rest.price);
  if (rest.oldPrice !== undefined) data.oldPrice = rest.oldPrice ? Number(rest.oldPrice) : null;
  if (rest.stock !== undefined) data.stock = Number(rest.stock);
  if (rest.description !== undefined) data.description = rest.description ? String(rest.description) : null;
  if (rest.descriptionEn !== undefined) data.descriptionEn = rest.descriptionEn ? String(rest.descriptionEn) : null;
  if (rest.images !== undefined) data.images = Array.isArray(rest.images) ? JSON.stringify(rest.images.filter(Boolean)) : null;
  if (rest.sizes !== undefined) data.sizes = Array.isArray(rest.sizes) ? JSON.stringify(rest.sizes.filter(Boolean)) : null;
  if (rest.colors !== undefined) data.colors = Array.isArray(rest.colors) ? JSON.stringify(rest.colors.filter(Boolean)) : null;

  if (rest.category !== undefined) {
    const categoryRecord = await db.productCategory.findFirst({
      where: { key: String(rest.category) },
    });
    data.category = categoryRecord?.key ?? String(rest.category);
  }

  await db.product.update({
    where: { id: String(id) },
    data,
  });

  clearPublicApiCache();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const err = await checkAdmin();
  if (err) return err;

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "معرّف المنتج مطلوب." }, { status: 400 });
  }

  await db.product.delete({ where: { id: String(id) } });
  clearPublicApiCache();
  return NextResponse.json({ success: true });
}
