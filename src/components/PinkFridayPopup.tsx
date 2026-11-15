"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

export type PinkFridayOffer = {
  id: string;
  offerId: string;
  membershipId: string | null;
  title: string;
  titleEn: string | null;
  imageUrl: string | null;
  badge: string | null;
  kind: "friend_offer" | "offer_box" | "direct_offer" | "membership_offer";
  pricingSource: {
    specialPrice: number | null;
    finalPrice?: number | null;
    priceBefore: number | null;
    membershipPrice: number | null;
    membershipPriceAfter: number | null;
    membershipPriceBefore: number | null;
  };
  durationDays: number | null;
  sessionsCount: number | null;
  features: string | null;
  featuresEn: string | null;
};

export type PinkFridayData = {
  enabled: boolean;
  settings: {
    ribbonText: string;
    endDate: string;
    showDelaySeconds: number;
    hideHours: number;
    updatedAt: string;
  };
  offers: PinkFridayOffer[];
};

type Props = {
  preview?: PinkFridayData | null;
  onSelectOffer?: (offer: PinkFridayOffer) => void;
  onClosePreview?: () => void;
};

const STORAGE_PREFIX = "fz_pinkfriday_popup_closed";

function parseFeatures(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      );
    }
  } catch {
    // Some legacy offers use plain-text features.
  }
  return raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function useCountdown(endTime: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, endTime - now);
  const s = Math.floor(remaining / 1000);
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    done: remaining === 0,
  };
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-EG", {
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PinkFridayPopup({
  preview = null,
  onSelectOffer,
  onClosePreview,
}: Props) {
  const [remote, setRemote] = useState<PinkFridayData | null>(null);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const data = preview ?? remote;

  useEffect(() => {
    if (preview) return;

    const controller = new AbortController();
    let mounted = true;

    async function load() {
      try {
        const response = await fetch("/api/popup", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;

        const payload: unknown = await response.json();
        if (!payload || typeof payload !== "object") return;

        const result = payload as Partial<PinkFridayData>;
        if (
          result.enabled === true &&
          result.settings &&
          Array.isArray(result.offers) &&
          result.offers.length > 0 &&
          mounted
        ) {
          setRemote(result as PinkFridayData);
        }
      } catch {
        // Fail closed if the campaign API is unavailable.
      }
    }

    void load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [preview]);

  const endTime = data?.settings
    ? Date.parse(data.settings.endDate)
    : 0;
  const cd = useCountdown(endTime);

  useEffect(() => {
    if (!data?.enabled || data.offers.length === 0) {
      setOpen(false);
      return;
    }

    if (!Number.isFinite(endTime) || endTime <= Date.now()) {
      setOpen(false);
      return;
    }

    if (preview) {
      setOpen(true);
      return;
    }

    const key = `${STORAGE_PREFIX}:${data.settings.updatedAt}`;
    try {
      const closedAt = Number(localStorage.getItem(key) || 0);
      const hideMs = data.settings.hideHours * 3600_000;
      if (closedAt > 0 && Date.now() - closedAt < hideMs) {
        return;
      }
    } catch {
      // Private mode: allow the campaign without persistence.
    }

    const delay = Math.max(
      0,
      Math.min(60, data.settings.showDelaySeconds),
    ) * 1000;

    const timer = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(timer);
  }, [data, endTime, preview]);

  const close = useCallback(() => {
    setOpen(false);
    if (preview) {
      onClosePreview?.();
      return;
    }
    if (!data) return;
    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}:${data.settings.updatedAt}`,
        String(Date.now()),
      );
    } catch {
      // Closing must still work if localStorage is unavailable.
    }
  }, [data, preview, onClosePreview]);

  useEffect(() => {
    if (!open || !data) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const scrollY = window.scrollY;
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    document.body.style.overflow = "hidden";

    if (isiOS) {
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
    }

    const timer = data.offers.length > 1
      ? window.setInterval(() => {
          setI((current) => (current + 1) % data.offers.length);
        }, 5000)
      : null;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      if (isiOS) window.scrollTo(0, scrollY);
    };
  }, [open, data, close]);

  if (!open || !data || cd.done || data.offers.length === 0) {
    return null;
  }

  const selectedIndex = Math.min(i, data.offers.length - 1);
  const o = data.offers[selectedIndex];
  const price = o.kind === "offer_box"
    ? (o.pricingSource.finalPrice ?? null)
    : o.pricingSource.specialPrice;
  const oldPrice =
    o.pricingSource.priceBefore ??
    o.pricingSource.membershipPriceBefore;

  const points = parseFeatures(o.features);
  const pad = (n: number) => String(n).padStart(2, "0");

  const changeSlide = (direction: number) => {
    setI((current) =>
      (current + direction + data.offers.length) % data.offers.length,
    );
  };

  const handleTouchEnd = (endX: number) => {
    if (touchStart !== null && data.offers.length > 1) {
      const delta = endX - touchStart;
      if (Math.abs(delta) > 45) changeSlide(delta > 0 ? 1 : -1);
    }
    setTouchStart(null);
  };

  return (
    <div
      dir="rtl"
      className="fz-overlay"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="عروض البينك فراي داي"
    >
      <div className="fz-modal" onClick={(event) => event.stopPropagation()}>
        <button className="fz-close" onClick={close} aria-label="إغلاق">✕</button>

        <div className="fz-ribbon">{data.settings.ribbonText}</div>

        <div
          className="fz-slider"
          onTouchStart={(event) => setTouchStart(event.touches[0]?.clientX ?? null)}
          onTouchEnd={(event) => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}
        >
          {data.offers.map((x, k) => (
            <div key={x.id} className={`fz-slide ${k === selectedIndex ? "on" : ""}`}>
              {x.imageUrl ? (
                <Image
                  src={x.imageUrl}
                  alt={`عرض ${x.title}`}
                  fill
                  sizes="(max-width:600px) 100vw, 560px"
                  priority={k === 0}
                  style={{ objectFit: "cover" }}
                />
              ) : (
                <div className="fz-image-fallback">{x.title}</div>
              )}
            </div>
          ))}
          <div className="fz-dots">
            {data.offers.map((x, k) => (
              <button
                key={x.id}
                className={k === selectedIndex ? "on" : ""}
                onClick={() => setI(k)}
                aria-label={`عرض ${x.title}`}
              />
            ))}
          </div>
        </div>

        <div className="fz-tabs">
          {data.offers.map((x, k) => {
            const amount = x.kind === "offer_box"
              ? (x.pricingSource.finalPrice ?? null)
              : x.pricingSource.specialPrice;
            const before =
              x.pricingSource.priceBefore ??
              x.pricingSource.membershipPriceBefore;
            return (
              <button
                key={x.id}
                className={`fz-tab ${k === selectedIndex ? "on" : ""}`}
                onClick={() => setI(k)}
              >
                {x.badge && <span className="fz-badge">{x.badge}</span>}
                <b>{x.title}</b>
                <span className="fz-price">
                  {amount !== null ? formatMoney(amount) : "تفاصيل السعر"}
                  {amount !== null && <small> ج.م</small>}
                </span>
                {amount !== null && before !== null && before > amount && (
                  <s>{formatMoney(before)} ج.م</s>
                )}
              </button>
            );
          })}
        </div>

        <ul className="fz-points">
          {o.sessionsCount !== null && o.sessionsCount > 0 && (
            <li>✓ {o.sessionsCount} حصة تدريبية</li>
          )}
          {o.durationDays !== null && o.durationDays > 0 && (
            <li>✓ مدة العرض: {o.durationDays} يوم</li>
          )}
          {points.map((point) => <li key={point}>✓ {point}</li>)}
        </ul>

        <div className="fz-timer">
          <span>العرض بيخلص خلال</span>
          <div>
            {([["يوم", cd.d], ["ساعة", cd.h], ["دقيقة", cd.m], ["ثانية", cd.s]] as const).map(([label, value]) => (
              <div key={label} className="fz-cell">
                <b>{pad(value)}</b><small>{label}</small>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="fz-cta"
          disabled={!onSelectOffer}
          onClick={() => {
            if (!onSelectOffer) return;
            close();
            onSelectOffer(o);
          }}
        >
          {price !== null
            ? `اشتركي دلوقتي بـ ${formatMoney(price)} جنيه`
            : "اعرفي تفاصيل العرض واشتركي"}
        </button>
        <button className="fz-later" onClick={close}>مش دلوقتي</button>
      </div>
<style jsx>{`
        .fz-overlay{position:fixed;inset:0;z-index:9999;background:rgba(40,0,25,.62);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:fzFade .3s ease}
        .fz-modal{position:relative;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;background:#fff;border-radius:22px;box-shadow:0 25px 60px rgba(214,25,110,.35);animation:fzPop .45s cubic-bezier(.2,1.3,.4,1);font-family:inherit}
        .fz-close{position:absolute;top:10px;left:10px;z-index:3;width:34px;height:34px;border-radius:50%;border:0;background:rgba(255,255,255,.95);color:#c2185b;font-size:16px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)}
        .fz-ribbon{background:linear-gradient(90deg,#e91e7a,#c2185b);color:#fff;text-align:center;font-weight:700;padding:8px;font-size:14px;letter-spacing:.3px}
        .fz-slider{position:relative;aspect-ratio:16/9;background:#fde4ef;overflow:hidden}
        .fz-slide{position:absolute;inset:0;opacity:0;transform:scale(1.04);transition:opacity .6s,transform .6s}
        .fz-slide.on{opacity:1;transform:scale(1)}
        .fz-dots{position:absolute;bottom:8px;left:0;right:0;display:flex;justify-content:center;gap:6px;z-index:2}
        .fz-dots button{width:8px;height:8px;border-radius:8px;border:0;background:rgba(255,255,255,.7);cursor:pointer;transition:width .3s}
        .fz-dots button.on{width:22px;background:#fff}
        .fz-tabs{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 14px 4px}
        .fz-tab{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:14px 8px 10px;border:2px solid #f6c6dc;border-radius:16px;background:#fff7fb;cursor:pointer;font-family:inherit;transition:.2s}
        .fz-tab.on{border-color:#e91e7a;background:#fff;box-shadow:0 6px 18px rgba(233,30,122,.2)}
        .fz-tab b{font-size:15px;color:#333}
        .fz-price{font-size:28px;font-weight:800;color:#d81b60;line-height:1.1}
        .fz-price small{font-size:13px}
        .fz-tab s{font-size:12px;color:#999}
        .fz-badge{position:absolute;top:-10px;background:#e91e7a;color:#fff;font-size:11px;padding:2px 10px;border-radius:20px;white-space:nowrap}
        .fz-points{list-style:none;margin:8px 18px;padding:0;font-size:14px;color:#444;line-height:1.9}
        .fz-points li{color:#444}
        .fz-points b{color:#d81b60}
        .fz-timer{display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 14px 10px;font-size:13px;color:#777}
        .fz-timer>div{display:flex;gap:8px;direction:rtl}
        .fz-cell{min-width:54px;background:#fde4ef;border-radius:10px;padding:6px 4px;display:flex;flex-direction:column;align-items:center}
        .fz-cell b{font-size:20px;color:#c2185b}
        .fz-cell small{font-size:11px;color:#888}
        .fz-cta{display:block;margin:4px 14px 6px;padding:15px;border-radius:14px;text-align:center;font-weight:800;font-size:17px;color:#fff;text-decoration:none;background:linear-gradient(90deg,#e91e7a,#c2185b);box-shadow:0 8px 20px rgba(233,30,122,.35);animation:fzPulse 2s infinite}
        .fz-later{display:block;margin:0 auto 14px;background:none;border:0;color:#999;font-size:13px;cursor:pointer;font-family:inherit}
        @keyframes fzFade{from{opacity:0}to{opacity:1}}
        @keyframes fzPop{from{opacity:0;transform:translateY(30px) scale(.9)}to{opacity:1;transform:none}}
        @keyframes fzPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
        @media (max-width:420px){.fz-price{font-size:24px}.fz-cell{min-width:46px}}
              .fz-image-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;background:#fde4ef;color:#c2185b;font-size:24px;font-weight:800}
        .fz-cta{width:calc(100% - 28px);border:0;font-family:inherit;cursor:pointer}
        .fz-cta:disabled{opacity:.55;cursor:not-allowed;animation:none}
        @media(max-width:600px){
          .fz-overlay{padding:8px;padding-top:max(8px,env(safe-area-inset-top));padding-bottom:max(8px,env(safe-area-inset-bottom))}
          .fz-modal{max-height:90dvh;overscroll-behavior:contain}
          .fz-tabs{grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:7px;padding:12px 10px 4px}
          .fz-tab{min-width:0;padding:12px 4px 8px}
          .fz-price{font-size:21px}
          .fz-cta{position:sticky;bottom:0;z-index:4;margin-bottom:8px}
          .fz-points{font-size:13px;line-height:1.65}
        }
        @media(prefers-reduced-motion:reduce){
          .fz-overlay,.fz-modal,.fz-cta{animation:none!important}
          .fz-slide,.fz-tab{transition:none!important}
        }
      `}</style>
    </div>
  );
}