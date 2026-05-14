import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";
import * as XLSX from "xlsx";

function yn(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v ?? "").trim();
  return s === "نعم" || s === "true" || s === "1" || s === "yes";
}
function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}
function str(v: unknown): string {
  return v == null || v === "" ? "" : String(v).trim();
}
function nullable(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function splitComma(v: unknown): string[] {
  return str(v).split(",").map((x) => x.trim()).filter(Boolean);
}
function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return (XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]).filter(
    (row) => Object.values(row).some((v) => v !== "" && v != null),
  );
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("products");
  if ("error" in guard) return guard.error;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "تعذّر قراءة الملف المرفق." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يتم إرفاق ملف." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls"].includes(ext ?? "")) {
    return NextResponse.json({ error: "الملف يجب أن يكون بصيغة Excel (.xlsx أو .xls)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "تعذّر قراءة ملف Excel — تأكد أن الملف غير تالف." }, { status: 400 });
  }

  const results = {
    categories: { created: 0, updated: 0 },
    products: { created: 0, updated: 0 },
    variants: { created: 0, updated: 0 },
    errors: [] as string[],
  };

  // ── 1. Categories ──────────────────────────────────────────────────────────
  for (const row of sheetRows(wb, "الأقسام")) {
    const key   = nullable(row["المفتاح (key) *"]);
    const label = nullable(row["الاسم بالعربي *"]);
    if (!key || !label) continue;

    const sizeRaw  = str(row["نوع المقاسات (none/clothing/shoes)"]);
    const sizeType = ["none", "clothing", "shoes"].includes(sizeRaw) ? sizeRaw : "none";

    try {
      const existing = await db.productCategory.findFirst({ where: { key } });
      if (existing) {
        await db.productCategory.update({
          where: { id: existing.id },
          data: {
            label,
            labelEn:   nullable(row["الاسم بالإنجليزي"]),
            sizeType,
            sortOrder: Math.round(num(row["الترتيب"], existing.sortOrder)),
            isActive:  row["نشط (نعم/لا)"] !== undefined ? yn(row["نشط (نعم/لا)"]) : existing.isActive,
          },
        });
        results.categories.updated++;
      } else {
        await db.productCategory.create({
          data: {
            key,
            label,
            labelEn:   nullable(row["الاسم بالإنجليزي"]),
            sizeType,
            sortOrder: Math.round(num(row["الترتيب"], 0)),
            isActive:  yn(row["نشط (نعم/لا)"]),
          },
        });
        results.categories.created++;
      }
    } catch (e) {
      results.errors.push(`قسم "${key}": ${e instanceof Error ? e.message : "خطأ"}`);
    }
  }

  // ── 2. Products ────────────────────────────────────────────────────────────
  // rowId → actual db id (used to link variants from same import batch)
  const importedIds = new Map<string, string>();

  for (const row of sheetRows(wb, "المنتجات")) {
    const name = nullable(row["اسم المنتج *"]);
    if (!name) continue;

    const rowId  = nullable(row["ID (لا تغيره)"]);
    const rowSku = nullable(row["SKU"]);

    const images = splitComma(row["روابط الصور (مفصولة بفاصلة)"]);
    const colors = splitComma(row["الألوان - hex (مفصولة بفاصلة)"]);

    const data = {
      name,
      nameEn:          nullable(row["Product Name"]),
      category:        nullable(row["القسم (مفتاح) *"]) ?? "gear",
      price:           num(row["السعر *"], 0),
      oldPrice:        str(row["السعر القديم"]) ? num(row["السعر القديم"]) : null,
      costPrice:       str(row["سعر التكلفة"])  ? num(row["سعر التكلفة"])  : null,
      stock:           Math.round(num(row["الكمية"], 0)),
      sku:             rowSku,
      barcode:         nullable(row["الباركود"]),
      unitLabel:       nullable(row["وحدة القياس"]),
      trackInventory:  row["تتبع المخزون (نعم/لا)"] !== undefined ? yn(row["تتبع المخزون (نعم/لا)"]) : true,
      reorderLevel:    Math.round(num(row["حد إعادة الطلب"], 0)),
      isActive:        row["نشط (نعم/لا)"]         !== undefined ? yn(row["نشط (نعم/لا)"])         : true,
      isFeatured:      yn(row["مميز (نعم/لا)"]),
      isNew:           yn(row["جديد (نعم/لا)"]),
      isBestSeller:    yn(row["الأكثر مبيعاً (نعم/لا)"]),
      isSpecialOffer:  yn(row["عرض خاص (نعم/لا)"]),
      vatEnabled:      yn(row["ضريبة مضافة (نعم/لا)"]),
      description:     nullable(row["الوصف"]),
      descriptionEn:   nullable(row["Description"]),
      importantInfo:   nullable(row["معلومات مهمة"]),
      disclaimer:      nullable(row["إخلاء المسؤولية"]),
      editorialReview: nullable(row["مراجعة تحريرية"]),
      images:          images.length ? JSON.stringify(images) : null,
      colors:          colors.length ? JSON.stringify(colors) : null,
    };

    try {
      // Lookup priority: ID → SKU → name
      let existing: { id: string } | null = null;
      if (rowId) existing = await db.product.findUnique({ where: { id: rowId }, select: { id: true } });
      if (!existing && rowSku) existing = await db.product.findFirst({ where: { sku: rowSku, deletedAt: null }, select: { id: true } });
      if (!existing) existing = await db.product.findFirst({ where: { name, deletedAt: null }, select: { id: true } });

      if (existing) {
        await db.product.update({ where: { id: existing.id }, data });
        if (rowId) importedIds.set(rowId, existing.id);
        results.products.updated++;
      } else {
        const created = await db.product.create({ data });
        if (rowId) importedIds.set(rowId, created.id);
        results.products.created++;
      }
    } catch (e) {
      results.errors.push(`منتج "${name}": ${e instanceof Error ? e.message : "خطأ"}`);
    }
  }

  // ── 3. Variants ────────────────────────────────────────────────────────────
  for (const row of sheetRows(wb, "المتغيرات")) {
    const rawPid  = str(row["ID المنتج *"]);
    const productId = importedIds.get(rawPid) ?? rawPid;
    if (!productId) continue;

    const exists = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!exists) {
      results.errors.push(`متغير: المنتج بـ ID "${productId}" غير موجود`);
      continue;
    }

    const variantId = nullable(row["ID المتغير (لا تغيره)"]);
    const size      = nullable(row["المقاس"]);
    const color     = nullable(row["اللون"]);

    const vdata = {
      productId,
      size,
      color,
      sku:       nullable(row["SKU المتغير"]),
      barcode:   nullable(row["الباركود"]),
      stock:     Math.round(num(row["الكمية"], 0)),
      price:     str(row["السعر (فارغ = سعر المنتج)"]) ? num(row["السعر (فارغ = سعر المنتج)"]) : null,
      costPrice: str(row["سعر التكلفة"]) ? num(row["سعر التكلفة"]) : null,
      isActive:  row["نشط (نعم/لا)"] !== undefined ? yn(row["نشط (نعم/لا)"]) : true,
    };

    try {
      let existing: { id: string } | null = null;
      if (variantId) existing = await db.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
      if (!existing) {
        existing = await db.productVariant.findFirst({
          where: { productId, size: size ?? null, color: color ?? null },
          select: { id: true },
        });
      }

      if (existing) {
        await db.productVariant.update({ where: { id: existing.id }, data: vdata });
        results.variants.updated++;
      } else {
        await db.productVariant.create({ data: vdata });
        results.variants.created++;
      }
    } catch (e) {
      results.errors.push(`متغير (${size ?? "—"} / ${color ?? "—"}): ${e instanceof Error ? e.message : "خطأ"}`);
    }
  }

  clearPublicApiCache();
  return NextResponse.json({ success: true, results });
}
