import { NextResponse } from "next/server";
import { requireAdminFeature } from "@/lib/admin-guard";
import { db } from "@/lib/db";

// ── SpreadsheetML helpers (no external deps) ──────────────────────────────────
function xe(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function cell(value: unknown, type: "String" | "Number" = "String"): string {
  const v = xe(value);
  if (v === "") return `<Cell><Data ss:Type="${type}"></Data></Cell>`;
  return `<Cell><Data ss:Type="${type}">${v}</Data></Cell>`;
}
function numCell(value: unknown): string {
  const n = Number(value);
  return isNaN(n) ? cell("") : cell(n, "Number");
}
function row(cells: string[]): string {
  return `<Row>${cells.join("")}</Row>`;
}
function sheet(name: string, rows: string[]): string {
  return `<Worksheet ss:Name="${xe(name)}"><Table>${rows.join("")}</Table></Worksheet>`;
}
function bool(v: boolean) { return v ? "نعم" : "لا"; }
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
  const PROD_HEADERS = [
    "ID (لا تغيره)", "اسم المنتج *", "Product Name", "القسم (مفتاح) *",
    "السعر *", "السعر القديم", "سعر التكلفة", "الكمية", "SKU", "الباركود",
    "وحدة القياس", "تتبع المخزون (نعم/لا)", "حد إعادة الطلب",
    "نشط (نعم/لا)", "مميز (نعم/لا)", "جديد (نعم/لا)",
    "الأكثر مبيعاً (نعم/لا)", "عرض خاص (نعم/لا)", "ضريبة مضافة (نعم/لا)",
    "الوصف", "Description", "معلومات مهمة", "إخلاء المسؤولية",
    "مراجعة تحريرية", "روابط الصور (مفصولة بفاصلة)", "الألوان - hex (مفصولة بفاصلة)",
    "اسم المورد",
  ];

  const productRows = [
    row(PROD_HEADERS.map((h) => cell(h))),
    ...products.map((p) =>
      row([
        cell(p.id),
        cell(p.name),
        cell(p.nameEn),
        cell(p.category),
        numCell(p.price),
        numCell(p.oldPrice),
        numCell(p.costPrice),
        numCell(p.stock),
        cell(p.sku),
        cell(p.barcode),
        cell(p.unitLabel),
        cell(bool(p.trackInventory)),
        numCell(p.reorderLevel),
        cell(bool(p.isActive)),
        cell(bool(p.isFeatured)),
        cell(bool(p.isNew)),
        cell(bool(p.isBestSeller)),
        cell(bool(p.isSpecialOffer)),
        cell(bool(p.vatEnabled)),
        cell(p.description),
        cell(p.descriptionEn),
        cell(p.importantInfo),
        cell(p.disclaimer),
        cell(p.editorialReview),
        cell(parseJson(p.images).join(", ")),
        cell(parseJson(p.colors).join(", ")),
        cell(p.supplier?.name),
      ])
    ),
  ];

  // ── Sheet 2: Categories ─────────────────────────────────────────────────────
  const CAT_HEADERS = [
    "المفتاح (key) *", "الاسم بالعربي *", "الاسم بالإنجليزي",
    "نوع المقاسات (none/clothing/shoes)", "الترتيب", "نشط (نعم/لا)",
  ];
  const catRows = [
    row(CAT_HEADERS.map((h) => cell(h))),
    ...categories.map((c) =>
      row([
        cell(c.key), cell(c.label), cell(c.labelEn),
        cell(c.sizeType), numCell(c.sortOrder), cell(bool(c.isActive)),
      ])
    ),
  ];

  // ── Sheet 3: Variants ───────────────────────────────────────────────────────
  const VAR_HEADERS = [
    "ID المتغير (لا تغيره)", "ID المنتج *", "SKU المنتج", "اسم المنتج",
    "المقاس", "اللون", "SKU المتغير", "الباركود", "الكمية",
    "السعر (فارغ = سعر المنتج)", "سعر التكلفة", "نشط (نعم/لا)",
  ];
  const productMap = new Map(products.map((p) => [p.id, p]));
  const variantRows = [
    row(VAR_HEADERS.map((h) => cell(h))),
    ...variants.map((v) => {
      const p = productMap.get(v.productId);
      return row([
        cell(v.id), cell(v.productId), cell(p?.sku), cell(p?.name),
        cell(v.size), cell(v.color), cell(v.sku), cell(v.barcode),
        numCell(v.stock), numCell(v.price), numCell(v.costPrice),
        cell(bool(v.isActive)),
      ]);
    }),
  ];

  // ── Sheet 4: Instructions ───────────────────────────────────────────────────
  const instrLines = [
    ["📋 تعليمات الاستيراد"],
    [""],
    ["ورقة المنتجات — لاستيراد المنتجات:"],
    ["• عمود ID: لا تغيره — يُستخدم للتعرف على المنتج. اتركه فارغاً لمنتج جديد."],
    ["• القسم (مفتاح): يجب أن يطابق تماماً مفتاح القسم في ورقة الأقسام."],
    ["• SKU: لو حددت SKU فسيُستخدم للبحث عن المنتج قبل الاسم."],
    ["• الحقول (نعم/لا): اكتب نعم أو لا فقط."],
    ["• روابط الصور: روابط https:// مفصولة بفاصلة."],
    ["• الألوان: أكواد hex مثل #FF0000 مفصولة بفاصلة."],
    [""],
    ["ورقة الأقسام:"],
    ["• المفتاح: حروف إنجليزية صغيرة وأرقام فقط بدون مسافات."],
    ["• نوع المقاسات: none أو clothing أو shoes فقط."],
    [""],
    ["ورقة المتغيرات:"],
    ["• ID المنتج: يجب أن يطابق ID المنتج في ورقة المنتجات."],
    ["• السعر: اتركه فارغاً لاستخدام سعر المنتج الأساسي."],
    [""],
    ["⚠️ للاستيراد: احفظ ورقة المنتجات كـ CSV ثم ارفع الملف."],
    ["⚠️ ترتيب الاستيراد: الأقسام أولاً ← ثم المنتجات."],
  ];
  const instrRows = instrLines.map((l) => row([cell(l[0] ?? "")]));

  // ── Assemble SpreadsheetML XML ──────────────────────────────────────────────
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:x="urn:schemas-microsoft-com:office:excel">
  <Styles>
    <Style ss:ID="Default">
      <Alignment ss:WrapText="1"/>
      <Font ss:FontName="Arial" ss:Size="11"/>
    </Style>
  </Styles>
  ${sheet("المنتجات", productRows)}
  ${sheet("الأقسام", catRows)}
  ${sheet("المتغيرات", variantRows)}
  ${sheet("تعليمات", instrRows)}
</Workbook>`;

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=UTF-8",
      "Content-Disposition": `attachment; filename="fitzone-products-${date}.xls"`,
    },
  });
}
