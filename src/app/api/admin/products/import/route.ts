import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { clearPublicApiCache } from "@/lib/public-cache";

// ── Pure CSV parser (no external deps) ────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === "\n" || ch === "\r") && !inQ) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      lines.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);

  const splitLine = (line: string): string[] => {
    const cells: string[] = [];
    let c = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (q && line[i + 1] === '"') { c += '"'; i++; }
        else q = !q;
      } else if (ch === "," && !q) {
        cells.push(c.trim());
        c = "";
      } else {
        c += ch;
      }
    }
    cells.push(c.trim());
    return cells;
  };

  if (lines.length < 2) return [];
  const headers = splitLine(lines[0]!);
  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((l) => {
      const vals = splitLine(l);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ""; });
      return obj;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));
}

// ── Value helpers ──────────────────────────────────────────────────────────────
function yn(v: string | undefined): boolean {
  const s = (v ?? "").trim();
  return s === "نعم" || s === "true" || s === "1" || s === "yes";
}
function num(v: string | undefined, fallback = 0): number {
  const n = Number((v ?? "").replace(/,/g, "").trim());
  return isNaN(n) ? fallback : n;
}
function nullable(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
}
function splitComma(v: string | undefined): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const URL_RE = /^https?:\/\/.+/;
const KEY_RE = /^[a-z0-9_-]+$/;

function cleanColors(v: string | undefined): string[] { return splitComma(v).filter((c) => HEX_RE.test(c)); }
function cleanUrls(v: string | undefined): string[] { return splitComma(v).filter((u) => URL_RE.test(u)); }

export async function POST(req: Request) {
  const guard = await requireAdminFeature("products");
  if ("error" in guard) return guard.error;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "تعذّر قراءة الملف المرفق." }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "لم يتم إرفاق ملف." }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext !== "csv")
    return NextResponse.json({ error: "الملف يجب أن يكون بصيغة CSV. افتح ملف الـ Excel في برنامج Excel ثم احفظه بصيغة CSV UTF-8 (.csv) وارفعه مجدداً." }, { status: 400 });

  const rawText = await file.text();
  // Strip BOM if present (Excel UTF-8 CSV adds BOM)
  const text = rawText.startsWith("﻿") ? rawText.slice(1) : rawText;
  const rows = parseCSV(text);

  if (rows.length === 0)
    return NextResponse.json({ error: "الملف فارغ أو لا يحتوي على بيانات صالحة." }, { status: 400 });

  const results = {
    products: { created: 0, updated: 0 },
    skipped: 0,
    errors: [] as string[],
  };

  // ── Pre-load reference data once ───────────────────────────────────────────
  const [existingCats, existingSkuRows] = await Promise.all([
    db.productCategory.findMany({ select: { id: true, key: true } }),
    db.product.findMany({ where: { deletedAt: null, sku: { not: null } }, select: { id: true, sku: true } }),
  ]);
  const catKeySet = new Set(existingCats.map((c) => c.key));
  const skuToDbId = new Map(existingSkuRows.filter((p) => p.sku).map((p) => [p.sku!, p.id]));

  // ── Process product rows ────────────────────────────────────────────────────
  const seenSkus = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowLabel = `الصف ${i + 2}`;

    const name  = nullable(row["اسم المنتج *"]);
    const price = num(row["السعر *"], -1);

    if (!name) {
      results.errors.push(`${rowLabel}: اسم المنتج مطلوب`);
      results.skipped++;
      continue;
    }
    if (price <= 0) {
      results.errors.push(`${rowLabel} "${name}": السعر يجب أن يكون أكبر من صفر`);
      results.skipped++;
      continue;
    }

    const rawCat = nullable(row["القسم (مفتاح) *"]) ?? "";
    if (!catKeySet.has(rawCat)) {
      results.errors.push(`${rowLabel} "${name}": القسم "${rawCat}" غير موجود — تأكد من إضافته في أقسام المنتجات أولاً`);
      results.skipped++;
      continue;
    }

    const rowId  = nullable(row["ID (لا تغيره)"]);
    const rowSku = nullable(row["SKU"]);

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

    // Warn about filtered values
    const rawImages = splitComma(row["روابط الصور (مفصولة بفاصلة)"]);
    const rawColors = splitComma(row["الألوان - hex (مفصولة بفاصلة)"]);
    if (rawImages.length > images.length)
      results.errors.push(`${rowLabel} "${name}" تحذير: ${rawImages.length - images.length} رابط صورة تم تجاهله (يجب أن يبدأ بـ https://)`);
    if (rawColors.length > colors.length)
      results.errors.push(`${rowLabel} "${name}" تحذير: ${rawColors.length - colors.length} لون تم تجاهله (يجب بصيغة #rrggbb)`);

    const baseData = {
      name,
      nameEn:          nullable(row["Product Name"]),
      category:        rawCat,
      price,
      oldPrice:        row["السعر القديم"]?.trim()  ? Math.max(0, num(row["السعر القديم"]))  : null,
      costPrice:       row["سعر التكلفة"]?.trim()   ? Math.max(0, num(row["سعر التكلفة"]))   : null,
      stock,
      sku:             rowSku,
      barcode:         nullable(row["الباركود"]),
      unitLabel:       nullable(row["وحدة القياس"]),
      trackInventory:  row["تتبع المخزون (نعم/لا)"]?.trim() ? yn(row["تتبع المخزون (نعم/لا)"]) : true,
      reorderLevel:    Math.max(0, Math.round(num(row["حد إعادة الطلب"], 0))),
      isActive:        row["نشط (نعم/لا)"]?.trim()         ? yn(row["نشط (نعم/لا)"])         : true,
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
    };

    // For new products: store null if no images. For updates: only overwrite if CSV has images/colors
    // (empty CSV cell must not wipe existing stored images)
    const createData = {
      ...baseData,
      images: images.length ? JSON.stringify(images) : null,
      colors: colors.length ? JSON.stringify(colors) : null,
    };
    const updateData = {
      ...baseData,
      ...(images.length ? { images: JSON.stringify(images) } : {}),
      ...(colors.length ? { colors: JSON.stringify(colors) } : {}),
    };

    try {
      let existing: { id: string } | null = null;
      if (rowId) {
        existing = await db.product.findUnique({ where: { id: rowId }, select: { id: true } });
        if (!existing) results.errors.push(`${rowLabel} "${name}" تحذير: ID "${rowId}" غير موجود — سيتم إنشاء منتج جديد`);
      }
      if (!existing && rowSku) {
        const dbId = skuToDbId.get(rowSku);
        if (dbId) existing = { id: dbId };
      }
      if (!existing) {
        existing = await db.product.findFirst({ where: { name: { equals: name }, deletedAt: null }, select: { id: true } });
      }

      if (existing) {
        await db.product.update({ where: { id: existing.id }, data: updateData });
        results.products.updated++;
      } else {
        const created = await db.product.create({ data: createData });
        if (rowSku) skuToDbId.set(rowSku, created.id);
        results.products.created++;
      }
    } catch (e) {
      results.errors.push(`${rowLabel} "${name}": ${e instanceof Error ? e.message : "خطأ في قاعدة البيانات"}`);
      results.skipped++;
    }
  }

  clearPublicApiCache();
  return NextResponse.json({ success: true, results });
}
