"use client";
import { useCallback, useEffect, useState } from "react";

type Zone = { id?: string; governorate: string; fee: number; estimatedDays: string; isActive: boolean };
type Company = {
  id: string; name: string; type: string; phone: string | null; contactPerson: string | null;
  defaultFee: number; estimatedDays: string | null; supportsCOD: boolean;
  codFeeType: string | null; codFeeValue: number | null; collectsPayment: boolean;
  isActive: boolean; notes: string | null; ordersCount: number;
  zones: Zone[]; createdAt: string;
};

const GOVS = ["القاهرة","الجيزة","الإسكندرية","الدقهلية","الشرقية","المنوفية","البحيرة","الإسماعيلية","الغربية","المنيا","أسيوط","سوهاج","قنا","الأقصر","أسوان","بني سويف","الفيوم","كفر الشيخ","دمياط","بورسعيد","السويس","شمال سيناء","جنوب سيناء","البحر الأحمر","الوادي الجديد","مطروح"];
const TYPES: Record<string, string> = { courier: "شركة توصيل", pickup: "استلام من الفرع", internal_courier: "مندوب داخلي" };

const S = {
  card: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 20 } as React.CSSProperties,
  input: { width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  label: { fontSize: 11, color: "#9a8a90", marginBottom: 4, display: "block" } as React.CSSProperties,
};

function ConfirmModal({ msg, onConfirm, onCancel }: { msg: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e0a12", border: "1px solid rgba(255,255,255,.15)", borderRadius: 16, padding: 28, maxWidth: 380, width: "90%", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ color: "#fff", fontSize: 15, marginBottom: 24 }}>{msg}</div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onCancel} style={{ padding: "9px 22px", borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "transparent", color: "#c9b9c1", cursor: "pointer" }}>إلغاء</button>
          <button onClick={onConfirm} style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, cursor: "pointer" }}>تأكيد</button>
        </div>
      </div>
    </div>
  );
}

function CompanyForm({ company, onSave, onClose }: { company: Company | null; onSave: (c: Company) => void; onClose: () => void }) {
  const [name, setName] = useState(company?.name ?? "");
  const [type, setType] = useState(company?.type ?? "courier");
  const [phone, setPhone] = useState(company?.phone ?? "");
  const [contactPerson, setContactPerson] = useState(company?.contactPerson ?? "");
  const [defaultFee, setDefaultFee] = useState(company?.defaultFee.toString() ?? "0");
  const [estimatedDays, setEstimatedDays] = useState(company?.estimatedDays ?? "");
  const [supportsCOD, setSupportsCOD] = useState(company?.supportsCOD ?? true);
  const [codFeeType, setCodFeeType] = useState(company?.codFeeType ?? "");
  const [codFeeValue, setCodFeeValue] = useState(company?.codFeeValue?.toString() ?? "");
  const [collectsPayment, setCollectsPayment] = useState(company?.collectsPayment ?? true);
  const [isActive, setIsActive] = useState(company?.isActive ?? true);
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [zones, setZones] = useState<Zone[]>(company?.zones ?? []);
  const [newGov, setNewGov] = useState("");
  const [newFee, setNewFee] = useState("");
  const [newDays, setNewDays] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addZone() {
    if (!newGov || !newFee) return;
    if (zones.find((z) => z.governorate === newGov)) { setErr("هذه المحافظة مضافة بالفعل"); return; }
    setZones((prev) => [...prev, { governorate: newGov, fee: parseFloat(newFee), estimatedDays: newDays, isActive: true }]);
    setNewGov(""); setNewFee(""); setNewDays(""); setErr(null);
  }

  async function handleSave() {
    if (!name.trim()) { setErr("اسم الشركة مطلوب"); return; }
    setSaving(true); setErr(null);
    const res = await fetch("/api/admin/delivery-companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: company?.id, name: name.trim(), type, phone: phone.trim() || null,
        contactPerson: contactPerson.trim() || null, defaultFee: parseFloat(defaultFee) || 0,
        estimatedDays: estimatedDays.trim() || null, supportsCOD, collectsPayment,
        codFeeType: codFeeType || null, codFeeValue: codFeeValue ? parseFloat(codFeeValue) : null,
        isActive, notes: notes.trim() || null, zones,
      }),
    });
    const d = await res.json() as { company?: Company; error?: string };
    setSaving(false);
    if (!res.ok || !d.company) { setErr(d.error ?? "خطأ"); return; }
    onSave(d.company);
  }

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 700, color: "#fff", marginBottom: 18, fontSize: 16 }}>
        {company ? "تعديل شركة التوصيل" : "إضافة شركة توصيل"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={S.label}>اسم الشركة *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={S.input} placeholder="مثال: Aramex، J&T Express، بوسطة" />
        </div>
        <div>
          <label style={S.label}>نوع التوصيل</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={S.input}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>حالة الشركة</label>
          <select value={isActive ? "1" : "0"} onChange={(e) => setIsActive(e.target.value === "1")} style={S.input}>
            <option value="1">نشطة</option>
            <option value="0">غير نشطة</option>
          </select>
        </div>
        <div>
          <label style={S.label}>رقم الهاتف</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} style={S.input} placeholder="01xxxxxxxxx" dir="ltr" />
        </div>
        <div>
          <label style={S.label}>المسؤول</label>
          <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} style={S.input} placeholder="اسم المسؤول" />
        </div>
        <div>
          <label style={S.label}>سعر التوصيل الافتراضي (ج.م)</label>
          <input type="number" value={defaultFee} onChange={(e) => setDefaultFee(e.target.value)} style={S.input} />
        </div>
        <div>
          <label style={S.label}>مدة التوصيل المتوقعة</label>
          <input value={estimatedDays} onChange={(e) => setEstimatedDays(e.target.value)} style={S.input} placeholder="مثال: 2-3 أيام عمل" />
        </div>

        {/* COD */}
        <div style={{ gridColumn: "1 / -1", borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 10, fontSize: 13 }}>الدفع عند الاستلام (COD)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fff" }}>
              <input type="checkbox" checked={supportsCOD} onChange={(e) => setSupportsCOD(e.target.checked)} style={{ accentColor: "#e91e63" }} />
              تدعم COD
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fff" }}>
              <input type="checkbox" checked={collectsPayment} onChange={(e) => setCollectsPayment(e.target.checked)} style={{ accentColor: "#e91e63" }} />
              تحصّل المبلغ
            </label>
          </div>
          {supportsCOD && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <label style={S.label}>نوع رسوم COD</label>
                <select value={codFeeType} onChange={(e) => setCodFeeType(e.target.value)} style={S.input}>
                  <option value="">بدون رسوم إضافية</option>
                  <option value="percentage">نسبة مئوية %</option>
                  <option value="fixed">مبلغ ثابت ج.م</option>
                </select>
              </div>
              {codFeeType && (
                <div>
                  <label style={S.label}>قيمة رسوم COD</label>
                  <input type="number" value={codFeeValue} onChange={(e) => setCodFeeValue(e.target.value)} style={S.input} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Zones */}
        <div style={{ gridColumn: "1 / -1", borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 10, fontSize: 13 }}>أسعار التوصيل حسب المحافظة</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginBottom: 10, alignItems: "end" }}>
            <div>
              <label style={S.label}>المحافظة</label>
              <select value={newGov} onChange={(e) => setNewGov(e.target.value)} style={S.input}>
                <option value="">— اختر محافظة —</option>
                {GOVS.filter((g) => !zones.find((z) => z.governorate === g)).map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>السعر ج.م</label>
              <input type="number" value={newFee} onChange={(e) => setNewFee(e.target.value)} style={{ ...S.input, width: 90 }} placeholder="0" />
            </div>
            <div>
              <label style={S.label}>المدة (اختياري)</label>
              <input value={newDays} onChange={(e) => setNewDays(e.target.value)} style={{ ...S.input, width: 120 }} placeholder="2-3 أيام" />
            </div>
            <button onClick={addZone} disabled={!newGov || !newFee} style={{ padding: "9px 14px", borderRadius: 8, border: "none", background: "#c9a227", color: "#000", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ إضافة</button>
          </div>
          {zones.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              {zones.map((z, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ color: "#fff", fontSize: 13 }}>{z.governorate}</span>
                  <span style={{ color: "#f5c542", fontWeight: 700, fontSize: 13 }}>{z.fee} ج.م {z.estimatedDays && <span style={{ color: "#9a8a90", fontWeight: 400 }}>— {z.estimatedDays}</span>}</span>
                  <button onClick={() => setZones((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <label style={S.label}>ملاحظات</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...S.input, resize: "vertical" }} />
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

export default function DeliveryCompanies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Company | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/delivery-companies?withZones=true");
    if (res.ok) { const d = await res.json() as { companies: Company[] }; setCompanies(d.companies); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleDelete(c: Company) {
    const res = await fetch(`/api/admin/delivery-companies?id=${c.id}`, { method: "DELETE" });
    if (res.ok) { setCompanies((prev) => prev.filter((x) => x.id !== c.id)); setMsg("تم الحذف بنجاح"); setTimeout(() => setMsg(null), 3000); }
    setConfirmDelete(null);
  }

  async function toggleActive(c: Company) {
    const res = await fetch("/api/admin/delivery-companies", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id, isActive: !c.isActive }) });
    if (res.ok) { const d = await res.json() as { company: Company }; setCompanies((prev) => prev.map((x) => x.id === d.company.id ? d.company : x)); }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {confirmDelete && <ConfirmModal msg={`حذف شركة "${confirmDelete.name}"؟`} onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>شركات التوصيل</div>
          <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>إدارة شركات التوصيل والأسعار حسب المحافظة</div>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#e91e63", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
          + إضافة شركة
        </button>
      </div>

      {msg && <div style={{ background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.3)", borderRadius: 10, padding: "12px 16px", color: "#4ade80", fontSize: 13 }}>{msg}</div>}
      {showForm && <CompanyForm company={editing} onSave={(c) => { setCompanies((prev) => editing ? prev.map((x) => x.id === c.id ? c : x) : [c, ...prev]); setShowForm(false); setEditing(null); }} onClose={() => { setShowForm(false); setEditing(null); }} />}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "إجمالي الشركات", value: companies.length, color: "#e91e63" },
          { label: "نشطة", value: companies.filter((c) => c.isActive).length, color: "#22c55e" },
          { label: "تدعم COD", value: companies.filter((c) => c.supportsCOD).length, color: "#f5c542" },
          { label: "إجمالي الطلبات", value: companies.reduce((s, c) => s + c.ordersCount, 0), color: "#a78bfa" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 4 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#9a8a90", padding: 40 }}>جارٍ التحميل...</div>
      ) : companies.length === 0 ? (
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 50, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🚚</div>
          <div style={{ color: "#9a8a90" }}>لا توجد شركات توصيل بعد</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {companies.map((c) => (
            <div key={c.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1 }}>
                  <div style={{ fontSize: 28 }}>🚚</div>
                  <div>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>
                      {TYPES[c.type] ?? c.type}
                      {c.phone && <span style={{ marginInlineStart: 10 }}>📞 {c.phone}</span>}
                      {c.contactPerson && <span style={{ marginInlineStart: 10 }}>👤 {c.contactPerson}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#f5c542", fontSize: 14 }}>{c.defaultFee} ج.م</span>
                  {c.estimatedDays && <span style={{ fontSize: 12, color: "#9a8a90" }}>⏱ {c.estimatedDays}</span>}
                  {c.supportsCOD && <span style={{ fontSize: 11, background: "rgba(245,197,66,.15)", color: "#f5c542", border: "1px solid rgba(245,197,66,.3)", borderRadius: 12, padding: "2px 8px" }}>COD</span>}
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: c.isActive ? "rgba(34,197,94,.15)" : "rgba(107,114,128,.15)", color: c.isActive ? "#22c55e" : "#6b7280", border: `1px solid ${c.isActive ? "#22c55e44" : "#6b728044"}` }}>
                    {c.isActive ? "نشطة" : "غير نشطة"}
                  </span>
                  <span style={{ fontSize: 12, color: "#9a8a90" }}>{c.ordersCount} طلب</span>
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(c); }} style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>{c.isActive ? "إيقاف" : "تفعيل"}</button>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(c); setShowForm(true); }} style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>تعديل</button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(c); }} style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid rgba(220,38,38,.3)", background: "rgba(220,38,38,.08)", color: "#f87171", cursor: "pointer", fontSize: 12 }}>حذف</button>
                  <span style={{ color: "#9a8a90" }}>{expanded === c.id ? "▲" : "▼"}</span>
                </div>
              </div>
              {expanded === c.id && c.zones.length > 0 && (
                <div style={{ padding: "0 18px 16px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
                  <div style={{ fontSize: 12, color: "#f5c542", fontWeight: 700, marginBottom: 8, marginTop: 12 }}>أسعار التوصيل حسب المحافظة:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                    {c.zones.map((z, i) => (
                      <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: "#fff" }}>{z.governorate}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#f5c542" }}>{z.fee} ج.م</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {expanded === c.id && c.zones.length === 0 && (
                <div style={{ padding: "12px 18px 16px", borderTop: "1px solid rgba(255,255,255,.08)", color: "#9a8a90", fontSize: 13 }}>
                  لا توجد أسعار محددة حسب المحافظة — يُستخدم السعر الافتراضي ({c.defaultFee} ج.م) لجميع المناطق
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
