"use client";
import { useEffect, useState } from "react";
import { TranslateButton } from "./TranslateButton";

type RewardPoolItem = {
  id: string;
  type: string;
  icon: string;
  labelAr: string;
  labelEn: string;
  value: number;
  weight: number;
  active: boolean;
};

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

const REWARD_TYPES = [
  { value: "free_product",  label: "🎁 منتج مجاني" },
  { value: "points",        label: "⭐ نقاط مكافآت" },
  { value: "free_shipping", label: "🚚 شحن مجاني" },
  { value: "discount",      label: "🏷️ خصم" },
  { value: "wallet",        label: "💳 رصيد محفظة" },
  { value: "bonus_chest",   label: "💎 صندوق مكافآت" },
];
const KNOWN_TYPES = REWARD_TYPES.map(t => t.value);

function uid() { return Math.random().toString(36).slice(2, 10); }

export function StoreFreeGiftsGameSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [stats, setStats]       = useState<{ totalSessions: number; confirmedSessions: number } | null>(null);
  const [addOpen, setAddOpen]   = useState(false);
  const [newItem, setNewItem]   = useState<Omit<RewardPoolItem, "id">>({
    type: "free_product", icon: "🎁", labelAr: "", labelEn: "", value: 0, weight: 10, active: true,
  });

  useEffect(() => {
    void fetch("/api/admin/store-free-gifts-game")
      .then(r => r.json())
      .then((d: { settings: Settings; stats: typeof stats }) => {
        setSettings(d.settings ?? DEFAULT_SETTINGS);
        setStats(d.stats ?? null);
      })
      .finally(() => setLoading(false));
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
    setNewItem({ type: "free_product", icon: "🎁", labelAr: "", labelEn: "", value: 0, weight: 10, active: true });
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
  const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
  const label12: React.CSSProperties = { display: "block", fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 4 };

  if (loading) return <div style={{ padding: 24, color: "rgba(255,255,255,.5)" }}>جارٍ التحميل...</div>;

  const newTypeIsCustom = !KNOWN_TYPES.includes(newItem.type);

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
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={newItem.labelEn} onChange={e => setNewItem(p => ({ ...p, labelEn: e.target.value }))} placeholder="Free Gift" style={inp} />
                  <TranslateButton from={newItem.labelAr} onTranslated={text => setNewItem(p => ({ ...p, labelEn: text }))} />
                </div>
              </div>
              <div>
                <label style={label12}>نوع المكافأة *</label>
                <select
                  value={newTypeIsCustom ? "custom" : newItem.type}
                  onChange={e => setNewItem(p => ({ ...p, type: e.target.value === "custom" ? "" : e.target.value }))}
                  style={sel}
                >
                  {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  <option value="custom">✏️ مخصص (custom)</option>
                </select>
                {newTypeIsCustom && (
                  <input value={newItem.type} onChange={e => setNewItem(p => ({ ...p, type: e.target.value.trim().replace(/\s/g,"_") }))}
                    placeholder="custom_reward_code" style={{ ...inp, marginTop: 6 }} />
                )}
              </div>
              <div>
                <label style={label12}>القيمة (أو 0)</label>
                <input type="number" min={0} value={newItem.value} onChange={e => setNewItem(p => ({ ...p, value: Number(e.target.value) }))} style={inp} />
              </div>
              <div>
                <label style={label12}>الوزن — كلما زاد كلما ظهر أكثر</label>
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
          {settings.rewardsPool.map((r, idx) => {
            const typeIsCustom = !KNOWN_TYPES.includes(r.type);
            return (
              <div key={r.id} style={{
                background: r.active ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.01)",
                border: `1px solid ${r.active ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.04)"}`,
                borderRadius: 11, padding: "12px 14px",
                opacity: r.active ? 1 : 0.5, transition: "all .2s",
              }}>
                {/* Row 1: icon + labels + controls */}
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
                  <div style={{ flex: 2, minWidth: 120 }}>
                    <label style={label12}>الاسم الإنجليزي</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={r.labelEn} onChange={e => updateReward(r.id, "labelEn", e.target.value)} style={inp} />
                      <TranslateButton from={r.labelAr} onTranslated={text => updateReward(r.id, "labelEn", text)} />
                    </div>
                  </div>

                  {/* Type dropdown */}
                  <div style={{ flex: 2, minWidth: 140 }}>
                    <label style={label12}>النوع</label>
                    <select
                      value={typeIsCustom ? "custom" : r.type}
                      onChange={e => {
                        if (e.target.value !== "custom") updateReward(r.id, "type", e.target.value);
                        else updateReward(r.id, "type", "");
                      }}
                      style={sel}
                    >
                      {REWARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      <option value="custom">✏️ مخصص (custom)</option>
                    </select>
                    {typeIsCustom && (
                      <input value={r.type} onChange={e => updateReward(r.id, "type", e.target.value.trim().replace(/\s/g,"_"))}
                        placeholder="custom_reward_code" style={{ ...inp, marginTop: 6 }} />
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
            );
          })}

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
    </div>
  );
}
