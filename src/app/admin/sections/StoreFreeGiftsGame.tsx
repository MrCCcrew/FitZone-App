"use client";
import { useEffect, useState } from "react";

type RewardPoolItem = {
  id: string;
  type: string;
  labelAr: string;
  labelEn: string;
  value: number;
  weight: number;
  active: boolean;
};

type Settings = {
  enabled: boolean;
  giftSlotsCount: number;
  maxCardPicksPerUser: number;
  referralGoal: number;
  sessionExpiryHours: number;
  rewardsPool: RewardPoolItem[];
};

const REWARD_TYPE_ICONS: Record<string, string> = {
  wallet: "💳", points: "⭐", discount: "🏷️",
  free_shipping: "🚚", free_product: "🎁", bonus_chest: "📦",
};

const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  giftSlotsCount: 3,
  maxCardPicksPerUser: 1,
  referralGoal: 3,
  sessionExpiryHours: 24,
  rewardsPool: [],
};

export function StoreFreeGiftsGameSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<{ totalSessions: number; completedSessions: number } | null>(null);

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
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/admin/store-free-gifts-game", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const updateReward = (id: string, key: keyof RewardPoolItem, value: unknown) => {
    setSettings(prev => ({
      ...prev,
      rewardsPool: prev.rewardsPool.map(r => r.id === id ? { ...r, [key]: value } : r),
    }));
  };

  const inp: React.CSSProperties = {
    padding: "8px 12px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,.12)",
    background: "rgba(255,255,255,.05)",
    color: "#fff", fontSize: 14,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  if (loading) return <div style={{ padding: 24, color: "rgba(255,255,255,.5)" }}>جارٍ التحميل...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "4px 0" }}>
      {/* Stats */}
      {stats && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "إجمالي الجلسات", value: stats.totalSessions },
            { label: "جلسات مكتملة", value: stats.completedSessions },
          ].map(s => (
            <div key={s.label} style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
              <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.5)" }}>{s.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, color: "#fbbf24" }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Master toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 16px" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>تفعيل لعبة الهدايا</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,.5)" }}>إظهار اللعبة للمستخدمين في صفحة المتجر</p>
        </div>
        <button
          onClick={() => setSettings(p => ({ ...p, enabled: !p.enabled }))}
          style={{
            padding: "7px 20px", borderRadius: 8, border: "none",
            background: settings.enabled ? "#10b981" : "rgba(255,255,255,.1)",
            color: settings.enabled ? "#fff" : "rgba(255,255,255,.5)",
            fontWeight: 700, cursor: "pointer", fontSize: 13, transition: "all .2s",
          }}
        >{settings.enabled ? "مفعّل" : "معطّل"}</button>
      </div>

      {/* General settings */}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>الإعدادات العامة</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {[
            { label: "عدد فتحات الهدايا", key: "giftSlotsCount" as const, min: 1, max: 10 },
            { label: "عدد اختيارات الكرت", key: "maxCardPicksPerUser" as const, min: 1, max: 3 },
            { label: "هدف الدعوة (أصدقاء)", key: "referralGoal" as const, min: 0, max: 20 },
            { label: "صلاحية الجلسة (ساعات)", key: "sessionExpiryHours" as const, min: 1, max: 72 },
          ].map(f => (
            <div key={f.key}>
              <label style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,.6)", marginBottom: 6 }}>{f.label}</label>
              <input
                type="number" min={f.min} max={f.max}
                value={settings[f.key]}
                onChange={e => setSettings(p => ({ ...p, [f.key]: Math.max(f.min, Math.min(f.max, Number(e.target.value))) }))}
                style={inp}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Rewards pool */}
      <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "#fbbf24" }}>بنك المكافآت</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {settings.rewardsPool.map(r => (
            <div key={r.id} style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr 80px 70px auto",
              gap: 10, alignItems: "center",
              background: r.active ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.01)",
              border: `1px solid ${r.active ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.04)"}`,
              borderRadius: 10, padding: "10px 12px",
              opacity: r.active ? 1 : 0.5,
              transition: "all .2s",
            }}>
              <span style={{ fontSize: 20 }}>{REWARD_TYPE_ICONS[r.type] ?? "🎁"}</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{r.labelAr}</p>
                <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,.4)" }}>{r.type}</p>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 3 }}>القيمة</label>
                <input type="number" value={r.value} onChange={e => updateReward(r.id, "value", Number(e.target.value))} style={{ ...inp, padding: "5px 8px", fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, color: "rgba(255,255,255,.4)", marginBottom: 3 }}>الوزن</label>
                <input type="number" min={1} max={100} value={r.weight} onChange={e => updateReward(r.id, "weight", Math.max(1, Number(e.target.value)))} style={{ ...inp, padding: "5px 8px", fontSize: 13 }} />
              </div>
              <button
                onClick={() => updateReward(r.id, "active", !r.active)}
                style={{
                  padding: "5px 12px", borderRadius: 7, border: "none",
                  background: r.active ? "#10b981" : "rgba(255,255,255,.08)",
                  color: r.active ? "#fff" : "rgba(255,255,255,.4)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >{r.active ? "ON" : "OFF"}</button>
            </div>
          ))}
          {settings.rewardsPool.length === 0 && (
            <p style={{ color: "rgba(255,255,255,.3)", fontSize: 13, textAlign: "center" }}>لا توجد مكافآت — ستُستخدم القيم الافتراضية</p>
          )}
        </div>
      </div>

      {/* Save */}
      <button
        onClick={() => void save()}
        disabled={saving}
        style={{
          padding: "13px", borderRadius: 12, border: "none",
          background: saved ? "#10b981" : saving ? "rgba(255,255,255,.1)" : "linear-gradient(135deg,#f59e0b,#f97316)",
          color: saving ? "rgba(255,255,255,.4)" : "#fff",
          fontSize: 15, fontWeight: 900, cursor: saving ? "not-allowed" : "pointer",
          transition: "all .25s",
        }}
      >
        {saved ? "✅ تم الحفظ" : saving ? "جارٍ الحفظ..." : "💾 حفظ الإعدادات"}
      </button>
    </div>
  );
}
