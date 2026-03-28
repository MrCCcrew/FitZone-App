"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, Product, ProductCategory } from "../types";

const INPUT = "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none";
const CLOTHING = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOES = Array.from({ length: 27 }, (_, i) => String(i + 20));

type EditableProduct = Omit<Product, "id" | "sold"> & { id?: string };
type EditableCategory = ProductCategory | { id?: string; key: string; label: string; sizeType: "none" | "clothing" | "shoes"; sortOrder: number; active: boolean };

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
      await fetch("/api/admin/products", {
        method: productModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productModal, sizes: sizeType === "none" ? [] : productModal.sizes ?? [] }),
      });
      await load();
      setProductModal(null);
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    if (!categoryModal) return;
    setSaving(true);
    try {
      await fetch("/api/admin/product-categories", {
        method: categoryModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryModal),
      });
      await load();
      setCategoryModal(null);
    } finally {
      setSaving(false);
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!productModal || !files?.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
        const data = await response.json();
        if (response.ok && data.url) urls.push(data.url);
      }
      setProductModal((current) => current ? { ...current, images: [...(current.images ?? []), ...urls] } : current);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-gray-500">جارٍ التحميل...</div>;

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
                  <p className="text-xs text-gray-500">كل قسم يمكن ربطه بمقاسات ملابس أو أحذية أو بدون مقاسات.</p>
                </div>
                <button onClick={() => setCategoryModal({ key: "", label: "", sizeType: "none", sortOrder: categories.length, active: true })} className="rounded-xl bg-pink-600 px-4 py-2 text-sm font-bold text-white">+ قسم</button>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-xl border border-gray-800 bg-black/20 p-4">
                    <div className="font-bold text-white">{category.label}</div>
                    <div className="text-xs text-gray-500">{category.key}</div>
                    <div className="mt-2 text-xs text-gray-400">
                      {category.sizeType === "clothing" ? "مقاسات ملابس" : category.sizeType === "shoes" ? "مقاسات أحذية" : "بدون مقاسات"}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setCategoryModal(category)} className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white">تعديل</button>
                      <button onClick={async () => {
                        const res = await fetch("/api/admin/product-categories", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: category.id }) });
                        if (!res.ok) {
                          const data = await res.json().catch(() => ({}));
                          window.alert(data.error ?? "تعذر حذف القسم");
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
              <button onClick={() => setProductModal({ ...EMPTY_PRODUCT, category: categories[0]?.key ?? "supplement" })} className="mt-4 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white">+ منتج جديد</button>
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
                  <button onClick={() => setProductModal({ ...product })} className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-xs text-white">تعديل</button>
                  <button onClick={async () => {
                    if (!window.confirm("حذف المنتج؟")) return;
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
                  <td className="px-4 py-3">
                    <select value={order.status} onChange={async (e) => {
                      await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, status: e.target.value }) });
                      await load();
                    }} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white">
                      <option value="pending">معلق</option>
                      <option value="confirmed">مؤكد</option>
                      <option value="delivered">تم التسليم</option>
                      <option value="cancelled">ملغي</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {productModal && (
        <Modal title={productModal.id ? "تعديل المنتج" : "منتج جديد"} onClose={() => setProductModal(null)}>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <input value={productModal.name} onChange={(e) => setProductModal({ ...productModal, name: e.target.value })} placeholder="اسم المنتج" className={INPUT} />
              <select value={productModal.category} onChange={(e) => setProductModal({ ...productModal, category: e.target.value, sizes: [] })} className={INPUT}>
                {categories.map((category) => <option key={category.id} value={category.key}>{category.label}</option>)}
              </select>
              <input value={productModal.emoji} onChange={(e) => setProductModal({ ...productModal, emoji: e.target.value })} placeholder="أيقونة" className={INPUT} />
              <input type="number" value={productModal.stock} onChange={(e) => setProductModal({ ...productModal, stock: Number(e.target.value) })} placeholder="المخزون" className={INPUT} />
              <input type="number" value={productModal.price} onChange={(e) => setProductModal({ ...productModal, price: Number(e.target.value) })} placeholder="السعر" className={INPUT} />
              <input type="number" value={productModal.oldPrice ?? ""} onChange={(e) => setProductModal({ ...productModal, oldPrice: e.target.value ? Number(e.target.value) : null })} placeholder="السعر قبل الخصم" className={INPUT} />
            </div>

            <textarea value={productModal.description ?? ""} onChange={(e) => setProductModal({ ...productModal, description: e.target.value })} placeholder="وصف المنتج" rows={3} className={`${INPUT} resize-none`} />

            <div className="space-y-3">
              <input type="file" multiple accept="image/*" onChange={(e) => { void uploadImages(e.target.files); e.currentTarget.value = ""; }} className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white" />
              {uploading && <div className="text-xs text-yellow-400">جارٍ رفع الصور...</div>}
              <textarea value={fromList(productModal.images)} onChange={(e) => setProductModal({ ...productModal, images: toList(e.target.value) })} rows={4} className={`${INPUT} resize-none`} placeholder="رابط في كل سطر" />
              {!!productModal.images?.length && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {productModal.images.map((image, index) => (
                    <div key={`${image}-${index}`} className="rounded-xl border border-gray-700 bg-gray-800 p-2">
                      <img src={image} alt={`product-${index + 1}`} className="mb-2 h-28 w-full rounded-lg object-cover" />
                      <button type="button" onClick={() => setProductModal({ ...productModal, images: productModal.images?.filter((_, i) => i !== index) ?? [] })} className="w-full text-xs text-red-400">حذف الصورة</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {sizeType !== "none" && (
              <div className="flex flex-wrap gap-2">
                {(sizeType === "shoes" ? SHOES : CLOTHING).map((size) => (
                  <button key={size} type="button" onClick={() => setProductModal({ ...productModal, sizes: toggle(productModal.sizes, size) })} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${productModal.sizes?.includes(size) ? "border-red-600 bg-red-600 text-white" : "border-gray-700 bg-gray-800 text-gray-400"}`}>
                    {size}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {["#111111", "#FFFFFF", "#6B7280", "#EF4444", "#3B82F6", "#22C55E", "#EC4899", "#D4A574"].map((color) => (
                <button key={color} type="button" onClick={() => setProductModal({ ...productModal, colors: toggle(productModal.colors, color) })} className={`h-8 w-8 rounded-full border-2 ${productModal.colors?.includes(color) ? "border-red-500" : "border-gray-600"}`} style={{ backgroundColor: color }} />
              ))}
            </div>

            <button onClick={() => void saveProduct()} disabled={saving} className="w-full rounded-xl bg-red-600 py-3 font-black text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ المنتج"}</button>
          </div>
        </Modal>
      )}

      {categoryModal && (
        <Modal title={categoryModal.id ? "تعديل القسم" : "قسم جديد"} onClose={() => setCategoryModal(null)}>
          <div className="space-y-4">
            <input value={categoryModal.label} onChange={(e) => setCategoryModal({ ...categoryModal, label: e.target.value })} placeholder="اسم القسم" className={INPUT} />
            <input value={categoryModal.key} onChange={(e) => setCategoryModal({ ...categoryModal, key: e.target.value })} placeholder="المفتاح" className={INPUT} dir="ltr" />
            <select value={categoryModal.sizeType} onChange={(e) => setCategoryModal({ ...categoryModal, sizeType: e.target.value as "none" | "clothing" | "shoes" })} className={INPUT}>
              <option value="none">بدون مقاسات</option>
              <option value="clothing">مقاسات ملابس</option>
              <option value="shoes">مقاسات أحذية</option>
            </select>
            <input type="number" value={categoryModal.sortOrder} onChange={(e) => setCategoryModal({ ...categoryModal, sortOrder: Number(e.target.value) })} placeholder="الترتيب" className={INPUT} />
            <select value={categoryModal.active ? "active" : "inactive"} onChange={(e) => setCategoryModal({ ...categoryModal, active: e.target.value === "active" })} className={INPUT}>
              <option value="active">نشط</option>
              <option value="inactive">مخفي</option>
            </select>
            <button onClick={() => void saveCategory()} disabled={saving} className="w-full rounded-xl bg-pink-600 py-3 font-black text-white disabled:opacity-50">{saving ? "جارٍ الحفظ..." : "حفظ القسم"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
