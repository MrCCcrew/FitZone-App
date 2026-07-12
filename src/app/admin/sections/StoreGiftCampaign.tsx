"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { StoreGiftCampaignSettings } from "@/app/api/admin/store-gift-campaign/route";

type AdminProduct = { id: string; name: string; images?: string[] | null };

function getThumb(images: string[] | null | undefined): string | null {
  if (!images || images.length === 0) return null;
  return images[0] ?? null;
}

function ProductPicker({ products, value, onChange }: {
  products: AdminProduct[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selected = products.find(p => p.id === value);
  const filtered = q ? products.filter(p => p.name.includes(q)) : products;

  const handleOpen = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative w-full">
      <button ref={btnRef} type="button" onClick={handleOpen}
        className="w-full bg-gray-900 border border-gray-700 hover:border-pink-500/60 rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-colors flex items-center gap-2 text-right">
        {selected ? (
          <>
            {getThumb(selected.images)
              ? <img src={getThumb(selected.images)!} className="w-7 h-7 rounded-md object-cover flex-shrink-0" />
              : <span className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center text-sm flex-shrink-0">🛍️</span>
            }
            <span className="flex-1 truncate text-right">{selected.name}</span>
          </>
        ) : <span className="flex-1 text-gray-500">— اختر منتجًا —</span>}
        <span className="text-gray-500 text-xs flex-shrink-0">▾</span>
      </button>

      {open && rect && (
        <div style={{ position: "fixed", top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="bg-gray-950 border border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
          <div className="sticky top-0 bg-gray-950 p-2 border-b border-gray-800">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
              onClick={e => e.stopPropagation()} autoFocus />
          </div>
          <div onClick={() => { onChange(null); setOpen(false); setQ(""); }}
            className="px-3 py-2 text-xs text-gray-500 cursor-pointer hover:bg-white/5 border-b border-gray-800">
            — بدون منتج محدد —
          </div>
          {filtered.map(p => {
            const thumb = getThumb(p.images);
            return (
              <div key={p.id} onClick={() => { onChange(p.id); setOpen(false); setQ(""); }}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-gray-800/50 hover:bg-white/5 transition-colors ${value === p.id ? "bg-pink-500/10" : ""}`}>
                {thumb
                  ? <img src={thumb} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-base flex-shrink-0">🛍️</div>
                }
                <span className="flex-1 text-sm text-white leading-tight">{p.name}</span>
                {value === p.id && <span className="text-pink-400 text-sm flex-shrink-0">✓</span>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-4 text-center text-xs text-gray-500">لا توجد نتائج</div>
          )}
        </div>
      )}
    </div>
  );
}

const REWARD_LABELS: Record<string, string> = {
  wallet: "💳 رصيد محفظة",
  points: "🏅 فيتزونات",
  discount: "🏷️ خصم على الإجمالي",
  free_shipping: "🚚 شحن مجاني",
  free_product: "🎁 منتج مجاني",
};

const INPUT = "w-full bg-gray-900 border border-gray-700 focus:border-pink-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";
const LABEL = "block text-xs text-gray-400 mb-1.5 font-semibold";

const DEFAULT: StoreGiftCampaignSettings = {
  campaignEnabled: false,
  campaignTitleAr: "🎁 هدية المتجر",
  campaignTitleEn: "Store Gift",
  campaignSubtitleAr: "هديتك قربت تفتح!",
  campaignSubtitleEn: "Your gift is almost unlocked!",
  minStoreCartSubtotal: 300,
  requiredStoreReferralCount: 3,
  rewardType: "wallet",
  rewardProductId: null,
  rewardWalletAmount: 50,
  rewardPoints: 200,
  discountAmount: 30,
  startsAt: null,
  endsAt: null,
  maxClaimsPerUser: 1,
  onlyForNewStoreCustomers: false,
  requireCompletedStoreOrder: true,
  requireSuccessfulReferralSignup: false,
  requireReferralFirstStoreOrder: false,
  isActive: false,
};

export default function StoreGiftCampaign() {
  const [settings, setSettings] = useState<StoreGiftCampaignSettings>(DEFAULT);
  const [stats, setStats] = useState({ totalClaims: 0, earnedClaims: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/store-gift-campaign", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json() as { settings: StoreGiftCampaignSettings; stats: typeof stats };
      setSettings(d.settings);
      setStats(d.stats);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void fetch("/api/admin/products")
      .then(r => r.json())
      .then((d: unknown) => { if (Array.isArray(d)) setProducts(d as AdminProduct[]); });
  }, [load]);

  const set = <K extends keyof StoreGiftCampaignSettings>(k: K, v: StoreGiftCampaignSettings[K]) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/admin/store-gift-campaign", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (res.ok) setMsg({ type: "success", text: "✅ تم حفظ إعدادات الحملة بنجاح." });
    else setMsg({ type: "error", text: "❌ تعذر الحفظ، حاول مرة أخرى." });
    setTimeout(() => setMsg(null), 4000);
  };

  // Preview text based on current settings
  const previewText = settings.campaignEnabled
    ? `باقي ${settings.minStoreCartSubtotal} ج.م من منتجات المتجر وتاخدي ${
        settings.rewardType === "wallet" ? `${settings.rewardWalletAmount} ج.م رصيد`
        : settings.rewardType === "points" ? `${settings.rewardPoints} فيتزونة`
        : settings.rewardType === "discount" ? `خصم ${settings.discountAmount} ج.م`
        : settings.rewardType === "free_shipping" ? "شحن مجاني"
        : "منتج مجاني"
      }`
    : "الحملة غير مفعلة";

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">جارٍ التحميل...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          ["🎁", "إجمالي المطالبات", stats.totalClaims, "text-pink-400"],
          ["✅", "هدايا مُكتسبة", stats.earnedClaims, "text-green-400"],
          ["⚙️", "الحالة", settings.isActive && settings.campaignEnabled ? "مفعّلة" : "متوقفة", settings.isActive && settings.campaignEnabled ? "text-green-400" : "text-red-400"],
        ].map(([icon, label, value, color]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-2xl mb-1">{String(icon)}</div>
            <div className={`font-black text-xl ${String(color)}`}>{String(value)}</div>
            <div className="text-xs text-gray-500 mt-1">{String(label)}</div>
          </div>
        ))}
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold ${msg.type === "success" ? "bg-green-900/30 text-green-300 border border-green-500/20" : "bg-red-900/30 text-red-300 border border-red-500/20"}`}>
          {msg.text}
        </div>
      )}

      {/* Main settings card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
        <h3 className="text-white font-black text-lg">⚙️ إعدادات حملة هدايا المتجر</h3>
        <p className="text-xs text-gray-500">هذه الحملة تطبق على منتجات المتجر فقط — لا تؤثر على الاشتراكات أو الجيم.</p>

        {/* Toggle active */}
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set("isActive", !settings.isActive)}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${settings.isActive ? "bg-pink-600" : "bg-gray-700"}`}
              style={{ position: "relative" }}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.isActive ? "right-1" : "right-7"}`} />
            </div>
            <span className="text-white font-bold text-sm">تفعيل الحملة</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set("campaignEnabled", !settings.campaignEnabled)}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${settings.campaignEnabled ? "bg-green-600" : "bg-gray-700"}`}
              style={{ position: "relative" }}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${settings.campaignEnabled ? "right-1" : "right-7"}`} />
            </div>
            <span className="text-white font-bold text-sm">عرض الحملة للعملاء</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>عنوان الحملة (عربي)</label>
            <input className={INPUT} value={settings.campaignTitleAr} onChange={(e) => set("campaignTitleAr", e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Campaign title (English)</label>
            <input className={INPUT} value={settings.campaignTitleEn} onChange={(e) => set("campaignTitleEn", e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className={LABEL}>وصف الحملة (عربي)</label>
            <input className={INPUT} value={settings.campaignSubtitleAr} onChange={(e) => set("campaignSubtitleAr", e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Campaign subtitle (English)</label>
            <input className={INPUT} value={settings.campaignSubtitleEn} onChange={(e) => set("campaignSubtitleEn", e.target.value)} dir="ltr" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>الحد الأدنى لسلة المتجر (ج.م)</label>
            <input className={INPUT} type="number" min={0} value={settings.minStoreCartSubtotal} onChange={(e) => set("minStoreCartSubtotal", Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>أقصى عدد هدايا للعميل الواحد</label>
            <input className={INPUT} type="number" min={1} value={settings.maxClaimsPerUser} onChange={(e) => set("maxClaimsPerUser", Number(e.target.value))} />
          </div>
          <div>
            <label className={LABEL}>تاريخ البداية (اختياري)</label>
            <input className={INPUT} type="datetime-local" value={settings.startsAt?.slice(0, 16) ?? ""} onChange={(e) => set("startsAt", e.target.value || null)} dir="ltr" />
          </div>
          <div>
            <label className={LABEL}>تاريخ الانتهاء (اختياري)</label>
            <input className={INPUT} type="datetime-local" value={settings.endsAt?.slice(0, 16) ?? ""} onChange={(e) => set("endsAt", e.target.value || null)} dir="ltr" />
          </div>
        </div>
      </div>

      {/* Reward type */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h3 className="text-white font-black">🎁 نوع الهدية</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.entries(REWARD_LABELS) as [string, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => set("rewardType", value as StoreGiftCampaignSettings["rewardType"])}
              className={`rounded-xl border px-4 py-3 text-sm font-bold transition-colors text-right ${
                settings.rewardType === value
                  ? "border-pink-500 bg-pink-500/10 text-pink-300"
                  : "border-white/10 bg-white/5 text-gray-400 hover:border-pink-500/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {settings.rewardType === "wallet" && (
          <div>
            <label className={LABEL}>قيمة الرصيد المُضاف (ج.م)</label>
            <input className={INPUT} type="number" min={0} value={settings.rewardWalletAmount} onChange={(e) => set("rewardWalletAmount", Number(e.target.value))} />
          </div>
        )}
        {settings.rewardType === "points" && (
          <div>
            <label className={LABEL}>عدد الفيتزونات المُضافة</label>
            <input className={INPUT} type="number" min={0} value={settings.rewardPoints} onChange={(e) => set("rewardPoints", Number(e.target.value))} />
          </div>
        )}
        {settings.rewardType === "discount" && (
          <div>
            <label className={LABEL}>قيمة الخصم على طلب المتجر (ج.م)</label>
            <input className={INPUT} type="number" min={0} value={settings.discountAmount} onChange={(e) => set("discountAmount", Number(e.target.value))} />
          </div>
        )}
        {settings.rewardType === "free_product" && (
          <div>
            <label className={LABEL}>المنتج المجاني</label>
            <ProductPicker products={products} value={settings.rewardProductId} onChange={id => set("rewardProductId", id)} />
          </div>
        )}

        <div>
          <label className={LABEL}>عدد الدعوات المطلوبة كبديل</label>
          <input className={INPUT} type="number" min={0} value={settings.requiredStoreReferralCount} onChange={(e) => set("requiredStoreReferralCount", Number(e.target.value))} />
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-2xl border border-pink-500/20 bg-pink-500/5 p-5">
        <p className="text-xs text-pink-300 font-bold mb-3">👁 معاينة البانر في سلة المتجر</p>
        <div className="rounded-xl bg-[#1a0010] border border-pink-500/30 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎁</span>
            <span className="text-white font-black text-sm">{settings.campaignTitleAr}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">{settings.campaignSubtitleAr}</p>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-gradient-to-r from-pink-600 to-pink-400 rounded-full" style={{ width: "60%" }} />
          </div>
          <p className="text-xs text-pink-300">{previewText}</p>
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full bg-pink-600 hover:bg-pink-700 text-white font-black py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {saving ? "جارٍ الحفظ..." : "💾 حفظ إعدادات الحملة"}
      </button>
    </div>
  );
}
