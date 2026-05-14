import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import type * as XLSXType from "xlsx";

function parseJson(v: string | null): unknown[] {
  try { return v ? (JSON.parse(v) as unknown[]) : []; } catch { return []; }
}
function bool(v: boolean) { return v ? "نعم" : "لا"; }

export async function GET() {
  const guard = await requireAdminFeature("products");
  if ("error" in guard) return guard.error;

  // Dynamic import keeps Turbopack from trying to bundle this CJS package
  const XLSX = await import("xlsx");

  const [products, categories, variants] = await Promise.all([
    db.product.findMany({
      where: { deletedAt: null },
      include: { supplier: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.productVariant.findMany({ orderBy: { productId: "asc" } }),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Products ──────────────────────────────────────────────────────
  const productRows = products.map((p) => {
    const imgs = (parseJson(p.images) as string[]).join(", ");
    const cols = (parseJson(p.colors) as string[]).join(", ");
    return {
      "ID (لا تغيره)": p.id,
      "اسم المنتج *": p.name,
      "Product Name": p.nameEn ?? "",
      "القسم (مفتاح) *": p.category,
      "السعر *": p.price,
      "السعر القديم": p.oldPrice ?? "",
      "سعر التكلفة": p.costPrice ?? "",
      "الكمية": p.stock,
      "SKU": p.sku ?? "",
      "الباركود": p.barcode ?? "",
      "وحدة القياس": p.unitLabel ?? "",
      "تتبع المخزون (نعم/لا)": bool(p.trackInventory),
      "حد إعادة الطلب": p.reorderLevel,
      "نشط (نعم/لا)": bool(p.isActive),
      "مميز (نعم/لا)": bool(p.isFeatured),
      "جديد (نعم/لا)": bool(p.isNew),
      "الأكثر مبيعاً (نعم/لا)": bool(p.isBestSeller),
      "عرض خاص (نعم/لا)": bool(p.isSpecialOffer),
      "ضريبة مضافة (نعم/لا)": bool(p.vatEnabled),
      "الوصف": p.description ?? "",
      "Description": p.descriptionEn ?? "",
      "معلومات مهمة": p.importantInfo ?? "",
      "إخلاء المسؤولية": p.disclaimer ?? "",
      "مراجعة تحريرية": p.editorialReview ?? "",
      "روابط الصور (مفصولة بفاصلة)": imgs,
      "الألوان - hex (مفصولة بفاصلة)": cols,
      "اسم المورد": p.supplier?.name ?? "",
    };
  });

  const wsProducts = XLSX.utils.json_to_sheet(productRows.length ? productRows : [{}]);
  styleHeader(wsProducts, Object.keys(productRows[0] ?? {}));
  XLSX.utils.book_append_sheet(wb, wsProducts, "المنتجات");

  // ── Sheet 2: Categories ────────────────────────────────────────────────────
  const catRows = categories.map((c) => ({
    "المفتاح (key) *": c.key,
    "الاسم بالعربي *": c.label,
    "الاسم بالإنجليزي": c.labelEn ?? "",
    "نوع المقاسات (none/clothing/shoes)": c.sizeType,
    "الترتيب": c.sortOrder,
    "نشط (نعم/لا)": bool(c.isActive),
  }));

  const wsCats = XLSX.utils.json_to_sheet(catRows.length ? catRows : [{}]);
  styleHeader(wsCats, Object.keys(catRows[0] ?? {}));
  XLSX.utils.book_append_sheet(wb, wsCats, "الأقسام");

  // ── Sheet 3: Variants ──────────────────────────────────────────────────────
  const variantRows = variants.map((v) => {
    const product = products.find((p) => p.id === v.productId);
    return {
      "ID المتغير (لا تغيره)": v.id,
      "ID المنتج *": v.productId,
      "SKU المنتج": product?.sku ?? "",
      "اسم المنتج": product?.name ?? "",
      "المقاس": v.size ?? "",
      "اللون": v.color ?? "",
      "SKU المتغير": v.sku ?? "",
      "الباركود": v.barcode ?? "",
      "الكمية": v.stock,
      "السعر (فارغ = سعر المنتج)": v.price ?? "",
      "سعر التكلفة": v.costPrice ?? "",
      "نشط (نعم/لا)": bool(v.isActive),
    };
  });

  const wsVariants = XLSX.utils.json_to_sheet(variantRows.length ? variantRows : [{}]);
  styleHeader(wsVariants, Object.keys(variantRows[0] ?? {}));
  XLSX.utils.book_append_sheet(wb, wsVariants, "المتغيرات");

  // ── Sheet 4: Instructions ──────────────────────────────────────────────────
  const instructions = [
    ["📋 تعليمات الاستيراد"],
    [""],
    ["ورقة المنتجات"],
    ["• عمود ID: لا تغيره — يُستخدم لتحديد المنتج الموجود. اتركه فارغاً لإضافة منتج جديد."],
    ["• القسم (مفتاح): يجب أن يتطابق تماماً مع المفتاح في ورقة الأقسام."],
    ["• SKU: لو حددت SKU فسيُستخدم للبحث عن المنتج بدلاً من ID."],
    ["• الحقول (نعم/لا): اكتب نعم أو لا فقط."],
    ["• روابط الصور: ضع روابط URL مفصولة بفاصلة (,)."],
    ["• الألوان: ضع كودات hex مفصولة بفاصلة (مثال: #FF0000, #000000)."],
    [""],
    ["ورقة الأقسام"],
    ["• المفتاح (key): معرّف فريد بحروف إنجليزية صغيرة بدون مسافات (مثال: shoes)."],
    ["• نوع المقاسات: اختر من (none / clothing / shoes)."],
    ["• لو القسم موجود بالفعل سيتم تحديثه، وإلا سيتم إنشاؤه."],
    [""],
    ["ورقة المتغيرات"],
    ["• ID المنتج: مطلوب — يجب أن يتطابق مع ID المنتج في ورقة المنتجات."],
    ["• لو وجد متغير بنفس المنتج والمقاس واللون سيتم تحديثه، وإلا سيُنشأ."],
    ["• السعر: اتركه فارغاً لاستخدام سعر المنتج الأساسي."],
  ];

  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "تعليمات");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const raw: any = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const blob = new Blob([raw as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  return new NextResponse(blob, {
    headers: {
      "Content-Disposition": `attachment; filename="fitzone-products-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}

function styleHeader(ws: XLSXType.WorkSheet, headers: string[]) {
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
}
