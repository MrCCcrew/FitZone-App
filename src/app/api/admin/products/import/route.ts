import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";
import * as XLSX from "xlsx";

// ── Value helpers ──────────────────────────────────────────────────────────────
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

// ── Validators ─────────────────────────────────────────────────────────────────
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const URL_RE = /^https?:\/\/.+/;
const KEY_RE = /^[a-z0-9_-]+$/;

function cleanColors(v: unknown): string[] {
  return splitComma(v).filter((c) => HEX_RE.test(c));
}
function cleanUrls(v: unknown): string[] {
  return splitComma(v).filter((u) => URL_RE.test(u));
}

export async function POST(req: Request) {
  const guard = await requireAdminFeature("products");
  if ("error" in guard) return guard.error;

  // ── Parse multipart form ────────────────────────────────────────────────────
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "تعذّر قراءة الملف المرفق." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يتم إرفاق ملف." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["xlsx", "xls"].includes(ext ?? ""))
    return NextResponse.json({ error: "الملف يجب أن يكون بصيغة Excel (.xlsx أو .xls)." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  let wb: XLSX.WorkBook;
  try { wb = XLSX.read(buffer, { type: "buffer" }); }
  catch { return NextResponse.json({ error: "تعذّر قراءة ملف Excel — تأكد أن الملف غير تالف." }, { status: 400 }); }

  const results = {
    categories: { created: 0, updated: 0 },
    products:   { created: 0, updated: 0 },
    variants:   { created: 0, updated: 0 },
    skipped:    0,
    errors:     [] as string[],
  };

  // ── Phase 1 — Pre-load reference data ──────────────────────────────────────
  // Load all existing categories and product SKUs once to validate against them
  const [existingCats, existingSkuRows] = await Promise.all([
    db.productCategory.findMany({ select: { id: true, key: true } }),
    db.product.findMany({ where: { deletedAt: null, sku: { not: null } }, select: { id: true, sku: true } }),
  ]);
  const catKeySet = new Set(existingCats.map((c) => c.key));
  const skuToDbId = new Map(existingSkuRows.filter((p) => p.sku).map((p) => [p.sku!, p.id]));

  // ── Phase 2 — Validate & upsert Categories ─────────────────────────────────
  const catRows = sheetRows(wb, "الأقسام");
  const seenCatKeys = new Set<string>();

  for (let i = 0; i < catRows.length; i++) {
    const row = catRows[i]!;
    const rowLabel = `الأقسام الصف ${i + 2}`;
    const key   = nullable(row["المفتاح (key) *"]);
    const label = nullable(row["الاسم بالعربي *"]);

    if (!key)   { results.errors.push(`${rowLabel}: المفتاح (key) مطلوب`); results.skipped++; continue; }
    if (!label) { results.errors.push(`${rowLabel}: الاسم بالعربي مطلوب`); results.skipped++; continue; }
    if (!KEY_RE.test(key)) { results.errors.push(`${rowLabel}: المفتاح "${key}" يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام فقط`); results.skipped++; continue; }
    if (seenCatKeys.has(key)) { results.errors.push(`${rowLabel}: المفتاح "${key}" مكرر في الملف`); results.skipped++; continue; }
    seenCatKeys.add(key);

    const sizeRaw  = str(row["نوع المقاسات (none/clothing/shoes)"]);
    const sizeType = ["none", "clothing", "shoes"].includes(sizeRaw) ? sizeRaw : "none";

    try {
      const existing = existingCats.find((c) => c.key === key);
      if (existing) {
        await db.productCategory.update({
          where: { id: existing.id },
          data: {
            label,
            labelEn:   nullable(row["الاسم بالإنجليزي"]),
            sizeType,
            sortOrder: Math.round(num(row["الترتيب"], 0)),
            isActive:  row["نشط (نعم/لا)"] !== undefined ? yn(row["نشط (نعم/لا)"]) : true,
          },
        });
        results.categories.updated++;
      } else {
        await db.productCategory.create({
          data: {
            key, label,
            labelEn:   nullable(row["الاسم بالإنجليزي"]),
            sizeType,
            sortOrder: Math.round(num(row["الترتيب"], 0)),
            isActive:  yn(row["نشط (نعم/لا)"]),
          },
        });
        catKeySet.add(key);
        results.categories.created++;
      }
    } catch (e) {
      results.errors.push(`${rowLabel}: ${e instanceof Error ? e.message : "خطأ في قاعدة البيانات"}`);
    }
  }

  // ── Phase 3 — Validate & upsert Products ───────────────────────────────────
  const productRows = sheetRows(wb, "المنتجات");
  const seenSkus    = new Set<string>(); // SKUs seen in this import batch
  const importedIds = new Map<string, string>(); // rowId → db id

  for (let i = 0; i < productRows.length; i++) {
    const row = productRows[i]!;
    const rowLabel = `المنتجات الصف ${i + 2}`;

    const name  = nullable(row["اسم المنتج *"]);
    const price = num(row["السعر *"], -1);

    // ── Per-row validation ──────────────────────────────────────────────────
    if (!name) {
      results.errors.push(`${rowLabel}: اسم المنتج مطلوب`);
      results.skipped++;
      continue;
    }
    if (price <= 0) {
      results.errors.push(`${rowLabel} "${name}": السعر يجب أن يكون أكبر من صفر (القيمة: ${price})`);
      results.skipped++;
      continue;
    }

    const rawCat = nullable(row["القسم (مفتاح) *"]) ?? "";
    if (!catKeySet.has(rawCat)) {
      results.errors.push(`${rowLabel} "${name}": القسم "${rawCat}" غير موجود — تأكد من ورقة الأقسام أو أضفه أولاً`);
      results.skipped++;
      continue;
    }

    const rowId  = nullable(row["ID (لا تغيره)"]);
    const rowSku = nullable(row["SKU"]);

    // Duplicate SKU check within this batch
    if (rowSku) {
      if (seenSkus.has(rowSku)) {
        results.errors.push(`${rowLabel} "${name}": SKU "${rowSku}" مكرر في الملف`);
        results.skipped++;
        continue;
      }
      seenSkus.add(rowSku);
    }

    const stock = Math.round(num(row["الكمية"], 0));
    if (stock < 0) {
      results.errors.push(`${rowLabel} "${name}": الكمية لا يمكن أن تكون سالبة`);
      results.skipped++;
      continue;
    }

    const images = cleanUrls(row["روابط الصور (مفصولة بفاصلة)"]);
    const colors = cleanColors(row["الألوان - hex (مفصولة بفاصلة)"]);

    // Warn about filtered values but don't skip the row
    const rawImages = splitComma(row["روابط الصور (مفصولة بفاصلة)"]);
    const rawColors = splitComma(row["الألوان - hex (مفصولة بفاصلة)"]);
    if (rawImages.length !== images.length)
      results.errors.push(`${rowLabel} "${name}" تحذير: ${rawImages.length - images.length} رابط صورة تم تجاهله (يجب أن يبدأ بـ https://)`);
    if (rawColors.length !== colors.length)
      results.errors.push(`${rowLabel} "${name}" تحذير: ${rawColors.length - colors.length} لون تم تجاهله (يجب بصيغة #rrggbb)`);

    const data = {
      name,
      nameEn:          nullable(row["Product Name"]),
      category:        rawCat,
      price,
      oldPrice:        str(row["السعر القديم"])  ? Math.max(0, num(row["السعر القديم"]))  : null,
      costPrice:       str(row["سعر التكلفة"])   ? Math.max(0, num(row["سعر التكلفة"]))   : null,
      stock,
      sku:             rowSku,
      barcode:         nullable(row["الباركود"]),
      unitLabel:       nullable(row["وحدة القياس"]),
      trackInventory:  row["تتبع المخزون (نعم/لا)"] !== undefined ? yn(row["تتبع المخزون (نعم/لا)"]) : true,
      reorderLevel:    Math.max(0, Math.round(num(row["حد إعادة الطلب"], 0))),
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
      // Lookup priority: ID → SKU → exact name
      // (name-based lookup is intentionally exact to avoid matching wrong products)
      let existing: { id: string } | null = null;

      if (rowId) {
        existing = await db.product.findUnique({ where: { id: rowId }, select: { id: true } });
        if (!existing)
          results.errors.push(`${rowLabel} "${name}" تحذير: ID "${rowId}" غير موجود — سيتم إنشاء منتج جديد`);
      }
      if (!existing && rowSku) {
        const dbId = skuToDbId.get(rowSku);
        if (dbId) existing = { id: dbId };
      }
      if (!existing) {
        existing = await db.product.findFirst({
          where: { name: { equals: name }, deletedAt: null },
          select: { id: true },
        });
      }

      if (existing) {
        await db.product.update({ where: { id: existing.id }, data });
        if (rowId) importedIds.set(rowId, existing.id);
        else importedIds.set(`name:${name}`, existing.id);
        results.products.updated++;
      } else {
        const created = await db.product.create({ data });
        if (rowId) importedIds.set(rowId, created.id);
        else importedIds.set(`name:${name}`, created.id);
        if (rowSku) skuToDbId.set(rowSku, created.id); // for same-batch SKU references
        results.products.created++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ في قاعدة البيانات";
      results.errors.push(`${rowLabel} "${name}": ${msg}`);
      results.skipped++;
    }
  }

  // ── Phase 4 — Validate & upsert Variants ───────────────────────────────────
  const variantRows = sheetRows(wb, "المتغيرات");

  for (let i = 0; i < variantRows.length; i++) {
    const row      = variantRows[i]!;
    const rowLabel = `المتغيرات الصف ${i + 2}`;

    const rawPid    = str(row["ID المنتج *"]);
    const productId = importedIds.get(rawPid) ?? rawPid;

    if (!productId) {
      results.errors.push(`${rowLabel}: ID المنتج مطلوب`);
      results.skipped++;
      continue;
    }

    const exists = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!exists) {
      results.errors.push(`${rowLabel}: المنتج بـ ID "${productId}" غير موجود`);
      results.skipped++;
      continue;
    }

    const variantId = nullable(row["ID المتغير (لا تغيره)"]);
    const size      = nullable(row["المقاس"]);
    const color     = nullable(row["اللون"]);
    const stock     = Math.round(num(row["الكمية"], 0));

    if (stock < 0) {
      results.errors.push(`${rowLabel}: الكمية لا يمكن أن تكون سالبة`);
      results.skipped++;
      continue;
    }

    const rawPrice = str(row["السعر (فارغ = سعر المنتج)"]);
    const vPrice   = rawPrice ? num(rawPrice) : null;
    if (vPrice !== null && vPrice < 0) {
      results.errors.push(`${rowLabel}: السعر لا يمكن أن يكون سالباً`);
      results.skipped++;
      continue;
    }

    const vdata = {
      productId,
      size,
      color,
      sku:       nullable(row["SKU المتغير"]),
      barcode:   nullable(row["الباركود"]),
      stock,
      price:     vPrice,
      costPrice: str(row["سعر التكلفة"]) ? Math.max(0, num(row["سعر التكلفة"])) : null,
      isActive:  row["نشط (نعم/لا)"] !== undefined ? yn(row["نشط (نعم/لا)"]) : true,
    };

    try {
      let existing: { id: string } | null = null;
      if (variantId)
        existing = await db.productVariant.findUnique({ where: { id: variantId }, select: { id: true } });
      if (!existing)
        existing = await db.productVariant.findFirst({
          where: { productId, size: size ?? null, color: color ?? null },
          select: { id: true },
        });

      if (existing) {
        await db.productVariant.update({ where: { id: existing.id }, data: vdata });
        results.variants.updated++;
      } else {
        await db.productVariant.create({ data: vdata });
        results.variants.created++;
      }
    } catch (e) {
      results.errors.push(`${rowLabel} (${size ?? "—"}/${color ?? "—"}): ${e instanceof Error ? e.message : "خطأ"}`);
      results.skipped++;
    }
  }

  clearPublicApiCache();
  return NextResponse.json({ success: true, results });
}
