"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PinkFridayPopup, { type PinkFridayData, type PinkFridayOffer } from "@/components/PinkFridayPopup";

type Settings = {
  enabled: boolean;
  ribbonText: string;
  endDate: string | null;
  showDelaySeconds: number;
  hideHours: number;
  revision: number;
  updatedAt: string | null;
};

type ExistingOffer = {
  id: string;
  title: string;
  active: boolean;
  specialPrice?: number | null;
  priceBefore?: number | null;
  membershipId?: string | null;
  durationDays?: number | null;
  sessionsCount?: number | null;
  features?: string[] | string | null;
  friendOfferEnabled?: boolean;
  offerBoxEnabled?: boolean;
  image?: string | null;
  validUntil?: string;
};

type PopupItem = {
  offerId: string;
  imageUrl: string | null;
  badge: string | null;
  isActive: boolean;
};

const EMPTY_SETTINGS: Settings = {
  enabled: false,
  ribbonText: "💗 PINK FRIDAY — لفترة محدودة",
  endDate: null,
  showDelaySeconds: 2.5,
  hideHours: 24,
  revision: 0,
  updatedAt: null,
};

const inputClass =
  "w-full min-w-0 rounded-xl border border-pink-300/30 bg-[#391525] px-3 py-2.5 text-white outline-none focus:border-pink-400";
const buttonClass =
  "rounded-xl bg-pink-600 px-4 py-2.5 font-bold text-white disabled:opacity-50";

async function readJson(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error || `HTTP ${response.status}`);
  }
  return body;
}

export default function PinkFridayPopupAdmin() {
  const [settings, setSettings] = useState<Settings>(EMPTY_SETTINGS);
  const [offers, setOffers] = useState<ExistingOffer[]>([]);
  const [items, setItems] = useState<PopupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadIndex, setUploadIndex] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/admin/popup/atomic", { cache: "no-store" }),

        fetch("/api/admin/offers", { cache: "no-store" }),
      ]);
      const [snapshot, o] = await Promise.all(responses.map(readJson));
      setSettings(snapshot.settings);
      setItems(
        snapshot.offers.map((item: {
          offerId: string;
          imageUrl: string | null;
          badge: string | null;
          isActive: boolean;
        }) => ({
          offerId: item.offerId,
          imageUrl: item.imageUrl,
          badge: item.badge,
          isActive: item.isActive,
        })),
      );
      setOffers(o as ExistingOffer[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل البيانات");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function changeItem(index: number, patch: Partial<PopupItem>) {
    setItems((previous) =>
      previous.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function move(index: number, direction: number) {
    setItems((previous) => {
      const to = index + direction;
      if (to < 0 || to >= previous.length) return previous;
      const copy = [...previous];
      [copy[index], copy[to]] = [copy[to], copy[index]];
      return copy;
    });
  }

  async function upload(index: number, file: File) {
    setUploadIndex(index);
    setError("");
    try {
      const formData = new FormData();
      formData.set("folder", "popup");
      formData.set("file", file);
      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await readJson(response);
      if (typeof payload.url !== "string") {
        throw new Error("رابط الصورة غير صالح");
      }
      changeItem(index, { imageUrl: payload.url });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فشل رفع الصورة");
    } finally {
      setUploadIndex(null);
    }
  }

  async function save() {
    setError("");
    setMessage("");

    if (items.some((item) => !item.offerId)) {
      setError("اختاري عرضًا لكل كارت");
      return;
    }

    if (new Set(items.map((item) => item.offerId)).size !== items.length) {
      setError("لا يمكن تكرار نفس العرض");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/popup/atomic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: settings.revision,
          settings: {
            enabled: settings.enabled,
            ribbonText: settings.ribbonText,
            endDate: settings.endDate,
            showDelaySeconds: settings.showDelaySeconds,
            hideHours: settings.hideHours,
          },
          offers: items.map((item, index) => ({
            ...item,
            sortOrder: index + 1,
          })),
        }),
      });

      if (response.status === 409) {
        // Preserve the current draft: never replace it automatically.
        setError(
          "تم تعديل الحملة من جلسة أخرى. احتفظي بتعديلاتك وراجعي أحدث نسخة قبل إعادة الحفظ.",
        );
        return;
      }

      const result = await readJson(response);
      setSettings(result.settings);
      setMessage("تم حفظ الحملة والعروض معًا بنجاح");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  }
  const previewOffers = useMemo<PinkFridayOffer[]>(() => {
    return items.flatMap((item, index): PinkFridayOffer[] => {
      if (!item.offerId || !item.isActive) return [];

      const linked = offers.find((offer) => offer.id === item.offerId);
      if (!linked) return [];

      const friend = linked.friendOfferEnabled === true;
      const box = linked.offerBoxEnabled === true;
      const featureValue = linked.features;

      return [{
        id: `preview-${index}-${item.offerId}`,
        offerId: item.offerId,
        membershipId: linked.membershipId ?? null,
        title: linked.title,
        titleEn: null,
        imageUrl: item.imageUrl ?? linked.image ?? null,
        badge: item.badge,
        kind: friend ? "friend_offer" : box ? "offer_box" : "membership_offer",
        pricingSource: {
          specialPrice: linked.specialPrice ?? null,
          priceBefore: linked.priceBefore ?? null,
          membershipPrice: null,
          membershipPriceAfter: null,
          membershipPriceBefore: null,
        },
        durationDays: linked.durationDays ?? null,
        sessionsCount: linked.sessionsCount ?? null,
        features: Array.isArray(featureValue)
          ? JSON.stringify(featureValue)
          : typeof featureValue === "string" ? featureValue : null,
        featuresEn: null,
      }];
    });
  }, [items, offers]);

  const previewData = useMemo<PinkFridayData>(() => {
    const date = settings.endDate ? Date.parse(settings.endDate) : NaN;

    return {
      enabled: true,
      settings: {
        ribbonText: settings.ribbonText,
        endDate: Number.isFinite(date) && date > Date.now()
          ? settings.endDate!
          : new Date(Date.now() + 86400000).toISOString(),
        showDelaySeconds: 0,
        hideHours: settings.hideHours,
        updatedAt: settings.updatedAt ?? "preview",
      },
      offers: previewOffers,
    };
  }, [settings, previewOffers]);
  if (loading) {
    return <p className="p-5 text-pink-100">جارٍ تحميل إعدادات البوب اب...</p>;
  }

  return (
    <div dir="rtl" className="space-y-6 text-white">
      <div>
        <h2 className="text-2xl font-black">إدارة Pink Friday Pop-up</h2>
        <p className="mt-2 text-sm text-pink-200">
          التحكم في ظهور النافذة والعروض والصور، دون تغيير أسعار العروض الأصلية.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-400 p-3 text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div role="status" className="rounded-xl border border-green-400 p-3 text-green-200">
          {message}
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-pink-400/20 bg-[#2b101f] p-4 sm:p-6">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="h-5 w-5 accent-pink-500"
            checked={settings.enabled}
            onChange={(event) =>
              setSettings((s) => ({ ...s, enabled: event.target.checked }))
            }
          />
          <span className="font-bold">تفعيل ظهور البوب اب</span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm">نص الشريط</span>
            <input
              className={inputClass}
              maxLength={191}
              value={settings.ribbonText}
              onChange={(event) =>
                setSettings((s) => ({ ...s, ribbonText: event.target.value }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="block text-sm">تاريخ الانتهاء (بتوقيت جهازك)</span>
            <input
              className={inputClass}
              type="datetime-local"
              value={
                settings.endDate
                  ? (() => {
                      const date = new Date(settings.endDate);
                      const offset = date.getTimezoneOffset() * 60000;
                      return new Date(date.getTime() - offset)
                        .toISOString().slice(0, 16);
                    })()
                  : ""
              }
              onChange={(event) =>
                setSettings((s) => ({
                  ...s,
                  endDate: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="block text-sm">تأخير الظهور (ثانية)</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              max="60"
              step="0.5"
              value={settings.showDelaySeconds}
              onChange={(event) =>
                setSettings((s) => ({
                  ...s,
                  showDelaySeconds: Number(event.target.value),
                }))
              }
            />
          </label>
          <label className="space-y-2">
            <span className="block text-sm">الإخفاء بعد الإغلاق (ساعة)</span>
            <input
              className={inputClass}
              type="number"
              min="0"
              max="720"
              step="1"
              value={settings.hideHours}
              onChange={(event) =>
                setSettings((s) => ({
                  ...s,
                  hideHours: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-pink-400/20 bg-[#2b101f] p-4 sm:p-6">
        <h3 className="text-lg font-bold">عروض البوب اب ({items.length}/3)</h3>

        {items.map((item, index) => (
          <div
            key={index}
            className="space-y-4 rounded-xl border border-pink-300/20 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>العرض رقم {index + 1}</strong>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑ فوق
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={index === items.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓ تحت
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-red-400 px-3 py-2 text-red-200"
                  onClick={() =>
                    setItems((previous) => previous.filter((_, i) => i !== index))
                  }
                >
                  حذف
                </button>
              </div>
            </div>

            <label className="block space-y-2">
              <span className="block text-sm">اختاري العرض الموجود بالموقع</span>
              <select
                className={inputClass}
                value={item.offerId}
                onChange={(event) =>
                  changeItem(index, { offerId: event.target.value })
                }
              >
                <option value="">اختاري عرضًا</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.title}
                    {offer.specialPrice != null
                      ? ` — ${offer.specialPrice} ج.م`
                      : ""}
                    {!offer.active ? " (غير مفعل)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="block text-sm">البادج</span>
              <input
                className={inputClass}
                maxLength={100}
                value={item.badge ?? ""}
                onChange={(event) =>
                  changeItem(index, { badge: event.target.value || null })
                }
                placeholder="الأوفر 🔥"
              />
            </label>

            <label className="block space-y-2">
              <span className="block text-sm">صورة البانر</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                disabled={uploadIndex !== null}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(index, file);
                }}
                className="block w-full text-sm"
              />
            </label>

            {uploadIndex === index && <p>جارٍ رفع الصورة...</p>}
            {item.imageUrl && (
              // Preview of the configured image, not a redesign of the popup.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.imageUrl}
                alt="معاينة صورة العرض"
                className="max-h-36 w-full rounded-xl object-contain"
              />
            )}

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 accent-pink-500"
                checked={item.isActive}
                onChange={(event) =>
                  changeItem(index, { isActive: event.target.checked })
                }
              />
              العرض ظاهر داخل البوب اب
            </label>
          </div>
        ))}

        <button
          type="button"
          className={buttonClass}
          disabled={items.length >= 3}
          onClick={() =>
            setItems((current) => [
              ...current,
              { offerId: "", imageUrl: null, badge: null, isActive: true },
            ])
          }
        >
          + إضافة عرض للبوب اب
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={buttonClass}
          onClick={() => void save()}
          disabled={saving || uploadIndex !== null}
        >
          {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات والعروض"}
        </button>
        <button
          type="button"
          className="rounded-xl border border-pink-300 px-4 py-2.5"
          onClick={() => void load()}
          disabled={saving}
        >
          تحديث البيانات
        </button>
        <button
          type="button"
          className="rounded-xl border border-pink-300 px-4 py-2.5 font-bold"
          disabled={saving || previewOffers.length === 0}
          onClick={() => setPreviewOpen(true)}
        >
          معاينة البوب اب قبل الحفظ
        </button>
        <span className="text-xs text-pink-200">
          المعاينة لا تفعّل الحملة ولا تبدأ شراءً. الأسعار غير المتاحة تظهر كتفاصيل السعر.
        </span>
      </div>
      {previewOpen && (
        <PinkFridayPopup
          preview={previewData}
          onClosePreview={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}