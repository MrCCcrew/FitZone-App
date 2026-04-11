"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminSectionShell, AdminCard } from "./shared";

interface Settings {
  pointsPerSubscription: number;
  pointsPerReferral: number;
  pointValueEGP: number;
  referralRewardType: "points" | "wallet";
  referralRewardValue: number;
  tierThresholds: { silver: number; gold: number; platinum: number };
}

interface ReferralRow {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
  code: string;
  referredCount: number;
  totalEarned: number;
}

const INPUT = "w-full bg-[rgba(255,255,255,.06)] border border-[rgba(255,188,219,0.2)] focus:border-pink-400 rounded-xl px-4 py-2.5 text-[#fff4f8] text-sm outline-none transition-colors [&_option]:bg-[#2a0f1b] [&_option]:text-[#fff2f8]";
const LABEL = "block text-xs font-bold text-[#d7aabd] mb-1";
const BTN_PRIMARY = "rounded-xl bg-[#E91E63] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#C2185B] disabled:opacity-50";

export default function RewardSettings() {
  const [settings, setSettings] = useState<Settings>({
    pointsPerSubscription: 100,
    pointsPerReferral: 50,
    pointValueEGP: 0.1,
    referralRewardType: "points",
    referralRewardValue: 50,
    tierThresholds: { silver: 500, gold: 1500, platinum: 5000 },
  });
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [tab, setTab] = useState<"settings" | "referrals">("settings");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch("/api/admin/reward-settings").then((r) => r.json()),
        fetch("/api/admin/referrals").then((r) => r.json()),
      ]);
      if (sRes && typeof sRes === "object") setSettings((p) => ({ ...p, ...(sRes as Partial<Settings>) }));
      if (Array.isArray(rRes)) setReferrals(rRes as ReferralRow[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/reward-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setMsg({ text: data.error ?? "حدث خطأ", ok: false }); return; }
      setMsg({ text: "تم حفظ الإعدادات بنجاح ✓", ok: true });
    } catch {
      setMsg({ text: "تعذر الحفظ", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setSettings((p) => ({ ...p, [key]: key === "referralRewardType" ? val : Number(val) }));
  };

  const setTier = (key: keyof Settings["tierThresholds"]) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setSettings((p) => ({ ...p, tierThresholds: { ...p.tierThresholds, [key]: Number(e.target.value) } }));

  return (
    <AdminSectionShell
      title="إعدادات المكافآت والإحالة"
      subtitle="Rewards & Referral Settings"
    >
      {/* Tabs */}
      <div className="flex gap-2">
        {(["settings", "referrals"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${tab === t ? "bg-[#E91E63] text-white" : "border border-[rgba(255,188,219,0.2)] text-[#d7aabd] hover:text-white"}`}>
            {t === "settings" ? "⚙️ الإعدادات" : "🔗 سجل الإحالات"}
          </button>
        ))}
      </div>

      {loading ? (
        <AdminCard><div className="py-10 text-center text-sm text-[#d7aabd]">جاري التحميل...</div></AdminCard>
      ) : tab === "settings" ? (
        <AdminCard>
          {msg && (
            <div className={`mb-5 rounded-xl px-4 py-3 text-sm font-bold ${msg.ok ? "bg-emerald-950/40 text-emerald-300 border border-emerald-500/30" : "bg-red-950/40 text-red-300 border border-red-500/30"}`}>
              {msg.text}
            </div>
          )}
          <div className="space-y-6">
            {/* Subscription Points */}
            <div>
              <h3 className="mb-3 text-base font-black text-[#fff4f8]">🎯 نقاط الاشتراك</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>نقاط عند كل اشتراك جديد</label>
                  <input className={INPUT} type="number" min="0" value={settings.pointsPerSubscription}
                    onChange={set("pointsPerSubscription")} />
                </div>
                <div>
                  <label className={LABEL}>قيمة النقطة الواحدة (جنيه)</label>
                  <input className={INPUT} type="number" min="0" step="0.01" value={settings.pointValueEGP}
                    onChange={set("pointValueEGP")} />
                </div>
              </div>
            </div>

            <div className="h-px bg-[rgba(255,188,219,0.12)]" />

            {/* Referral Rewards */}
            <div>
              <h3 className="mb-3 text-base font-black text-[#fff4f8]">🔗 مكافأة الإحالة</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>نوع المكافأة</label>
                  <select className={INPUT} style={{ backgroundColor: "#2a0f1b" }} value={settings.referralRewardType}
                    onChange={(e) => setSettings((p) => ({ ...p, referralRewardType: e.target.value as "points" | "wallet" }))}>
                    <option value="points">نقاط مكافآت</option>
                    <option value="wallet">رصيد محفظة (جنيه)</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL}>
                    قيمة المكافأة {settings.referralRewardType === "points" ? "(نقطة)" : "(جنيه)"}
                  </label>
                  <input className={INPUT} type="number" min="0" value={settings.referralRewardValue}
                    onChange={set("referralRewardValue")} />
                </div>
                <div>
                  <label className={LABEL}>نقاط إضافية للمُحال (عند التسجيل)</label>
                  <input className={INPUT} type="number" min="0" value={settings.pointsPerReferral}
                    onChange={set("pointsPerReferral")} />
                </div>
              </div>
            </div>

            <div className="h-px bg-[rgba(255,188,219,0.12)]" />

            {/* Tier Thresholds */}
            <div>
              <h3 className="mb-3 text-base font-black text-[#fff4f8]">🏅 حدود مستويات العضوية (نقاط)</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={LABEL}>🥈 فضي (Silver)</label>
                  <input className={INPUT} type="number" min="0" value={settings.tierThresholds.silver}
                    onChange={setTier("silver")} />
                </div>
                <div>
                  <label className={LABEL}>🥇 ذهبي (Gold)</label>
                  <input className={INPUT} type="number" min="0" value={settings.tierThresholds.gold}
                    onChange={setTier("gold")} />
                </div>
                <div>
                  <label className={LABEL}>💎 بلاتيني (Platinum)</label>
                  <input className={INPUT} type="number" min="0" value={settings.tierThresholds.platinum}
                    onChange={setTier("platinum")} />
                </div>
              </div>
              <p className="mt-2 text-xs text-[#a07080]">البرونزي (Bronze) هو المستوى الافتراضي للعضوات الجدد تحت حد الفضي.</p>
            </div>

            <button className={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "💾 حفظ الإعدادات"}
            </button>
          </div>
        </AdminCard>
      ) : (
        <AdminCard>
          <h3 className="mb-4 text-base font-black text-[#fff4f8]">سجل الإحالات</h3>
          {referrals.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#d7aabd]">لا توجد إحالات بعد.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,188,219,0.12)] text-[#d7aabd]">
                    <th className="py-3 text-right font-bold">العضوة</th>
                    <th className="py-3 text-right font-bold">كود الإحالة</th>
                    <th className="py-3 text-right font-bold">عدد المُحالين</th>
                    <th className="py-3 text-right font-bold">إجمالي المكسب</th>
                    <th className="py-3 text-right font-bold">رابط الإحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map((r) => (
                    <tr key={r.id} className="border-b border-[rgba(255,188,219,0.07)] hover:bg-white/5">
                      <td className="py-3">
                        <div className="font-bold text-[#fff4f8]">{r.userName ?? "—"}</div>
                        <div className="text-xs text-[#a07080]">{r.userEmail ?? ""}</div>
                      </td>
                      <td className="py-3 font-black tracking-wider text-pink-300">{r.code}</td>
                      <td className="py-3 text-center font-bold text-[#fff4f8]">{r.referredCount}</td>
                      <td className="py-3 text-center font-bold text-emerald-400">{r.totalEarned}</td>
                      <td className="py-3">
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/r/${r.code}`)}
                          className="rounded-lg border border-[rgba(255,188,219,0.2)] px-3 py-1 text-xs text-[#d7aabd] hover:text-white transition-colors">
                          نسخ الرابط
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>
      )}
    </AdminSectionShell>
  );
}
