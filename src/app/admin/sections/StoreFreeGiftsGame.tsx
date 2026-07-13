"use client";
import { useEffect, useRef, useState } from "react";

// ── Sessions Log ──────────────────────────────────────────────────────────────
type SessionRow = {
  id: string;
  status: string;
  spinRewardType: string | null;
  spinRewardValue: number | null;
  selectedProductIds: string;
  giftSlotsCount: number | null;
  createdAt: string;
  confirmedAt: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  storeOrder: { id: string; status: string; total: number } | null;
};

const SESSION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active:   { label: "لعب ولم يكمل",        color: "#f59e0b" },
  confirmed_no_order: { label: "كسب / بانتظار الطلب", color: "#6366f1" },
  confirmed_with_order: { label: "تم استلام الهدية", color: "#10b981" },
  expired:  { label: "انتهت المدة",           color: "#6b7280" },
};

function sessionDisplayStatus(row: SessionRow) {
  if (row.status === "confirmed") return row.storeOrder ? "confirmed_with_order" : "confirmed_no_order";
  return row.status;
}

const FILTER_TABS = [
  { key: "all",      label: "الكل" },
  { key: "active",   label: "لعب ولم يكمل" },
  { key: "confirmed_no_order", label: "كسب / بانتظار الطلب", apiValue: "confirmed" },
  { key: "confirmed_with_order", label: "تم استلام الهدية", apiValue: "confirmed" },
  { key: "expired",  label: "انتهت المدة" },
];

function GameSessionsLog() {
  const [filterKey, setFilterKey] = useState("all");
  const [page, setPage]           = useState(1);
  const [data, setData]           = useState<{ sessions: SessionRow[]; total: number } | null>(null);
  const [loading, setLoading]     = useState(false);

  const fetchSessions = async (fk: string, pg: number) => {
    setLoading(true);
    try {
      const tab = FILTER_TABS.find(t => t.key === fk);
      const apiStatus = tab && "apiValue" in tab ? tab.apiValue : (fk === "all" ? "" : fk);
      const qs = new URLSearchParams({ page: String(pg), ...(apiStatus ? { status: apiStatus } : {}) });
      const res = await fetch(`/api/admin/store-free-gifts-game/sessions?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) return;
      const d = await res.json() as { sessions: SessionRow[]; total: number };
      // Filter client-side for the sub-types of "confirmed"
      if (fk === "confirmed_no_order") d.sessions = d.sessions.filter(s => s.status === "confirmed" && !s.storeOrder);
      if (fk === "confirmed_with_order") d.sessions = d.sessions.filter(s => s.status === "confirmed" && !!s.storeOrder);
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchSessions(filterKey, page); }, [filterKey, page]);

  const totalPages = data ? Math.ceil(data.total / 25) : 1;

  return (
    <div style={{ marginTop: 32, background: "rgba(255,255,255,.04)", borderRadius: 16, padding: 20 }}>
      <h3 style={{ color: "#f59e0b", fontWeight: 900, fontSize: 15, marginBottom: 14 }}>📋 سجل جلسات اللعبة</h3>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {FILTER_TABS.map(tab => (
          <button key={tab.key} onClick={() => { setFilterKey(tab.key); setPage(1); }}
            style={{ padding: "5px 12px", borderRadius: 20, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: filterKey === tab.key ? "#f59e0b" : "rgba(255,255,255,.1)",
              color: filterKey === tab.key ? "#000" : "#ccc" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "#9ca3af", fontSize: 13 }}>جارٍ التحميل…</p>}

      {!loading && data && (
        <>
          {data.sessions.length === 0
            ? <p style={{ color: "#6b7280", fontSize: 13 }}>لا توجد جلسات لهذا الفلتر.</p>
            : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                      {["العميل", "المكافأة", "المنتجات", "الحالة", "التاريخ", "الطلب"].map(h => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map(row => {
                      const ds = sessionDisplayStatus(row);
                      const statusInfo = SESSION_STATUS_LABELS[ds] ?? { label: ds, color: "#9ca3af" };
                      let productCount = 0;
                      try { productCount = (JSON.parse(row.selectedProductIds) as string[]).length; } catch { productCount = 0; }
                      return (
                        <tr key={row.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                          <td style={{ padding: "7px 8px", color: "#e5e7eb" }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{row.user?.name ?? "—"}</div>
                            <div style={{ color: "#9ca3af", fontSize: 11 }}>{row.user?.email ?? row.id.slice(-8)}</div>
                          </td>
                          <td style={{ padding: "7px 8px", color: "#f3f4f6" }}>
                            {row.spinRewardType ?? "—"}
                            {row.spinRewardValue ? <span style={{ color: "#9ca3af" }}> ({row.spinRewardValue})</span> : null}
                          </td>
                          <td style={{ padding: "7px 8px", color: "#d1d5db" }}>
                            {productCount > 0 ? `${productCount} منتج (مجموع ${row.giftSlotsCount ?? 1})` : `مجموع ${row.giftSlotsCount ?? 1}`}
                          </td>
                          <td style={{ padding: "7px 8px" }}>
                            <span style={{ background: statusInfo.color + "22", color: statusInfo.color, padding: "2px 8px", borderRadius: 10, fontWeight: 700, fontSize: 11 }}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td style={{ padding: "7px 8px", color: "#9ca3af", fontSize: 11 }}>
                            {new Date(row.createdAt).toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </td>
                          <td style={{ padding: "7px 8px", color: "#d1d5db" }}>
                            {row.storeOrder
                              ? <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 6px", borderRadius: 8, fontSize: 11 }}>
                                  #{row.storeOrder.id.slice(-6).toUpperCase()}
                                </span>
                              : <span style={{ color: "#6b7280", fontSize: 11 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,.1)", color: "#ccc", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? .4 : 1 }}>
                ← السابق
              </button>
              <span style={{ color: "#9ca3af", fontSize: 12, lineHeight: "28px" }}>{page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "rgba(255,255,255,.1)", color: "#ccc", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? .4 : 1 }}>
                التالي →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

type RewardPoolItem = {
  id: string;
  type: string;
  icon: string;
  labelAr: string;
  labelEn: string;
  value: number;
  weight: number;
  active: boolean;
  productId?: string;
};

type AdminProduct = { id: string; name: string; images?: string[] | null };

function getThumb(images: string[] | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  return images[0] ?? null;
}

const PICKER_BASE: React.CSSProperties = {
  padding: "7px 10px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,.12)",
  background: "rgba(255,255,255,.05)",
  color: "#fff", fontSize: 13,
  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

function ProductPicker({ products, value, onChange }: {
  products: AdminProduct[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = products.find(p => p.id === value);
  const filtered = q ? products.filter(p => p.name.includes(q)) : products;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ ...PICKER_BASE, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        {selected ? (
          <>
            {getThumb(selected.images)
              ? <img src={getThumb(selected.images)!} style={{ width: 26, height: 26, borderRadius: 5, objectFit: "cover", flexShrink: 0 }} />
              : <span style={{ width: 26, height: 26, borderRadius: 5, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🛍️</span>
            }
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{selected.name}</span>
          </>
        ) : <span style={{ flex: 1, color: "rgba(255,255,255,.3)" }}>— اختر منتجًا —</span>}
        <span style={{ color: "rgba(255,255,255,.4)", fontSize: 10, flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#1e0015", border: "1px solid rgba(255,255,255,.15)",
          borderRadius: 10, zIndex: 300, maxHeight: 240, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,.7)",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid rgba(255,255,255,.08)", position: "sticky", top: 0, background: "#1e0015" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث..."
              style={{ ...PICKER_BASE, padding: "5px 8px", fontSize: 12 }}
              onClick={e => e.stopPropagation()} autoFocus />
          </div>
          <div onClick={() => { onChange(""); setOpen(false); setQ(""); }}
            style={{ padding: "8px 12px", cursor: "pointer", color: "rgba(255,255,255,.35)", fontSize: 11, borderBottom: "1px solid rgba(255,255,255,.06)" }}>
            — بدون منتج محدد —
          </div>
          {filtered.map(p => {
            const thumb = getThumb(p.images);
            return (
              <div key={p.id} onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
                  cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.04)",
                  background: value === p.id ? "rgba(251,191,36,.1)" : "transparent",
                }}>
                {thumb
                  ? <img src={thumb} style={{ width: 38, height: 38, borderRadius: 7, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 38, height: 38, borderRadius: 7, background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🛍️</div>
                }
                <span style={{ flex: 1, fontSize: 12, color: "#fff", lineHeight: 1.3 }}>{p.name}</span>
                {value === p.id && <span style={{ color: "#fbbf24", fontSize: 13, flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 14, textAlign: "center", color: "rgba(255,255,255,.3)", fontSize: 12 }}>لا توجد نتائج</div>
          )}
        </div>
      )}
    </div>
  );
}

const REWARD_TYPES = [
  { value: "free_product",  label: "منتج مجاني" },
  { value: "points",        label: "فيتزونات" },
  { value: "discount",      label: "خصم" },
  { value: "free_shipping", label: "شحن مجاني" },
  { value: "bonus_chest",   label: "صندوق بونص" },
  { value: "wallet",        label: "رصيد محفظة" },
  { value: "custom_gift",   label: "هدية مخصصة" },
];

type Settings = {
  gameEnabled: boolean;
  freeGiftSlotsCount: number;
  maxCardPicksPerUser: number;
  requiredInvites: number;
  sessionDurationMinutes: number;
  rewardsPool: RewardPoolItem[];
};

const DEFAULT_SETTINGS: Settings = {
  gameEnabled: false,
  freeGiftSlotsCount: 3,
  maxCardPicksPerUser: 1,
  requiredInvites: 3,
  sessionDurationMinutes: 1440,
  rewardsPool: [],
};

const QUICK_ICONS = ["🎁","⭐","🚚","🪙","💎","🏆","🎀","💳","🎉","🛍️","💝","🎊","🏅","🌟","🎯","🎲"];

function uid() { return Math.random().toString(36).slice(2, 10); }

export function StoreFreeGiftsGameSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [stats, setStats]       = useState<{ totalSessions: number; confirmedSessions: number } | null>(null);
  const [addOpen, setAddOpen]   = useState(false);
  const [newItem, setNewItem]   = useState<Omit<RewardPoolItem, "id">>({
    type: "", icon: "🎁", labelAr: "", labelEn: "", value: 0, weight: 10, active: true, productId: "",
  });
  const [products, setProducts] = useState<AdminProduct[]>([]);

  useEffect(() => {
    void fetch("/api/admin/store-free-gifts-game")
      .then(r => r.json())
      .then((d: { settings: Settings; stats: typeof stats }) => {
        setSettings(d.settings ?? DEFAULT_SETTINGS);
        setStats(d.stats ?? null);
      })
      .finally(() => setLoading(false));
    void fetch("/api/admin/products")
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setProducts(d as AdminProduct[]); });
  }, []);

  const save = async () => {
    setSaving(true); setSaved(false);
    try {
      await fetch("/api/admin/store-free-gifts-game", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const updateReward = (id: string, key: keyof RewardPoolItem, value: unknown) =>
    setSettings(prev => ({
      ...prev,
      rewardsPool: prev.rewardsPool.map(r => r.id === id ? { ...r, [key]: value } : r),
    }));

  const deleteReward = (id: string) =>
    setSettings(prev => ({ ...prev, rewardsPool: prev.rewardsPool.filter(r => r.id !== id) }));

  const addReward = () => {
    if (!newItem.labelAr.trim() || !newItem.type.trim()) return;
    setSettings(prev => ({
      ...prev,
      rewardsPool: [...prev.rewardsPool, { id: uid(), ...newItem }],
    }));
    setNewItem({ type: "", icon: "🎁", labelAr: "", labelEn: "", value: 0, weight: 10, active: true, productId: "" });
    setAddOpen(false);
  };

  const moveReward = (id: string, dir: -1 | 1) => {
    setSettings(prev => {
      const arr = [...prev.rewardsPool];
      const i = arr.findIndex(r => r.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...prev, rewardsPool: arr };
    });
  };

  const totalWeight = settings.rewardsPool.filter(r => r.active).reduce((s, r) => s + r.weight, 0);

  const inp: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.05)",
    color: "#fff", fontSize: 13,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  const label12: React.CSSProperties = { display: "block", fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 4 };

  if (loading) return <div style={{ padding: 24, color: "rgba(255,255,255,.5)" }}>جارٍ التحميل...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "4px 0" }}>

      {/* ── Stats ── */}
      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "إجمالي الجلسات",  val: stats.totalSessions },
            { label: "جلسات مكتملة",    val: stats.confirmedSessions },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 130, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.5)" }}>{s.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>{s.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Master toggle ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>تفعيل لعبة الهدايا</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,.5)" }}>إظهار اللعبة للمستخدمين في صفحة المتجر</p>
        </div>
        <button onClick={() => setSettings(p => ({ ...p, gameEnabled: !p.gameEnabled }))}
          style={{ padding: "7px 20px", borderRadius: 8, border: "none", background: settings.gameEnabled ? "#10b981" : "rgba(255,255,255,.1)", color: settings.gameEnabled ? "#fff" : "rgba(255,255,255,.5)", fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all .2s" }}>
          {settings.gameEnabled ? "مفعّل" : "معطّل"}
        </button>
      </div>

      {/* ── General settings ── */}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>الإعدادات العامة</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {([
            { label: "عدد فتحات الهدايا",       key: "freeGiftSlotsCount",     min: 1, max: 10 },
            { label: "عدد اختيارات الكرت",       key: "maxCardPicksPerUser",     min: 1, max: 3 },
            { label: "هدف الدعوة (أصدقاء)",      key: "requiredInvites",         min: 0, max: 20 },
            { label: "صلاحية الجلسة (دقائق)",   key: "sessionDurationMinutes",  min: 30, max: 10080 },
          ] as { label: string; key: keyof Settings & string; min: number; max: number }[]).map(f => (
            <div key={f.key}>
              <label style={label12}>{f.label}</label>
              <input type="number" min={f.min} max={f.max}
                value={settings[f.key] as number}
                onChange={e => setSettings(p => ({ ...p, [f.key]: Math.max(f.min, Math.min(f.max, Number(e.target.value))) }))}
                style={inp} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Rewards pool ── */}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>بنك المكافآت</h3>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "rgba(255,255,255,.4)" }}>
              {settings.rewardsPool.filter(r=>r.active).length} مكافأة نشطة · مجموع الأوزان: {totalWeight}
            </p>
          </div>
          <button onClick={() => setAddOpen(v => !v)}
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(251,191,36,.4)", background: "rgba(251,191,36,.08)", color: "#fbbf24", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            {addOpen ? "✕ إلغاء" : "+ إضافة مكافأة"}
          </button>
        </div>

        {/* Add form */}
        {addOpen && (
          <div style={{ background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.2)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>مكافأة جديدة</p>

            {/* Icon picker */}
            <label style={label12}>الأيقونة (رمز)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {QUICK_ICONS.map(ic => (
                <button key={ic} onClick={() => setNewItem(p => ({ ...p, icon: ic }))}
                  style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${newItem.icon === ic ? "#fbbf24" : "rgba(255,255,255,.1)"}`, background: newItem.icon === ic ? "rgba(251,191,36,.15)" : "rgba(255,255,255,.04)", fontSize: 18, cursor: "pointer" }}>
                  {ic}
                </button>
              ))}
              <input value={newItem.icon} onChange={e => setNewItem(p => ({ ...p, icon: e.target.value.slice(-2) }))}
                placeholder="✍" style={{ ...inp, width: 44, textAlign: "center", fontSize: 18, padding: "4px 6px" }} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={label12}>الاسم بالعربي *</label>
                <input value={newItem.labelAr} onChange={e => setNewItem(p => ({ ...p, labelAr: e.target.value }))} placeholder="هدية مجانية" style={inp} />
              </div>
              <div>
                <label style={label12}>الاسم بالإنجليزي</label>
                <input value={newItem.labelEn} onChange={e => setNewItem(p => ({ ...p, labelEn: e.target.value }))} placeholder="Free Gift" style={inp} />
              </div>
              <div>
                <label style={label12}>نوع المكافأة *</label>
                <select value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value, productId: "" }))}
                  style={{ ...inp, appearance: "auto" }}>
                  <option value="">— اختر النوع —</option>
                  {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                </select>
              </div>
              {newItem.type === "free_product" && (
                <div>
                  <label style={label12}>المنتج المجاني</label>
                  <ProductPicker products={products} value={newItem.productId ?? ""} onChange={id => setNewItem(p => ({ ...p, productId: id }))} />
                </div>
              )}
              <div>
                <label style={label12}>القيمة (أو 0)</label>
                <input type="number" min={0} value={newItem.value} onChange={e => setNewItem(p => ({ ...p, value: Number(e.target.value) }))} style={inp} />
              </div>
              <div>
                <label style={label12}>الوزن (1-100) — كلما زاد كلما ظهر أكثر</label>
                <input type="number" min={1} max={100} value={newItem.weight} onChange={e => setNewItem(p => ({ ...p, weight: Math.max(1, Math.min(100, Number(e.target.value))) }))} style={inp} />
              </div>
            </div>
            <button onClick={addReward}
              disabled={!newItem.labelAr.trim() || !newItem.type.trim()}
              style={{ padding: "9px 24px", borderRadius: 9, border: "none", background: (!newItem.labelAr.trim() || !newItem.type.trim()) ? "rgba(255,255,255,.1)" : "#10b981", color: "#fff", fontWeight: 800, fontSize: 13, cursor: (!newItem.labelAr.trim() || !newItem.type.trim()) ? "not-allowed" : "pointer" }}>
              ✓ إضافة للبنك
            </button>
          </div>
        )}

        {/* Rewards list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {settings.rewardsPool.map((r, idx) => (
            <div key={r.id} style={{
              background: r.active ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.01)",
              border: `1px solid ${r.active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)"}`,
              borderRadius: 11, padding: "12px 14px",
              opacity: r.active ? 1 : 0.5, transition: "all .2s",
            }}>
              {/* Row 1: icon + labels + toggle + delete */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                {/* Icon */}
                <input value={r.icon} onChange={e => updateReward(r.id, "icon", e.target.value.slice(-2))}
                  style={{ ...inp, width: 44, textAlign: "center", fontSize: 22, padding: "4px", flexShrink: 0 }} />

                {/* Label Ar */}
                <div style={{ flex: 2, minWidth: 110 }}>
                  <label style={label12}>الاسم العربي</label>
                  <input value={r.labelAr} onChange={e => updateReward(r.id, "labelAr", e.target.value)} style={inp} />
                </div>

                {/* Label En */}
                <div style={{ flex: 2, minWidth: 100 }}>
                  <label style={label12}>الاسم الإنجليزي</label>
                  <input value={r.labelEn} onChange={e => updateReward(r.id, "labelEn", e.target.value)} style={inp} />
                </div>

                {/* Type */}
                <div style={{ flex: 2, minWidth: 130 }}>
                  <label style={label12}>النوع</label>
                  <select value={r.type} onChange={e => { updateReward(r.id, "type", e.target.value); updateReward(r.id, "productId", ""); }}
                    style={{ ...inp, appearance: "auto" }}>
                    <option value="">— اختر —</option>
                    {REWARD_TYPES.map(rt => <option key={rt.value} value={rt.value}>{rt.label}</option>)}
                  </select>
                  {r.type === "free_product" && (
                    <div style={{ marginTop: 4 }}>
                      <ProductPicker products={products} value={r.productId ?? ""} onChange={id => updateReward(r.id, "productId", id)} />
                    </div>
                  )}
                </div>

                {/* Value */}
                <div style={{ width: 70 }}>
                  <label style={label12}>القيمة</label>
                  <input type="number" min={0} value={r.value} onChange={e => updateReward(r.id, "value", Number(e.target.value))} style={{ ...inp, padding: "7px 8px" }} />
                </div>

                {/* Weight */}
                <div style={{ width: 70 }}>
                  <label style={label12}>الوزن</label>
                  <input type="number" min={1} max={100} value={r.weight} onChange={e => updateReward(r.id, "weight", Math.max(1, Number(e.target.value)))} style={{ ...inp, padding: "7px 8px" }} />
                </div>

                {/* Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => updateReward(r.id, "active", !r.active)}
                    style={{ padding: "5px 12px", borderRadius: 7, border: "none", background: r.active ? "#10b981" : "rgba(255,255,255,.08)", color: r.active ? "#fff" : "rgba(255,255,255,.4)", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {r.active ? "✓ نشط" : "○ معطّل"}
                  </button>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => moveReward(r.id, -1)} disabled={idx === 0}
                      style={{ flex: 1, padding: "3px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "rgba(255,255,255,.5)", fontSize: 12, cursor: "pointer" }}>↑</button>
                    <button onClick={() => moveReward(r.id, 1)} disabled={idx === settings.rewardsPool.length - 1}
                      style={{ flex: 1, padding: "3px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "rgba(255,255,255,.5)", fontSize: 12, cursor: "pointer" }}>↓</button>
                    <button onClick={() => deleteReward(r.id)}
                      style={{ flex: 1, padding: "3px 6px", borderRadius: 6, border: "1px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.08)", color: "#ef4444", fontSize: 11, cursor: "pointer", fontWeight: 700 }}>✕</button>
                  </div>
                </div>
              </div>

              {/* Probability bar */}
              {totalWeight > 0 && r.active && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 4, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
                    <div style={{ width: `${(r.weight / totalWeight * 100).toFixed(1)}%`, height: "100%", background: "linear-gradient(90deg,#fbbf24,#f59e0b)", borderRadius: 4 }} />
                  </div>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,.4)", whiteSpace: "nowrap" }}>
                    {(r.weight / totalWeight * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          ))}

          {settings.rewardsPool.length === 0 && (
            <p style={{ color: "rgba(255,255,255,.3)", fontSize: 13, textAlign: "center", padding: 16 }}>
              لا توجد مكافآت — ستُستخدم القيم الافتراضية
            </p>
          )}
        </div>
      </div>

      {/* ── Save ── */}
      <button onClick={() => void save()} disabled={saving}
        style={{ padding: "13px", borderRadius: 12, border: "none", background: saved ? "#10b981" : saving ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#f59e0b,#f97316)", color: saving ? "rgba(255,255,255,.4)" : "#fff", fontSize: 15, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer", transition: "all .25s" }}>
        {saved ? "✅ تم الحفظ" : saving ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}
      </button>

      <GameSessionsLog />
    </div>
  );
}
