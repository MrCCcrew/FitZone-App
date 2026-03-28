"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, Product, ProductCategory } from "../types";

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none";
const CLOTHING = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOES = Array.from({ length: 27 }, (_, i) => String(i + 20));

type EditableProduct = Omit<Product, "id" | "sold"> & { id?: string };
type EditableCategory =
  | ProductCategory
  | {
      id?: string;
      key: string;
      label: string;
      sizeType: "none" | "clothing" | "shoes";
      sortOrder: number;
      active: boolean;
    };

const EMPTY_PRODUCT: EditableProduct = {
  name: "",
  category: "supplement",
  price: 0,
  oldPrice: null,
  stock: 0,
  active: true,
  emoji: "🛍️",
  description: "",
  images: [],
  sizes: [],
  colors: [],
  sizeType: "none",
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="text-xl text-gray-500">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldHint({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-bold text-white">{title}</div>
        <div className="mt-1 text-xs leading-6 text-gray-400">{hint}</div>
      </div>
      {children}
    </label>
  );
}

function toList(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function fromList(value?: string[]) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function toggle(arr: string[] | undefined, value: string) {
  const list = arr ?? [];
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [productModal, setProductModal] = useState<EditableProduct | null>(null);
  const [categoryModal, setCategoryModal] = useState<EditableCategory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, o, c] = await Promise.all([
        fetch("/api/admin/products", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/orders", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/admin/product-categories", { cache: "no-store" }).then((r) => r.json()),
      ]);
      setProducts(Array.isArray(p) ? p : []);
      setOrders(Array.isArray(o) ? o : []);
      setCategories(Array.isArray(c) ? c : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.key, item])), [categories]);
  const sizeType = productModal ? categoryMap.get(productModal.category)?.sizeType ?? "none" : "none";

  const filteredProducts = products.filter((product) => {
    const searchOk = !search.trim() || product.name.includes(search) || (product.description ?? "").includes(search);
    const filterOk = filter === "all" || product.category === filter;
    return searchOk && filterOk;
  });

  const saveProduct = async () => {
    if (!productModal) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: productModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productModal, sizes: sizeType === "none" ? [] : productModal.sizes ?? [] }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert(data.error ?? "تعذر حفظ المنتج.");
        return;
      }
      await load();
      setProductModal(null);
      setUploadError(null);
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    if (!categoryModal) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/product-categories", {
        method: categoryModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryModal),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        window.alert(data.error ?? "تعذر حفظ القسم.");
        return;
      }
      await load();
      setCategoryModal(null);
    } finally {
      setSaving(false);
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!productModal || !files?.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? `تعذر رفع الصورة: ${file.name}`);
        if (data.url) urls.push(data.url);
      }
      if (urls.length === 0) throw new Error("لم يتم استلام روابط الصور بعد الرفع.");
      setProductModal((current) => current ? { ...current, images: [...(current.images ?? []), ...urls] } : current);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "تعذر رفع الصور حاليًا.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-500">جارٍ تحميل بيانات المنتجات...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button onClick={() => setTab("products")} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${tab === "products" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"}`}>المنتجات</button>
        <button onClick={() => setTab("orders")} className={`rounded-xl px-5 py-2.5 text-sm font-bold ${tab === "orders" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"}`}>الطلبات</button>
      </div>

      {tab === "products" && (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.5fr,1fr]">
            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-white">أقسام المنتجات</h3>
                  <p className="text-xs text-gray-500">اربط كل قسم بنوع المقاسات المناسب حتى لا تظهر مقاسات غير صحيحة للعميل.</p>
                </div>
                <button onClick={() => setCategoryModal({ key: "", label: "", sizeType: "none", sortOrder: categories.length, active: true })} className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">+ قسم</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-xl border border-gray-800 bg-black/20 p-4">
                    <div className="font-bold text-white">{category.label}</div>
                    <div className="text-xs text-gray-500">{category.key}</div>
                    <div className="mt-2 text-xs text-gray-400">{category.sizeType === "clothing" ? "مقاسات ملابس" : category.sizeType === "shoes" ? "مقاسات أحذية" : "بدون مقاسات"}</div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setCategoryModal(category)} className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white">تعديل</button>
                      <button onClick={async () => {
                        const res = await fetch("/api/admin/product-categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: category.id }) });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          window.alert(data.error ?? "تعذر حذف القسم.");
                          return;
                        }
                        await load();
                      }} className="rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-300">حذف</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج..." className={INPUT} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setFilter("all")} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === "all" ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400"}`}>الكل</button>
                {categories.map((category) => (
                  <button key={category.id} onClick={() => setFilter(category.key)} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === category.key ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400"}`}>{category.label}</button>
                ))}
              </div>
              <button onClick={() => { setUploadError(null); setProductModal({ ...EMPTY_PRODUCT, category: categories[0]?.key ?? "supplement" }); }} className="mt-4 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">+ منتج جديد</button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product) => (
              <div key={product.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
                <div className="mb-3 flex items-start justify-between">
                  <span className="text-4xl">{product.emoji}</span>
                  <span className="rounded-full bg-pink-500/20 px-2 py-1 text-xs text-pink-300">{product.categoryLabel ?? categoryMap.get(product.category)?.label ?? product.category}</span>
                </div>
                <h4 className="font-black text-white">{product.name}</h4>
                <div className="mt-1 text-sm text-yellow-400">{product.price.toLocaleString("ar-EG")} ج.م</div>
                <div className="mt-2 text-xs text-gray-500">صور: {product.images?.length ?? 0} | مقاسات: {product.sizes?.length ?? 0}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setUploadError(null); setProductModal({ ...product }); }} className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white">تعديل</button>
                  <button onClick={async () => {
                    if (!window.confirm("هل تريد حذف هذا المنتج؟")) return;
                    await fetch("/api/admin/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id }) });
                    await load();
                  }} className="rounded-lg bg-red-950/50 px-3 py-2 text-xs text-red-300">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "orders" && (
        <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800 text-xs text-gray-500">
              <tr>
                {["العميل", "المنتج", "الكمية", "الإجمالي", "الحالة"].map((header) => <th key={header} className="px-4 py-3 text-right">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-800/50">
                  <td className="px-4 py-3 text-white">{order.customerName}</td>
                  <td className="px-4 py-3 text-gray-300">{order.product}</td>
                  <td className="px-4 py-3 text-gray-300">{order.quantity}</td>
                  <td className="px-4 py-3 text-yellow-400">{order.total.toLocaleString("ar-EG")} ج.م</td>
                  <td className="px-4 py-3"><select value={order.status} onChange={async (e) => { await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, status: e.target.value }) }); await load(); }} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"><option value="pending">معلق</option><option value="confirmed">مؤكد</option><option value="delivered">تم التسليم</option><option value="cancelled">ملغي</option></select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {productModal && (
        <Modal title={productModal.id ? "تعديل المنتج" : "منتج جديد"} onClose={() => setProductModal(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-800 bg-black/20 p-4 text-xs leading-7 text-gray-400">أدخل بيانات المنتج كما ستظهر للعميل داخل المتجر وصفحة التفاصيل. الاسم والوصف والصور والسعر كلها ستنعكس مباشرة على عرض المنتج.</div>
            <div className="grid gap-4 md:grid-cols-2">
              <FieldHint title="اسم المنتج" hint="اكتب الاسم التسويقي الذي سيظهر للعميل داخل المتجر وصفحة المنتج."><input value={productModal.name} onChange={(e) => setProductModal({ ...productModal, name: e.target.value })} placeholder="مثال: حذاء Luna Sport" className={INPUT} /></FieldHint>
              <FieldHint title="القسم" hint="اختر القسم الصحيح حتى تظهر المقاسات المناسبة للعميل فقط."><select value={productModal.category} onChange={(e) => setProductModal({ ...productModal, category: e.target.value, sizes: [] })} className={INPUT}>{categories.map((category) => <option key={category.id} value={category.key}>{category.label}</option>)}</select></FieldHint>
              <FieldHint title="أيقونة داخلية" hint="اختياري. تستخدم في لوحة الإدارة فقط لتسهيل تمييز المنتج."><input value={productModal.emoji} onChange={(e) => setProductModal({ ...productModal, emoji: e.target.value })} placeholder="مثال: 👟" className={INPUT} /></FieldHint>
              <FieldHint title="المخزون" hint="عدد القطع المتاحة الآن للبيع من هذا المنتج."><input type="number" value={productModal.stock} onChange={(e) => setProductModal({ ...productModal, stock: Number(e.target.value) })} placeholder="مثال: 25" className={INPUT} /></FieldHint>
              <FieldHint title="السعر الحالي" hint="السعر الذي سيدفعه العميل عند إضافة المنتج إلى السلة."><input type="number" value={productModal.price} onChange={(e) => setProductModal({ ...productModal, price: Number(e.target.value) })} placeholder="مثال: 850" className={INPUT} /></FieldHint>
              <FieldHint title="السعر قبل الخصم" hint="اختياري. اتركه فارغًا إذا لم يوجد خصم على المنتج."><input type="number" value={productModal.oldPrice ?? ""} onChange={(e) => setProductModal({ ...productModal, oldPrice: e.target.value ? Number(e.target.value) : null })} placeholder="مثال: 1200" className={INPUT} /></FieldHint>
            </div>
            <FieldHint title="وصف المنتج" hint="اذكر الفائدة أو الخامة أو الاستخدام الأساسي حتى يفهم العميل المنتج بسرعة."><textarea value={productModal.description ?? ""} onChange={(e) => setProductModal({ ...productModal, description: e.target.value })} placeholder="مثال: حذاء رياضي خفيف مناسب للمشي والجري اليومي." rows={4} className={`${INPUT} resize-none`} /></FieldHint>
            <div className="space-y-3">
              <FieldHint title="رفع الصور" hint="يمكنك رفع أكثر من صورة. يفضل أن تكون الصورة أقل من 5MB وبجودة واضحة."><input type="file" multiple accept="image/*" onChange={(e) => { void uploadImages(e.target.files); e.currentTarget.value = ""; }} className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white" /></FieldHint>
              {uploading && <div className="text-xs text-yellow-400">جارٍ رفع الصور إلى التخزين السحابي...</div>}
              {uploadError && <div className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-xs leading-6 text-red-200">{uploadError}</div>}
              <FieldHint title="روابط الصور اليدوية" hint="إذا كانت الصور مرفوعة مسبقًا في مكان آخر، ضع رابطًا واحدًا في كل سطر."><textarea value={fromList(productModal.images)} onChange={(e) => setProductModal({ ...productModal, images: toList(e.target.value) })} rows={4} className={`${INPUT} resize-none`} placeholder="https://example.com/product-image-1.jpg" /></FieldHint>
              {!!productModal.images?.length && <div className="grid gap-3 sm:grid-cols-2">{productModal.images.map((image, index) => <div key={`${image}-${index}`} className="rounded-xl border border-gray-700 bg-gray-800 p-2"><img src={image} alt={`product-${index + 1}`} className="mb-2 h-28 w-full rounded-lg object-cover" /><button type="button" onClick={() => setProductModal({ ...productModal, images: productModal.images?.filter((_, i) => i !== index) ?? [] })} className="w-full text-xs text-red-400">حذف الصورة</button></div>)}</div>}
            </div>
            {sizeType !== "none" && <FieldHint title="المقاسات" hint={sizeType === "shoes" ? "اختر مقاسات الأحذية المتوفرة لهذا المنتج." : "اختر مقاسات الملابس المتوفرة لهذا المنتج."}><div className="flex flex-wrap gap-2">{(sizeType === "shoes" ? SHOES : CLOTHING).map((size) => <button key={size} type="button" onClick={() => setProductModal({ ...productModal, sizes: toggle(productModal.sizes, size) })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${productModal.sizes?.includes(size) ? "border-red-600 bg-red-600 text-white" : "border-gray-700 bg-gray-800 text-gray-400"}`}>{size}</button>)}</div></FieldHint>}
            <FieldHint title="الألوان" hint="اختياري. اختر الألوان المتاحة حتى تظهر للعميل داخل صفحة المنتج."><div className="flex flex-wrap gap-2">{["#111111", "#FFFFFF", "#6B7280", "#EF4444", "#3B82F6", "#22C55E", "#EC4899", "#D4A574"].map((color) => <button key={color} type="button" onClick={() => setProductModal({ ...productModal, colors: toggle(productModal.colors, color) })} className={`h-8 w-8 rounded-full border-2 ${productModal.colors?.includes(color) ? "border-red-500" : "border-gray-600"}`} style={{ backgroundColor: color }} />)}</div></FieldHint>
            <button onClick={() => void saveProduct()} disabled={saving} className="w-full rounded-xl bg-red-600 py-3 font-black text-white disabled:opacity-50">{saving ? "جارٍ حفظ المنتج..." : "حفظ المنتج"}</button>
          </div>
        </Modal>
      )}

      {categoryModal && (
        <Modal title={categoryModal.id ? "تعديل القسم" : "قسم جديد"} onClose={() => setCategoryModal(null)}>
          <div className="space-y-4">
            <FieldHint title="اسم القسم" hint="الاسم الظاهر للعميل داخل المتجر."><input value={categoryModal.label} onChange={(e) => setCategoryModal({ ...categoryModal, label: e.target.value })} placeholder="مثال: أحذية" className={INPUT} /></FieldHint>
            <FieldHint title="المفتاح الداخلي" hint="استخدم كلمة إنجليزية قصيرة بدون مسافات مثل shoes أو clothing."><input value={categoryModal.key} onChange={(e) => setCategoryModal({ ...categoryModal, key: e.target.value })} placeholder="shoes" className={INPUT} dir="ltr" /></FieldHint>
            <FieldHint title="نوع المقاسات" hint="حدد هل هذا القسم له مقاسات ملابس أو أحذية أو بدون مقاسات."><select value={categoryModal.sizeType} onChange={(e) => setCategoryModal({ ...categoryModal, sizeType: e.target.value as "none" | "clothing" | "shoes" })} className={INPUT}><option value="none">بدون مقاسات</option><option value="clothing">مقاسات ملابس</option><option value="shoes">مقاسات أحذية</option></select></FieldHint>
            <FieldHint title="الترتيب" hint="الأقسام ذات الرقم الأقل تظهر أولًا في المتجر."><input type="number" value={categoryModal.sortOrder} onChange={(e) => setCategoryModal({ ...categoryModal, sortOrder: Number(e.target.value) })} placeholder="0" className={INPUT} /></FieldHint>
            <FieldHint title="الحالة" hint="القسم غير النشط لن يظهر للاستخدام في الواجهة."><select value={categoryModal.active ? "active" : "inactive"} onChange={(e) => setCategoryModal({ ...categoryModal, active: e.target.value === "active" })} className={INPUT}><option value="active">نشط</option><option value="inactive">مخفي</option></select></FieldHint>
            <button onClick={() => void saveCategory()} disabled={saving} className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50">{saving ? "جارٍ حفظ القسم..." : "حفظ القسم"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
