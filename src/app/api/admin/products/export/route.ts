import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";
import { buildXlsx, type CellValue } from "@/lib/xlsx-builder";

function yn(v: boolean): string { return v ? "نعم" : "لا"; }
function parseJson(v: string | null): string[] {
  try { return v ? (JSON.parse(v) as string[]) : []; } catch { return []; }
}

export async function GET() {
  const guard = await requireAdminFeature("products");
  if ("error" in guard) return guard.error;

  const [products, categories, variants] = await Promise.all([
    db.product.findMany({
      where: { deletedAt: null },
      include: { supplier: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    db.productCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.productVariant.findMany({ orderBy: { productId: "asc" } }),
  ]);

  // ── Sheet 1: Products ───────────────────────────────────────────────────────
  const PROD_HDR: CellValue[] = [
    "ID (لا تغيره)", "اسم المنتج *", "Product Name", "القسم (مفتاح) *",
    "السعر *", "السعر القديم", "سعر التكلفة", "الكمية", "SKU", "الباركود",
    "وحدة القياس", "تتبع المخزون (نعم/لا)", "حد إعادة الطلب",
    "نشط (نعم/لا)", "مميز (نعم/لا)", "جديد (نعم/لا)",
    "الأكثر مبيعاً (نعم/لا)", "عرض خاص (نعم/لا)", "ضريبة مضافة (نعم/لا)",
    "الوصف", "Description", "معلومات مهمة", "إخلاء المسؤولية",
    "مراجعة تحريرية", "روابط الصور (مفصولة بفاصلة)",
    "الألوان - hex (مفصولة بفاصلة)", "اسم المورد",
  ];
  const prodRows: CellValue[][] = [
    PROD_HDR,
    ...products.map((p): CellValue[] => [
      p.id, p.name, p.nameEn ?? "", p.category,
      p.price, p.oldPrice ?? "", p.costPrice ?? "", p.stock,
      p.sku ?? "", p.barcode ?? "", p.unitLabel ?? "",
      yn(p.trackInventory), p.reorderLevel,
      yn(p.isActive), yn(p.isFeatured), yn(p.isNew),
      yn(p.isBestSeller), yn(p.isSpecialOffer), yn(p.vatEnabled),
      p.description ?? "", p.descriptionEn ?? "",
      p.importantInfo ?? "", p.disclaimer ?? "", p.editorialReview ?? "",
      parseJson(p.images).join(", "),
      parseJson(p.colors).join(", "),
      p.supplier?.name ?? "",
    ]),
  ];

  // ── Sheet 2: Categories ─────────────────────────────────────────────────────
  const catRows: CellValue[][] = [
    ["المفتاح (key) *", "الاسم بالعربي *", "الاسم بالإنجليزي",
     "نوع المقاسات (none/clothing/shoes)", "الترتيب", "نشط (نعم/لا)"],
    ...categories.map((c): CellValue[] => [
      c.key, c.label, c.labelEn ?? "", c.sizeType, c.sortOrder, yn(c.isActive),
    ]),
  ];

  // ── Sheet 3: Variants ───────────────────────────────────────────────────────
  const productMap = new Map(products.map((p) => [p.id, p]));
  const variantRows: CellValue[][] = [
    ["ID المتغير (لا تغيره)", "ID المنتج *", "SKU المنتج", "اسم المنتج",
     "المقاس", "اللون", "SKU المتغير", "الباركود", "الكمية",
     "السعر (فارغ = سعر المنتج)", "سعر التكلفة", "نشط (نعم/لا)"],
    ...variants.map((v): CellValue[] => {
      const p = productMap.get(v.productId);
      return [
        v.id, v.productId, p?.sku ?? "", p?.name ?? "",
        v.size ?? "", v.color ?? "", v.sku ?? "", v.barcode ?? "",
        v.stock, v.price ?? "", v.costPrice ?? "", yn(v.isActive),
      ];
    }),
  ];

  // ── Sheet 4: Instructions ───────────────────────────────────────────────────
  const instrRows: CellValue[][] = [
    ["📋 تعليمات الاستيراد"],
    [""],
    ["ورقة المنتجات:"],
    ["• عمود ID: لا تغيره — يُستخدم للتعرف على المنتج الموجود. اتركه فارغاً لمنتج جديد."],
    ["• القسم (مفتاح): يجب أن يطابق تماماً مفتاح القسم في ورقة الأقسام."],
    ["• SKU: لو حددت SKU فسيُستخدم للبحث عن المنتج قبل الاسم."],
    ["• السعر: يجب أن يكون أكبر من صفر."],
    ["• الكمية: يجب أن تكون صفر أو أكبر."],
    ["• الحقول (نعم/لا): اكتب نعم أو لا فقط."],
    ["• روابط الصور: روابط https:// مفصولة بفاصلة (,)."],
    ["• الألوان: أكواد hex مثل #FF0000 مفصولة بفاصلة."],
    [""],
    ["ورقة الأقسام:"],
    ["• المفتاح: حروف إنجليزية صغيرة وأرقام فقط بدون مسافات (مثال: shoes)."],
    ["• نوع المقاسات: none أو clothing أو shoes فقط."],
    [""],
    ["ورقة المتغيرات:"],
    ["• ID المنتج: يجب أن يطابق ID المنتج في ورقة المنتجات."],
    ["• السعر: اتركه فارغاً لاستخدام سعر المنتج الأساسي."],
    [""],
    ["⚠️ الاستيراد: ارفع ورقة المنتجات محفوظة كـ CSV UTF-8 فقط."],
  ];

  const buffer = buildXlsx([
    { name: "المنتجات", rows: prodRows },
    { name: "الأقسام", rows: catRows },
    { name: "المتغيرات", rows: variantRows },
    { name: "تعليمات", rows: instrRows },
  ]);

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fitzone-products-${date}.xlsx"`,
    },
  });
}
