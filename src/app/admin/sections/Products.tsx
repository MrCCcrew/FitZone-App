"use client";

import { useState, useEffect, useCallback } from "react";
import type { Product, Order } from "../types";

const CAT_LABELS: Record<Product["category"], string> = { supplement: "مكملات", gear: "معدات", clothing: "ملابس", accessory: "إكسسوار" };
const CAT_COLORS: Record<Product["category"], string> = { supplement: "bg-blue-500/20 text-blue-400", gear: "bg-orange-500/20 text-orange-400", clothing: "bg-pink-500/20 text-pink-400", accessory: "bg-purple-500/20 text-purple-400" };
const ORDER_STATUS: Record<Order["status"], { label: string; color: string }> = {
  pending: { label: "معلق", color: "bg-yellow-500/20 text-yellow-400" },
  confirmed: { label: "مؤكد", color: "bg-blue-500/20 text-blue-400" },
  delivered: { label: "تم التسليم", color: "bg-green-500/20 text-green-400" },
  cancelled: { label: "ملغي", color: "bg-red-500/20 text-red-400" },
};

const EMPTY: Omit<Product, "id" | "sold"> = {
  name: "",
  category: "supplement",
  price: 0,
  oldPrice: null,
  stock: 0,
  active: true,
  emoji: "📦",
  description: "",
  images: [],
  sizes: [],
};

const INPUT = "w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-gray-500 text-xs mb-1.5">{label}</label>{children}</div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-black text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
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

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<Product | Omit<Product, "id" | "sold"> | null>(null);
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("الكل");
  const [uploading, setUploading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [p, o] = await Promise.all([
      fetch("/api/admin/products").then((r) => r.json()),
      fetch("/api/admin/orders").then((r) => r.json()),
    ]);
    setProducts(Array.isArray(p) ? p : []);
    setOrders(Array.isArray(o) ? o : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    const isEdit = "id" in modal;
    await fetch("/api/admin/products", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modal),
    });
    await fetchAll();
    setModal(null);
    setSaving(false);
  };

  const toggleProduct = async (id: string, active: boolean) => {
    await fetch("/api/admin/products", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) });
    await fetchAll();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("حذف المنتج؟")) return;
    await fetch("/api/admin/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await fetchAll();
  };

  const updateOrderStatus = async (id: string, status: Order["status"]) => {
    await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    await fetchAll();
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/uploads", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error("فشل رفع الصورة");
    }

    return res.json() as Promise<{ url: string }>;
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!modal || !files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const result = await uploadImage(file);
        uploaded.push(result.url);
      }
      setModal({
        ...modal,
        images: [...(modal.images ?? []), ...uploaded],
      });
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500 text-sm">جارٍ تحميل المنتجات والطلبات...</div></div>;

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.includes(search);
    const matchCat = catFilter === "الكل" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const totalRevenue = products.reduce((s, p) => s + p.price * p.sold, 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {[["products", "📦 المنتجات"], ["orders", "🛒 الطلبات"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v as typeof tab)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              ["إجمالي المنتجات", products.length, "text-white"],
              ["منتجات نشطة", products.filter((p) => p.active).length, "text-green-400"],
              ["مبيعات إجمالية", products.reduce((s, p) => s + p.sold, 0), "text-yellow-400"],
              ["إيراد المبيعات", totalRevenue.toLocaleString("ar-EG") + " ج.م", "text-red-400"],
            ].map(([label, val, color]) => (
              <div key={label as string} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
                <div className={`text-xl font-black ${color}`}>{val}</div>
                <div className="text-gray-500 text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن منتج..."
              className="flex-1 min-w-48 bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors placeholder-gray-600"
            />
            <div className="flex gap-1">
              {["الكل", ...Object.keys(CAT_LABELS)].map((c) => (
                <button key={c} onClick={() => setCatFilter(c)} className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${catFilter === c ? "bg-yellow-500 text-black" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {c === "الكل" ? "الكل" : CAT_LABELS[c as Product["category"]]}
                </button>
              ))}
            </div>
            <button onClick={() => setModal(EMPTY)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors">
              + منتج جديد
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map((p) => (
              <div key={p.id} className={`bg-gray-900/60 border rounded-2xl p-5 transition-all ${p.active ? "border-gray-800" : "border-gray-800 opacity-60"}`}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-4xl">{p.emoji}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CAT_COLORS[p.category]}`}>{CAT_LABELS[p.category]}</span>
                    <button onClick={() => toggleProduct(p.id, p.active)} className={`relative w-10 h-5 rounded-full transition-colors ${p.active ? "bg-green-600" : "bg-gray-700"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${p.active ? "right-0.5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
                <h4 className="text-white font-black mb-1">{p.name}</h4>
                {p.description && <p className="text-gray-500 text-xs mb-2 line-clamp-2">{p.description}</p>}
                <div className="text-yellow-400 font-black text-lg mb-1">{p.price.toLocaleString("ar-EG")} ج.م</div>
                <div className="flex gap-4 text-xs text-gray-400 mb-2">
                  <span>المخزون: <span className={p.stock <= 10 ? "text-red-400 font-bold" : "text-gray-300"}>{p.stock}</span></span>
                  <span>المبيعات: <span className="text-gray-300">{p.sold}</span></span>
                </div>
                <div className="flex gap-3 text-[11px] text-gray-500 mb-3">
                  <span>صور: {p.images?.length ?? 0}</span>
                  <span>مقاسات: {p.sizes?.length ?? 0}</span>
                </div>
                {p.stock <= 10 && <div className="text-xs text-red-400 bg-red-900/20 px-2 py-1 rounded-lg mb-3">⚠️ مخزون منخفض</div>}
                <div className="flex gap-2">
                  <button onClick={() => setModal(p)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">تعديل</button>
                  <button onClick={() => deleteProduct(p.id)} className="bg-red-900/50 hover:bg-red-800 text-red-400 text-xs font-bold py-2 px-3 rounded-lg transition-colors">حذف</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "orders" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-white font-black">الطلبات</h3>
            <div className="flex gap-2 text-xs">
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <span key={k} className={`px-2 py-1 rounded-full font-bold ${v.color}`}>
                  {orders.filter((o) => o.status === k).length} {v.label}
                </span>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  {["رقم الطلب", "العميل", "المنتج", "الكمية", "الإجمالي", "التاريخ", "الحالة", ""].map((h) => (
                    <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4 text-gray-500 text-xs font-mono">#{order.id}</td>
                    <td className="py-3 px-4 text-white font-medium">{order.customerName}</td>
                    <td className="py-3 px-4 text-gray-400">{order.product}</td>
                    <td className="py-3 px-4 text-gray-400">{order.quantity}</td>
                    <td className="py-3 px-4 text-yellow-400 font-bold">{order.total.toLocaleString("ar-EG")} ج.م</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{order.date}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${ORDER_STATUS[order.status].color}`}>
                        {ORDER_STATUS[order.status].label}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value as Order["status"])}
                        className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-2 py-1 outline-none"
                      >
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
        </div>
      )}

      {modal && (
        <Modal title={"id" in modal ? "تعديل المنتج" : "منتج جديد"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="الأيقونة">
                <input value={modal.emoji} onChange={(e) => setModal({ ...modal, emoji: e.target.value })} className={INPUT} />
              </Field>
              <Field label="الفئة">
                <select value={modal.category} onChange={(e) => setModal({ ...modal, category: e.target.value as Product["category"] })} className={INPUT}>
                  {Object.entries(CAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>

            <Field label="اسم المنتج">
              <input value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} className={INPUT} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="السعر (ج.م)">
                <input type="number" value={modal.price} onChange={(e) => setModal({ ...modal, price: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="السعر قبل الخصم">
                <input type="number" value={modal.oldPrice ?? 0} onChange={(e) => setModal({ ...modal, oldPrice: e.target.value ? +e.target.value : null })} className={INPUT} dir="ltr" />
              </Field>
            </div>

            <Field label="المخزون">
              <input type="number" value={modal.stock} onChange={(e) => setModal({ ...modal, stock: +e.target.value })} className={INPUT} dir="ltr" />
            </Field>

            <Field label="وصف المنتج">
              <textarea value={modal.description ?? ""} onChange={(e) => setModal({ ...modal, description: e.target.value })} rows={3} className={`${INPUT} resize-none`} />
            </Field>

            <Field label="روابط الصور - كل رابط في سطر">
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  onChange={(e) => { void handleImageUpload(e.target.files); e.currentTarget.value = ""; }}
                  className="block w-full text-sm text-gray-400 file:ml-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-4 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-red-700"
                />
                {uploading && <div className="text-xs text-yellow-400">جارٍ رفع الصور...</div>}
                <textarea
                  value={fromList(modal.images)}
                  onChange={(e) => setModal({ ...modal, images: toList(e.target.value) })}
                  rows={4}
                  placeholder={"يمكنك أيضًا إدخال روابط صور يدويًا هنا"}
                  className={`${INPUT} resize-none`}
                  dir="ltr"
                />
                {!!modal.images?.length && (
                  <div className="grid grid-cols-2 gap-3">
                    {modal.images.map((image, index) => (
                      <div key={`${image}-${index}`} className="bg-gray-800 rounded-xl p-2 border border-gray-700">
                        <img src={image} alt={`product-${index + 1}`} className="w-full h-28 object-cover rounded-lg mb-2" />
                        <button
                          type="button"
                          onClick={() => setModal({ ...modal, images: modal.images?.filter((_, i) => i !== index) ?? [] })}
                          className="w-full text-xs text-red-400 hover:text-red-300 transition-colors"
                        >
                          حذف الصورة
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>

            <Field label="المقاسات - كل مقاس في سطر أو مفصول بفاصلة">
              <textarea
                value={fromList(modal.sizes)}
                onChange={(e) => setModal({ ...modal, sizes: toList(e.target.value) })}
                rows={3}
                placeholder={"36\n37\n38\nM\nL\nXL"}
                className={`${INPUT} resize-none`}
              />
            </Field>

            <button onClick={save} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">
              {saving ? "جارٍ الحفظ..." : "💾 حفظ المنتج"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
