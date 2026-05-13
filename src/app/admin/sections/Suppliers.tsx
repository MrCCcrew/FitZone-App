"use client";
import { useCallback, useEffect, useState } from "react";

type Supplier = {
  id: string; name: string; phone: string | null; address: string | null;
  notes: string | null; isActive: boolean; commissionRate: number | null;
  commissionType: string | null; productsCount: number; receiptsCount: number;
  createdAt: string;
};

const S = {
  card: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 20 } as React.CSSProperties,
  input: { width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  label: { fontSize: 11, color: "#9a8a90", marginBottom: 4, display: "block" } as React.CSSProperties,
  btn: (active: boolean): React.CSSProperties => ({ padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: active ? 700 : 500, background: active ? "#e91e63" : "rgba(255,255,255,.07)", color: active ? "#fff" : "#c9b9c1", fontSize: 13 }),
};

function ConfirmModal({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e0a12", border: "1px solid rgba(255,255,255,.15)", borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#fff", fontSize: 15, marginBottom: 24 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "9px 22px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#c9b9c1", cursor: "pointer" }}>إلغاء</button>
          <button onClick={onConfirm} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" }}>تأكيد الحذف</button>
        </div>
      </div>
    </div>
  );
}

function SupplierForm({ supplier, onSave, onClose }: { supplier: Supplier | null; onSave: (s: Supplier) => void; onClose: () => void }) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [commissionRate, setCommissionRate] = useState(supplier?.commissionRate?.toString() ?? "");
  const [commissionType, setCommissionType] = useState(supplier?.commissionType ?? "percentage");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setErr("اسم المورد مطلوب"); return; }
    setSaving(true); setErr(null);
    const res = await fetch("/api/admin/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: supplier?.id,
        name: name.trim(), phone: phone.trim() || null, address: address.trim() || null,
        notes: notes.trim() || null, isActive,
        commissionRate: commissionRate ? parseFloat(commissionRate) : null,
        commissionType: commissionRate ? commissionType : null,
      }),
    });
    const d = await res.json() as { supplier?: Supplier; error?: string };
    setSaving(false);
    if (!res.ok || !d.supplier) { setErr(d.error ?? "خطأ"); return; }
    onSave(d.supplier);
  }

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, color: "#fff", marginBottom: 18, fontSize: 16 }}>
        {supplier ? "تعديل المورد" : "إضافة مورد جديد"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={S.label}>الاسم الداخلي للمورد *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="مثال: متجر الرياضة الأول" />
        </div>
        <div>
          <label style={S.label}>رقم الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={S.input} placeholder="01xxxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label style={S.label}>حالة المورد</label>
          <select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")} style={S.input}>
            <option value="1">نشط</option>
            <option value="0">غير نشط</option>
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={S.label}>العنوان</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} style={S.input} placeholder="العنوان الكامل" />
        </div>
        <div>
          <label style={S.label}>نسبة العمولة / الربح</label>
          <input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={S.input} placeholder="مثال: 20" />
        </div>
        <div>
          <label style={S.label}>نوع العمولة</label>
          <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} style={S.input} disabled={!commissionRate}>
            <option value="percentage">نسبة مئوية %</option>
            <option value="fixed">مبلغ ثابت ج.م</option>
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={S.label}>ملاحظات داخلية</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...S.input, resize: "vertical" }} placeholder="أي ملاحظات خاصة بهذا المورد..." />
        </div>
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 12, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#c9b9c1", cursor: "pointer" }}>إلغاء</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: "#e91e63", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "جارٍ الحفظ..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/suppliers");
    if (res.ok) {
      const d = await res.json() as { suppliers: Supplier[] };
      setSuppliers(d.suppliers);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(s: Supplier) {
    const res = await fetch(`/api/admin/suppliers?id=${s.id}`, { method: "DELETE" });
    if (res.ok) {
      setSuppliers((prev) => prev.filter((x) => x.id !== s.id));
      setMsg("تم حذف المورد بنجاح");
      setTimeout(() => setMsg(null), 3000);
    }
    setConfirmDelete(null);
  }

  async function toggleActive(s: Supplier) {
    const res = await fetch("/api/admin/suppliers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, isActive: !s.isActive }),
    });
    if (res.ok) {
      const d = await res.json() as { supplier: Supplier };
      setSuppliers((prev) => prev.map((x) => x.id === d.supplier.id ? d.supplier : x));
    }
  }

  const filtered = suppliers.filter((s) =>
    !search || s.name.includes(search) || (s.phone ?? "").includes(search)
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {confirmDelete && (
        <ConfirmModal
          msg={`هل تريد حذف المورد "${confirmDelete.name}"؟ سيتم إلغاء ربطه بجميع المنتجات.`}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>إدارة الموردين</div>
          <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>بيانات الموردين داخلية — لا تظهر للعملاء</div>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#e91e63", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + إضافة مورد
        </button>
      </div>

      {msg && <div style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 10, padding: "12px 16px", color: "#4ade80", fontSize: 13 }}>{msg}</div>}

      {showForm && (
        <SupplierForm
          supplier={editing}
          onSave={(s) => {
            setSuppliers((prev) => editing ? prev.map((x) => x.id === s.id ? s : x) : [s, ...prev]);
            setShowForm(false); setEditing(null);
          }}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Search */}
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 بحث بالاسم أو الهاتف..." style={{ ...S.input, maxWidth: 340 }} />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[
          { label: "إجمالي الموردين", value: suppliers.length, color: "#e91e63" },
          { label: "موردون نشطون", value: suppliers.filter((s) => s.isActive).length, color: "#22c55e" },
          { label: "موردون غير نشطين", value: suppliers.filter((s) => !s.isActive).length, color: "#6b7280" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ ...S.card, padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9a8a90", padding: 40 }}>جارٍ التحميل...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
          <div style={{ color: "#9a8a90" }}>{search ? "لا توجد نتائج للبحث" : "لا يوجد موردون بعد"}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((s) => (
            <div key={s.id} style={{ ...S.card, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: s.isActive ? "rgba(233,30,99,.15)" : "rgba(107,114,128,.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🏪</div>
                <div>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>
                    {s.phone && <span style={{ marginInlineEnd: 12 }}>📞 {s.phone}</span>}
                    <span style={{ marginInlineEnd: 12 }}>📦 {s.productsCount} منتج</span>
                    <span>🧾 {s.receiptsCount} فاتورة</span>
                  </div>
                  {s.commissionRate && (
                    <div style={{ fontSize: 11, color: "#f5c542", marginTop: 3 }}>
                      عمولة: {s.commissionRate}{s.commissionType === "percentage" ? "%" : " ج.م"}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: s.isActive ? "rgba(34,197,94,.15)" : "rgba(107,114,128,.15)", color: s.isActive ? "#22c55e" : "#6b7280", border: `1px solid ${s.isActive ? "#22c55e44" : "#6b728044"}` }}>
                  {s.isActive ? "نشط" : "غير نشط"}
                </span>
                <button onClick={() => toggleActive(s)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>
                  {s.isActive ? "إيقاف" : "تفعيل"}
                </button>
                <button onClick={() => { setEditing(s); setShowForm(true); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>
                  تعديل
                </button>
                <button onClick={() => setConfirmDelete(s)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)", color: "#f87171", cursor: "pointer", fontSize: 12 }}>
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
