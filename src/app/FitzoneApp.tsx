'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/language";

// ─── FIT ZONE BRAND COLORS ─────────────────────────────────────────────────
const C = {
  bg: "#FFF5F8",
  bgCard: "#FFFFFF",
  bgCard2: "#FFF0F5",
  border: "#F5D0DC",
  red: "#E91E63",
  redDark: "#C2185B",
  redLight: "#F06292",
  gold: "#C8A200",
  goldLight: "#F0C420",
  goldDark: "#8A6E00",
  white: "#1A0812",
  gray: "#7A5B68",
  grayLight: "#B090A0",
  grayDark: "#E8D0D8",
  success: "#16A34A",
  successDark: "#166534",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Tajawal:wght@300;400;500;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  body{font-family:'Cairo','Tajawal',sans-serif;direction:inherit;background:${C.bg};color:${C.white};overflow-x:hidden;}
  .app{min-height:100vh;}

  .btn-primary{background:${C.red};color:#fff;border:none;padding:12px 28px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;letter-spacing:.3px;}
  .btn-primary:hover{background:${C.redLight};transform:translateY(-1px);box-shadow:0 6px 20px rgba(233,30,99,.35);}
  .btn-gold{background:linear-gradient(135deg,${C.gold},${C.goldLight});color:#000;border:none;padding:12px 28px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;}
  .btn-gold:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(200,162,0,.35);}
  .btn-outline{background:transparent;color:${C.red};border:2px solid ${C.red};padding:10px 26px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;}
  .btn-outline:hover{background:${C.red};color:#fff;}
  .btn-outline-gold{background:transparent;color:${C.gold};border:1.5px solid ${C.gold};padding:8px 20px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
  .btn-outline-gold:hover{background:${C.gold};color:#000;}
  .btn-ghost{background:rgba(233,30,99,.06);color:${C.white};border:1px solid ${C.border};padding:10px 22px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
  .btn-ghost:hover{background:rgba(233,30,99,.12);}

  .card{background:${C.bgCard};border-radius:12px;border:1px solid ${C.border};overflow:hidden;}
  .card-hover{transition:transform .2s,border-color .2s,box-shadow .2s;}
  .card-hover:hover{transform:translateY(-3px);border-color:${C.red}55;box-shadow:0 8px 32px rgba(233,30,99,.12);}

  .section{padding:72px 0;}
  .container{max-width:1280px;margin:0 auto;padding:0 24px;}

  .tag{display:inline-flex;align-items:center;background:rgba(233,30,99,.15);color:${C.red};padding:4px 14px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
  .tag-gold{background:rgba(200,162,0,.15);color:${C.gold};padding:4px 14px;border-radius:4px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;}
  .badge{display:inline-flex;align-items:center;background:${C.red};color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;font-weight:700;}
  .badge-gold{background:${C.gold};color:#000;}
  .badge-green{background:rgba(34,197,94,.15);color:${C.success};border:1px solid rgba(34,197,94,.3);}

  .section-title{font-size:34px;font-weight:900;color:${C.white};margin-bottom:8px;line-height:1.2;}
  .section-title span{color:${C.red};}
  .section-sub{font-size:15px;color:${C.gray};margin-bottom:40px;line-height:1.8;}

  .divider{height:1px;background:${C.border};margin:24px 0;}

  .input{width:100%;padding:12px 16px;border:1.5px solid ${C.border};border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;color:${C.white};background:${C.bgCard2};outline:none;transition:border .2s;}
  .input:focus{border-color:${C.red};}
  .input::placeholder{color:${C.gray};}
  .select{width:100%;padding:12px 16px;border:1.5px solid ${C.border};border-radius:8px;font-family:'Cairo',sans-serif;font-size:14px;color:${C.white};background:${C.bgCard2};outline:none;cursor:pointer;}
  .select option{background:${C.bgCard};}

  .tab{padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;border:1.5px solid transparent;transition:all .2s;color:${C.gray};background:transparent;font-family:'Cairo',sans-serif;}
  .tab.active{background:${C.red};color:#fff;border-color:${C.red};}
  .tab:not(.active):hover{border-color:${C.border};color:${C.white};}

  .price-big{font-size:44px;font-weight:900;color:${C.red};}
  .price-currency{font-size:18px;font-weight:700;}

  ::-webkit-scrollbar{width:6px;}
  ::-webkit-scrollbar-track{background:${C.bg};}
  ::-webkit-scrollbar-thumb{background:${C.grayDark};border-radius:3px;}
  ::-webkit-scrollbar-thumb:hover{background:${C.red};}

  @media(max-width:768px){
    .section-title{font-size:24px;}
    .hide-mobile{display:none!important;}
    .hide-desktop{display:inline-flex!important;}
    .grid-mobile-1{grid-template-columns:1fr!important;}
    .grid-mobile-2{grid-template-columns:1fr 1fr!important;}
    .container{padding:0 16px;}
  }
  @media(min-width:769px){
    .hide-desktop{display:none!important;}
  }

  .glow-red{box-shadow:0 0 30px rgba(233,30,99,.2);}
  .glow-gold{box-shadow:0 0 30px rgba(200,162,0,.2);}

  .noise-overlay::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.03'/%3E%3C/svg%3E");pointer-events:none;}

  .schedule-shell{background:linear-gradient(180deg,#1b1417 0%,#0f0b0d 100%);border-radius:26px;padding:28px;border:1px solid rgba(255,255,255,.12);position:relative;overflow:hidden;box-shadow:0 20px 45px rgba(0,0,0,.18);font-family:'Cairo','Tajawal',sans-serif;}
  .schedule-shell::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at top left,rgba(255,196,65,.12),transparent 45%),radial-gradient(circle at bottom right,rgba(255,196,65,.08),transparent 45%);pointer-events:none;}
  .schedule-title{display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:22px;text-align:center;}
  .schedule-title h2{font-size:36px;font-weight:900;color:#fff;letter-spacing:.5px;}
  .schedule-title span{background:#0f0a0c;color:#f5c542;border-radius:999px;padding:6px 18px;font-size:16px;font-weight:800;border:1px solid rgba(255,255,255,.18);}
  .schedule-grid{display:grid;border:2px solid rgba(255,255,255,.85);border-radius:18px;overflow:hidden;direction:ltr;background:#101010;min-width:0;width:100%;}
  .schedule-cell{min-height:86px;border-left:1px solid rgba(255,255,255,.22);border-top:1px solid rgba(255,255,255,.22);padding:8px 10px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:2px;}
  .schedule-cell.time{background:#111;font-weight:900;font-size:18px;color:#fff;letter-spacing:.5px;}
  .schedule-cell.time span{font-size:12px;color:#c9c9c9;font-weight:700;}
  .schedule-cell.day{background:#151515;color:#fff;font-weight:900;font-size:16px;position:sticky;right:0;z-index:3;text-align:right;}
  .schedule-cell.clock{background:#111;color:#fff;font-weight:800;gap:4px;}
  .schedule-cell.sticky{position:sticky;top:0;z-index:4;background:#111;}
  .schedule-cell.day-head{background:#141414;color:#fff;font-weight:900;position:sticky;right:0;z-index:5;text-align:right;}
  .schedule-block{margin-top:16px;}
  .schedule-block-title{color:#fff;font-weight:900;font-size:18px;margin-bottom:10px;}
  .schedule-slot-box{width:100%;border-radius:12px;padding:6px;border:1px solid rgba(255,255,255,.12);display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.02);}
  .schedule-slot-item{width:100%;border-radius:10px;padding:6px 8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:#f5c542;font-weight:800;font-size:12px;cursor:pointer;}
  .schedule-slot-item.selected{border-color:rgba(233,30,99,.7);background:rgba(233,30,99,.18);}
  .schedule-slot-item.disabled{cursor:not-allowed;opacity:.5;color:#ef4444;}
  .schedule-item-title{color:#f5c542;font-weight:900;font-size:13px;line-height:1.2;}
  .schedule-item-sub{color:#f2e7ec;font-size:11px;font-weight:700;}
  .schedule-item-tag{color:#f5c542;font-size:10px;font-weight:800;}
  .schedule-empty{color:#f5c542;font-size:22px;font-weight:900;opacity:.8;}
  .schedule-scroll{overflow-x:visible;padding-bottom:8px;max-width:100%;}
  .schedule-grid .schedule-cell.sticky{border-top:none;}
  .today-classes-carousel{position:relative;overflow:hidden;padding:6px 0;}
  .today-classes-carousel::before,.today-classes-carousel::after{content:'';position:absolute;top:0;bottom:0;width:72px;z-index:2;pointer-events:none;}
  .today-classes-carousel::before{left:0;background:linear-gradient(to right,${C.bg},rgba(255,245,248,0));}
  .today-classes-carousel::after{right:0;background:linear-gradient(to left,${C.bg},rgba(255,245,248,0));}
  .today-classes-track{display:flex;gap:16px;width:max-content;will-change:transform;}
  .today-class-card{flex:0 0 280px;}
  @media(max-width:900px){
    .schedule-title h2{font-size:28px;}
    .schedule-shell{padding:20px;}
    .schedule-cell{min-height:74px;}
    .today-classes-carousel::before,.today-classes-carousel::after{width:32px;}
    .today-class-card{flex-basis:240px;}
  }
  @media(max-width:640px){
    .today-class-card{flex-basis:220px;}
  }
`;

const publicApiCache: Record<string, Promise<Record<string, unknown>> | null> = {};

function resetPublicApiCache() {
  Object.keys(publicApiCache).forEach((key) => {
    publicApiCache[key] = null;
  });
}

function getUiLang() {
  if (typeof document === "undefined") return "ar";
  const value = document.documentElement.lang;
  return value === "en" ? "en" : "ar";
}

function loadPublicApi(force = false) {
  const lang = getUiLang();
  if (force) {
    publicApiCache[lang] = null;
  }

  if (!publicApiCache[lang]) {
    publicApiCache[lang] = fetch(`/api/public?lang=${lang}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch((error) => {
        publicApiCache[lang] = null;
        throw error;
      });
  }

  return publicApiCache[lang] as Promise<Record<string, unknown>>;
}

function useT() {
  const { lang } = useLang();
  return useCallback((ar: string, en: string) => (lang === "ar" ? ar : en), [lang]);
}

function wrapCarouselOffset(offset: number, segmentWidth: number) {
  if (segmentWidth <= 0) return offset;
  if (offset <= -2 * segmentWidth) return offset + segmentWidth;
  if (offset >= 0) return offset - segmentWidth;
  return offset;
}

function getDefaultAccount(
  accounts: PaymentAccount[] | undefined,
  fallbackLabel: string,
  fallbackUrl: string,
) {
  const list = Array.isArray(accounts) ? accounts : [];
  return list.find((item) => item.isDefault) ?? list[0] ?? { id: "fallback", label: fallbackLabel, url: fallbackUrl };
}

// ─── ICONS ─────────────────────────────────────────────────────────────────
const I = ({ n, s = 20, c = "currentColor" }: { n: string; s?: number; c?: string }) => {
  const d = {
    home: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
    heart: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
    cart: "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0",
    wallet: "M2 9.5V4a2 2 0 012-2h16a2 2 0 012 2v5.5 M2 9.5h20V20a2 2 0 01-2 2H4a2 2 0 01-2-2V9.5z M16 14a1 1 0 110 2 1 1 0 010-2",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
    check: "M20 6L9 17l-5-5",
    clock: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2",
    fire: "M12 2c0 6-4 8-4 12s4 8 4 8 4-4 4-8-4-6-4-12z M8.5 14.5c0 2 1.5 3.5 3.5 3.5s3.5-1.5 3.5-3.5-3.5-4-3.5-7c0 3-3.5 5-3.5 7z",
    users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
    gift: "M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z",
    share: "M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8 M16 6l-4-4-4 4 M12 2v13",
    copy: "M8 17.929H6c-1.105 0-2-.912-2-2.036V5.036C4 3.91 4.895 3 6 3h8c1.105 0 2 .911 2 2.036v1.866m-6 .17h8c1.105 0 2 .91 2 2.035v10.857C20 21.09 19.105 22 18 22h-8c-1.105 0-2-.911-2-2.036V9.107c0-1.124.895-2.036 2-2.036z",
    chevronLeft: "M15 18l-6-6 6-6",
    chevronRight: "M9 18l6-6-6-6",
    menu: "M3 12h18 M3 6h18 M3 18h18",
    x: "M18 6L6 18 M6 6l12 12",
    plus: "M12 5v14 M5 12h14",
    minus: "M5 12h14",
    tag: "M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01",
    map: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z M12 10a2 2 0 100-4 2 2 0 000 4z",
    phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.88a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z",
    mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
    facebook: "M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3.2l.8-4H14V7a1 1 0 011-1h3z",
    calendar: "M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z M16 2v4 M8 2v4 M3 10h18",
    award: "M12 15a7 7 0 100-14 7 7 0 000 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
    box: "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12",
    truck: "M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3m0 0h4l3 3v4h-7m0-7v7 M7 17a2 2 0 100 4 2 2 0 000-4z M17 17a2 2 0 100 4 2 2 0 000-4z",
    repeat: "M17 1l4 4-4 4 M3 11V9a4 4 0 014-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 01-4 4H3",
    logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
    chevronDown: "M6 9l6 6 6-6",
    info: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01",
    whatsapp: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52",
    instagram: "M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z M17.5 6.5h.01 M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5z",
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d[n as keyof typeof d]?.split(" M").map((path, i) => <path key={i} d={i === 0 ? path : "M" + path} />)}
    </svg>
  );
};

// ─── FIT ZONE LOGO ─────────────────────────────────────────────────────────
const FZLogo = ({ size = 40 }) => (
  <img
    src="/fitzone-logo.jpeg"
    alt="Fit Zone Logo"
    width={size}
    height={size}
    style={{
      width: size,
      height: size,
      objectFit: "contain",
      display: "block",
      flexShrink: 0,
    }}
  />
);

// ─── GYM VISUAL PLACEHOLDERS ───────────────────────────────────────────────
const GymImg = ({ type = "hero", w = "100%", h = 300 }: { type?: string; w?: string | number; h?: number }) => {
  const configs = {
    hero: {
      bg1: "#1A0A02", bg2: "#2D0F05",
      content: (
        <>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#heroGrad)"/>
          <defs><radialGradient id="heroGrad" cx="30%" cy="50%"><stop offset="0%" stopColor="#FFD6E8"/><stop offset="100%" stopColor="#FFF5F8"/></radialGradient></defs>
          {/* Gym equipment silhouettes */}
          <ellipse cx="75%" cy="85%" rx="120" ry="40" fill="#E91E63" opacity=".1"/>
          <rect x="60%" y="35%" width="8" height="50%" fill="#E91E63" opacity=".4" rx="3"/>
          <rect x="55%" y="40%" width="18%" height="8" fill="#C2185B" opacity=".5" rx="2"/>
          <ellipse cx="55%" cy="40%" rx="18" ry="18" fill="#E91E63" opacity=".35"/>
          <ellipse cx="73%" cy="40%" rx="18" ry="18" fill="#E91E63" opacity=".35"/>
          {/* Athlete outline */}
          <ellipse cx="32%" cy="28%" rx="22" ry="22" fill="#E91E63" opacity=".15"/>
          <ellipse cx="32%" cy="21%" rx="8" ry="8" fill="#C2185B"/>
          <path d="M 112 87 Q 128 75 144 87 L 140 165 L 128 156 L 116 165 Z" fill="#E91E63" opacity=".7"/>
          {/* FITZONE on wall */}
          <rect x="15%" y="60%" width="35%" height="5" fill="#E91E63" opacity=".15" rx="2"/>
          <text x="32%" y="74%" textAnchor="middle" fontSize="18" fontWeight="900" fill="#E91E63" fontFamily="'Cairo',sans-serif" letterSpacing="3" opacity=".8">FITZONE</text>
          {/* Red glow */}
          <radialGradient id="redGlow" cx="32%" cy="50%"><stop offset="0%" stopColor="#E91E63" stopOpacity=".08"/><stop offset="100%" stopColor="#E91E63" stopOpacity="0"/></radialGradient>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#redGlow)"/>
        </>
      )
    },
    yoga: {
      content: (
        <>
          <defs><linearGradient id="yg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#F3E8FF"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#yg)"/>
          <circle cx="50%" cy="40%" r="60" fill="rgba(139,0,200,.1)"/>
          <ellipse cx="50%" cy="42%" rx="12" ry="12" fill="#666"/>
          <path d="M 176 150 Q 200 135 224 150 L 216 210 L 200 204 L 184 210 Z" fill="#777"/>
          <text x="50%" y="88%" textAnchor="middle" fontSize="14" fontWeight="700" fill="#9B59B6" fontFamily="'Cairo',sans-serif">يوجا</text>
          <text x="50%" y="96%" textAnchor="middle" fontSize="9" fill="#666" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    zumba: {
      content: (
        <>
          <defs><linearGradient id="zg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE4E8"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#zg)"/>
          <circle cx="50%" cy="40%" r="50" fill="rgba(233,30,99,.12)"/>
          <ellipse cx="50%" cy="36%" rx="11" ry="11" fill="#888"/>
          <path d="M 176 132 Q 192 120 208 126 Q 224 132 232 156 L 208 198 L 192 192 Z" fill="#777"/>
          <text x="50%" y="86%" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.red} fontFamily="'Cairo',sans-serif">زومبا</text>
          <text x="50%" y="95%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    strength: {
      content: (
        <>
          <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFECF0"/><stop offset="100%" stopColor="#080808"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#sg)"/>
          <rect x="30%" y="35%" width="40%" height="8" fill="#333" rx="3"/>
          <ellipse cx="30%" cy="39%" rx="18" ry="18" fill="#2A2A2A" stroke="#444" strokeWidth="2"/>
          <ellipse cx="70%" cy="39%" rx="18" ry="18" fill="#2A2A2A" stroke="#444" strokeWidth="2"/>
          <text x="50%" y="75%" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.gold} fontFamily="'Cairo',sans-serif">قوة</text>
          <text x="50%" y="88%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    pilates: {
      content: (
        <>
          <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E0F0FF"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pg)"/>
          <circle cx="50%" cy="40%" r="45" fill="rgba(14,165,233,.08)"/>
          <ellipse cx="50%" cy="35%" rx="11" ry="11" fill="#777"/>
          <path d="M 176 129 L 224 129 L 216 195 L 200 186 L 184 195 Z" fill="#666"/>
          <text x="50%" y="85%" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0EA5E9" fontFamily="'Cairo',sans-serif">بيلاتس</text>
          <text x="50%" y="94%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    cardio: {
      content: (
        <>
          <defs><linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE8F0"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#cg)"/>
          <circle cx="50%" cy="38%" r="50" fill="rgba(249,115,22,.1)"/>
          <text x="50%" y="45%" textAnchor="middle" fontSize="28" fill="rgba(249,115,22,.6)">⚡</text>
          <text x="50%" y="80%" textAnchor="middle" fontSize="13" fontWeight="700" fill="#F97316" fontFamily="'Cairo',sans-serif">كارديو</text>
          <text x="50%" y="92%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    trainer1: {
      content: (
        <>
          <defs><radialGradient id="t1g" cx="50%" cy="40%"><stop offset="0%" stopColor="#FFD6E8"/><stop offset="100%" stopColor="#FFF5F8"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t1g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(233,30,99,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#C2185B"/>
          <path d="M 144 144 Q 200 126 256 144 L 248 240 L 200 228 L 152 240 Z" fill="#E91E63" opacity=".7"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">هبة زارع</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill="#eaa2be" fontFamily="'Cairo',sans-serif">مدربة رئيسية</text>
        </>
      )
    },
    trainer2: {
      content: (
        <>
          <defs><radialGradient id="t2g" cx="50%" cy="40%"><stop offset="0%" stopColor="#F5E0FF"/><stop offset="100%" stopColor="#FFF5F8"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t2g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(139,0,200,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#C2185B"/>
          <path d="M 144 144 Q 200 126 256 144 L 248 240 L 200 228 L 152 240 Z" fill="#E91E63" opacity=".7"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">منال علي</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill="#c6adff" fontFamily="'Cairo',sans-serif">مدربة يوجا</text>
        </>
      )
    },
    trainer3: {
      content: (
        <>
          <defs><radialGradient id="t3g" cx="50%" cy="40%"><stop offset="0%" stopColor="#E8F5E0"/><stop offset="100%" stopColor="#FFF5F8"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t3g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(34,197,94,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#C2185B"/>
          <path d="M 144 144 Q 200 126 256 144 L 248 240 L 200 228 L 152 240 Z" fill="#E91E63" opacity=".7"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">سحر كمال</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill="#93ccc7" fontFamily="'Cairo',sans-serif">مدربة قوة</text>
        </>
      )
    },
    product1: {
      content: (
        <>
          <defs><linearGradient id="pr1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFD6E8"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pr1)"/>
          <text x="50%" y="48%" textAnchor="middle" fontSize="48" fill="rgba(200,162,0,.7)">👟</text>
          <rect x="15%" y="68%" width="70%" height="1" fill={C.border}/>
          <text x="50%" y="82%" textAnchor="middle" fontSize="11" fill={C.gray} fontFamily="'Cairo',sans-serif">حذاء رياضي</text>
        </>
      )
    },
    product2: {
      content: (
        <>
          <defs><linearGradient id="pr2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#E8F5E0"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pr2)"/>
          <text x="50%" y="48%" textAnchor="middle" fontSize="48" fill="rgba(34,197,94,.7)">🥤</text>
          <rect x="15%" y="68%" width="70%" height="1" fill={C.border}/>
          <text x="50%" y="82%" textAnchor="middle" fontSize="11" fill={C.gray} fontFamily="'Cairo',sans-serif">مكملات غذائية</text>
        </>
      )
    },
    product3: {
      content: (
        <>
          <defs><linearGradient id="pr3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFF0E8"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pr3)"/>
          <text x="50%" y="48%" textAnchor="middle" fontSize="48" fill="rgba(233,30,99,.7)">🏋️</text>
          <rect x="15%" y="68%" width="70%" height="1" fill={C.border}/>
          <text x="50%" y="82%" textAnchor="middle" fontSize="11" fill={C.gray} fontFamily="'Cairo',sans-serif">معدات رياضية</text>
        </>
      )
    },
    blog: {
      content: (
        <>
          <defs><linearGradient id="blg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#FFE0EC"/><stop offset="100%" stopColor="#FFF5F8"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#blg)"/>
          <circle cx="50%" cy="40%" r="40" fill="rgba(233,30,99,.08)"/>
          <text x="50%" y="50%" textAnchor="middle" fontSize="32" fill="rgba(233,30,99,.6)">📰</text>
          <text x="50%" y="80%" textAnchor="middle" fontSize="10" fill={C.gray} fontFamily="'Cairo',sans-serif">FIT ZONE BLOG</text>
        </>
      )
    },
    offer: {
      content: (
        <>
          <defs>
            <linearGradient id="og" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFE8F0"/>
              <stop offset="100%" stopColor="#FFF5F8"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#og)"/>
          <circle cx="50%" cy="42%" r="50" fill="rgba(200,162,0,.08)"/>
          <text x="50%" y="55%" textAnchor="middle" fontSize="36" fill="rgba(200,162,0,.7)">🏷️</text>
          <text x="50%" y="82%" textAnchor="middle" fontSize="10" fill={C.gold} fontFamily="'Cairo',sans-serif">عرض خاص</text>
        </>
      )
    },
    gymReal: {
      content: (
        <>
          <defs>
            <linearGradient id="grg" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FCE4EC"/>
              <stop offset="50%" stopColor="#FFF0F5"/>
              <stop offset="100%" stopColor="#F8BBD9"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grg)"/>
          {/* Floating animated circles */}
          {[
            { cx:48,  cy:180, r:55, color:"#E91E63", op:.12, dur:"6s",  delay:"0s" },
            { cx:112, cy:390, r:35, color:"#F06292", op:.18, dur:"8s",  delay:"1s" },
            { cx:180, cy:120, r:70, color:"#F48FB1", op:.10, dur:"7s",  delay:"2s" },
            { cx:248, cy:450, r:45, color:"#E91E63", op:.14, dur:"9s",  delay:"0.5s" },
            { cx:312, cy:240, r:60, color:"#F06292", op:.12, dur:"6.5s",delay:"1.5s" },
            { cx:360, cy:480, r:30, color:"#F48FB1", op:.20, dur:"7.5s",delay:"3s" },
            { cx:20,  cy:420, r:40, color:"#E91E63", op:.10, dur:"8.5s",delay:"2.5s" },
            { cx:220, cy:330, r:25, color:"#F06292", op:.16, dur:"5.5s",delay:"4s" },
          ].map((c,i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={c.color} opacity={c.op}>
              <animate attributeName="cy" values={`${c.cy};${c.cy - 35};${c.cy}`} dur={c.dur} begin={c.delay} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
              <animate attributeName="r"  values={`${c.r};${Math.round(c.r*1.2)};${c.r}`} dur={c.dur} begin={c.delay} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
              <animate attributeName="opacity" values={`${c.op};${+(c.op*1.6).toFixed(2)};${c.op}`} dur={c.dur} begin={c.delay} repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"/>
            </circle>
          ))}
          {/* FITZONE sign */}
          <rect x="15%" y="20%" width="70%" height="28" fill="rgba(233,30,99,.15)" rx="3"/>
          <text x="50%" y="38%" textAnchor="middle" fontSize="16" fontWeight="900" fill={C.red} fontFamily="'Cairo',sans-serif" letterSpacing="4">FITZONE</text>
          {/* Glow */}
          <radialGradient id="atmG" cx="50%" cy="50%"><stop offset="0%" stopColor="#E91E63" stopOpacity=".1"/><stop offset="100%" stopColor="transparent"/></radialGradient>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#atmG)"/>
        </>
      )
    },
  };
  const cfg = configs[type as keyof typeof configs] || configs.hero;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${typeof w === "number" ? w : 400} ${h}`} preserveAspectRatio="xMidYMid slice" style={{ display: "block", borderRadius: "inherit" }}>
      {cfg.content}
    </svg>
  );
};

// ─── HEADER ─────────────────────────────────────────────────────────────────
const DEFAULT_TOP_BAR = {
  ar: "💪 01001514535 · بني سويف · أول نادي للسيدات والأطفال",
  en: "💪 01001514535 · Beni Suef · First ladies & kids gym",
};
const SHOW_CLASSES_PAGE = false;
const Header = ({
  currentPage,
  navigate,
  cartCount = 0,
  walletBalance = "0",
  summary,
}: {
  currentPage: string;
  navigate: (p: string) => void;
  cartCount?: number;
  walletBalance?: string;
  summary?: UserSummary | null;
}) => {
  const { lang, toggleLang } = useLang();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const [annIndex, setAnnIndex] = useState(0);
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  useEffect(() => {
    fetch("/api/site-content?sections=announcements")
      .then(r => r.json())
      .then(d => {
        const items = Array.isArray(d.announcements)
          ? (d.announcements as { text: string; active: boolean }[]).filter(a => a.active).map(a => a.text)
          : [];
        if (items.length > 0) setAnnouncements(items);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (announcements.length <= 1) return;
    const t = setInterval(() => setAnnIndex(i => (i + 1) % announcements.length), 4000);
    return () => clearInterval(t);
  }, [announcements]);
  const navItems = [
    { id: "home", label: t("الرئيسية", "Home") },
    { id: "about", label: t("عن النادي", "About") },
    { id: "memberships", label: t("الاشتراكات", "Memberships") },
    ...(SHOW_CLASSES_PAGE ? [{ id: "classes", label: t("الكلاسات", "Classes") }] : []),
    { id: "schedule", label: t("الجدول", "Schedule") },
    { id: "shop", label: t("المتجر", "Shop") },
    { id: "offers", label: t("العروض", "Offers") },
    { id: "trainers", label: t("المدربات", "Trainers") },
    { id: "blog", label: t("المدونة", "Blog") },
  ];
  return (
    <header style={{ background: "rgba(255,245,248,.97)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
      {/* Top bar */}
      <div style={{ background: C.red, padding: "6px 0", textAlign: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>
          {announcements.length > 0 ? announcements[annIndex] : t(DEFAULT_TOP_BAR.ar, DEFAULT_TOP_BAR.en)}
        </span>
      </div>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 78 }}>
        <div onClick={() => navigate("home")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <FZLogo size={56} />
          <div>
            <div style={{ fontSize: 19, fontWeight: 900, color: C.white, letterSpacing: 1, lineHeight: 1 }}>FIT ZONE</div>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2, lineHeight: 1.1, marginTop: 3 }}>FITNESS CLUB</div>
          </div>
        </div>
        <nav className="hide-mobile" style={{ display: "flex", gap: 2 }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              style={{
                background: item.id === "shop" ? "rgba(236,72,153,0.12)" : "none",
                border: item.id === "shop" ? "1px solid rgba(236,72,153,0.4)" : "none",
                padding: "8px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: item.id === "shop" ? 800 : 600,
                cursor: "pointer",
                color: item.id === "shop" ? "#e91e63" : (currentPage === item.id ? C.red : C.gray),
                fontFamily: "'Cairo', sans-serif",
                transition: "color .2s, background .2s, border .2s",
                borderBottom: currentPage === item.id ? `2px solid ${C.red}` : "2px solid transparent",
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={toggleLang}
            title={lang === "ar" ? "English" : "العربية"}
            style={{
              background: "rgba(233,30,99,.12)",
              border: `1px solid ${C.red}33`,
              borderRadius: 6,
              padding: "6px 10px",
              cursor: "pointer",
              color: C.red,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "'Cairo', sans-serif",
              minWidth: 40,
              textAlign: "center",
            }}
          >
            {lang === "ar" ? "EN" : "ع"}
          </button>
          <button onClick={() => navigate("wallet")} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(233,30,99,.12)", border: `1px solid ${C.red}33`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", color: C.red, fontSize: 12, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            <I n="wallet" s={14} c={C.red} />
            <span className="hide-mobile">
              {(summary?.walletBalance ?? 0) > 0
                ? t(`رصيد المحفظة ${walletBalance} ج.م`, `Wallet ${walletBalance} EGP`)
                : t("شحن المحفظة", "Top up wallet")}
            </span>
          </button>
          <button onClick={() => navigate("cart")} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 8 }}>
            <I n="cart" s={20} c={C.gray} />
            {cartCount > 0 && <span style={{ position: "absolute", top: 2, left: 2, width: 16, height: 16, background: C.red, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>{cartCount}</span>}
          </button>
          <button
            onClick={() => navigate("account")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: summary?.authenticated ? "rgba(233,30,99,.12)" : "none",
              border: summary?.authenticated ? `1px solid ${C.red}33` : "none",
              borderRadius: 8,
              cursor: "pointer",
              padding: "8px 10px",
              color: summary?.authenticated ? C.red : C.gray,
              fontFamily: "'Cairo', sans-serif",
            }}
          >
            <I n="user" s={20} c={summary?.authenticated ? C.red : C.gray} />
            <span className="hide-mobile" style={{ fontSize: 12, fontWeight: 700 }}>
              {summary?.authenticated ? (summary.user?.name || t("حسابي", "My account")) : t("تسجيل الدخول", "Login")}
            </span>
          </button>
          <button className="btn-primary hide-mobile" onClick={() => navigate("memberships")} style={{ padding: "8px 18px", fontSize: 13 }}>
            {t("اشتركي الآن", "Subscribe now")}
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }} className="hide-desktop">
            <I n={mobileOpen ? "x" : "menu"} s={22} c={C.white} />
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div style={{ background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "16px 24px" }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => { navigate(item.id); setMobileOpen(false); }} style={{ display: "block", width: "100%", background: "none", border: "none", padding: "12px 0", fontSize: 15, fontWeight: 600, cursor: "pointer", color: currentPage === item.id ? C.red : C.white, textAlign: "right", fontFamily: "'Cairo', sans-serif", borderBottom: `1px solid ${C.border}` }}>
              {item.label}
            </button>
          ))}
          <button className="btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} onClick={() => navigate("memberships")}>
            {t("اشتركي الآن", "Subscribe now")}
          </button>
        </div>
      )}
    </header>
  );
};

// ─── FOOTER ─────────────────────────────────────────────────────────────────
const Footer = ({ navigate }: { navigate: (p: string) => void }) => {
  const [contact, setContact] = useState<PublicContact>(DEFAULT_CONTACT);
  const t = useT();

  useEffect(() => {
    loadPublicApi()
      .then((data) => {
        if (data.contact && typeof data.contact === "object") {
          setContact((current) => ({ ...current, ...(data.contact as Partial<PublicContact>) }));
        }
      })
      .catch(() => {});
  }, []);

  const socialLinks = [
    { key: "facebook", href: normalizeExternalUrl(contact.facebook), color: "#1877F2" },
    { key: "instagram", href: normalizeExternalUrl(contact.instagram), color: "#E1306C" },
    { key: "whatsapp", href: normalizeWhatsappLink(contact.whatsapp || "01001514535"), color: "#25D366" },
  ];

  return (
  <footer style={{ background: "#F8ECF0", borderTop: `1px solid ${C.border}`, padding: "64px 0 32px" }}>
    <div className="container">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 40, marginBottom: 48 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <FZLogo size={44} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.white, letterSpacing: 1 }}>FIT ZONE</div>
              <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2 }}>FITNESS CLUB</div>
            </div>
          </div>
          <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
            {t(
              "أول نادي لياقة بدنية للسيدات والأطفال في بني سويف. جودة عالية، مدربات محترفات، ونتائج حقيقية.",
              "First fitness club for women and kids in Beni Suef. High quality, pro coaches, real results.",
            )}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            {socialLinks.map(({ key, href, color }) => (
              href ? (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={key}
                  style={{ width: 34, height: 34, background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", textDecoration: "none" }}
                >
                  <I n={key} s={16} c={color} />
                </a>
              ) : (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  style={{ width: 34, height: 34, background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", opacity: 0.65 }}
                >
                  <I n={key} s={16} c={color} />
                </button>
              )
            ))}
          </div>
        </div>
        {[
          {
            title: t("الخدمات", "Services"),
            links: [
              ["memberships", t("الاشتراكات", "Memberships")],
              ...(SHOW_CLASSES_PAGE ? [["classes", t("الكلاسات", "Classes")]] : []),
              ["schedule", t("الجدول الأسبوعي", "Weekly schedule")],
              ["shop", t("المتجر", "Shop")],
              ["offers", t("العروض", "Offers")],
            ],
          },
          {
            title: t("حسابي", "Account"),
            links: [
              ["account", t("ملفي الشخصي", "My profile")],
              ["wallet", t("المحفظة", "Wallet")],
              ["rewards", t("نقاط المكافآت", "Rewards")],
              ["referral", t("الإحالات", "Referrals")],
            ],
          },
          {
            title: t("تواصل معنا", "Contact"),
            links: [
              ["about", t("عن النادي", "About")],
              ["contact", t("اتصلي بنا", "Contact us")],
              ["blog", t("المدونة", "Blog")],
              ["contact", t("الأسئلة الشائعة", "FAQ")],
              ["trainers", t("المدربات", "Trainers")],
            ],
          },
          {
            title: t("السياسات", "Policies"),
            links: [
              ["/policy", t("سياسة الاستخدام", "Terms of use")],
              ["/privacy", t("سياسة الخصوصية", "Privacy policy")],
              ["/refund", t("سياسة الاسترجاع", "Refund policy")],
            ],
          },
        ].map((col) => (
          <div key={col.title}>
            <h4 style={{ fontWeight: 700, marginBottom: 16, color: C.white, fontSize: 14 }}>{col.title}</h4>
            {col.links.map(([page, label]) => (
              <button
                key={label}
                onClick={() => {
                  if (page.startsWith("/")) {
                    window.location.href = page;
                  } else {
                    navigate(page);
                  }
                }}
                style={{ display: "block", background: "none", border: "none", color: C.gray, fontSize: 13, padding: "5px 0", cursor: "pointer", fontFamily: "'Cairo', sans-serif", textAlign: "right", transition: "color .2s" }}
              >
                {label}
              </button>
            ))}
          </div>
        ))}
        <div>
          <h4 style={{ fontWeight: 700, marginBottom: 16, color: C.white, fontSize: 14 }}>{t("معلومات التواصل", "Contact info")}</h4>
          {[["phone", contact.phone], ["mail", contact.email], ["map", contact.address]].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10, color: C.gray, fontSize: 12 }}>
              <I n={icon} s={14} c={C.red} /><span>{text}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.goldDark, fontSize: 12 }}>
          {t("© 2026 FIT ZONE Fitness Club. جميع الحقوق محفوظة.", "© 2026 FIT ZONE Fitness Club. All rights reserved.")}
        </p>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ color: C.goldDark, fontSize: 11 }}>
            {t("صُمم بـ ♥ لفريق فيت زون", "Made with ♥ by Fit Zone team")}
          </span>
        </div>
      </div>
    </div>
  </footer>
  );
};


function useViewportFlags() {
  const [width, setWidth] = useState(typeof window === "undefined" ? 1280 : window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < 768,
    isTablet: width < 1024,
  };
}

function viewportWidth() {
  return typeof window === "undefined" ? 1280 : window.innerWidth;
}

function responsiveColumns(mobile: string, tablet: string, desktop: string) {
  const width = viewportWidth();
  if (width < 768) return mobile;
  if (width < 1024) return tablet;
  return desktop;
}

function useWindowWidth() {
  const [w, setW] = useState(1280);
  useEffect(() => {
    setW(window.innerWidth);
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── ABOUT PAGE ───────────────────────────────────────────────────────────────
type AboutContent = {
  name: string;
  nameEn?: string;
  city: string;
  cityEn?: string;
  founded: string;
  description: string;
  descriptionEn?: string;
  vision: string;
  visionEn?: string;
};

const DEFAULT_ABOUT: AboutContent = {
  name: "فت زون جيم",
  nameEn: "Fit Zone Gym",
  city: "بني سويف - مصر",
  cityEn: "Beni Suef, Egypt",
  founded: "2020",
  description:
    "احنا أول نادي جيم منفرد في بني سويف. بنقدّم تجربة تدريب مختلفة للسيدات والأطفال في بيئة آمنة ومريحة، وبرامج تدريب علمية بإشراف أفضل المدربات المتخصصات في مجال التدريب البدني.",
  descriptionEn:
    "We are the first women & kids gym in Beni Suef, offering a safe, comfortable space and structured training programs led by certified coaches.",
  vision:
    "هدفنا إنك توصلي لأفضل نسخة من نفسك من خلال التزام تدريبي مناسب لحالتك، مع متابعة مستمرة وتخطيط ذكي للتمارين.",
  visionEn:
    "Our goal is to help you reach your best self through a program that fits your needs, with continuous follow‑up and smart training plans.",
};

const AboutPage = () => {
  const [about, setAbout] = useState<AboutContent>(DEFAULT_ABOUT);
  const [contactInfo, setContactInfo] = useState<PublicContact>(DEFAULT_CONTACT);
  const t = useT();
  const { lang } = useLang();

  useEffect(() => {
    fetch("/api/site-content?sections=about,contact", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (payload.about && typeof payload.about === "object") {
          setAbout({ ...DEFAULT_ABOUT, ...(payload.about as Partial<AboutContent>) });
        }
        if (payload.contact && typeof payload.contact === "object") {
          setContactInfo((prev) => ({ ...prev, ...(payload.contact as Partial<PublicContact>) }));
        }
      })
      .catch(() => {});
  }, []);

  const highlights =
    lang === "en"
      ? [
          "Feel more energy and vitality.",
          "Exercise improves mood and reduces stress.",
          "A healthy, toned, flexible body strengthens muscles and posture.",
          "Regular training improves circulation and skin health.",
          "A balanced body helps burn fat and maintain healthy weight.",
          "Better heart health lowers chronic disease risks.",
        ]
      : [
          "هتتمتعي بطاقة وحيوية أكبر.",
          "الرياضة تساعد في تحسين المزاج والتخلص من الإجهاد.",
          "جسم صحي ومشدود ومرن يقوي العضلات ويحسن القوام العام.",
          "نشاط مستمر للتمارين يحسّن الدورة الدموية بما يفيد بشرتك.",
          "قوام مثالي ووزن مناسب يساعدك على حرق الدهون والحفاظ على وزن صحي.",
          "صحة قلب أفضل تقلل من مخاطر الأمراض المزمنة.",
        ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC 0%, #FFF5F8 60%, ${C.bg} 100%)`, padding: "72px 0" }}>
        <div className="container">
          <div
            style={{
              background: "linear-gradient(135deg, #2b0f1d 0%, #1a0b12 100%)",
              borderRadius: 28,
              padding: viewportWidth() < 768 ? 24 : 40,
              border: "1px solid rgba(255,255,255,.08)",
              boxShadow: "0 24px 60px rgba(17,5,10,.35)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 12% 20%, rgba(233,30,99,.25), transparent 55%), radial-gradient(circle at 90% 10%, rgba(200,162,0,.2), transparent 45%)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <FZLogo size={56} />
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{lang === "en" ? about.nameEn ?? about.name : about.name}</div>
                    <div style={{ fontSize: 12, color: C.gold, letterSpacing: 2 }}>FITNESS CLUB</div>
                  </div>
                </div>
                <span style={{ background: "rgba(233,30,99,.15)", color: "#fff", borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700 }}>
                  {t("اكتشفي النسخة الأفضل من نفسك", "Discover your best self")}
                </span>
              </div>

              <div style={{ marginTop: 28 }}>
                <h1 style={{ fontSize: viewportWidth() < 768 ? 30 : 40, color: "#fff", fontWeight: 900, marginBottom: 12 }}>
                  {t("احنا مين؟", "Who are we?")}
                </h1>
                <p style={{ color: "#f4dbe5", fontSize: 15, lineHeight: 2 }}>
                  {lang === "en" ? about.descriptionEn ?? about.description : about.description}
                </p>
                <p style={{ color: "#f4dbe5", fontSize: 15, lineHeight: 2, marginTop: 12 }}>
                  {lang === "en" ? about.visionEn ?? about.vision : about.vision}
                </p>
              </div>

              <div style={{ marginTop: 28, background: "rgba(0,0,0,.4)", borderRadius: 18, padding: 20, border: "1px solid rgba(255,255,255,.08)" }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: C.gold, marginBottom: 12, textAlign: "center" }}>
                  {t("الرياضة ليست مجرد وسيلة", "Fitness is more than a way")}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 16, textAlign: "center" }}>
                  {t("للحصول على جسم مثالي بل هي أسلوب حياة", "to get a perfect body — it is a lifestyle")}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 14 }}>
                  {highlights.map((item) => (
                    <div
                      key={item}
                      style={{
                        background: "rgba(255,255,255,.06)",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,.08)",
                        padding: "12px 14px",
                        color: "#fdf2f7",
                        fontSize: 13,
                        lineHeight: 1.7,
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                      }}
                    >
                      <span style={{ color: C.gold, fontWeight: 900 }}>•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 26, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{t("ابدئي الآن!", "Start now!")}</div>
                <div style={{ color: "#f4dbe5", marginTop: 6, fontSize: 14 }}>
                  {t("وامنحي نفسك فرصة لتكوني في أفضل حالتك", "Give yourself the chance to be at your best")}
                </div>
                <div style={{ marginTop: 14, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12, color: C.gold, fontWeight: 800 }}>
                  <span>📞 {contactInfo.phone || "01001514535"}</span>
                  {contactInfo.whatsapp ? <span>📱 {contactInfo.whatsapp}</span> : null}
                </div>
                <div style={{ marginTop: 6, color: "#f4dbe5", fontSize: 13 }}>
                  {contactInfo.address || "مقابل أمام بنك القاهرة بجوار شام للسياحة فوق كازيون"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

type UserSummary = {
  authenticated: boolean;
  user?: { name: string; email: string; role: string };
  walletBalance?: number;
  rewardPoints?: number;
  rewardTier?: string;
  referralCode?: string | null;
  referralEarned?: number;
  membership?: { name: string; status: string; endDate: string } | null;
  upcomingBookingDate?: string | null;
};

type CartItem = {
  productId: string;
  name: string;
  price: number;
  qty: number;
  size?: string | null;
  type: string;
};

type PublicClass = {
  id: string;
  name: string;
  description: string;
  trainer: string;
  trainerSpecialty?: string;
  duration: string;
  intensity: string;
  category?: string | null;
  type: string;
  subType?: string | null;
  price: number;
  maxSpots: number;
  showTrainerName?: boolean;
  schedules: { id: string; date: string; time: string; availableSpots: number }[];
};

type PublicOffer = {
  id: string;
  title: string;
  type: "percentage" | "fixed" | "special";
  discount: number;
  specialPrice: number | null;
  description: string;
  appliesTo: string;
  membershipId: string | null;
  image: string | null;
  showOnHome: boolean;
  showMaxSubscribers?: boolean;
  maxSubscribers: number | null;
  currentSubscribers: number;
  expiresAt: string;
};

type PublicGoal = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  kind: string;
  parentId?: string | null;
  sortOrder: number;
};

type PublicMembership = {
  id: string;
  name: string;
  price: number;
  priceBefore?: number | null;
  priceAfter?: number | null;
  image?: string | null;
  sortOrder?: number;
  durationDays: number;
  cycle: string | null;
  sessionsCount: number | null;
  features: string[];
  walletBonus: number;
  gift: string | null;
  kind: string;
  goalIds: string[];
};

type PublicHealthQuestion = {
  id: string;
  title: string;
  prompt: string;
  sortOrder: number;
  restrictedClassTypes: string[];
};

type PublicTrainer = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  certifications: string[];
  rating: number;
  sessionsCount: number;
  image: string | null;
  showOnHome: boolean;
  sortOrder: number;
  classesCount: number;
};

type PublicContact = {
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  facebook: string;
  instagram: string;
  mapEmbed: string;
};

type TrainersPageContent = {
  badge: string;
  badgeEn?: string;
  title: string;
  titleEn?: string;
  subtitle: string;
  subtitleEn?: string;
  description: string;
  descriptionEn?: string;
  highlight: string;
  highlightEn?: string;
  ctaLabel: string;
  ctaLabelEn?: string;
};

type PublicBlogPost = {
  id: string;
  title: string;
  category: string;
  author: string;
  date: string;
  readTime: string;
  featured: boolean;
  summary: string;
  content: string;
  coverImage: string;
  videoUrl: string;
  active: boolean;
};

type PublicBlog = {
  categories: string[];
  posts: PublicBlogPost[];
};

type PublicDeliveryOption = {
  id: string;
  name: string;
  type: string;
  description: string;
  fee: number;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  showCashOnDelivery: boolean;
  sortOrder: number;
};

type PaymentAccount = {
  id: string;
  label: string;
  url: string;
  isDefault?: boolean;
};

type PublicPaymentSettings = {
  instapayUrl: string;
  instapayLabel: string;
  vodafoneCashUrl: string;
  vodafoneCashLabel: string;
  instapayAccounts: PaymentAccount[];
  vodafoneCashAccounts: PaymentAccount[];
};

const CART_STORAGE_KEY = "fitzone:cart";
const CLASS_STORAGE_KEY = "fitzone:selected-class";

const CLASS_TYPE_LABELS: Record<string, string> = {
  fitness: "فيتنس",
  cardio: "كارديو",
  zumba: "زومبا",
  yoga: "يوجا",
  pilates: "بيلاتس",
  strength: "قوة",
  crossfit: "كروس فيت",
  bodybuilding: "بيلدينج",
  building: "بيلدينج",
  boxing: "كيك بوكس",
  kickboxing: "كيك بوكس",
  selfdefense: "سلف ديفنس",
  karate: "كاراتيه",
  kids: "أطفال",
  dance: "رقص شرقي",
};

const CLASS_TYPE_ALIASES: Record<string, string> = Object.entries(CLASS_TYPE_LABELS).reduce(
  (acc, [key, label]) => {
    acc[key] = key;
    acc[label] = key;
    return acc;
  },
  {} as Record<string, string>,
);

function normalizeClassTypeKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return CLASS_TYPE_ALIASES[lower] ?? CLASS_TYPE_ALIASES[trimmed] ?? lower;
}

function formatClassType(value: string) {
  const key = normalizeClassTypeKey(value);
  return CLASS_TYPE_LABELS[key] ?? value;
}

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("fitzone-cart-updated"));
}

function addToCart(item: CartItem) {
  const current = readCart();
  const existing = current.find(
    (entry) => entry.productId === item.productId && (entry.size ?? "") === (item.size ?? ""),
  );

  if (existing) {
    existing.qty += item.qty;
  } else {
    current.push(item);
  }

  writeCart(current);
}

function formatCurrency(value?: number) {
  const lang = getUiLang();
  const formatted = Number(value ?? 0).toLocaleString(lang === "en" ? "en-US" : "ar-EG");
  return lang === "en" ? `${formatted} EGP` : `${formatted} ج.م`;
}

function getTierLabel(tier?: string) {
  const lang = getUiLang();
  if (tier === "platinum") return lang === "en" ? "Platinum" : "بلاتيني";
  if (tier === "gold") return lang === "en" ? "Gold" : "ذهبي";
  if (tier === "silver") return lang === "en" ? "Silver" : "فضي";
  return lang === "en" ? "Bronze" : "برونزي";
}

function getCountdownParts(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { expired: false, days, hours, minutes, seconds };
}

const DEFAULT_CONTACT: PublicContact = {
  phone: "01001514535",
  whatsapp: "01001514535",
  email: "itsfitzoone@gmail.com",
  address: "بني سويف، مقابل بنك القاهرة",
  hours: "أحد-خميس: ٧ص-١٠م | جمعة-سبت: ٨ص-٨م",
  facebook: "",
  instagram: "",
  mapEmbed: "",
};

function normalizeExternalUrl(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeWhatsappLink(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/[^\d+]/g, "");
  if (!digits) return "";

  const normalized = digits.startsWith("+")
    ? digits.slice(1)
    : digits.startsWith("0")
      ? `2${digits}`
      : digits;

  return `https://wa.me/${normalized}`;
}
// ─── HOME PAGE ───────────────────────────────────────────────────────────────
const DEFAULT_HOME_MEMBERSHIPS: Array<{
  name: string;
  price: number;
  priceBefore: number | null;
  priceAfter: number | null;
  period: string;
  features: string[];
  color: string;
  popular: boolean;
}> = [
  { name: "لايت", price: 299, priceBefore: null, priceAfter: null, period: "شهر", features: ["4 كلاسات/شهر", "جدول أسبوعي", "تطبيق موبايل"], color: C.gray, popular: false },
  { name: "برو", price: 599, priceBefore: null, priceAfter: null, period: "شهر", features: ["كلاسات غير محدودة", "مدربة خاصة", "خصم 10% متجر", "محفظة رقمية", "نقاط مكافآت"], color: C.red, popular: true },
  { name: "بريميوم", price: 999, priceBefore: null, priceAfter: null, period: "شهر", features: ["كل مزايا برو", "4 جلسات خاصة", "خصم 25% متجر", "أولوية الحجز"], color: C.gold, popular: false },
];
const HOME_PLAN_COLORS = [C.gray, C.red, C.gold, "#A855F7", "#3498DB"];
const cycleLabel = (cycle?: string | null, days?: number) => {
  const lang = getUiLang();
  const labels = {
    monthly: lang === "en" ? "Monthly" : "شهري",
    quarterly: lang === "en" ? "Quarterly" : "ربع سنوي",
    semi_annual: lang === "en" ? "Semi annual" : "نصف سنوي",
    annual: lang === "en" ? "Annual" : "سنوي",
    custom: lang === "en" ? "Custom" : "مخصص",
  };
  if (cycle && cycle in labels) return labels[cycle as keyof typeof labels];
  if (days && days <= 31) return labels.monthly;
  if (days && days <= 100) return labels.quarterly;
  if (days && days <= 200) return labels.semi_annual;
  return labels.annual;
};
const DEFAULT_HERO_SLIDES = [
  "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1200&q=80&sat=-20",
];
type HomeHeroContent = {
  badge: string;
  badgeEn?: string;
  headline1: string;
  headline1En?: string;
  headline2: string;
  headline2En?: string;
  headline3: string;
  headline3En?: string;
  subtext: string;
  subtextEn?: string;
  ctaPrimary: string;
  ctaPrimaryEn?: string;
  ctaSecondary: string;
  ctaSecondaryEn?: string;
  slides: string[];
  stats: { value: string; label: string }[];
  statsEn?: { value: string; label: string }[];
};
const HomePage = ({ navigate, summary }: { navigate: (p: string) => void; summary: UserSummary | null }) => {
  const _w = useWindowWidth();
  const { lang } = useLang();
  const t = useT();
  // Shadow module-level functions with reactive versions (fixes SSR hydration mismatch)
  const viewportWidth = () => _w;
  const responsiveColumns = (mobile: string, tablet: string, desktop: string) => _w < 768 ? mobile : _w < 1024 ? tablet : desktop;
    const classes =
      lang === "en"
        ? [
            { icon: "🧘", name: "Yoga", count: "12 classes", color: "#9B59B6", bg: "rgba(155,89,182,.1)", border: "rgba(155,89,182,.3)" },
            { icon: "💃", name: "Zumba", count: "8 classes", color: C.red, bg: "rgba(233,30,99,.08)", border: "rgba(233,30,99,.2)" },
            { icon: "🏋️", name: "Strength", count: "15 classes", color: C.gold, bg: "rgba(200,162,0,.08)", border: "rgba(200,162,0,.2)" },
            { icon: "🤸", name: "Pilates", count: "10 classes", color: "#0EA5E9", bg: "rgba(14,165,233,.08)", border: "rgba(14,165,233,.2)" },
            { icon: "🏃", name: "Cardio", count: "6 classes", color: "#F97316", bg: "rgba(249,115,22,.08)", border: "rgba(249,115,22,.2)" },
          ]
        : [
            { icon: "🧘", name: "يوجا", count: "12 كلاس", color: "#9B59B6", bg: "rgba(155,89,182,.1)", border: "rgba(155,89,182,.3)" },
            { icon: "💃", name: "زومبا", count: "8 كلاسات", color: C.red, bg: "rgba(233,30,99,.08)", border: "rgba(233,30,99,.2)" },
            { icon: "🏋️", name: "قوة", count: "15 كلاس", color: C.gold, bg: "rgba(200,162,0,.08)", border: "rgba(200,162,0,.2)" },
            { icon: "🤸", name: "بيلاتس", count: "10 كلاسات", color: "#0EA5E9", bg: "rgba(14,165,233,.08)", border: "rgba(14,165,233,.2)" },
            { icon: "🏃", name: "كارديو", count: "6 كلاسات", color: "#F97316", bg: "rgba(249,115,22,.08)", border: "rgba(249,115,22,.2)" },
          ];
  const [memberships, setMemberships] = useState(DEFAULT_HOME_MEMBERSHIPS);
  const [trainers, setTrainers] = useState<PublicTrainer[]>([
    {
      id: "trainer-1",
      name: "هبة زارع",
      specialty: "مدربة رئيسية · يوجا وقوة",
      bio: "",
      certifications: [],
      rating: 4.9,
      sessionsCount: 520,
      image: null,
      showOnHome: true,
      sortOrder: 0,
      classesCount: 12,
    },
    {
      id: "trainer-2",
      name: "منال علي",
      specialty: "مدربة زومبا وكارديو",
      bio: "",
      certifications: [],
      rating: 4.8,
      sessionsCount: 380,
      image: null,
      showOnHome: true,
      sortOrder: 1,
      classesCount: 10,
    },
    {
      id: "trainer-3",
      name: "سحر كمال",
      specialty: "مدربة قوة وبيلاتس",
      bio: "",
      certifications: [],
      rating: 4.9,
      sessionsCount: 415,
      image: null,
      showOnHome: true,
      sortOrder: 2,
      classesCount: 9,
    },
  ]);
  const [testimonials, setTestimonials] = useState<PublicTestimonial[]>([
    { displayName: "أميرة السيد", content: "أفضل جيم في بني سويف. المدربات محترفات جدًا والأجواء تشجعك على الاستمرار.", rating: 5 },
    { displayName: "هنا محمد", content: "الجدول مرن ومناسب جدًا وأنصح به لأي سيدة تريد الالتزام بانتظام.", rating: 5 },
    { displayName: "ريم أحمد", content: "الحجز يتم بسرعة وسهولة من الموقع والتجربة ممتازة.", rating: 5 },
  ]);
  const [products, setProducts] = useState<StoreProduct[]>(DEFAULT_PRODUCTS.slice(0, 3));
  const [specialOffer, setSpecialOffer] = useState<PublicOffer | null>(null);
  const [specialOfferLoading, setSpecialOfferLoading] = useState(false);
  const [specialOfferMessage, setSpecialOfferMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [todayClasses, setTodayClasses] = useState<Array<{ id: string; time: string; name: string; trainer: string; spots: number; color: string }>>([]);
  const [todayIndex, setTodayIndex] = useState(0);
  const todayCarouselRef = useRef<HTMLDivElement | null>(null);
  const todayTrackRef = useRef<HTMLDivElement | null>(null);
  const todayOffsetRef = useRef(0);
  const todaySegmentWidthRef = useRef(0);
    const [heroContent, setHeroContent] = useState<HomeHeroContent>({
      badge: "أول نادي للسيدات في بني سويف",
      badgeEn: "First women & kids gym in Beni Suef",
      headline1: "ابدئي رحلتك",
      headline1En: "Start your journey",
      headline2: "FIT ZONE",
      headline2En: "FIT ZONE",
      headline3: "مع",
      headline3En: "with",
      subtext: "النادي الوحيد المخصص للسيدات والأطفال. كلاسات متنوعة، مدربات محترفات، ونتائج حقيقية في بيئة آمنة ومريحة.",
      subtextEn: "The only club dedicated to women and kids. Diverse classes, expert coaches, real results in a safe and friendly environment.",
      ctaPrimary: "اشتركي الآن",
      ctaPrimaryEn: "Subscribe now",
      ctaSecondary: "احجزي كلاس تجريبي",
      ctaSecondaryEn: "Book a trial class",
      slides: DEFAULT_HERO_SLIDES,
      stats: [
        { value: "500+", label: "عضوة نشطة" },
        { value: "50+", label: "كلاس أسبوعيًا" },
        { value: "3", label: "مدربات محترفات" },
      ],
      statsEn: [
        { value: "500+", label: "Active members" },
        { value: "50+", label: "Weekly classes" },
        { value: "3", label: "Pro trainers" },
      ],
    });
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [offerNow, setOfferNow] = useState(Date.now());
  useEffect(() => {
    loadPublicApi(true).then(d => {
      if (Array.isArray(d.memberships) && d.memberships.length > 0) {
        const subscriptions = (d.memberships as PublicMembership[]).filter((mb) => mb.kind === "subscription");
        setMemberships(subscriptions.slice(0, 3).map((mb, i) => ({
          name: mb.name,
          price: mb.price,
          priceBefore: mb.priceBefore ?? null,
          priceAfter: mb.priceAfter ?? null,
          period: cycleLabel(mb.cycle, mb.durationDays),
          features: Array.isArray(mb.features) ? mb.features.slice(0, 4) : [],
          color: HOME_PLAN_COLORS[i % HOME_PLAN_COLORS.length],
          popular: i === 1,
        })));
      }
      if (Array.isArray(d.trainers) && d.trainers.length > 0) {
        setTrainers(
          (d.trainers as PublicTrainer[])
            .filter((trainer) => trainer.showOnHome)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .slice(0, 6),
        );
      }
      if (Array.isArray(d.testimonials) && d.testimonials.length > 0) {
        setTestimonials(d.testimonials.slice(0, 6));
      }
      if (Array.isArray(d.products) && d.products.length > 0) {
        setProducts(d.products.slice(0, 3).map((p: { id?: string; name: string; price: number; oldPrice: number | null; category: string; categoryLabel?: string; sizeType?: "none" | "clothing" | "shoes"; images?: string[]; sizes?: string[]; colors?: string[] }, i: number) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          oldPrice: p.oldPrice,
          type: `product${(i % 3) + 1}`,
          cat: p.categoryLabel ?? catMap[p.category] ?? p.category,
          categoryKey: p.category,
          sizeType: p.sizeType ?? "none",
          sizes: Array.isArray(p.sizes) ? p.sizes.filter(Boolean) : [],
          colors: Array.isArray(p.colors) ? p.colors.filter(Boolean) : [],
          badge: p.oldPrice ? `خصم ${Math.round((1 - p.price / p.oldPrice) * 100)}%` : null,
          rating: 4.7,
          images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
        })));
      }
      if (Array.isArray(d.offers)) {
        const highlighted = (d.offers as PublicOffer[]).find((offer) => offer.type === "special" && offer.showOnHome);
        setSpecialOffer(highlighted ?? null);
      }
      if (Array.isArray(d.classes)) {
        const now = new Date();
        const todayLabel = now.toLocaleDateString("ar-EG", { weekday: "long" });
        const timeToMinutes = (value: string) => {
          const [h, m] = value.split(":").map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const typeColor = (type: string) => {
          if (type === "yoga") return "#9B59B6";
          if (type === "dance") return C.red;
          if (type === "strength") return C.gold;
          if (type === "cardio") return "#F97316";
          return "#6B7280";
        };
        const entries = (d.classes as PublicClass[]).flatMap((cls) =>
          cls.schedules.map((schedule) => {
            const day = new Date(schedule.date).toLocaleDateString("ar-EG", { weekday: "long" });
            return {
              id: schedule.id,
              time: schedule.time,
              name: cls.name,
              trainer: cls.trainer,
              spots: schedule.availableSpots,
              color: typeColor(cls.type),
              day,
            };
          }),
        );
        const todayEntries = entries
          .filter((entry) => entry.day === todayLabel)
          .sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
        setTodayClasses(todayEntries);
        setTodayIndex(0);
      }
    }).catch(() => {});
  }, []);
  useEffect(() => {
    fetch("/api/site-content?sections=hero", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.hero && typeof d.hero === "object") {
          const next = d.hero as Partial<HomeHeroContent>;
          setHeroContent((current) => ({
            ...current,
            ...next,
            slides: Array.isArray(next.slides) && next.slides.length > 0 ? next.slides.filter(Boolean) : current.slides,
            stats: Array.isArray(next.stats) && next.stats.length > 0 ? next.stats : current.stats,
          }));
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const slides = heroContent.slides?.length ? heroContent.slides : DEFAULT_HERO_SLIDES;
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % slides.length);
    }, 2800);
    return () => clearInterval(timer);
  }, [heroContent.slides]);
  useEffect(() => {
    if (!specialOffer) return;
    const timer = setInterval(() => setOfferNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [specialOffer]);
  const animatedTodayClasses = useMemo(() => todayClasses, [todayClasses]);
  useEffect(() => {
    const applyTransform = () => {
      if (todayTrackRef.current) {
        todayTrackRef.current.style.transform = `translate3d(${todayOffsetRef.current}px, 0, 0)`;
      }
    };

    const measure = () => {
      const track = todayTrackRef.current;
      if (!track || animatedTodayClasses.length === 0) return;
      const segmentWidth = track.scrollWidth / 3;
      todaySegmentWidthRef.current = segmentWidth;
      todayOffsetRef.current = -segmentWidth;
      applyTransform();
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [animatedTodayClasses.length]);

  useEffect(() => {
    if (animatedTodayClasses.length <= 1) return;
    let frameId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const elapsed = (now - lastTime) / 1000;
      lastTime = now;
      const direction = 1;
      todayOffsetRef.current = wrapCarouselOffset(
        todayOffsetRef.current + direction * 24 * elapsed,
        todaySegmentWidthRef.current,
      );
      if (todayTrackRef.current) {
        todayTrackRef.current.style.transform = `translate3d(${todayOffsetRef.current}px, 0, 0)`;
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animatedTodayClasses.length]);

  const moveTodayCarousel = useCallback((direction: "prev" | "next") => {
    if (animatedTodayClasses.length === 0 || todaySegmentWidthRef.current <= 0) return;
    const step = todaySegmentWidthRef.current / animatedTodayClasses.length;
    const delta =
      direction === "next"
        ? step
        : -step;
    todayOffsetRef.current = wrapCarouselOffset(todayOffsetRef.current + delta, todaySegmentWidthRef.current);
    if (todayTrackRef.current) {
      todayTrackRef.current.style.transform = `translate3d(${todayOffsetRef.current}px, 0, 0)`;
    }
    setTodayIndex((current) =>
      direction === "next"
        ? (current + 1) % animatedTodayClasses.length
        : (current - 1 + animatedTodayClasses.length) % animatedTodayClasses.length,
    );
  }, [animatedTodayClasses.length]);
    const heroStats = summary?.authenticated
      ? [
          [formatCurrency(summary.walletBalance), t("رصيدك الحالي", "Current balance")],
          [(summary.rewardPoints ?? 0).toLocaleString(lang === "en" ? "en-US" : "ar-EG"), t("نقاطك الحالية", "Your points")],
          [summary.membership?.name ?? t("بدون اشتراك", "No membership"), t("الباقة النشطة", "Active plan")],
        ]
      : (lang === "en" ? heroContent.statsEn ?? heroContent.stats : heroContent.stats).map((s) => [s.value, s.label]);
  const walletHighlights = [
    ["💳", formatCurrency(summary?.walletBalance), t("رصيد المحفظة", "Wallet balance")],
    ["🏅", (summary?.rewardPoints ?? 0).toLocaleString(lang === "en" ? "en-US" : "ar-EG"), t("نقاط المكافآت", "Reward points")],
    ["🎁", summary?.authenticated ? `${summary?.referralEarned ?? 0} ${lang === "en" ? "EGP" : "ج.م"}` : "20%", summary?.authenticated ? t("مكافآت الإحالة", "Referral rewards") : t("خصم الإحالة", "Referral discount")],
    ["📦", summary?.membership?.name ?? getTierLabel(summary?.rewardTier), summary?.membership ? t("الاشتراك النشط", "Active plan") : t("مستوى العضوية", "Membership tier")],
  ];
    const heroSlides = heroContent.slides?.length ? heroContent.slides : DEFAULT_HERO_SLIDES;
    const heroBadge = lang === "en" ? heroContent.badgeEn ?? heroContent.badge : heroContent.badge;
    const heroHeadline1 = lang === "en" ? heroContent.headline1En ?? heroContent.headline1 : heroContent.headline1;
    const heroHeadline2 = lang === "en" ? heroContent.headline2En ?? heroContent.headline2 : heroContent.headline2;
    const heroHeadline3 = lang === "en" ? heroContent.headline3En ?? heroContent.headline3 : heroContent.headline3;
    const heroSubtext = lang === "en" ? heroContent.subtextEn ?? heroContent.subtext : heroContent.subtext;
    const heroCtaPrimary = lang === "en" ? heroContent.ctaPrimaryEn ?? heroContent.ctaPrimary : heroContent.ctaPrimary;
    const heroCtaSecondary = lang === "en" ? heroContent.ctaSecondaryEn ?? heroContent.ctaSecondary : heroContent.ctaSecondary;
  const offerCountdown = specialOffer ? getCountdownParts(specialOffer.expiresAt) : null;
  const remainingSubscribers =
    specialOffer?.maxSubscribers != null && specialOffer?.showMaxSubscribers
      ? Math.max(specialOffer.maxSubscribers - specialOffer.currentSubscribers, 0)
      : null;

  const handleTrialBooking = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("fitzone_trial_booking", "1");
    }
    navigate("memberships");
  };

  const handleSpecialOfferSubscribe = async () => {
    if (!specialOffer) return;
    if (!summary?.authenticated) {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/?page=home")}`;
      return;
    }

    setSpecialOfferLoading(true);
    setSpecialOfferMessage(null);
    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: specialOffer.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setSpecialOfferMessage({ text: payload.error || t("تعذر الاشتراك في العرض الآن.", "Unable to subscribe to the offer right now."), ok: false });
        return;
      }

      setSpecialOfferMessage({ text: t("تم الاشتراك في العرض الخاص بنجاح.", "Special offer subscribed successfully."), ok: true });
      await loadPublicApi(true).then((d) => {
        if (Array.isArray(d.offers)) {
          const highlighted = (d.offers as PublicOffer[]).find((offer) => offer.type === "special" && offer.showOnHome);
          setSpecialOffer(highlighted ?? null);
        }
      }).catch(() => {});
    } catch {
      setSpecialOfferMessage({ text: t("تعذر الاتصال بالخادم أثناء الاشتراك.", "Failed to reach the server while subscribing."), ok: false });
    } finally {
      setSpecialOfferLoading(false);
    }
  };

  return (
    <div>
      {/* ─ HERO ─ */}
      <section style={{ position: "relative", minHeight: viewportWidth() < 768 ? 520 : 600, display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <GymImg type="gymReal" w="100%" h={600} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(252,228,236,.85) 30%, rgba(255,240,245,.4) 100%)" }} />
        </div>
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "0.95fr 1.05fr"), gap: 32, alignItems: "center" }}>
            <div
              style={{
                maxWidth: 580,
                order: viewportWidth() < 1024 ? 2 : 1,
                position: "relative",
                paddingRight: 0,
              }}
            >
            <div className="tag" style={{ marginBottom: 20, display: "inline-flex" }}>💪 {heroBadge}</div>
            <h1 style={{ fontSize: viewportWidth() < 768 ? 34 : 56, fontWeight: 900, lineHeight: 1.1, color: C.white, marginBottom: 20 }}>
              {heroHeadline1}<br />
              {heroHeadline3} <span style={{ color: C.red, textShadow: `0 0 30px ${C.red}66` }}>{heroHeadline2}</span>
            </h1>
            <p style={{ fontSize: viewportWidth() < 768 ? 15 : 17, color: C.gray, lineHeight: 1.8, marginBottom: 36, maxWidth: 460 }}>
              {heroSubtext}
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={() => navigate("memberships")} style={{ fontSize: 16, padding: "14px 36px" }}>
                  <I n="star" s={16} c="#fff" /> {heroCtaPrimary}
              </button>
              <button className="btn-outline" onClick={handleTrialBooking} style={{ fontSize: 16, padding: "14px 36px" }}>
                  {heroCtaSecondary}
              </button>
            </div>
            <div style={{ display: "flex", gap: viewportWidth() < 768 ? 20 : 40, marginTop: 48, flexWrap: "wrap" }}>
              {heroStats.map(([n,l]) => (
                <div key={l}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: C.red }}>{n}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
            <div style={{ order: viewportWidth() < 1024 ? 1 : 2 }}>
              <div style={{ position: "relative" }}>
                <div
                  className="card glow-red"
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 18,
                    background: "rgba(255,255,255,.55)",
                    backdropFilter: "blur(12px)",
                    border: `1px solid ${C.border}`,
                    boxShadow: "0 24px 80px rgba(233,30,99,.2)",
                  }}
                >
                  {/* Slide stack — landscape shape, image fills fully with no empty borders */}
                  <div style={{ position: "relative", width: "100%", padding: 10 }}>
                    {/* Spacer: 16:9 landscape ratio — same shape as original */}
                    <div style={{ width: "100%", aspectRatio: "16/9", visibility: "hidden" }} />

                    {heroSlides.map((slide, index) => (
                      <div
                        key={`${slide}-${index}`}
                        style={{
                          position: "absolute",
                          inset: 10,
                          opacity: index === heroSlideIndex ? 1 : 0,
                          transform: index === heroSlideIndex ? "scale(1)" : "scale(1.035)",
                          transition: "opacity 700ms ease, transform 700ms ease",
                          pointerEvents: index === heroSlideIndex ? "auto" : "none",
                          borderRadius: 14,
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={slide}
                          alt={`hero-slide-${index + 1}`}
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent, rgba(26,8,18,.18))", pointerEvents: "none" }} />
                        <div
                          style={{
                            position: "absolute",
                            top: 12,
                            left: 12,
                            background: "rgba(26,8,18,.55)",
                            color: "#fff",
                            border: `1px solid ${C.border}`,
                            borderRadius: 999,
                            padding: "5px 11px",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {index + 1} من {heroSlides.length}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ position: "absolute", right: 18, bottom: 18, display: "flex", gap: 8 }}>
                    {heroSlides.map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setHeroSlideIndex(index)}
                        style={{
                          width: index === heroSlideIndex ? 26 : 10,
                          height: 10,
                          borderRadius: 999,
                          border: "none",
                          background: index === heroSlideIndex ? C.red : "rgba(255,255,255,.65)",
                          cursor: "pointer",
                          transition: "all .2s ease",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Floating card */}
        <div style={{ position: "absolute", left: viewportWidth() < 768 ? "auto" : "5%", right: viewportWidth() < 768 ? 16 : "auto", bottom: viewportWidth() < 768 ? 16 : 40, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 20px", display: viewportWidth() < 768 ? "none" : "flex", alignItems: "center", gap: 12, zIndex: 2 }}>
          <div style={{ width: 36, height: 36, background: "rgba(233,30,99,.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>🏆</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{summary?.authenticated ? (summary.user?.name || "عضوة جديدة") : "مشتركات اليوم"}</div>
            <div style={{ fontSize: 11, color: C.red }}>{summary?.authenticated ? `الباقة: ${summary.membership?.name ?? "بدون اشتراك"}` : "+12 عضوة جديدة"}</div>
          </div>
        </div>
      </section>

      {specialOffer && (
        <section style={{ padding: "18px 0 8px" }}>
          <div className="container">
            <div
              className="card"
              style={{
                border: `1px solid ${C.red}33`,
                background: "linear-gradient(135deg, rgba(233,30,99,.08), rgba(255,255,255,.95))",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: responsiveColumns("1fr", "1fr", "1.1fr .9fr"),
                  gap: 0,
                  alignItems: "stretch",
                }}
              >
                <div style={{ padding: viewportWidth() < 768 ? 22 : 32, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span className="badge" style={{ width: "fit-content", marginBottom: 14, background: C.red }}>
                    {t("عرض خاص محدود", "Limited special offer")}
                  </span>
                  <h2 style={{ fontSize: viewportWidth() < 768 ? 24 : 34, fontWeight: 900, color: C.white, marginBottom: 10, lineHeight: 1.3 }}>
                    {specialOffer.title}
                  </h2>
                  <p style={{ color: C.gray, fontSize: 14, lineHeight: 1.9, marginBottom: 18 }}>
                    {specialOffer.description || t("عرض خاص لفترة محدودة على إحدى باقات النادي.", "Limited-time offer on a club package.")}
                  </p>
                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 30, fontWeight: 900, color: C.red }}>
                        {formatCurrency(specialOffer.specialPrice ?? 0)}
                      </div>
                      <div style={{ fontSize: 12, color: C.gray }}>{t("قيمة الاشتراك أثناء العرض", "Offer price")}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: C.white }}>
                        {specialOffer.currentSubscribers.toLocaleString(lang === "en" ? "en-US" : "ar-EG")}
                      </div>
                      <div style={{ fontSize: 12, color: C.gray }}>{t("اشتركن بالفعل", "Already joined")}</div>
                    </div>
                    {remainingSubscribers != null && (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: C.gold }}>
                          {remainingSubscribers.toLocaleString(lang === "en" ? "en-US" : "ar-EG")}
                        </div>
                        <div style={{ fontSize: 12, color: C.gray }}>{t("المقاعد المتبقية", "Seats remaining")}</div>
                      </div>
                    )}
                  </div>

                  {offerCountdown && (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
                      {[
                        { label: t("يوم", "Days"), value: offerCountdown.days },
                        { label: t("ساعة", "Hours"), value: offerCountdown.hours },
                        { label: t("دقيقة", "Minutes"), value: offerCountdown.minutes },
                        { label: t("ثانية", "Seconds"), value: offerCountdown.seconds },
                      ].map((item) => (
                        <div key={item.label} style={{ minWidth: 74, borderRadius: 14, background: "rgba(255,255,255,.88)", border: `1px solid ${C.border}`, padding: "10px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color: offerCountdown.expired ? C.gray : C.red }}>
                            {String(item.value).padStart(2, "0")}
                          </div>
                          <div style={{ fontSize: 11, color: C.gray }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <button className="btn-primary" onClick={handleSpecialOfferSubscribe} disabled={specialOfferLoading || offerCountdown?.expired}>
                      {specialOfferLoading ? t("جارٍ التنفيذ...", "Processing...") : offerCountdown?.expired ? t("انتهى العرض", "Offer ended") : t("اشتركي في العرض", "Join the offer")}
                    </button>
                    <button className="btn-outline" onClick={() => navigate("offers")}>{t("تفاصيل العرض", "Offer details")}</button>
                  </div>

                  {specialOfferMessage && (
                    <div
                      style={{
                        marginTop: 14,
                        borderRadius: 12,
                        padding: "10px 14px",
                        background: specialOfferMessage.ok ? "rgba(22,163,74,.1)" : "rgba(233,30,99,.1)",
                        color: specialOfferMessage.ok ? C.successDark : C.redDark,
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {specialOfferMessage.text}
                    </div>
                  )}
                </div>

                <div style={{ minHeight: viewportWidth() < 768 ? 280 : 360, background: "#fff0f5" }}>
                  <img
                    src={specialOffer.image || heroSlides[0]}
                    alt={specialOffer.title}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─ QUICK ACTIONS ─ */}
      <section style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: "0" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr 1fr", "repeat(4, 1fr)", "repeat(4, 1fr)") }}>
            {[
              { icon: "repeat", label: t("الاشتراكات", "Memberships"), page: "memberships", sub: t("باقات متنوعة", "Flexible plans") },
              { icon: "calendar", label: t("الجدول الأسبوعي", "Weekly schedule"), page: "schedule", sub: t("احجزي مقعدك", "Book your spot") },
              { icon: "box", label: t("المتجر", "Shop"), page: "shop", sub: t("منتجات رياضية", "Sports products") },
              { icon: "wallet", label: t("شحن المحفظة", "Top up wallet"), page: "wallet", sub: t("بونص حتى 15%", "Bonus up to 15%") },
            ].map(({ icon, label, page, sub }) => (
              <button key={page} onClick={() => navigate(page)} style={{ background: "none", border: "none", borderLeft: `1px solid ${C.border}`, padding: "20px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, fontFamily: "'Cairo', sans-serif", transition: "background .2s" }}>
                <div style={{ width: 44, height: 44, background: "rgba(233,30,99,.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <I n={icon} s={20} c={C.red} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{label}</div>
                  <div style={{ fontSize: 11, color: C.gray }}>{sub}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─ CLASS CATEGORIES ─ */}
      {SHOW_CLASSES_PAGE ? (
        <section className="section">
          <div className="container">
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <span className="tag" style={{ marginBottom: 12, display: "inline-block" }}>{t("كلاساتنا", "Our classes")}</span>
              <h2 className="section-title">{t("كلاسات تناسب", "Classes for")} <span>{t("كل أهدافك", "every goal")}</span></h2>
              <p className="section-sub">{t("تشكيلة متنوعة من الكلاسات مع أفضل المدربات", "A diverse set of classes with top coaches")}</p>
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              {classes.map(c => (
                <button key={c.name} onClick={() => navigate("classes")} style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "22px 28px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: viewportWidth() < 768 ? 96 : 110, transition: "transform .2s, box-shadow .2s", fontFamily: "'Cairo', sans-serif" }}>
                  <span style={{ fontSize: 36 }}>{c.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: C.gray }}>{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* ─ MEMBERSHIPS ─ */}
      <section className="section" style={{ background: C.bgCard }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="tag" style={{ marginBottom: 12, display: "inline-block" }}>{t("الأسعار", "Pricing")}</span>
            <h2 className="section-title">{t("اختاري", "Choose")} <span>{t("الباقة", "the plan")}</span> {t("المناسبة", "that fits")}</h2>
            <p className="section-sub">{t("باقات بأسعار تنافسية تبدأ من 299 ج.م / شهر", "Affordable plans starting from 299 EGP / month")}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {memberships.map(m => (
              <div key={m.name} className={`card card-hover`} style={{ padding: 32, position: "relative", border: m.popular ? `2px solid ${C.red}` : `1px solid ${C.border}`, transform: m.popular ? "scale(1.03)" : "none" }}>
                {m.popular && (
                  <div style={{ position: "absolute", top: -5, left: "50%", transform: "translateX(-50%)", background: C.red, color: "#fff", padding: "4px 20px", borderRadius: 4, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>⭐ {t("الأكثر شعبية", "Most popular")}</div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 900, color: C.white }}>{t("باقة", "Plan")} {m.name}</h3>
                <div style={{ margin: "16px 0 24px" }}>
                  <span className="price-currency" style={{ color: m.color }}>{lang === "en" ? "EGP " : "ج.م "}</span>
                  <span className="price-big" style={{ color: m.color }}>{m.priceAfter ?? m.price}</span>
                  <span style={{ color: C.gray, fontSize: 13 }}> / {m.period}</span>
                </div>
                {m.priceBefore && m.priceBefore > (m.priceAfter ?? m.price) ? (
                  <div style={{ color: C.grayDark, fontSize: 13, textDecoration: "line-through", marginTop: -12, marginBottom: 12 }}>
                    {m.priceBefore} {lang === "en" ? "EGP" : "ج.م"}
                  </div>
                ) : null}
            <div className="divider" />
                <ul style={{ listStyle: "none", marginBottom: 28 }}>
                  {m.features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 14, color: C.grayLight, borderBottom: `1px solid ${C.border}` }}>
                      <I n="check" s={14} c={m.popular ? C.red : C.gold} /> {f}
                    </li>
                  ))}
                </ul>
                <button className={m.popular ? "btn-primary" : "btn-outline"} style={{ width: "100%", justifyContent: "center", background: m.popular ? C.red : "transparent", borderColor: m.color, color: m.popular ? "#fff" : m.color }} onClick={() => navigate("memberships")}>
                  {t("اشتركي الآن", "Subscribe now")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ SCHEDULE PREVIEW ─ */}
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32, gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2 className="section-title">{t("كلاسات", "Today's")} <span>{t("اليوم", "classes")}</span></h2>
              <p suppressHydrationWarning style={{ color: C.gray, fontSize: 14 }}>{new Date().toLocaleDateString(lang === "en" ? "en-US" : "ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {t("بني سويف", "Beni Suef")}</p>
            </div>
            <button className="btn-outline" onClick={() => navigate("schedule")}>{t("الجدول الكامل", "Full schedule")}</button>
          </div>
          {todayClasses.length === 0 ? (
            <div className="card" style={{ padding: 24, textAlign: "center", color: C.gray }}>
              {t("لا توجد كلاسات لليوم حالياً. يمكنك الاطلاع على الجدول الكامل لاختيار موعد مناسب.", "No classes today. Check the full schedule to pick a suitable time.")}
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <button
                className="btn-outline"
                onClick={() => moveTodayCarousel("prev")}
                style={{
                  position: "absolute",
                  left: -12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  padding: "10px 12px",
                  borderRadius: 999,
                  zIndex: 3,
                }}
              >
                <I n="chevronLeft" s={16} c={C.red} />
              </button>
              <button
                className="btn-outline"
                onClick={() => moveTodayCarousel("next")}
                style={{
                  position: "absolute",
                  right: -12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  padding: "10px 12px",
                  borderRadius: 999,
                  zIndex: 3,
                }}
              >
                <I n="chevronRight" s={16} c={C.red} />
              </button>
              <div
                ref={todayCarouselRef}
                className="today-classes-carousel"
                style={{ transform: lang === "ar" ? "scaleX(-1)" : "none" }}
              >
                <div ref={todayTrackRef} className="today-classes-track" style={{ direction: "ltr" }}>
                  {[0, 1, 2].flatMap((copyIndex) =>
                    animatedTodayClasses.map((s, index) => (
                    <div
                      key={`${s.id}-${copyIndex}-${index}-${todayIndex}`}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                      className="card today-class-card"
                      style={{ padding: 20, borderRight: `3px solid ${s.color}`, transform: lang === "ar" ? "scaleX(-1)" : "none" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                        <span style={{ background: `${s.color}22`, color: s.color, padding: "4px 12px", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>{s.time}</span>
                        <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: s.spots === 0 ? "rgba(239,68,68,.15)" : s.spots < 4 ? "rgba(234,179,8,.12)" : "rgba(34,197,94,.12)", color: s.spots === 0 ? "#EF4444" : s.spots < 4 ? "#EAB308" : C.success, fontWeight: 600 }}>
                          {s.spots === 0 ? t("ممتلئ", "Full") : s.spots < 4 ? `${s.spots} ${t("متبقية", "left")}` : t("متاح الآن", "Available")}
                        </span>
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: C.white, marginBottom: 4 }}>{s.name}</div>
                      <div style={{ color: C.gray, fontSize: 13, marginBottom: 16 }}>{t("مع", "With")} {s.trainer}</div>
                      <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: 13, opacity: s.spots === 0 ? .5 : 1 }} disabled={s.spots === 0} onClick={() => navigate("schedule")}>
                        {s.spots === 0 ? t("ممتلئ", "Full") : t("احجزي الآن", "Book now")}
                      </button>
                    </div>
                  )))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─ WALLET + REWARDS BANNER ─ */}
      <section style={{ background: `linear-gradient(135deg, #FFE8F0 0%, ${C.bgCard} 100%)`, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "64px 0" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 48, alignItems: "center" }}>
          <div>
            <span className="tag" style={{ marginBottom: 16, display: "inline-flex" }}>💳 {t("نظام المحفظة والمكافآت", "Wallet & rewards system")}</span>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: C.white, marginBottom: 16, lineHeight: 1.2 }}>{t("اشحني محفظتك", "Top up your wallet")}<br /><span style={{ color: C.red }}>{t("واكسبي أكثر", "and earn more")}</span></h2>
            <p style={{ color: C.gray, fontSize: 15, lineHeight: 1.8, marginBottom: 28 }}>{t("بونص إضافي مع كل شحن! اشحني بـ 200 ج.م واحصلي على 20 ج.م إضافية. اكسبي نقاط مع كل عملية واستبديليها بخصومات حصرية.", "Extra bonus with every top-up! Add 200 EGP and get +20 EGP. Earn points with every purchase and redeem exclusive discounts.")}</p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-primary" onClick={() => navigate("wallet")} style={{ fontSize: 14, padding: "11px 24px" }}>
                <I n="wallet" s={16} c="#fff" /> {t("اشحني الآن", "Top up now")}
              </button>
              <button className="btn-ghost" onClick={() => navigate("rewards")} style={{ fontSize: 14 }}>{t("نقاطي", "My points")}</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 16 }}>
            {walletHighlights.map(([icon,val,lbl]) => (
              <div key={lbl} style={{ background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
                <div style={{ color: C.gold, fontWeight: 900, fontSize: 20 }}>{val}</div>
                <div style={{ color: C.gray, fontSize: 11, marginTop: 4 }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ PRODUCTS ─ */}
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div>
              <h2 className="section-title">{t("المتجر", "Shop")} <span>{t("الرياضي", "gear")}</span></h2>
              <p className="section-sub">{t("منتجات مختارة لتعزيز أدائك", "Curated products to boost performance")}</p>
            </div>
            <button
              className="btn-primary"
              onClick={() => navigate("shop")}
              style={{
                boxShadow: "0 12px 30px rgba(233,30,99,0.3)",
                borderColor: "transparent",
                padding: "12px 26px",
              }}
            >
              {t("تسوقي الآن", "Shop now")}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {products.map(p => (
              <div key={p.id ?? p.name} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => { if (typeof window !== "undefined") { window.sessionStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(p)); } navigate("productDetail"); }}>
                {(() => {
                  const outOfStock = typeof p.stock === "number" && p.stock <= 0;
                  return (
                    <>
                <div style={{ height: 200, position: "relative" }}>
                  <ProductVisual product={p} h={200} />
                  {p.badge && <span className="badge" style={{ position: "absolute", top: 12, right: 12 }}>{p.badge}</span>}
                  {outOfStock && (
                    <span
                      className="badge"
                      style={{ position: "absolute", top: 12, left: 12, background: "#2b0f1b", color: "#ffd166" }}
                    >
                      {t("نفذت الكمية", "Out of stock")}
                    </span>
                  )}
                </div>
                <div style={{ padding: 20 }}>
                  <h3 style={{ fontWeight: 700, marginBottom: 10, fontSize: 15, color: C.white }}>{p.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontWeight: 900, color: C.red, fontSize: 20 }}>{p.price} {lang === "en" ? "EGP" : "ج.م"}</span>
                    {p.oldPrice && <span style={{ textDecoration: "line-through", color: C.gray, fontSize: 13 }}>{p.oldPrice} {lang === "en" ? "EGP" : "ج.م"}</span>}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13, opacity: outOfStock ? 0.5 : 1 }}
                    disabled={outOfStock}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (outOfStock) return;
                      addToCart({ productId: p.id ?? p.name, name: p.name, price: p.price, qty: 1, size: p.sizeType === "none" ? null : p.sizes?.[0] ?? null, type: p.type });
                      navigate("cart");
                    }}
                  >
                    <I n="cart" s={14} c="#fff" /> {outOfStock ? t("نفذت الكمية", "Out of stock") : t("أضيفي للسلة", "Add to cart")}
                  </button>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ REFERRAL ─ */}
      <section style={{ background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "56px 0" }}>
        <div className="container" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🎁</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: C.white, marginBottom: 12 }}>{t("دعوي صاحبتك", "Invite your friend")} <span style={{ color: C.red }}>{t("واربحا معًا!", "and earn together!")}</span></h2>
          <p style={{ color: C.gray, fontSize: 16, marginBottom: 28, maxWidth: 480 }}>{t("ادعي صديقتك للاشتراك معكِ في فيت زون وكلتيكما هتاخدوا خصم 20% على الاشتراك القادم.", "Invite a friend to join Fit Zone and you both get 20% off the next membership.")}</p>
          <button className="btn-primary" onClick={() => navigate("referral")} style={{ fontSize: 15, padding: "14px 40px" }}>
            <I n="share" s={16} c="#fff" /> {t("اشتركي في برنامج الإحالة", "Join referral program")}
          </button>
        </div>
      </section>

      {/* ─ TRAINERS ─ */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 className="section-title">{t("مدرباتنا", "Our trainers")} <span>{t("المحترفات", "experts")}</span></h2>
            <p className="section-sub">{t("فريق من أفضل المدربات لمساعدتك في تحقيق أهدافك", "A team of top coaches to help you reach your goals")}</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {trainers.map((t, index) => (
              <div key={t.id} className="card card-hover" style={{ padding: 0, overflow: "hidden", textAlign: "center" }}>
                <div style={{ height: 220, background: "#fff" }}>
                  {t.image ? (
                    <img src={t.image} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <GymImg type={`trainer${(index % 3) + 1}`} w="100%" h={220} />
                  )}
                </div>
                <div style={{ padding: "20px 24px 24px" }}>
                  <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{t.name}</h3>
                  <p style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 16 }}>{t.specialty}</p>
                  <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 16 }}>
                    <div><div style={{ fontWeight: 700, color: C.red }}>⭐ {t.rating}</div><div style={{ fontSize: 11, color: C.gray }}>التقييم</div></div>
                    <div><div style={{ fontWeight: 700, color: C.white }}>{t.sessionsCount}</div><div style={{ fontSize: 11, color: C.gray }}>جلسة</div></div>
                  </div>
                  <button className="btn-outline" style={{ width: "100%" }} onClick={() => navigate("trainers")}>عرض الملف</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ TESTIMONIALS ─ */}
      <section className="section" style={{ background: C.bgCard }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 className="section-title">قالت عنا <span>العضوات</span></h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {testimonials.map((t, index) => {
              const name = t.displayName || t.user?.name || "عميلة";
              return (
                <div key={t.id ?? `${name}-${index}`} className="card" style={{ padding: 28, borderRight: `3px solid ${C.red}` }}>
                  <div style={{ display: "flex", marginBottom: 12 }}>
                    {[...Array(t.rating)].map((_,i) => <span key={i} style={{ color: C.gold, fontSize: 16 }}>⭐</span>)}
                  </div>
                  <p style={{ color: C.gray, lineHeight: 1.8, fontSize: 14, marginBottom: 20 }}>"{t.content}"</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, background: "rgba(233,30,99,.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontWeight: 700 }}>{name[0]}</div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{name}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── MEMBERSHIPS PAGE ─────────────────────────────────────────────────────────
type PlanItem = {
  id: string | null;
  name: string;
  price: number;
  priceBefore?: number | null;
  priceAfter?: number | null;
  image?: string | null;
  sortOrder?: number;
  durationDays: number;
  cycle: string | null;
  sessionsCount: number | null;
  features: string[];
  color: string;
  popular: boolean;
  goalIds: string[];
};
const DEFAULT_PLANS: PlanItem[] = [
  { id: null, name: "ليت", price: 299, durationDays: 30, cycle: "monthly", sessionsCount: 8, features: ["دخول الصالة 6 أيام","تمارين القلب","خزائن آمنة"], color: C.gray, popular: false, goalIds: [] },
  { id: null, name: "برو", price: 599, durationDays: 30, cycle: "monthly", sessionsCount: 12, features: ["دخول غير محدود","مدربة خاصة","خصم 10% في المتجر","محفظة رقمية"], color: C.red, popular: true, goalIds: [] },
  { id: null, name: "بريميوم", price: 999, durationDays: 30, cycle: "monthly", sessionsCount: 12, features: ["دخول غير محدود","مدربتان خاصتان","خصم 25% في المتجر","أولوية الحجز","4 جلسات خاصة"], color: C.gold, popular: false, goalIds: [] },
  { id: null, name: "VIP", price: 1499, durationDays: 30, cycle: "monthly", sessionsCount: 12, features: ["دخول غير محدود","مدربة مخصصة","خصم 40% في المتجر","حجز VIP","8 جلسات خاصة"], color: "#A855F7", popular: false, goalIds: [] },
];
const PLAN_COLORS = [C.gray, C.red, C.gold, "#A855F7", "#3498DB", "#27AE60"];
const MembershipsPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const t = useT();
  const [tab, setTab] = useState<"all" | "monthly" | "quarterly" | "semi_annual" | "annual" | "custom">("all");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>(DEFAULT_PLANS);
  const [goals, setGoals] = useState<PublicGoal[]>([]);
  const [publicClasses, setPublicClasses] = useState<PublicClass[]>([]);
  const [healthQuestions, setHealthQuestions] = useState<PublicHealthQuestion[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [goalViewParentId, setGoalViewParentId] = useState<string | null>(null);
  const plansRef = useRef<HTMLDivElement | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [subMsg, setSubMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [verifyModal, setVerifyModal] = useState<{ plan: PlanItem } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [discountCode, setDiscountCode] = useState("");
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountResult, setDiscountResult] = useState<{ id: string; type: string; value: number; discountAmount: number | null; description?: string | null } | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [surveyPlan, setSurveyPlan] = useState<PlanItem | null>(null);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, boolean | null>>({});
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const [schedulePlan, setSchedulePlan] = useState<PlanItem | null>(null);
  const [scheduleSelections, setScheduleSelections] = useState<string[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [membershipPayMethod, setMembershipPayMethod] = useState<"instapay" | "vodafone_cash">("instapay");
  const [membershipPaymentSettings, setMembershipPaymentSettings] = useState<PublicPaymentSettings>({
    instapayUrl: "",
    instapayLabel: "InstaPay",
    vodafoneCashUrl: "",
    vodafoneCashLabel: "Vodafone Cash",
    instapayAccounts: [],
    vodafoneCashAccounts: [],
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldOpen = window.sessionStorage.getItem("fitzone_trial_booking");
    if (!shouldOpen) return;
    window.sessionStorage.removeItem("fitzone_trial_booking");
    const trialPlan: PlanItem = {
      id: "trial-class",
      name: "كلاس تجريبي",
      price: 0,
      priceBefore: null,
      priceAfter: null,
      durationDays: 1,
      cycle: null,
      sessionsCount: 1,
      features: ["حجز كلاس فردي من جميع الأنواع", "اختاري أي موعد متاح"],
      color: C.red,
      popular: false,
      goalIds: [],
    };
    setScheduleSelections([]);
    setScheduleError(null);
    setSchedulePlan(trialPlan);
  }, []);
  useEffect(() => {
    loadPublicApi()
      .then((d) => {
        if (Array.isArray(d.goals)) {
          setGoals((d.goals as PublicGoal[]).sort((a, b) => a.sortOrder - b.sortOrder));
        }
        if (Array.isArray(d.classes)) {
          setPublicClasses(d.classes as PublicClass[]);
        }
        if (Array.isArray(d.healthQuestions)) {
          setHealthQuestions(
            (d.healthQuestions as PublicHealthQuestion[]).sort((a, b) => a.sortOrder - b.sortOrder),
          );
        }
        if (Array.isArray(d.memberships) && d.memberships.length > 0) {
          const subscriptions = (d.memberships as PublicMembership[])
            .filter((mb) => mb.kind === "subscription")
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          setPlans(
            subscriptions.map((mb, i) => ({
              id: mb.id,
              name: mb.name,
              price: mb.price,
              priceBefore: mb.priceBefore ?? null,
              priceAfter: mb.priceAfter ?? null,
              image: mb.image ?? null,
              sortOrder: mb.sortOrder ?? 0,
              durationDays: mb.durationDays,
              cycle: mb.cycle,
              sessionsCount: mb.sessionsCount,
              features: Array.isArray(mb.features) ? mb.features : [],
              color: PLAN_COLORS[i % PLAN_COLORS.length],
              popular: i === 1,
              goalIds: Array.isArray(mb.goalIds) ? mb.goalIds : [],
            })),
          );
        }
        if (d.paymentSettings && typeof d.paymentSettings === "object") {
          setMembershipPaymentSettings((prev) => ({ ...prev, ...(d.paymentSettings as PublicPaymentSettings) }));
        }
      })
      .catch(() => {});
  }, []);

  const rootGoals = useMemo(() => goals.filter((goal) => !goal.parentId), [goals]);
  const gamesRoot = useMemo(() => rootGoals.find((goal) => goal.kind === "games_root"), [rootGoals]);
  const gamesChildren = useMemo(
    () => goals.filter((goal) => goal.parentId && goal.parentId === gamesRoot?.id),
    [goals, gamesRoot?.id],
  );
  const gamesChildIds = useMemo(() => gamesChildren.map((goal) => goal.id), [gamesChildren]);
  const goalsByParent = useMemo(() => {
    const map = new Map<string, PublicGoal[]>();
    goals.forEach((goal) => {
      if (!goal.parentId) return;
      const list = map.get(goal.parentId) ?? [];
      list.push(goal);
      map.set(goal.parentId, list);
    });
    return map;
  }, [goals]);
  const goalViewParent = useMemo(
    () => (goalViewParentId ? goals.find((goal) => goal.id === goalViewParentId) ?? null : null),
    [goals, goalViewParentId],
  );
  const goalViewChildren = useMemo(() => {
    if (!goalViewParentId) return [];
    return (goalsByParent.get(goalViewParentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [goalsByParent, goalViewParentId]);
  const displayGoals = useMemo(() => {
    if (rootGoals.length === 0) return [];
    if (goalViewParentId) return goalViewChildren;
    const expanded = new Set(selectedGoals);
    const children = Array.from(expanded)
      .flatMap((id) => goalsByParent.get(id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return [...rootGoals, ...children];
  }, [rootGoals, goalsByParent, selectedGoals, goalViewParentId, goalViewChildren]);

  const toggleGoal = (goalId: string) => {
    const hasChildren = (goalsByParent.get(goalId) ?? []).length > 0;
    if (!goalViewParentId && hasChildren) {
      setGoalViewParentId(goalId);
      setSelectedGoals([]);
      return;
    }
    setSelectedGoals((prev) => {
      const exists = prev.includes(goalId);
      if (!exists) return [...prev, goalId];
      const next = prev.filter((id) => id !== goalId);
      const childIds = goalsByParent.get(goalId)?.map((item) => item.id) ?? [];
      const cleaned = childIds.length > 0 ? next.filter((id) => !childIds.includes(id)) : next;
      if (gamesRoot && goalId === gamesRoot.id) {
        return cleaned.filter((id) => !gamesChildIds.includes(id));
      }
      return cleaned;
    });
    setTimeout(() => {
      plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const filteredPlans = useMemo(() => {
    if (selectedGoals.length === 0) return [];
    const byGoal = plans.filter((plan) => {
      const ids = plan.goalIds ?? [];
      if (ids.length === 0) return true;
      return ids.some((id) => selectedGoals.includes(id));
    });
    if (tab === "all") return byGoal;
    return byGoal.filter((plan) => (plan.cycle ?? "custom") === tab);
  }, [plans, selectedGoals, tab]);

  const surveyBlockedTypes = useMemo(() => {
    const blocked = new Set<string>();
    healthQuestions.forEach((question) => {
      if (surveyAnswers[question.id]) {
        question.restrictedClassTypes.forEach((type) => {
          const key = normalizeClassTypeKey(type);
          if (key) blocked.add(key);
        });
      }
    });
    return Array.from(blocked);
  }, [healthQuestions, surveyAnswers]);

  const scheduleChoices = useMemo(() => {
    const blocked = new Set(surveyBlockedTypes.map((t) => normalizeClassTypeKey(t)));
    const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
    const rows: {
      id: string;
      className: string;
      trainer: string;
      showTrainerName: boolean;
      day: string;
      time: string;
      date: string;
      type: string;
      subType: string | null;
      availableSpots: number;
    }[] = [];
    publicClasses.forEach((c) => {
      const typeKey = normalizeClassTypeKey(c.type ?? "");
      if (typeKey && blocked.has(typeKey)) return;
      (c.schedules || []).forEach((s) => {
        const date = new Date(s.date);
        if (Number.isNaN(date.getTime())) return;
        rows.push({
          id: s.id,
          className: c.name,
          trainer: c.trainer,
          showTrainerName: c.showTrainerName !== false,
          day: dayNames[date.getDay()] ?? "الأحد",
          time: s.time,
          date: s.date,
          type: c.type,
          subType: c.subType ?? null,
          availableSpots: s.availableSpots ?? c.maxSpots,
        });
      });
    });
    rows.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return a.time.localeCompare(b.time);
    });
    return rows;
  }, [publicClasses, surveyBlockedTypes]);

  const parseScheduleTime = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    return (h || 0) * 60 + (m || 0);
  };

  const formatScheduleTimeLabel = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    const hour = Number.isNaN(h) ? 0 : h;
    const minute = Number.isNaN(m) ? 0 : m;
    const period = hour < 12 ? "صباحًا" : hour < 16 ? "ظهرًا" : "مساءً";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(displayHour).padStart(2, "0")}.${String(minute).padStart(2, "0")} ${period}`;
  };

  const scheduleSlots = useMemo(() => {
    const times = Array.from(new Set(scheduleChoices.map((item) => item.time)));
    return times.sort((a, b) => parseScheduleTime(a) - parseScheduleTime(b));
  }, [scheduleChoices]);

  const scheduleSplit = useMemo(() => {
    const cutoff = 15 * 60;
    const morning = scheduleSlots.filter((slot) => parseScheduleTime(slot) < cutoff);
    const evening = scheduleSlots.filter((slot) => parseScheduleTime(slot) >= cutoff);
    return { morning, evening };
  }, [scheduleSlots]);

  const scheduleDays = useMemo(() => {
    const daySet = new Set(scheduleChoices.map((item) => item.day));
    const order = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
    return order.filter((day) => daySet.has(day));
  }, [scheduleChoices]);

  const toggleScheduleSelection = (entry: { id: string; day: string; time: string }, disabled: boolean) => {
    if (disabled) return;
    setScheduleError(null);
    setScheduleSelections((prev) => {
      const sameSlotIds = scheduleChoices
        .filter((item) => item.day === entry.day && item.time === entry.time)
        .map((item) => item.id);
      const exists = prev.includes(entry.id);
      if (exists) {
        return prev.filter((id) => id !== entry.id);
      }
      const cleaned = prev.filter((id) => !sameSlotIds.includes(id));
      const limit = schedulePlan?.sessionsCount ?? null;
      if (limit && cleaned.length >= limit) {
        setScheduleError(`يمكنك اختيار ${limit} موعد كحد أقصى لهذه الباقة.`);
        return prev;
      }
      return [...cleaned, entry.id];
    });
  };

  const openSurvey = (plan: PlanItem) => {
    if (healthQuestions.length === 0) {
      setSchedulePlan(plan);
      setScheduleSelections([]);
      setScheduleError(null);
      return;
    }
    const initialAnswers: Record<string, boolean | null> = {};
    healthQuestions.forEach((question) => {
      initialAnswers[question.id] = surveyAnswers[question.id] ?? null;
    });
    setSurveyAnswers(initialAnswers);
    setSurveyError(null);
    setSurveyPlan(plan);
  };

  const handleSurveyContinue = async () => {
    if (!surveyPlan) return;
    const unanswered = healthQuestions.some((question) => surveyAnswers[question.id] == null);
    if (unanswered) {
      setSurveyError("يرجى الإجابة على جميع الأسئلة قبل المتابعة.");
      return;
    }
    setSurveyError(null);
    const plan = surveyPlan;
    setSurveyPlan(null);
    setSchedulePlan(plan);
    setScheduleSelections([]);
    setScheduleError(null);
  };

  const validateDiscount = async (membershipId?: string) => {
    const code = discountCode.trim().toUpperCase();
    if (!code) return;
    setDiscountValidating(true);
    setDiscountError(null);
    setDiscountResult(null);
    try {
      const params = new URLSearchParams({ code });
      if (membershipId) params.set("membershipId", membershipId);
      const res = await fetch(`/api/discount/validate?${params.toString()}`);
      const data = await res.json() as { valid?: boolean; error?: string; id?: string; type?: string; value?: number; discountAmount?: number | null; description?: string | null };
      if (!res.ok || !data.valid) {
        setDiscountError(data.error || t("كود الخصم غير صالح.", "Invalid discount code."));
      } else {
        setDiscountResult({ id: data.id!, type: data.type!, value: data.value!, discountAmount: data.discountAmount ?? null, description: data.description });
      }
    } catch {
      setDiscountError(t("تعذر التحقق من الكود.", "Could not validate the code."));
    } finally {
      setDiscountValidating(false);
    }
  };

  const handleSubscribe = async (plan: PlanItem, scheduleIds: string[] = [], paymentOverride?: "instapay" | "vodafone_cash") => {
    if (!plan.id) { navigate("register"); return; }
    setSubscribing(plan.id);
    setSubMsg(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: plan.id, scheduleIds, paymentMethod: paymentOverride ?? membershipPayMethod, discountCode: discountResult ? discountCode.trim().toUpperCase() : null }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 401) {
        setSubMsg({ text: "⚠️ يجب تسجيل الدخول أولاً يابطلة للاشتراك — جارٍ تحويلك لصفحة الدخول...", ok: false });
        setTimeout(() => {
          window.location.href = `/login?callbackUrl=${encodeURIComponent("/?page=memberships")}`;
        }, 1500);
        return;
      }
      const data = await res.json() as { error?: string; needsVerification?: boolean; checkoutUrl?: string; transactionId?: string | null };
      if (!res.ok) {
        if (data.needsVerification) {
          setVerifyModal({ plan });
          setVerifyCode(""); setVerifyMsg(null);
          // أرسل كود تفعيل تلقائياً
          fetch("/api/auth/resend-verification", { method: "POST" }).catch(() => {});
        } else {
          setSubMsg({ text: data.error || "حدث خطأ", ok: false });
        }
        return;
      }
      setSubMsg({ text: `✅ تم الاشتراك في باقة ${plan.name} بنجاح!`, ok: true });
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        if (data.transactionId) {
          window.open(`/payment/verify?transactionId=${data.transactionId}`, "_blank", "noopener,noreferrer");
        }
      }
      setTimeout(() => { window.location.href = "/account"; }, 1500);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        setSubMsg({ text: "انتهت مهلة الاتصال، حاولي مرة أخرى", ok: false });
      } else {
        setSubMsg({ text: "تعذر الاتصال بالخادم", ok: false });
      }
    } finally {
      setSubscribing(null);
    }
  };

  const handleScheduleConfirm = async () => {
    if (!schedulePlan) return;
    const limit = schedulePlan.sessionsCount ?? null;
    if (limit && scheduleSelections.length > limit) {
      setScheduleError(`يمكنك اختيار ${limit} موعد كحد أقصى لهذه الباقة.`);
      return;
    }
    if (scheduleChoices.length > 0 && scheduleSelections.length === 0) {
      setScheduleError("اختاري مواعيد مناسبة قبل تأكيد الاشتراك.");
      return;
    }
    const plan = schedulePlan;
    const selected = [...scheduleSelections];
    setSchedulePlan(null);
    setScheduleError(null);
    setScheduleSelections([]);
    await handleSubscribe(plan, selected, membershipPayMethod);
  };

  const handleVerify = async () => {
    if (!verifyCode.trim() || verifyLoading) return;
    setVerifyLoading(true);
    setVerifyMsg(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: verifyCode.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setVerifyMsg({ text: data.error || t("كود غير صحيح", "Invalid code"), ok: false }); return; }
      setVerifyMsg({ text: t("✅ تم تفعيل حسابك بنجاح! جارٍ الاشتراك...", "✅ Your account has been verified successfully. Completing subscription..."), ok: true });
      // Retry the subscription automatically after verification.
      const pendingPlan = verifyModal?.plan;
      setVerifyModal(null);
      if (pendingPlan) setTimeout(() => handleSubscribe(pendingPlan), 800);
    } catch {
      setVerifyMsg({ text: t("تعذر الاتصال بالخادم", "Could not reach the server"), ok: false });
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST" });
      setVerifyMsg({ text: t("تم إرسال كود جديد إلى بريدك الإلكتروني", "A new code has been sent to your email"), ok: true });
      setResendCooldown(60);
      const interval = setInterval(() => setResendCooldown(p => { if (p <= 1) { clearInterval(interval); return 0; } return p - 1; }), 1000);
    } catch {
      setVerifyMsg({ text: t("تعذر إرسال الكود", "Could not send the code"), ok: false });
    } finally {
      setResendLoading(false);
    }
  };

  const faqs = [
    { q: "هل يمكن إلغاء الاشتراك في أي وقت؟", a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. سيستمر الاشتراك حتى نهاية الفترة المدفوعة." },
    { q: "كيف أحجز الكلاسات؟", a: "بعد الاشتراك، يمكنك الحجز مباشرة من صفحة الجدول الأسبوعي أو من تفاصيل الكلاس." },
    { q: "هل يمكن تجميد الاشتراك؟", a: "نعم، نتيح تجميد الاشتراك لمدة تصل إلى شهرين في السنة." },
    { q: "ما طرق الدفع المتاحة؟", a: "نقبل النقدي، بطاقات الدفع، إنستاباي، والمحفظة الرقمية." },
    { q: "هل يوجد كلاسات للأطفال؟", a: "نعم! لدينا برامج مخصصة للأطفال من سن 4 سنوات فأكثر." },
  ];
  const primaryPlan = filteredPlans[0] ?? plans[0];

  return (
    <div>
      {surveyPlan && (
        <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(233,30,99,.12)", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 680, width: "100%", boxShadow: "0 24px 60px rgba(233,30,99,.2)", border: `1px solid ${C.border}`, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontWeight: 900, fontSize: 20, color: C.white }}>استبيان الإصابات</h2>
              <button onClick={() => setSurveyPlan(null)} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: C.gray }}>×</button>
            </div>
            <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.8, marginBottom: 18 }}>
              أجيبي على الأسئلة التالية لنحدد الكلاسات المناسبة لك قبل الاشتراك.
            </p>

            <div style={{ display: "grid", gap: 12 }}>
              {healthQuestions.map((question) => {
                const answer = surveyAnswers[question.id];
                return (
                  <div key={question.id} className="card" style={{ padding: 16 }}>
                    <div style={{ fontWeight: 800, color: C.white, marginBottom: 6 }}>{question.title}</div>
                    <div style={{ color: C.gray, fontSize: 13, lineHeight: 1.7 }}>{question.prompt}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => setSurveyAnswers((prev) => ({ ...prev, [question.id]: true }))}
                        className="btn-outline"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          borderColor: answer === true ? C.red : C.border,
                          color: answer === true ? C.red : C.gray,
                          background: answer === true ? "rgba(233,30,99,.08)" : "transparent",
                          fontSize: 12,
                        }}
                      >
                        نعم
                      </button>
                      <button
                        onClick={() => setSurveyAnswers((prev) => ({ ...prev, [question.id]: false }))}
                        className="btn-outline"
                        style={{
                          padding: "6px 14px",
                          borderRadius: 999,
                          borderColor: answer === false ? C.red : C.border,
                          color: answer === false ? C.red : C.gray,
                          background: answer === false ? "rgba(233,30,99,.08)" : "transparent",
                          fontSize: 12,
                        }}
                      >
                        لا
                      </button>
                    </div>
                    {answer === true && question.restrictedClassTypes.length > 0 ? (
                      <div style={{ marginTop: 10, fontSize: 12, color: C.red }}>
                        الكلاسات الممنوعة: {question.restrictedClassTypes.map(formatClassType).join("، ")}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {surveyBlockedTypes.length > 0 ? (
              <div className="card" style={{ marginTop: 18, padding: 14, background: "rgba(233,30,99,.06)" }}>
                <div style={{ fontWeight: 800, color: C.white, marginBottom: 6 }}>ملخص الكلاسات الممنوعة</div>
                <div style={{ color: C.gray, fontSize: 13 }}>
                  {surveyBlockedTypes.map(formatClassType).join("، ")}
                </div>
              </div>
            ) : null}

            {surveyError ? (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: "#fee2e2", color: "#991b1b", fontWeight: 700, fontSize: 13 }}>
                {surveyError}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={() => setSurveyPlan(null)} className="btn-outline" style={{ padding: "8px 18px" }}>
                رجوع
              </button>
              <button onClick={() => void handleSurveyContinue()} className="btn-primary" style={{ padding: "8px 18px" }}>
                متابعة للاشتراك
              </button>
            </div>
          </div>
        </div>
      )}

      {schedulePlan && (
        <div style={{ position: "fixed", inset: 0, zIndex: 210, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(15,10,12,.72)", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "#111", borderRadius: 22, padding: 28, maxWidth: 860, width: "100%", boxShadow: "0 24px 60px rgba(0,0,0,.45)", border: "1px solid rgba(255,255,255,.12)", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={{ fontWeight: 900, fontSize: 20, color: "#fff" }}>اختاري مواعيدك المناسبة</h2>
                <p style={{ color: "#c9b9c1", fontSize: 13, marginTop: 4 }}>
                  المواعيد المعروضة تستبعد الكلاسات الممنوعة حسب الاستبيان.
                </p>
              </div>
              <button onClick={() => setSchedulePlan(null)} style={{ border: "none", background: "none", fontSize: 22, cursor: "pointer", color: "#c9b9c1" }}>×</button>
            </div>

            {surveyBlockedTypes.length > 0 && (
              <div style={{ background: "rgba(233,30,99,.08)", border: "1px solid rgba(233,30,99,.25)", borderRadius: 10, padding: 12, color: "#ffb7d0", fontSize: 12, marginBottom: 16 }}>
                الكلاسات المستبعدة: {surveyBlockedTypes.map(formatClassType).join("، ")}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ color: "#f5c542", fontWeight: 800, fontSize: 13 }}>
                {schedulePlan.sessionsCount ? `يمكنك اختيار ${schedulePlan.sessionsCount} موعد` : "اختاري المواعيد المناسبة لك"}
              </div>
              <div style={{ color: "#fff", fontSize: 12 }}>
                تم اختيار {scheduleSelections.length}
              </div>
            </div>

              {scheduleChoices.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#c9b9c1" }}>
                  لا توجد مواعيد متاحة حاليًا، يمكنك المتابعة وسيتم التنسيق لاحقًا من الإدارة.
                </div>
              ) : (
                <>
                  {scheduleSplit.morning.length > 0 && (
                    <div className="schedule-block">
                      <div className="schedule-block-title">الجدول الصباحي</div>
                      <div className="schedule-scroll" style={{ direction: "ltr" }}>
                        <div
                          className="schedule-grid"
                          style={{
                            gridTemplateColumns: `${scheduleSplit.morning
                              .map(() => "minmax(130px, 1fr)")
                              .join(" ")} 120px`,
                          }}
                        >
                          {scheduleSplit.morning.map((slot) => (
                            <div key={`morning-head-${slot}`} className="schedule-cell time sticky">
                              {formatScheduleTimeLabel(slot)}
                            </div>
                          ))}
                          <div className="schedule-cell sticky day-head">اليوم</div>
                          {scheduleDays.map((day) => (
                            <div key={`morning-row-${day}`} style={{ display: "contents" }}>
                              {scheduleSplit.morning.map((slot) => {
                                const cellEntries = scheduleChoices.filter(
                                  (entry) => entry.day === day && entry.time === slot
                                );
                                return (
                                  <div key={`${day}-morning-${slot}`} className="schedule-cell">
                                    {cellEntries.length === 0 ? (
                                      <div className="schedule-empty">—</div>
                                    ) : (
                                      <div className="schedule-slot-box">
                                        {cellEntries.length > 1 ? (
                                          <div className="schedule-item-tag" style={{ color: "#ffb7d0" }}>
                                            اختاري كلاس واحد فقط لهذا الموعد
                                          </div>
                                        ) : null}
                                        {cellEntries.map((entry) => {
                                          const selected = scheduleSelections.includes(entry.id);
                                          const disabled = entry.availableSpots <= 0;
                                          return (
                                            <button
                                              key={entry.id}
                                              onClick={() => toggleScheduleSelection(entry, disabled)}
                                              className={`schedule-slot-item${selected ? " selected" : ""}${
                                                disabled ? " disabled" : ""
                                              }`}
                                            >
                                              <div className="schedule-item-title">{entry.className}</div>
                                              {entry.showTrainerName ? (
                                                <div className="schedule-item-sub" style={{ color: "#fff" }}>
                                                  {entry.trainer}
                                                </div>
                                              ) : null}
                                              <div className="schedule-item-tag">
                                                {formatClassType(entry.type)}
                                                {entry.subType ? ` - ${entry.subType}` : ""}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <div className="schedule-cell day">{day}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {scheduleSplit.evening.length > 0 && (
                    <div className="schedule-block">
                      <div className="schedule-block-title">الجدول المسائي</div>
                      <div className="schedule-scroll" style={{ direction: "ltr" }}>
                        <div
                          className="schedule-grid"
                          style={{
                            gridTemplateColumns: `${scheduleSplit.evening
                              .map(() => "minmax(130px, 1fr)")
                              .join(" ")} 120px`,
                          }}
                        >
                          {scheduleSplit.evening.map((slot) => (
                            <div key={`evening-head-${slot}`} className="schedule-cell time sticky">
                              {formatScheduleTimeLabel(slot)}
                            </div>
                          ))}
                          <div className="schedule-cell sticky day-head">اليوم</div>
                          {scheduleDays.map((day) => (
                            <div key={`evening-row-${day}`} style={{ display: "contents" }}>
                              {scheduleSplit.evening.map((slot) => {
                                const cellEntries = scheduleChoices.filter(
                                  (entry) => entry.day === day && entry.time === slot
                                );
                                return (
                                  <div key={`${day}-evening-${slot}`} className="schedule-cell">
                                    {cellEntries.length === 0 ? (
                                      <div className="schedule-empty">—</div>
                                    ) : (
                                      <div className="schedule-slot-box">
                                        {cellEntries.length > 1 ? (
                                          <div className="schedule-item-tag" style={{ color: "#ffb7d0" }}>
                                            اختاري كلاس واحد فقط لهذا الموعد
                                          </div>
                                        ) : null}
                                        {cellEntries.map((entry) => {
                                          const selected = scheduleSelections.includes(entry.id);
                                          const disabled = entry.availableSpots <= 0;
                                          return (
                                            <button
                                              key={entry.id}
                                              onClick={() => toggleScheduleSelection(entry, disabled)}
                                              className={`schedule-slot-item${selected ? " selected" : ""}${
                                                disabled ? " disabled" : ""
                                              }`}
                                            >
                                              <div className="schedule-item-title">{entry.className}</div>
                                              {entry.showTrainerName ? (
                                                <div className="schedule-item-sub" style={{ color: "#fff" }}>
                                                  {entry.trainer}
                                                </div>
                                              ) : null}
                                              <div className="schedule-item-tag">
                                                {formatClassType(entry.type)}
                                                {entry.subType ? ` - ${entry.subType}` : ""}
                                              </div>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <div className="schedule-cell day">{day}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

            <div className="card" style={{ marginTop: 18, padding: 16, background: "rgba(255,255,255,.04)" }}>
              <div style={{ fontWeight: 800, color: "#fff", marginBottom: 8 }}>طريقة الدفع</div>
              <div style={{ display: "grid", gap: 10 }}>
                {[
                  {
                    id: "instapay",
                    label: getDefaultAccount(
                      membershipPaymentSettings.instapayAccounts,
                      membershipPaymentSettings.instapayLabel || "InstaPay",
                      membershipPaymentSettings.instapayUrl,
                    ).label,
                  },
                  {
                    id: "vodafone_cash",
                    label: getDefaultAccount(
                      membershipPaymentSettings.vodafoneCashAccounts,
                      membershipPaymentSettings.vodafoneCashLabel || "Vodafone Cash",
                      membershipPaymentSettings.vodafoneCashUrl,
                    ).label,
                  },
                ].map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    onClick={() => setMembershipPayMethod(method.id as "instapay" | "vodafone_cash")}
                    className={`schedule-slot-item${membershipPayMethod === method.id ? " selected" : ""}`}
                    style={{ textAlign: "right" }}
                  >
                    <div className="schedule-item-title">{method.label}</div>
                    <div className="schedule-item-sub">الدفع يتم عبر الهاتف بعد تأكيد الاشتراك.</div>
                  </button>
                ))}
              </div>
            </div>

            {scheduleError && (
              <div style={{ marginTop: 12, color: "#ff9aa5", fontSize: 12, fontWeight: 700 }}>
                {scheduleError}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setSchedulePlan(null)} className="btn-outline" style={{ padding: "8px 18px" }}>
                رجوع
              </button>
              <button className="btn-primary" onClick={handleScheduleConfirm}>
                تأكيد الاشتراك
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─ VERIFY EMAIL MODAL ─ */}
      {verifyModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(233,30,99,.1)", backdropFilter: "blur(6px)" }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 24px 60px rgba(233,30,99,.2)", border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📧</div>
            <h2 style={{ fontWeight: 900, fontSize: 22, color: C.white, marginBottom: 8 }}>تفعيل الحساب أولاً</h2>
            <p style={{ color: C.gray, fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              تم إرسال كود التفعيل إلى بريدك الإلكتروني.<br />
              أدخل الكود للمتابعة والاشتراك في باقة <strong style={{ color: C.red }}>{verifyModal.plan.name}</strong>
            </p>
            <input
              value={verifyCode}
              onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handleVerify()}
              placeholder="xxxxxx"
              maxLength={6}
              dir="ltr"
              style={{ width: "100%", textAlign: "center", fontSize: 28, fontWeight: 900, letterSpacing: 8, padding: "12px 16px", borderRadius: 12, border: `2px solid ${verifyCode.length === 6 ? C.red : C.border}`, outline: "none", marginBottom: 16, color: C.white, transition: "border .2s" }}
            />
            {verifyMsg && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: verifyMsg.ok ? "#dcfce7" : "#fee2e2", color: verifyMsg.ok ? "#166534" : "#991b1b", fontWeight: 700, fontSize: 13 }}>
                {verifyMsg.text}
              </div>
            )}
            <button
              onClick={handleVerify}
              disabled={verifyLoading || verifyCode.length < 4}
              style={{ width: "100%", background: `linear-gradient(135deg, ${C.red}, ${C.redLight})`, color: "#fff", border: "none", borderRadius: 12, padding: "13px 0", fontWeight: 900, fontSize: 16, cursor: verifyLoading || verifyCode.length < 4 ? "not-allowed" : "pointer", opacity: verifyLoading || verifyCode.length < 4 ? 0.6 : 1, marginBottom: 12, transition: "opacity .2s", fontFamily: "'Cairo', sans-serif" }}
            >
              {verifyLoading ? "جارٍ التفعيل..." : "تفعيل وإتمام الاشتراك"}
            </button>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                onClick={handleResend}
                disabled={resendLoading || resendCooldown > 0}
                style={{ background: "none", border: "none", color: resendCooldown > 0 ? C.gray : C.red, fontSize: 13, fontWeight: 600, cursor: resendCooldown > 0 ? "default" : "pointer", fontFamily: "'Cairo', sans-serif" }}
              >
                {resendCooldown > 0 ? `إعادة الإرسال بعد ${resendCooldown}ث` : "إعادة إرسال الكود"}
              </button>
              <button
                onClick={() => setVerifyModal(null)}
                style={{ background: "none", border: "none", color: C.gray, fontSize: 13, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "64px 0" }}>
        <div className="container" style={{ textAlign: "center" }}>
          <span className="tag" style={{ marginBottom: 16, display: "inline-block" }}>الأهداف والاشتراكات</span>
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 44, fontWeight: 900, marginBottom: 12, color: C.white }}>اختاري <span style={{ color: C.red }}>هدفك واشتراكك</span></h1>
          <p style={{ color: C.gray, fontSize: 16, marginBottom: 32 }}>اختاري هدفك أولًا ثم الاشتراك المناسب لك.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button className={`tab ${tab === "all" ? "active" : ""}`} onClick={() => setTab("all")}>الكل</button>
            <button className={`tab ${tab === "monthly" ? "active" : ""}`} onClick={() => setTab("monthly")}>شهري</button>
            <button className={`tab ${tab === "quarterly" ? "active" : ""}`} onClick={() => setTab("quarterly")}>ربع سنوي</button>
            <button className={`tab ${tab === "semi_annual" ? "active" : ""}`} onClick={() => setTab("semi_annual")}>نصف سنوي</button>
            <button className={`tab ${tab === "annual" ? "active" : ""}`} onClick={() => setTab("annual")}>سنوي</button>
            <button className={`tab ${tab === "custom" ? "active" : ""}`} onClick={() => setTab("custom")}>مخصص</button>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 className="section-title">
              {goalViewParentId ? <>اختاري هدفك <span>الفرعي</span></> : <>اختاري هدفك <span>الرياضي</span></>}
            </h2>
            <p className="section-sub">
              {goalViewParentId
                ? `أهداف ${goalViewParent?.name ?? "مختارة"} — اختاري هدفًا فرعيًا لعرض الاشتراكات المناسبة.`
                : "يمكنك اختيار أكثر من هدف لعرض الاشتراكات المناسبة لكل هدف."}
            </p>
            {goalViewParentId && (
              <button
                className="btn-outline"
                style={{ marginTop: 10 }}
                onClick={() => {
                  setGoalViewParentId(null);
                  setSelectedGoals([]);
                }}
              >
                رجوع لكل الأهداف
              </button>
            )}
          </div>

          {goals.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: "center", color: C.gray }}>
              جاري تحميل الأهداف...
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 16 }}>
                {displayGoals.map((goal) => {
                  const active = selectedGoals.includes(goal.id);
                  const hasChildren = !goal.parentId && (goalsByParent.get(goal.id)?.length ?? 0) > 0;
                  return (
                    <button
                      key={goal.id}
                      onClick={() => {
                        if (hasChildren) {
                          setGoalViewParentId(goal.id);
                          setSelectedGoals([]);
                          return;
                        }
                        toggleGoal(goal.id);
                      }}
                      className="card card-hover"
                      style={{
                        border: active ? `2px solid ${C.red}` : `1px solid ${C.border}`,
                        padding: 14,
                        textAlign: "center",
                        background: active ? "rgba(233,30,99,.08)" : C.bgCard,
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ height: 120, borderRadius: 12, overflow: "hidden", marginBottom: 12, background: "rgba(233,30,99,.08)" }}>
                        {goal.image ? (
                          <img src={goal.image} alt={goal.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.gray, fontWeight: 700 }}>
                            {goal.name}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 14, color: C.white }}>{goal.name}</div>
                      {goal.description ? <div style={{ marginTop: 6, color: C.gray, fontSize: 12 }}>{goal.description}</div> : null}
                    </button>
                  );
                })}
              </div>

                {null}
              </>
            )}
        </div>
      </section>

      <section className="section" ref={plansRef}>
        <div className="container">
          {subMsg && (
            <div style={{ marginBottom: 20, padding: "14px 20px", borderRadius: 8, background: subMsg.ok ? "#dcfce7" : "#fee2e2", color: subMsg.ok ? "#166534" : "#991b1b", fontWeight: 700, textAlign: "center", fontSize: 14 }}>
              {subMsg.text}
            </div>
          )}
          {/* Discount Code Box */}
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                className="input"
                style={{ flex: 1, textTransform: "uppercase" }}
                placeholder={t("كود الخصم (اختياري)", "Discount code (optional)")}
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value.toUpperCase());
                  setDiscountResult(null);
                  setDiscountError(null);
                }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); validateDiscount(); } }}
              />
              <button
                className="btn-outline"
                style={{ whiteSpace: "nowrap", padding: "10px 20px" }}
                onClick={() => validateDiscount()}
                disabled={discountValidating || !discountCode.trim()}
              >
                {discountValidating ? t("...", "...") : t("تطبيق", "Apply")}
              </button>
            </div>
            {discountResult && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "#dcfce7", color: "#166534", fontSize: 13, fontWeight: 700, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  ✅ {t("تم تطبيق الخصم:", "Discount applied:")} {discountResult.type === "percentage" ? `${discountResult.value}%` : `${discountResult.value} ${t("جنيه", "EGP")}`}
                  {discountResult.discountAmount != null && ` — ${t("توفيري", "You save")} ${discountResult.discountAmount} ${t("جنيه", "EGP")}`}
                </span>
                <button onClick={() => { setDiscountResult(null); setDiscountCode(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#166534", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
            )}
            {discountError && (
              <div style={{ padding: "8px 14px", borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontSize: 13, fontWeight: 600 }}>
                ⚠️ {discountError}
              </div>
            )}
          </div>

          {selectedGoals.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: "center", color: C.gray }}>
              {goalViewParentId
                ? t("اختاري هدفًا فرعيًا لعرض الاشتراكات المناسبة.", "Select a sub-goal to see suitable plans.")
                : t("اختاري هدفًا أو أكثر لعرض الاشتراكات المناسبة.", "Select one or more goals to see suitable plans.")}
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: "center", color: C.gray }}>
              لا توجد اشتراكات مرتبطة بالأهداف المختارة حالياً.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr 1fr", "repeat(4, 1fr)", "repeat(4, 1fr)"), gap: 24 }}>
              {filteredPlans.map((p) => {
                const before = p.priceBefore ?? null;
                const after = p.priceAfter ?? p.price;
                const hasDiscount = before != null && before > after;
                const discountPercent = hasDiscount ? Math.round((1 - after / before) * 100) : null;
                return (
                  <div
                    key={p.name}
                    className="card"
                    style={{
                      padding: 0,
                      position: "relative",
                      border: p.popular ? `2px solid ${C.red}` : `1px solid ${C.border}`,
                      boxShadow: "0 18px 45px rgba(233,30,99,.12)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "28px 24px 18px",
                        background: `linear-gradient(135deg, rgba(233,30,99,.12), rgba(255,255,255,.6))`,
                        borderBottom: `1px solid ${C.border}`,
                        position: "relative",
                      }}
                    >
                      {p.popular && (
                        <div style={{ position: "absolute", top: 16, left: 16, background: C.red, color: "#fff", padding: "4px 14px", borderRadius: 999, fontSize: 11, fontWeight: 800 }}>
                          الأكثر شعبية
                        </div>
                      )}
                      {hasDiscount && discountPercent != null ? (
                        <div style={{ position: "absolute", top: 10, right: 16, background: C.gold, color: "#000", padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800 }}>
                          خصم {discountPercent}%
                        </div>
                      ) : null}
                      {p.image ? (
                        <div style={{ height: 140, borderRadius: 14, overflow: "hidden", marginBottom: 14, border: `1px solid ${C.border}` }}>
                          <img src={p.image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ) : null}
                      <h3 style={{ fontWeight: 900, fontSize: 20, color: C.white, marginBottom: 10 }}>{p.name}</h3>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 38, fontWeight: 900, color: p.color }}>{formatCurrency(after)}</span>
                        <span style={{ color: C.gray, fontSize: 12 }}>{cycleLabel(p.cycle, p.durationDays)}</span>
                      </div>
                      {hasDiscount ? (
                        <div style={{ marginTop: 6, color: C.grayDark, fontSize: 12, textDecoration: "line-through" }}>
                          {formatCurrency(before)} ج.م
                        </div>
                      ) : null}
                    </div>

                    <div style={{ padding: "18px 24px 22px" }}>
                      <div style={{ display: "flex", gap: 12, color: C.gray, fontSize: 12, marginBottom: 12, flexWrap: "wrap" }}>
                        {p.sessionsCount ? <span>عدد الحصص: {p.sessionsCount}</span> : null}
                        <span>المدة: {p.durationDays} يوم</span>
                      </div>
                      {p.features.map((feat, fi) => (
                        <div key={fi} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px dashed ${C.border}`, fontSize: 12 }}>
                          <span style={{ color: p.color, fontWeight: 900, fontSize: 14 }}>✓</span>
                          <span style={{ color: C.grayLight }}>{feat}</span>
                        </div>
                      ))}
                      <button
                        onClick={() => openSurvey(p)}
                        disabled={p.id !== null && subscribing === p.id}
                        className="btn-primary"
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          marginTop: 18,
                          background: p.popular ? C.red : "transparent",
                          border: `2px solid ${p.color}`,
                          color: p.popular ? "#fff" : p.color,
                          fontFamily: "'Cairo', sans-serif",
                          padding: "10px",
                          borderRadius: 10,
                          fontSize: 13,
                          fontWeight: 800,
                          cursor: (p.id !== null && subscribing === p.id) ? "not-allowed" : "pointer",
                          transition: "all .2s",
                          opacity: (p.id !== null && subscribing === p.id) ? 0.7 : 1,
                          boxShadow: p.popular ? "0 10px 25px rgba(233,30,99,.25)" : "none",
                        }}
                      >
                        {(p.id !== null && subscribing === p.id) ? "جارٍ الاشتراك..." : "اشتركي الآن"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="section" style={{ background: C.bgCard }}>
        <div className="container" style={{ maxWidth: 700, margin: "0 auto" }}>
          <h2 className="section-title" style={{ textAlign: "center", marginBottom: 32 }}>الأسئلة <span>الشائعة</span></h2>
          {faqs.map((f, i) => (
            <div key={i} className="card" style={{ marginBottom: 10, padding: 0 }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", background: "none", border: "none", padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 14, color: C.white, textAlign: "right" }}>
                {f.q} <I n={openFaq === i ? "minus" : "plus"} s={16} c={C.red} />
              </button>
              {openFaq === i && <div style={{ padding: "0 20px 18px", color: C.gray, lineHeight: 1.8, fontSize: 13 }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </section>

      <div style={{ position: viewportWidth() < 768 ? "static" : "sticky", bottom: 0, background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "14px 0", zIndex: 50 }}>
        <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
          <p style={{ fontWeight: 600, color: C.gray, fontSize: 14 }}>مستعدة تبدئي رحلتك مع فيت زون؟</p>
          <button
            className="btn-primary"
            style={{ padding: "10px 32px", opacity: selectedGoals.length === 0 || !primaryPlan ? 0.6 : 1 }}
            onClick={() => {
              setSubMsg({ text: "برجاء الضغط على الاشتراك المفضل لديكِ للاستكمال.", ok: false });
              setTimeout(() => {
                plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 50);
            }}
            disabled={selectedGoals.length === 0 || !primaryPlan}
          >
            ابدئي الآن
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── OFFERS PAGE ──────────────────────────────────────────────────────────────
const DEFAULT_OFFERS: Array<PublicOffer & { color: string }> = [
  {
    id: "default-special",
    title: "العرض الذهبي",
    type: "special",
    discount: 0,
    specialPrice: 399,
    description: "اشتراك لفترة محدودة بعدد مقاعد قليل وسعر مميز.",
    appliesTo: "باقة برو",
    membershipId: null,
    image: null,
    showOnHome: true,
    showMaxSubscribers: true,
    maxSubscribers: 40,
    currentSubscribers: 12,
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    color: C.red,
  },
  {
    id: "default-offer-1",
    title: "خصم العضوات الجديدات",
    type: "percentage",
    discount: 20,
    specialPrice: null,
    description: "خصم على أول اشتراك للعضوات الجديدات.",
    appliesTo: "جميع الباقات",
    membershipId: null,
    image: null,
    showOnHome: false,
    showMaxSubscribers: true,
    maxSubscribers: null,
    currentSubscribers: 0,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    color: C.gold,
  },
];
const OffersPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const [offers, setOffers] = useState(DEFAULT_OFFERS);
  const [packages, setPackages] = useState<PublicMembership[]>([]);
  useEffect(() => {
    loadPublicApi().then(d => {
      if (Array.isArray(d.offers) && d.offers.length > 0) {
        const COLORS = [C.gold, C.red, "#9B59B6", "#3498DB", "#27AE60"];
        setOffers((d.offers as PublicOffer[]).map((offer, i) => ({
          ...offer,
          color: COLORS[i % COLORS.length],
        })));
      }
      if (Array.isArray(d.memberships)) {
        const pack = (d.memberships as PublicMembership[]).filter((mb) => mb.kind === "package");
        setPackages(pack);
      }
    }).catch(() => {});
  }, []);

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, #FFF5F8, ${C.bg})`, padding: "64px 0", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 50%, rgba(200,162,0,.08), transparent 60%), radial-gradient(circle at 70% 50%, rgba(233,30,99,.08), transparent 60%)" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ fontSize: viewportWidth() < 768 ? 42 : 56, marginBottom: 16 }}>🔥</div>
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>العروض <span style={{ color: C.red }}>والباقات</span></h1>
          <p style={{ color: C.gray, fontSize: 17 }}>هنا هتلاقي العروض الحالية مع الباقات الخاصة في مكان واحد.</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title" style={{ marginBottom: 32 }}>العروض <span>الحالية</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {offers.map(o => {
              const countdown = getCountdownParts(o.expiresAt);
              const remaining = o.showMaxSubscribers && o.maxSubscribers != null
                ? Math.max(o.maxSubscribers - o.currentSubscribers, 0)
                : null;
              return (
              <div key={o.id} className="card card-hover" style={{ padding: 0, overflow: "hidden", border: `1px solid ${o.color}33` }}>
                <div style={{ background: `linear-gradient(135deg, ${o.color}33, ${o.color}11)`, padding: "36px 24px", textAlign: "center", borderBottom: `1px solid ${o.color}22` }}>
                  <div style={{ fontSize: viewportWidth() < 768 ? 34 : 44, marginBottom: 12 }}>{o.type === "special" ? "⏳" : "🎁"}</div>
                  <div style={{ fontSize: 56, fontWeight: 900, color: o.color, lineHeight: 1 }}>
                    {o.type === "special" ? formatCurrency(o.specialPrice ?? 0) : o.type === "percentage" ? `${o.discount}%` : `${o.discount} ج.م`}
                  </div>
                  <div style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>
                    {o.type === "special" ? "سعر العرض الخاص" : "قيمة الخصم"}
                  </div>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <h3 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 8 }}>{o.title}</h3>
                  <p style={{ color: C.gray, fontSize: 13, marginBottom: 16 }}>{o.description}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: C.gray }}>
                      ⏰ {countdown.expired ? "انتهى العرض" : `ينتهي في ${countdown.days} يوم`}
                    </span>
                    {remaining != null && (
                      <span style={{ fontSize: 12, color: C.gray }}>المتبقي: {remaining}</span>
                    )}
                  </div>
                  <button style={{ width: "100%", padding: "10px", borderRadius: 6, border: `2px solid ${o.color}`, background: "transparent", color: o.color, fontFamily: "'Cairo', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => navigate(o.type === "special" ? "home" : "memberships")}>
                    {o.type === "special" ? "اشتركي في العرض" : "استفيدي الآن"}
                  </button>
                </div>
              </div>
            )})}
          </div>

          <h2 className="section-title" style={{ marginTop: 64, marginBottom: 32 }}>الباقات <span>الخاصة</span></h2>
          {packages.length === 0 ? (
            <div className="card" style={{ padding: 20, textAlign: "center", color: C.gray }}>
              لا توجد باقات متاحة حالياً.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "repeat(2, 1fr)"), gap: 24 }}>
              {packages.map((pkg, i) => {
                const before = pkg.priceBefore ?? null;
                const after = pkg.priceAfter ?? pkg.price;
                const hasDiscount = before != null && before > after;
                const discount = hasDiscount ? Math.round((1 - after / before) * 100) : null;
                return (
                  <div key={pkg.id} className="card" style={{ padding: 28 }}>
                    {hasDiscount && discount != null ? (
                      <span className="badge" style={{ marginBottom: 16, display: "inline-flex" }}>وفري {discount}%</span>
                    ) : null}
                    <h3 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{pkg.name}</h3>
                    <ul style={{ marginBottom: 24 }}>
                      {(pkg.features ?? []).map((item) => (
                        <li key={`${pkg.id}-${item}`} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 14, color: C.grayLight, borderBottom: `1px solid ${C.border}` }}>
                          <I n="check" s={14} c={C.success} /> {item}
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20 }}>
                      <span style={{ fontSize: 38, fontWeight: 900, color: C.red }}>{after}</span>
                      <span style={{ color: C.gray, fontSize: 14 }}>ج.م</span>
                      {before != null && before > after && (
                        <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 15 }}>{before} ج.م</span>
                      )}
                    </div>
                    <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => navigate("memberships")}>اختاري الباقة</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

// ─── CLASSES PAGE ─────────────────────────────────────────────────────────────
const DEFAULT_CLASSES: PublicClass[] = [];
const intMap: Record<string, string> = { low: "خفيف", medium: "متوسط", high: "عالي", extreme: "عالي جدًا" };
const classTypeMap: Record<string, string> = {
  yoga: "يوجا",
  zumba: "زومبا",
  strength: "قوة",
  pilates: "بيلاتس",
  cardio: "كارديو",
  boxing: "ملاكمة",
  swimming: "سباحة",
  dance: "رقص",
};
const gymImageKnownTypes = new Set(["yoga", "zumba", "strength", "pilates", "cardio", "boxing", "swimming", "dance"]);
function getClassTypeLabel(type: string) {
  const normalized = type?.trim();
  if (!normalized) return "غير محدد";
  return classTypeMap[normalized] ?? normalized;
}
function resolveClassImageType(type: string) {
  return gymImageKnownTypes.has(type) ? type : "cardio";
}
const ClassesPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("الكل");
  const [classes, setClasses] = useState<PublicClass[]>(DEFAULT_CLASSES);
  useEffect(() => {
    loadPublicApi().then(d => {
      if (Array.isArray(d.classes) && d.classes.length > 0) {
        setClasses(d.classes.map((c: PublicClass) => ({
          ...c,
          intensity: intMap[c.intensity] ?? c.intensity,
        })));
      }
    }).catch(() => {});
  }, []);
  const intensityColors: Record<string, string> = { "خفيف": C.success, "متوسط": "#EAB308", "عالي": C.red, "عالي جدًا": "#A855F7" };
  const types = ["الكل", ...Array.from(new Set(classes.map(c => getClassTypeLabel(c.type)).filter(Boolean)))];
  const filtered = classes.filter(c =>
    (filterType === "الكل" || getClassTypeLabel(c.type) === filterType) &&
    (search === "" || c.name.includes(search) || c.trainer.includes(search))
  );

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: viewportWidth() < 768 ? 30 : 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>كلاساتنا</h1>
          <p style={{ color: C.gray, fontSize: 15, marginBottom: 24 }}>اكتشفي كلاساتنا المتنوعة واحجزي مكانك الآن</p>
          <div style={{ position: "relative", maxWidth: 480 }}>
            <input className="input" placeholder="ابحثي عن كلاس أو مدربة..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 44 }} />
            <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}><I n="search" s={18} c={C.gray} /></span>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 32 }}>
            {types.map(t => <button key={t} className={`tab ${filterType === t ? "active" : ""}`} onClick={() => setFilterType(t)}>{t}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 24 }}>
            {filtered.map(c => {
              const firstSchedule = c.schedules[0];
              const spots = firstSchedule?.availableSpots ?? c.maxSpots;
              return (
              <div key={c.id} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => { if (typeof window !== "undefined") { window.sessionStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(c)); } navigate("classDetail"); }}>
                <div style={{ height: 180 }}><GymImg type={resolveClassImageType(c.type)} w="100%" h={180} /></div>
                <div style={{ padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <h3 style={{ fontWeight: 800, fontSize: 16, color: C.white }}>{c.name}</h3>
                    <span style={{ fontWeight: 700, color: C.red }}>{c.price} ج.م</span>
                  </div>
                  <div style={{ color: C.gray, fontSize: 13, marginBottom: 12 }}>مع {c.trainer}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, background: C.bgCard2, padding: "3px 10px", borderRadius: 4, fontSize: 11, color: C.gray }}>
                      <I n="clock" s={11} c={C.gray} /> {c.duration}
                    </span>
                    <span style={{ background: `${intensityColors[c.intensity]}22`, color: intensityColors[c.intensity], padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{c.intensity}</span>
                    <span style={{ background: spots === 0 ? "rgba(239,68,68,.12)" : spots < 4 ? "rgba(234,179,8,.12)" : "rgba(34,197,94,.12)", color: spots === 0 ? "#EF4444" : spots < 4 ? "#EAB308" : C.success, padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {spots === 0 ? "ممتلئ" : `${spots} متبقية`}
                    </span>
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center", opacity: spots === 0 ? .5 : 1, padding: "9px", fontSize: 13 }} disabled={spots === 0} onClick={e => { e.stopPropagation(); if (typeof window !== "undefined") { window.sessionStorage.setItem(CLASS_STORAGE_KEY, JSON.stringify(c)); } navigate("classDetail"); }}>
                    {spots === 0 ? "ممتلئ" : "احجزي الآن"}
                  </button>
                </div>
              </div>
            )})}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── CLASS DETAIL ─────────────────────────────────────────────────────────────
const ClassDetailPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const [gymClass, setGymClass] = useState<PublicClass | null>(null);
  const [bookingMsg, setBookingMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookingScheduleId, setBookingScheduleId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(CLASS_STORAGE_KEY);
    if (!stored) return;
    try {
      setGymClass(JSON.parse(stored) as PublicClass);
    } catch {
      // ignore invalid payload
    }
  }, []);

  const bookSchedule = async (scheduleId: string) => {
    setBookingId(scheduleId);
    setBookingMsg(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId }),
      });
      if (res.status === 401) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent("/account?tab=bookings")}`;
        return;
      }
      const data = await res.json() as { error?: string; message?: string };
      if (!res.ok) {
        setBookingMsg({ text: data.error ?? "تعذر إتمام الحجز حاليًا.", ok: false });
        return;
      }
      setBookingMsg({ text: data.message ?? "تم الحجز بنجاح. جاري تحويلك إلى حسابك.", ok: true });
      setBookingScheduleId(scheduleId);
      setTimeout(() => { window.location.href = "/account?tab=bookings"; }, 1200);
    } catch {
      setBookingMsg({ text: "حدث خطأ غير متوقع أثناء تنفيذ الحجز.", ok: false });
    } finally {
      setBookingId(null);
    }
  };

  const sessions = gymClass?.schedules ?? [];
  return (
    <div>
      <div style={{ height: 340, position: "relative" }}>
        <GymImg type={resolveClassImageType(gymClass?.type ?? "yoga")} w="100%" h={340} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,10,10,.3) 0%, rgba(10,10,10,.85) 100%)" }} />
        <div style={{ position: "absolute", bottom: 32, left: 0, right: 0 }}><div className="container">
          <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>{getClassTypeLabel(gymClass?.type ?? "yoga")}</span>
          <h1 style={{ color: C.white, fontSize: 38, fontWeight: 900 }}>{gymClass?.name ?? " "}</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[["clock", gymClass?.duration ?? ""],["fire", gymClass?.intensity ?? ""],["users", `${sessions[0]?.availableSpots ?? gymClass?.maxSpots ?? 0} مقعد متاح`]].map(([icon, text]) => (
              <span key={text} style={{ color: C.gray, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <I n={icon} s={13} c={C.gray} /> {text}
              </span>
            ))}
          </div>
        </div></div>
      </div>
      <div className="container" style={{ padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 360px"), gap: 40 }}>
          <div>
            <div className="card" style={{ padding: 28, marginBottom: 20 }}>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 14 }}>عن الكلاس</h2>
              <p style={{ color: C.gray, lineHeight: 1.8, fontSize: 14 }}>{gymClass?.description || "لا يوجد وصف لهذا الكلاس."}</p>
              <h3 style={{ fontWeight: 700, color: C.white, marginTop: 20, marginBottom: 14 }}>الفوائد</h3>
              <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 10 }}>
                {["تحسين المرونة","تقليل التوتر","تقوية العضلات","تحسين التركيز","توازن الجسم","تنفس أعمق"].map(b => (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.grayLight }}>
                    <I n="check" s={13} c={C.success} /> {b}
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 28 }}>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 16 }}>المدربة</h2>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}><GymImg type="trainer1" w={80} h={80} /></div>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{gymClass?.trainer ?? ""}</h3>
                  <p style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>{gymClass?.trainerSpecialty ?? ""}</p>
                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: C.gray }}>⭐ 4.9 تقييم</span>
                    <span style={{ fontSize: 12, color: C.gray }}>520 جلسة</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 24, position: viewportWidth() < 1024 ? "static" : "sticky", top: 86 }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white, marginBottom: 16 }}>اختاري الموعد</h3>
            {bookingMsg && <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 8, background: bookingMsg.ok ? "#dcfce7" : "#fee2e2", color: bookingMsg.ok ? "#166534" : "#991b1b", fontWeight: 700, fontSize: 13 }}>{bookingMsg.text}</div>}
            {sessions.map(s => (
              <div key={s.id} className="card" style={{ padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{new Date(s.date).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}</div>
                    <div style={{ color: C.gray, fontSize: 12 }}>{s.time}</div>
                  </div>
                  <span style={{ background: s.availableSpots === 0 ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.12)", color: s.availableSpots === 0 ? "#EF4444" : C.success, padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, height: "fit-content" }}>
                    {s.availableSpots === 0 ? "ممتلئ" : `${s.availableSpots} متبقية`}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 900, color: C.red }}>{formatCurrency(gymClass?.price ?? 0)}</span>
                  <button className="btn-primary" style={{ padding: "5px 14px", fontSize: 12, opacity: s.availableSpots === 0 ? .4 : 1 }} disabled={s.availableSpots === 0 || bookingId === s.id || bookingScheduleId === s.id} onClick={() => bookSchedule(s.id)}>
                    {bookingScheduleId === s.id ? "تم الحجز" : bookingId === s.id ? "جارٍ..." : s.availableSpots === 0 ? "ممتلئ" : "احجزي الآن"}
                  </button>
                </div>
              </div>
            ))}
            <div className="divider" />
            <div style={{ background: "rgba(233,30,99,.08)", border: `1px solid ${C.red}33`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <I n="wallet" s={15} c={C.red} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.red }}>ميزة الاشتراك والحجز</span>
              </div>
              <p style={{ fontSize: 11, color: C.gray }}>احجزي حصتك الآن، وسيظهر الحجز مباشرة داخل صفحة حسابك.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCHEDULE PAGE ────────────────────────────────────────────────────────────
const SchedulePage = () => {
  const [entries, setEntries] = useState<
    { day: string; time: string; title: string; sub: string; tag: string }[]
  >([]);

  useEffect(() => {
    loadPublicApi()
      .then((data) => {
        if (!Array.isArray(data.classes)) return;
        const rows: { day: string; time: string; title: string; sub: string; tag: string }[] = [];
        const dayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        (data.classes as PublicClass[]).forEach((c) => {
          (c.schedules || []).forEach((s) => {
            const date = new Date(s.date);
            if (Number.isNaN(date.getTime())) return;
            const day = dayNames[date.getDay()] ?? "الأحد";
            const typeLabel = getClassTypeLabel(c.type);
            const tag = [typeLabel, c.subType].filter(Boolean).join(" - ");
            rows.push({
              day,
              time: s.time,
              title: c.name,
              sub: c.trainer ? c.trainer : "",
              tag,
            });
          });
        });
        setEntries(rows);
      })
      .catch(() => {});
  }, []);

  const parseTime = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    return (h || 0) * 60 + (m || 0);
  };

  const formatTimeLabel = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    const hour = Number.isNaN(h) ? 0 : h;
    const minute = Number.isNaN(m) ? 0 : m;
    const period = hour < 12 ? "صباحًا" : hour < 16 ? "ظهرًا" : "مساءً";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(displayHour).padStart(2, "0")}.${String(minute).padStart(2, "0")} ${period}`;
  };

  const DAY_ORDER = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  const MORNING_FALLBACK = ["09:00", "10:00", "11:00", "12:00", "13:00"];
  const EVENING_FALLBACK = ["16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

  const splitEntries = useMemo(() => {
    const morning: typeof entries = [];
    const evening: typeof entries = [];
    entries.forEach((entry) => {
      if (parseTime(entry.time) < 15 * 60) {
        morning.push(entry);
      } else {
        evening.push(entry);
      }
    });
    return { morning, evening };
  }, [entries]);

  const buildSlots = (list: typeof entries, fallback: string[]) => {
    const times = Array.from(new Set(list.map((item) => item.time)));
    const merged = Array.from(new Set([...times, ...fallback]));
    return merged.sort((a, b) => parseTime(a) - parseTime(b));
  };

  const morningSlots = useMemo(() => buildSlots(splitEntries.morning, MORNING_FALLBACK), [splitEntries.morning]);
  const eveningSlots = useMemo(() => buildSlots(splitEntries.evening, EVENING_FALLBACK), [splitEntries.evening]);

  const days = useMemo(() => {
    const used = new Set(entries.map((entry) => entry.day));
    return DAY_ORDER.filter((day) => used.has(day) || day !== "الجمعة");
  }, [entries]);

  const renderBoard = (title: string, subtitle: string, list: typeof entries, slots: string[]) => (
    <div className="schedule-shell" style={{ marginBottom: 36 }}>
      <div className="schedule-title">
        <h2>جدول</h2>
        <span>{title}</span>
        <div style={{ color: "#f1f1f1", fontSize: 14 }}>{subtitle}</div>
      </div>
      <div className="schedule-scroll" style={{ direction: "ltr" }}>
        <div
          className="schedule-grid"
          style={{
            gridTemplateColumns: `${slots.map(() => "minmax(120px, 1fr)").join(" ")} 120px`,
          }}
        >
          {slots.map((slot) => (
            <div key={`head-${slot}`} className="schedule-cell time">
              {formatTimeLabel(slot)}
            </div>
          ))}
          <div className="schedule-cell clock">
            <I n="clock" s={20} c="#f5c542" />
          </div>
          {days.map((day) => (
            <div key={`row-${day}`} style={{ display: "contents" }}>
              {slots.map((slot) => {
                const cellEntries = list.filter((entry) => entry.day === day && entry.time === slot);
                return (
                  <div key={`${day}-${slot}`} className="schedule-cell">
                    {cellEntries.length === 0 ? (
                      <div className="schedule-empty">—</div>
                    ) : (
                      cellEntries.map((entry, idx) => (
                        <div key={`${day}-${slot}-${idx}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div className="schedule-item-title">{entry.title}</div>
                          {entry.sub ? <div className="schedule-item-sub">{entry.sub}</div> : null}
                          {entry.tag ? <div className="schedule-item-tag">{entry.tag}</div> : null}
                        </div>
                      ))
                  )}
                </div>
              );
            })}
            <div className="schedule-cell day">{day}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
  );

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ fontSize: viewportWidth() < 768 ? 30 : 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>الجدول الأسبوعي</h1>
          <p style={{ color: C.gray, fontSize: 15 }}>كل المواعيد تُسجَّل من لوحة الإدارة ويمكن تعديلها في أي وقت.</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          {renderBoard("مواعيد الكلاسات الصباحية", "ابدئي يومك بنشاط وحماس", splitEntries.morning, morningSlots)}
          {renderBoard("مواعيد الكلاسات المسائية", "اختاري أفضل توقيت بعد اليوم الطويل", splitEntries.evening, eveningSlots)}
        </div>
      </section>
    </div>
  );
};

// ─── SHOP PAGE ────────────────────────────────────────────────────────────────
type StoreProduct = {
  id?: string;
  name: string;
  price: number;
  oldPrice: number | null;
  type: string;
  cat: string;
  categoryKey?: string;
  sizeType?: "none" | "clothing" | "shoes";
  badge: string | null;
  rating: number;
  description?: string;
  images?: string[];
  sizes?: string[];
  colors?: string[];
  reviewCount?: number;
  stock?: number | null;
};

type StoreCategory = {
  key: string;
  label: string;
  sizeType: "none" | "clothing" | "shoes";
};

type PublicTestimonial = {
  id?: string;
  displayName?: string | null;
  content: string;
  rating: number;
  user?: { name?: string | null } | null;
};

const PRODUCT_STORAGE_KEY = "fitzone:selected-product";
const DEFAULT_PRODUCTS: StoreProduct[] = [
  { name: "حذاء Luna Sport", price: 850, oldPrice: 1200, type: "product1", cat: "أحذية", categoryKey: "shoes", sizeType: "shoes", badge: "الأكثر مبيعًا", rating: 4.9, sizes: ["37", "38", "39", "40"], stock: 12 },
  { name: "بروتين وايت لايت 1kg", price: 450, oldPrice: null as number | null, type: "product2", cat: "مكملات", categoryKey: "supplement", sizeType: "none", badge: null as string | null, rating: 4.7, stock: 6 },
  { name: "طقم معدات يوغا", price: 680, oldPrice: 900, type: "product3", cat: "معدات", categoryKey: "gear", sizeType: "none", badge: "خصم 25%", rating: 4.8, stock: 4 },
  { name: "تيشيرت رياضي", price: 320, oldPrice: null as number | null, type: "product1", cat: "ملابس", categoryKey: "clothing", sizeType: "clothing", badge: null as string | null, rating: 4.6, sizes: ["S", "M", "L", "XL"], stock: 10 },
];
const DEFAULT_STORE_CATEGORIES: StoreCategory[] = [
  { key: "shoes", label: "أحذية", sizeType: "shoes" },
  { key: "clothing", label: "ملابس", sizeType: "clothing" },
  { key: "supplement", label: "مكملات", sizeType: "none" },
  { key: "gear", label: "معدات", sizeType: "none" },
];
const catMap: Record<string, string> = { gear: "معدات", supplement: "مكملات", clothing: "ملابس", accessory: "إكسسوار", shoes: "أحذية" };
const catMapEn: Record<string, string> = { gear: "Gear", supplement: "Supplements", clothing: "Clothing", accessory: "Accessories", shoes: "Shoes" };
const categoryEnByArabic: Record<string, string> = Object.entries(catMap).reduce((acc, [key, value]) => {
  acc[value] = catMapEn[key] ?? value;
  return acc;
}, {} as Record<string, string>);

function localizeStoreCategory(label: string, key: string | undefined, lang: "ar" | "en") {
  if (lang !== "en") return label;
  return (key && catMapEn[key]) || categoryEnByArabic[label] || label;
}

function localizeDiscountBadge(badge: string | null | undefined, lang: "ar" | "en") {
  if (!badge) return badge;
  if (lang !== "en") return badge;
  const match = badge.match(/خصم\s+(\d+)%/);
  if (match) return `${match[1]}% off`;
  if (badge === "الأكثر مبيعًا") return "Best seller";
  return badge;
}

const mapApiProductToStoreProduct = (
  p: {
    id?: string;
    name: string;
    price: number;
    oldPrice: number | null;
    category: string;
    categoryLabel?: string;
    sizeType?: "none" | "clothing" | "shoes";
    description?: string;
    images?: string[];
    sizes?: string[];
    colors?: string[];
    rating?: number;
    reviewCount?: number;
    stock?: number;
  },
  i: number,
): StoreProduct => ({
  id: p.id ?? `api-${i}`,
  name: p.name,
  price: p.price,
  oldPrice: p.oldPrice,
  description: p.description ?? "",
  images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
  sizes: Array.isArray(p.sizes) ? p.sizes.filter(Boolean) : [],
  colors: Array.isArray(p.colors) ? p.colors.filter(Boolean) : [],
  type: `product${(i % 3) + 1}`,
  cat: p.categoryLabel ?? catMap[p.category] ?? p.category,
  categoryKey: p.category,
  sizeType: p.sizeType ?? "none",
  badge: p.oldPrice ? `خصم ${Math.round((1 - p.price / p.oldPrice) * 100)}%` : null,
  rating: typeof p.rating === "number" && p.rating > 0 ? p.rating : 4.7,
  reviewCount: typeof p.reviewCount === "number" ? p.reviewCount : 0,
  stock: typeof p.stock === "number" ? p.stock : null,
});
const ProductVisual = ({ product, h = 200 }: { product: StoreProduct; h?: number }) => {
  const firstImage = product.images?.[0];

  if (firstImage) {
    return <img src={firstImage} alt={product.name} style={{ width: "100%", height: h, objectFit: "cover", display: "block", background: C.bgCard2 }} />;
  }

  return <GymImg type={product.type} w="100%" h={h} />;
};

const getProductRecommendationScore = (product: StoreProduct, searchTerm: string) => {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return 0;

  let score = 0;
  const haystacks = [product.name, product.description ?? "", product.cat, ...(product.sizes ?? [])].map((value) => value.toLowerCase());

  haystacks.forEach((value, index) => {
    if (value.includes(term)) score += index === 0 ? 5 : 2;
    term.split(/\s+/).filter(Boolean).forEach((part) => {
      if (part.length > 1 && value.includes(part)) score += index === 0 ? 2 : 1;
    });
  });

  return score;
};

const ShopPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const t = useT();
  const { lang } = useLang();
  const allLabel = t("الكل", "All");
  const [cat, setCat] = useState("الكل");
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<StoreCategory[]>(DEFAULT_STORE_CATEGORIES);
  const [products, setProducts] = useState<StoreProduct[]>(DEFAULT_PRODUCTS);

  useEffect(() => {
    loadPublicApi()
      .then((d) => {
        if (Array.isArray(d.categories) && d.categories.length > 0) {
          setCategories(d.categories.map((item: { key: string; label: string; sizeType: "none" | "clothing" | "shoes" }) => ({ key: item.key, label: item.label, sizeType: item.sizeType })));
        }
        if (Array.isArray(d.products) && d.products.length > 0) {
          setProducts(
            d.products.map(
              (
                p: {
                  id?: string;
                  name: string;
                  price: number;
                  oldPrice: number | null;
                  category: string;
                  categoryLabel?: string;
                  sizeType?: "none" | "clothing" | "shoes";
                  description?: string;
                  images?: string[];
                  sizes?: string[];
                  colors?: string[];
                  rating?: number;
                  reviewCount?: number;
                },
                i: number,
              ) => mapApiProductToStoreProduct(p, i),
            ),
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCat(allLabel);
  }, [allLabel]);

  const categoryButtons = [allLabel, ...categories.map((item) => item.label)];
  const filtered = products.filter((p) => {
    const matchesCategory = cat === allLabel || p.cat === cat;
    const term = search.trim().toLowerCase();
    if (!term) return matchesCategory;
    return matchesCategory && (
      p.name.toLowerCase().includes(term) ||
      (p.description ?? "").toLowerCase().includes(term) ||
      p.cat.toLowerCase().includes(term) ||
      (p.sizes ?? []).some((size) => size.toLowerCase().includes(term))
    );
  });

  const recommended = search.trim()
    ? [...products]
        .map((product) => ({ product, score: getProductRecommendationScore(product, search) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(({ product }) => product)
    : [];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: viewportWidth() < 768 ? 30 : 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>{t("المتجر الرياضي", "Sports shop")}</h1>
          <p style={{ color: C.gray, fontSize: 15 }}>{t("منتجات مختارة لتعزيز أهدافك", "Selected products to support your goals")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categoryButtons.map((label) => {
                const categoryRecord = categories.find((item) => item.label === label);
                const displayLabel = label === allLabel ? allLabel : localizeStoreCategory(label, categoryRecord?.key, lang);
                return <button key={label} className={`tab ${cat === label ? "active" : ""}`} onClick={() => setCat(label)}>{displayLabel}</button>;
              })}
            </div>
            <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px", maxWidth: 360 }}>
              <input className="input" placeholder={t("ابحثي عن منتج أو مقاس أو وصف...", "Search for a product, size, or description...")} value={search} onChange={e => setSearch(e.target.value)} style={{ paddingRight: 44 }} />
              <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}><I n="search" s={18} c={C.gray} /></span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
            {filtered.map(p => (
              <div key={p.id ?? p.name} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => { if (typeof window !== "undefined") { window.sessionStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(p)); } navigate("productDetail"); }}>
                {(() => {
                  const outOfStock = typeof p.stock === "number" && p.stock <= 0;
                  return (
                    <>
                <div style={{ height: 200, position: "relative" }}>
                  <ProductVisual product={p} h={200} />
                  {p.badge && <span className="badge" style={{ position: "absolute", top: 12, right: 12 }}>{localizeDiscountBadge(p.badge, lang)}</span>}
                  {outOfStock && (
                    <span
                      className="badge"
                      style={{ position: "absolute", top: 12, left: 12, background: "#2b0f1b", color: "#ffd166" }}
                    >
                      {t("نفذت الكمية", "Out of stock")}
                    </span>
                  )}
                </div>
                <div style={{ padding: 18 }}>
                  <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.white }}>{p.name}</h3>
                  {p.description && <p style={{ color: C.gray, fontSize: 12, lineHeight: 1.7, marginBottom: 10, minHeight: 40 }}>{p.description.slice(0, 70)}{p.description.length > 70 ? "..." : ""}</p>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ fontWeight: 900, color: C.red, fontSize: 20 }}>{formatCurrency(p.price)}</span>
                    {p.oldPrice && <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 12 }}>{formatCurrency(p.oldPrice)}</span>}
                  </div>
                  {p.sizeType !== "none" && p.sizes && p.sizes.length > 0 && <div style={{ color: C.gray, fontSize: 11, marginBottom: 12 }}>{t("المقاسات", "Sizes")}: {p.sizes.slice(0, 4).join(" - ")}</div>}
                  <button
                    className="btn-primary"
                    style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: 12, opacity: outOfStock ? 0.5 : 1 }}
                    disabled={outOfStock}
                    onClick={e => {
                      e.stopPropagation();
                      if (outOfStock) return;
                      addToCart({ productId: p.id ?? p.name, name: p.name, price: p.price, qty: 1, size: p.sizeType === "none" ? null : p.sizes?.[0] ?? null, type: p.type });
                      navigate("cart");
                    }}
                  >
                    <I n="cart" s={13} c="#fff" /> {outOfStock ? t("نفذت الكمية", "Out of stock") : t("أضيفي للسلة", "Add to cart")}
                  </button>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
          {search.trim() && recommended.length > 0 && (
            <div style={{ marginTop: 48 }}>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: C.white, marginBottom: 16 }}>{t("منتجات مقترحة", "Recommended products")}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
                {recommended.map((p) => (
                  <div key={`recommended-${p.id ?? p.name}`} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => { if (typeof window !== "undefined") { window.sessionStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(p)); } navigate("productDetail"); }}>
                    {(() => {
                      const outOfStock = typeof p.stock === "number" && p.stock <= 0;
                      return (
                        <>
                    <div style={{ height: 170 }}><ProductVisual product={p} h={170} /></div>
                    <div style={{ padding: 16 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.white }}>{p.name}</h3>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 900, color: C.red, fontSize: 18 }}>{formatCurrency(p.price)}</span>
                        {p.oldPrice && <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 12 }}>{formatCurrency(p.oldPrice)}</span>}
                        {outOfStock && <span style={{ color: "#ffd166", fontSize: 11, fontWeight: 800 }}>{t("نفذت الكمية", "Out of stock")}</span>}
                      </div>
                    </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

type ProductReviewItem = {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
};

const ProductDetailPage = ({ navigate, walletBalance = 0 }: { navigate: (p: string) => void; walletBalance?: number }) => {
  const t = useT();
  const { lang } = useLang();
  const [qty, setQty] = useState(1);
  const [product, setProduct] = useState<StoreProduct>(DEFAULT_PRODUCTS[0]);
  const [catalog, setCatalog] = useState<StoreProduct[]>(DEFAULT_PRODUCTS);
  const [selectedImage, setSelectedImage] = useState(0);
  const [imageZoomed, setImageZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(C.red);
  const outOfStock = typeof product.stock === "number" && product.stock <= 0;
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState("");
  const [reviewMessage, setReviewMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [averageRating, setAverageRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviews, setReviews] = useState<ProductReviewItem[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(PRODUCT_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as StoreProduct;
      setProduct(parsed);
      setSelectedSize(parsed.sizeType === "none" ? null : parsed.sizes?.[0] ?? null);
      setSelectedImage(0);
    } catch {
      // ignore invalid payload
    }
  }, []);

  useEffect(() => {
    loadPublicApi()
      .then((d) => {
        if (Array.isArray(d.products) && d.products.length > 0) {
          const mapped = d.products.map((item: {
            id?: string;
            name: string;
            price: number;
            oldPrice: number | null;
            category: string;
            categoryLabel?: string;
            sizeType?: "none" | "clothing" | "shoes";
            description?: string;
            images?: string[];
            sizes?: string[];
            colors?: string[];
            rating?: number;
            reviewCount?: number;
          }, index: number) => mapApiProductToStoreProduct(item, index));
          setCatalog(mapped);
          const refreshed = mapped.find((item) => item.id && item.id === product.id);
          if (refreshed) {
            setProduct(refreshed);
            setSelectedSize(refreshed.sizeType === "none" ? null : refreshed.sizes?.[0] ?? null);
          }
        }
      })
      .catch(() => {});
  }, [product.id]);

  useEffect(() => {
    if (!product.id) {
      setReviews([]);
      setAverageRating(product.rating ?? 0);
      setReviewCount(product.reviewCount ?? 0);
      return;
    }

    setReviewsLoading(true);
    fetch(`/api/products/${product.id}/reviews`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error ?? t("تعذر تحميل مراجعات المنتج.", "Unable to load product reviews."));
        }
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
        setAverageRating(typeof data.averageRating === "number" ? data.averageRating : 0);
        setReviewCount(typeof data.count === "number" ? data.count : 0);
      })
      .catch(() => {
        setReviews([]);
        setAverageRating(product.rating ?? 0);
        setReviewCount(product.reviewCount ?? 0);
      })
      .finally(() => setReviewsLoading(false));
  }, [product.id, product.rating, product.reviewCount]);

  const gallery = product.images && product.images.length > 0 ? product.images : [product.type];
  const fallbackSizes = product.sizeType === "shoes" ? ["36", "37", "38", "39", "40", "41"] : product.sizeType === "clothing" ? ["S", "M", "L", "XL"] : [];
  const sizes = product.sizes && product.sizes.length > 0 ? product.sizes : fallbackSizes;
  const relatedProducts = catalog.filter((item) => item.id !== product.id && item.categoryKey === product.categoryKey).slice(0, 4);

  const submitReview = async () => {
    if (!product.id) {
      setReviewMessage({ text: t("هذا المنتج غير مربوط بقاعدة البيانات بعد.", "This product is not linked to the database yet."), ok: false });
      return;
    }

    setReviewSubmitting(true);
    setReviewMessage(null);
    try {
      const response = await fetch(`/api/products/${product.id}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: reviewRating,
          content: reviewContent,
        }),
      });

      if (response.status === 401) {
        window.location.href = `/login?callbackUrl=${encodeURIComponent("/shop")}`;
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReviewMessage({ text: data.error ?? t("تعذر إرسال تقييمك حاليًا.", "Unable to submit your review right now."), ok: false });
        return;
      }

      setReviewMessage({ text: t("تم حفظ تقييمك بنجاح.", "Your review has been saved successfully."), ok: true });
      setReviewContent("");
      const reload = await fetch(`/api/products/${product.id}/reviews`, { cache: "no-store" });
      const reloadData = await reload.json().catch(() => ({}));
      if (reload.ok) {
        setReviews(Array.isArray(reloadData.reviews) ? reloadData.reviews : []);
        setAverageRating(typeof reloadData.averageRating === "number" ? reloadData.averageRating : 0);
        setReviewCount(typeof reloadData.count === "number" ? reloadData.count : 0);
      }
    } catch {
      setReviewMessage({ text: t("حدث خطأ غير متوقع أثناء إرسال التقييم.", "An unexpected error occurred while submitting the review."), ok: false });
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleZoomMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 100;
    const y = ((event.clientY - bounds.top) / bounds.height) * 100;
    setZoomOrigin(`${x}% ${y}%`);
  };

  return (
    <div>
      <div className="container" style={{ padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 48, alignItems: "start" }}>
          <div>
            <div
              style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12, position: "relative", cursor: product.images && product.images.length > 0 ? "zoom-in" : "default" }}
              onMouseMove={handleZoomMove}
              onMouseEnter={() => setImageZoomed(true)}
              onMouseLeave={() => {
                setImageZoomed(false);
                setZoomOrigin("50% 50%");
              }}
            >
              {product.images && product.images.length > 0 ? (
                <img
                  src={product.images[selectedImage]}
                  alt={product.name}
                  style={{
                    width: "100%",
                    height: viewportWidth() < 768 ? 300 : 380,
                    objectFit: "cover",
                    display: "block",
                    background: C.bgCard2,
                    transform: imageZoomed ? "scale(1.9)" : "scale(1)",
                    transformOrigin: zoomOrigin,
                    transition: imageZoomed ? "transform 120ms ease-out" : "transform 220ms ease",
                  }}
                />
              ) : (
                <GymImg type={product.type} w="100%" h={viewportWidth() < 768 ? 300 : 380} />
              )}
              {product.images && product.images.length > 1 && (
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    bottom: 12,
                    background: "rgba(26,8,18,.72)",
                    color: "#fff",
                    border: `1px solid ${C.border}`,
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {selectedImage + 1} / {product.images.length}
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("repeat(3, 1fr)", "repeat(4, 1fr)", "repeat(4, 1fr)"), gap: 8 }}>
              {gallery.map((item, i) => (
                <div key={`${product.id ?? product.name}-${i}`} onClick={() => setSelectedImage(i)} style={{ borderRadius: 8, overflow: "hidden", border: i === selectedImage ? `2px solid ${C.red}` : `1px solid ${C.border}`, cursor: "pointer" }}>
                  {product.images && product.images.length > 0 ? (
                    <img src={String(item)} alt={`${product.name}-${i + 1}`} style={{ width: "100%", height: 70, objectFit: "cover", display: "block", background: C.bgCard2 }} />
                  ) : (
                    <GymImg type={String(item)} w="100%" h={70} />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>{product.cat}</span>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: C.white, marginBottom: 12 }}>{product.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: viewportWidth() < 768 ? 34 : 42, fontWeight: 900, color: C.red }}>{product.price}</span>
              <span style={{ color: C.gray }}>{lang === "en" ? "EGP" : "ج.م"}</span>
              {product.oldPrice && <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 16 }}>{formatCurrency(product.oldPrice)}</span>}
              {product.badge && <span className="badge">{localizeDiscountBadge(product.badge, lang)}</span>}
              {outOfStock && <span className="badge" style={{ background: "#2b0f1b", color: "#ffd166" }}>{t("نفذت الكمية", "Out of stock")}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ color: C.gold, fontWeight: 800 }}>
                {"★".repeat(Math.max(1, Math.round(averageRating || product.rating || 0)))}
              </div>
              <div style={{ color: C.gray, fontSize: 13 }}>
                {averageRating > 0 ? averageRating.toFixed(1) : product.rating.toFixed(1)} {t("من 5", "out of 5")}
              </div>
              <div style={{ color: C.grayDark, fontSize: 13 }}>
                {reviewCount} {t("تقييم", "reviews")}
              </div>
            </div>
            {product.description && <p style={{ color: C.gray, lineHeight: 1.9, marginBottom: 24 }}>{product.description}</p>}

            {product.sizeType !== "none" && sizes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ color: C.white, fontWeight: 700, marginBottom: 10 }}>{t("المقاس", "Size")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {sizes.map((size) => (
                    <button key={size} onClick={() => setSelectedSize(size)} style={{ minWidth: 44, padding: "10px 14px", borderRadius: 8, border: `1px solid ${selectedSize === size ? C.red : C.border}`, background: selectedSize === size ? C.red : C.bgCard, color: selectedSize === size ? "#fff" : C.white, cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 700 }}>
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!!product.colors?.length && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ color: C.white, fontWeight: 700, marginBottom: 10 }}>{t("اللون", "Color")}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {product.colors.map((color) => (
                    <button key={color} onClick={() => setSelectedColor(color)} style={{ width: 30, height: 30, borderRadius: "50%", border: `2px solid ${selectedColor === color ? C.red : C.border}`, background: color, cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <button disabled={outOfStock} onClick={() => setQty((value) => Math.max(1, value - 1))} style={{ padding: "10px 14px", border: "none", background: C.bgCard, cursor: outOfStock ? "not-allowed" : "pointer", opacity: outOfStock ? 0.5 : 1 }}>-</button>
                <div style={{ padding: "10px 16px", minWidth: 46, textAlign: "center" }}>{qty}</div>
                <button disabled={outOfStock} onClick={() => setQty((value) => value + 1)} style={{ padding: "10px 14px", border: "none", background: C.bgCard, cursor: outOfStock ? "not-allowed" : "pointer", opacity: outOfStock ? 0.5 : 1 }}>+</button>
              </div>
              <button
                className="btn-primary"
                style={{ flex: 1, justifyContent: "center", opacity: outOfStock ? 0.5 : 1 }}
                disabled={outOfStock}
                onClick={() => {
                  if (outOfStock) return;
                  addToCart({ productId: product.id ?? product.name, name: product.name, price: product.price, qty, size: product.sizeType === "none" ? null : selectedSize, type: product.type });
                  navigate("cart");
                }}
              >
                <I n="cart" s={16} c="#fff" /> {outOfStock ? t("نفذت الكمية", "Out of stock") : t("أضيفي للسلة", "Add to cart")}
              </button>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ color: C.gray, fontSize: 13, marginBottom: 8 }}>{t("الرصيد الحالي بالمحفظة", "Current wallet balance")}</div>
              <div style={{ color: C.gold, fontWeight: 900, fontSize: 24 }}>{formatCurrency(walletBalance)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1.1fr 1fr"), gap: 32, marginTop: 56 }}>
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontWeight: 900, fontSize: 24, color: C.white, marginBottom: 18 }}>{t("أضيفي تقييمك", "Add your review")}</h2>
            <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.8, marginBottom: 18 }}>{t("اكتبي رأيك في المنتج، وسيظهر التقييم باسم حسابك بعد الحفظ.", "Write your opinion about the product and your review will appear under your account name after saving.")}</p>
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.white, fontWeight: 700, marginBottom: 8 }}>{t("تقييمك", "Your rating")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button key={star} type="button" onClick={() => setReviewRating(star)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 28, color: star <= reviewRating ? C.gold : C.border }}>
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: C.white, fontWeight: 700, marginBottom: 8 }}>{t("مراجعتك", "Your review")}</div>
              <textarea value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} rows={6} placeholder={t("اكتبي رأيك في المنتج، الجودة، المقاس أو التجربة العامة.", "Write your opinion about the product, quality, size, or overall experience.")} className="input" style={{ resize: "vertical", minHeight: 160 }} />
            </div>
            {reviewMessage && (
              <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 12, background: reviewMessage.ok ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)", color: reviewMessage.ok ? C.success : "#fca5a5", fontSize: 13, fontWeight: 700 }}>
                {reviewMessage.text}
              </div>
            )}
            <button className="btn-primary" style={{ justifyContent: "center", minWidth: 170 }} disabled={reviewSubmitting} onClick={() => { void submitReview(); }}>
              {reviewSubmitting ? t("جارٍ الإرسال...", "Sending...") : t("إرسال التقييم", "Submit review")}
            </button>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontWeight: 900, fontSize: 24, color: C.white }}>{t("تقييمات العملاء", "Customer reviews")}</h2>
              <div style={{ color: C.gray, fontSize: 13 }}>
                {t("متوسط التقييم", "Average rating")}: <span style={{ color: C.gold, fontWeight: 800 }}>{averageRating > 0 ? averageRating.toFixed(1) : product.rating.toFixed(1)}</span>
              </div>
            </div>
            {reviewsLoading ? (
              <div style={{ color: C.gray }}>{t("جارٍ تحميل التقييمات...", "Loading reviews...")}</div>
            ) : reviews.length === 0 ? (
              <div style={{ color: C.gray, lineHeight: 1.8 }}>{t("لا توجد تقييمات لهذا المنتج بعد. كوني أول من يضيف مراجعة.", "There are no reviews for this product yet. Be the first to add one.")}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {reviews.map((review) => (
                  <div key={review.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 14, alignItems: "start", paddingBottom: 16, borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: C.white }}>
                      {review.user.name.slice(0, 1)}
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800, color: C.white }}>{review.user.name}</div>
                        <div style={{ color: C.grayDark, fontSize: 12 }}>{new Date(review.createdAt).toLocaleDateString(lang === "en" ? "en-US" : "ar-EG", { day: "numeric", month: "long", year: "numeric" })}</div>
                      </div>
                      <div style={{ color: C.gold, marginBottom: 8 }}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div>
                      <div style={{ color: C.gray, lineHeight: 1.9, fontSize: 14 }}>{review.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {relatedProducts.length > 0 && (
          <div style={{ marginTop: 56 }}>
            <h2 style={{ fontSize: 28, fontWeight: 900, color: C.white, marginBottom: 18 }}>{t("منتجات ذات صلة", "Related products")}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
              {relatedProducts.map((item) => (
                <div key={`related-${item.id ?? item.name}`} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => {
                  if (typeof window !== "undefined") {
                    window.sessionStorage.setItem(PRODUCT_STORAGE_KEY, JSON.stringify(item));
                  }
                  setProduct(item);
                  setSelectedImage(0);
                  setSelectedSize(item.sizeType === "none" ? null : item.sizes?.[0] ?? null);
                  setReviewMessage(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}>
                  <div style={{ height: 170 }}><ProductVisual product={item} h={170} /></div>
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.white }}>{item.name}</h3>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 900, color: C.red, fontSize: 18 }}>{formatCurrency(item.price)}</span>
                      {item.oldPrice && <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 12 }}>{formatCurrency(item.oldPrice)}</span>}
                    </div>
                    <div style={{ color: C.gold, fontSize: 13 }}>⭐ {item.rating.toFixed(1)} {item.reviewCount ? `(${item.reviewCount})` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CartPage = ({ navigate, summary }: { navigate: (p: string) => void; summary: UserSummary | null }) => {
  const { lang } = useLang();
  const t = useT();
  const [step, setStep] = useState("cart");
  const [payMethod, setPayMethod] = useState("instapay");
  const [useRewards, setUseRewards] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [orderMsg, setOrderMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<{ url: string; label: string; transactionId?: string | null } | null>(null);
  const [deliveryOptions, setDeliveryOptions] = useState<PublicDeliveryOption[]>([]);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<PublicPaymentSettings>({
    instapayUrl: "",
    instapayLabel: "InstaPay",
    vodafoneCashUrl: "",
    vodafoneCashLabel: "Vodafone Cash",
    instapayAccounts: [],
    vodafoneCashAccounts: [],
  });
  const [address, setAddress] = useState({
    firstName: summary?.user?.name?.split(" ")[0] ?? "",
    lastName: summary?.user?.name?.split(" ").slice(1).join(" ") ?? "",
    phone: "",
    city: " ",
    details: "",
  });

  useEffect(() => {
    const sync = () => setCartItems(readCart());
    sync();
    window.addEventListener("fitzone-cart-updated", sync);
    return () => window.removeEventListener("fitzone-cart-updated", sync);
  }, []);

  useEffect(() => {
    loadPublicApi()
      .then((d) => {
        if (Array.isArray(d.deliveryOptions)) {
          const options = (d.deliveryOptions as PublicDeliveryOption[]).slice().sort((a, b) => a.sortOrder - b.sortOrder);
          setDeliveryOptions(options);
          setSelectedDeliveryId((current) => current ?? options[0]?.id ?? null);
        }
        if (d.paymentSettings && typeof d.paymentSettings === "object") {
          setPaymentSettings((prev) => ({ ...prev, ...(d.paymentSettings as PublicPaymentSettings) }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (deliveryOptions.length > 0 && !selectedDeliveryId) {
      setSelectedDeliveryId(deliveryOptions[0]?.id ?? null);
    }
  }, [deliveryOptions, selectedDeliveryId]);

  const updateQty = (productId: string, size: string | null | undefined, delta: number) => {
    const next = readCart()
      .map((item) =>
        item.productId === productId && (item.size ?? "") === (size ?? "")
          ? { ...item, qty: Math.max(0, item.qty + delta) }
          : item,
      )
      .filter((item) => item.qty > 0);
    writeCart(next);
    setCartItems(next);
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const rewardsValue = Math.floor((summary?.rewardPoints ?? 0) / 100);
  const discount = useRewards ? rewardsValue : 0;
  const selectedDelivery = deliveryOptions.find((option) => option.id === selectedDeliveryId) ?? null;
  const shippingFee = selectedDelivery?.type === "pickup" ? 0 : selectedDelivery?.fee ?? 0;
  const total = Math.max(0, subtotal - discount + shippingFee);

  const availablePayMethods = useMemo(() => {
    const methods = [
      {
        id: "instapay",
        label: getDefaultAccount(
          paymentSettings.instapayAccounts,
          paymentSettings.instapayLabel || "InstaPay",
          paymentSettings.instapayUrl,
        ).label,
      },
      {
        id: "vodafone_cash",
        label: getDefaultAccount(
          paymentSettings.vodafoneCashAccounts,
          paymentSettings.vodafoneCashLabel || "Vodafone Cash",
          paymentSettings.vodafoneCashUrl,
        ).label,
      },
    ];
    if (selectedDelivery?.type === "pickup") {
      methods.unshift({ id: "cod", label: "الدفع عند الاستلام (داخل الجيم)" });
    }
    return methods;
  }, [paymentSettings.instapayLabel, paymentSettings.vodafoneCashLabel, selectedDelivery?.type]);

  useEffect(() => {
    if (!availablePayMethods.find((m) => m.id === payMethod)) {
      setPayMethod(availablePayMethods[0]?.id ?? "instapay");
    }
  }, [availablePayMethods, payMethod]);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&accept-language=${lang === "en" ? "en" : "ar"}`,
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        display_name?: string;
        address?: {
          city?: string;
          town?: string;
          village?: string;
          state?: string;
          county?: string;
        };
      };
      const displayName = payload.display_name?.trim() || "";
      const city =
        payload.address?.city?.trim() ||
        payload.address?.town?.trim() ||
        payload.address?.village?.trim() ||
        payload.address?.state?.trim() ||
        payload.address?.county?.trim() ||
        "";
      return {
        displayName,
        city,
      };
    } catch {
      return null;
    }
  };

  const fillCurrentLocation = () => {
    if (!navigator.geolocation) {
      setOrderMsg({ text: "المتصفح لا يدعم تحديد الموقع تلقائيًا.", ok: false });
      return;
    }

    setLocating(true);
    setOrderMsg(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const locationText =
          lang === "en"
            ? `Auto-detected location - Latitude: ${coords.latitude.toFixed(6)}, Longitude: ${coords.longitude.toFixed(6)}`
            : `الموقع التلقائي - Latitude: ${coords.latitude.toFixed(6)}, Longitude: ${coords.longitude.toFixed(6)}`;
        const resolved = await reverseGeocode(coords.latitude, coords.longitude);

        setAddress((current) => ({
          ...current,
          city: resolved?.city || current.city,
          details: resolved?.displayName || locationText,
        }));

        setOrderMsg({
          text: resolved?.displayName
            ? t("تم تحديد عنوانك تلقائيًا من نفس موقعك الحالي.", "Your address was detected automatically from your current location.")
            : t("تم تحديد موقعك الحالي، لكن تعذر تحويله إلى عنوان دقيق فتم استخدام الإحداثيات.", "Your current location was detected, but it could not be converted to an exact address, so coordinates were used instead."),
          ok: true,
        });
        setLocating(false);
      },
      () => {
          setOrderMsg({ text: t("تعذر تحديد موقعك. تأكدي من السماح بالوصول إلى الموقع الجغرافي.", "Could not detect your location. Please allow location access and try again."), ok: false });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const submitOrder = async () => {
    if (!summary?.authenticated) {
      window.location.href = `/login?callbackUrl=${encodeURIComponent("/account?tab=orders")}`;
      return;
    }
    if (cartItems.length === 0) return;
    if (!address.phone.trim() || !address.details.trim()) {
      setOrderMsg({ text: "يرجى إدخال رقم الهاتف والعنوان التفصيلي.", ok: false });
      return;
    }
    if (!selectedDeliveryId && deliveryOptions.length > 0) {
      setOrderMsg({ text: "يرجى اختيار وسيلة الشحن أو الاستلام.", ok: false });
      return;
    }

    setSubmitting(true);
    setOrderMsg(null);
    try {
      const recipientName = `${address.firstName} ${address.lastName}`.trim();
      const addressLine = `${address.city} - ${address.details}`.trim();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.qty,
            size: item.size,
          })),
          address: `${addressLine} - ${address.phone}`,
          recipientName,
          recipientPhone: address.phone,
          paymentMethod: payMethod,
          deliveryOptionId: selectedDeliveryId,
          isClubPickup: selectedDelivery?.type === "pickup",
        }),
      });

      const data = await res.json() as { error?: string; orderId?: string; message?: string; checkoutUrl?: string; transactionId?: string | null };
      if (!res.ok) {
        setOrderMsg({ text: data.error ?? "تعذر إنشاء الطلب حاليًا.", ok: false });
        return;
      }

      setCreatedOrderId(data.orderId ?? null);
      if (data.checkoutUrl) {
        const label =
          payMethod === "vodafone_cash"
            ? getDefaultAccount(
                paymentSettings.vodafoneCashAccounts,
                paymentSettings.vodafoneCashLabel,
                paymentSettings.vodafoneCashUrl,
              ).label
            : getDefaultAccount(
                paymentSettings.instapayAccounts,
                paymentSettings.instapayLabel,
                paymentSettings.instapayUrl,
              ).label;
        setPaymentAction({ url: data.checkoutUrl, label, transactionId: data.transactionId ?? null });
      } else {
        setPaymentAction(null);
      }
      setOrderMsg({ text: data.message ?? "تم تسجيل طلبك بنجاح.", ok: true });
      writeCart([]);
      setCartItems([]);
      setStep("success");
    } catch {
      setOrderMsg({ text: "حدث خطأ غير متوقع أثناء إنشاء الطلب.", ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "success") return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, textAlign: "center" }}>
      <div style={{ width: viewportWidth() < 768 ? 72 : 90, height: viewportWidth() < 768 ? 72 : 90, background: "rgba(34,197,94,.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: viewportWidth() < 768 ? 34 : 44, marginBottom: 24 }}>✅</div>
      <h1 style={{ fontSize: 34, fontWeight: 900, color: C.white, marginBottom: 10 }}>تم تسجيل طلبك بنجاح</h1>
      {createdOrderId && <p style={{ color: C.gray, fontSize: 15, marginBottom: 6 }}>رقم الطلب: {createdOrderId}</p>}
      <p style={{ color: C.gray, fontSize: 13, marginBottom: 24 }}>تم حفظ الطلب في النظام، وسيظهر في حسابك.</p>
      {paymentAction && (
        <div className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: C.white, marginBottom: 6 }}>إكمال الدفع عبر {paymentAction.label}</div>
          <div style={{ color: C.gray, fontSize: 12, marginBottom: 12 }}>افتحي الرابط التالي من الهاتف لإتمام التحويل.</div>
          <button
            className="btn-primary"
            style={{ justifyContent: "center", width: "100%" }}
            onClick={() => window.open(paymentAction.url, "_blank", "noopener,noreferrer")}
          >
            فتح رابط الدفع
          </button>
          {paymentAction.transactionId && (
            <button
              className="btn-outline"
              style={{ justifyContent: "center", width: "100%", marginTop: 10 }}
              onClick={() => window.open(`/payment/verify?transactionId=${paymentAction.transactionId}`, "_blank", "noopener,noreferrer")}
            >
              التحقق من الدفع
            </button>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn-primary" onClick={() => window.location.href = "/account?tab=orders"}>عرض طلباتي</button>
        <button className="btn-ghost" onClick={() => navigate("home")}>العودة للرئيسية</button>
      </div>
    </div>
  );

  return (
    <div>
      <section style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: "28px 0" }}>
        <div className="container">
          <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
            {[
              ["cart", t("السلة", "Cart")],
              ["address", t("العنوان", "Address")],
              ["delivery", t("الشحن", "Shipping")],
              ["payment", t("الدفع", "Payment")],
            ].map(([s, label], i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: step === s ? C.red : C.grayDark, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{i + 1}</div>
                <span style={{ fontWeight: 700, fontSize: 14, color: step === s ? C.white : C.gray }}>{label}</span>
                {i < 3 && <span style={{ color: C.grayDark }}>{lang === "ar" ? "←" : "→"}</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container" style={{ padding: "40px 24px" }}>
        {orderMsg && (
          <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 10, background: orderMsg.ok ? "#dcfce7" : "#fee2e2", color: orderMsg.ok ? "#166534" : "#991b1b", fontWeight: 700 }}>
            {orderMsg.text}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 360px"), gap: 28, alignItems: "start" }}>
          <div>
            {step === "cart" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{t("السلة", "Cart")}</h2>
                {cartItems.length === 0 && (
                  <div className="card" style={{ padding: 24, textAlign: "center", color: C.gray }}>
                      {t("لا توجد منتجات في السلة حاليًا.", "No products in the cart right now.")}
                  </div>
                )}
                {cartItems.map((item) => (
                  <div key={`${item.productId}-${item.size ?? ""}`} className="card" style={{ padding: 18, marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ width: 70, height: 70, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}><GymImg type={item.type} w={70} h={70} /></div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{item.name}</h3>
                      {item.size && <p style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{t("المقاس", "Size")}: {item.size}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                      <button onClick={() => updateQty(item.productId, item.size, -1)} style={{ width: 30, height: 30, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white }}>-</button>
                      <span style={{ width: 28, textAlign: "center", fontSize: 13, fontWeight: 700, color: C.white }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.productId, item.size, 1)} style={{ width: 30, height: 30, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white }}>+</button>
                    </div>
                    <span style={{ fontWeight: 900, color: C.red, width: 110, textAlign: "center", fontSize: 15 }}>{formatCurrency(item.price * item.qty)}</span>
                  </div>
                ))}
                <button className="btn-primary" disabled={cartItems.length === 0} style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15, marginTop: 14, opacity: cartItems.length === 0 ? 0.5 : 1 }} onClick={() => setStep("address")}>
                  {lang === "ar" ? "التالي: العنوان ←" : "Next: Address →"}
                </button>
              </div>
            )}

            {step === "address" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{t("بيانات العنوان", "Address details")}</h2>
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 14, marginBottom: 14 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("الاسم الأول", "First name")}</label><input className="input" value={address.firstName} onChange={(e) => setAddress({ ...address, firstName: e.target.value })} /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("اسم العائلة", "Last name")}</label><input className="input" value={address.lastName} onChange={(e) => setAddress({ ...address, lastName: e.target.value })} /></div>
                  </div>
                  <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("رقم الهاتف", "Phone number")}</label><input className="input" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} dir="ltr" /></div>
                  <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("المحافظة", "Governorate")}</label><select className="select" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })}><option>{t("بني سويف", "Beni Suef")}</option><option>{t("الفيوم", "Faiyum")}</option><option>{t("القاهرة", "Cairo")}</option></select></div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block" }}>{t("العنوان التفصيلي", "Detailed address")}</label>
                      <button
                        type="button"
                        className="btn-outline-gold"
                        style={{ padding: "6px 12px", fontSize: 12 }}
                        onClick={fillCurrentLocation}
                        disabled={locating}
                      >
                        <I n="map" s={14} c={C.gold} /> {locating ? t("جارٍ تحديد الموقع...", "Detecting location...") : t("تحديد موقعي تلقائيًا", "Use my current location")}
                      </button>
                    </div>
                    <input className="input" value={address.details} onChange={(e) => setAddress({ ...address, details: e.target.value })} placeholder={t("الشارع، رقم المبنى، علامة مميزة...", "Street, building number, landmark...")} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setStep("cart")}>{t("العودة للسلة", "Back to cart")}</button>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep("delivery")}>{t("متابعة إلى الشحن", "Continue to shipping")}</button>
                </div>
              </div>
            )}

            {step === "delivery" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{t("وسيلة الشحن أو الاستلام", "Delivery or pickup")}</h2>
                <div className="card" style={{ padding: 20 }}>
                  {deliveryOptions.length === 0 ? (
                    <div style={{ color: C.gray, fontSize: 13 }}>
                      {t("لا توجد خيارات شحن متاحة حالياً. يمكنك المتابعة وسيتم التواصل معك للتنسيق.", "No shipping options are available right now. You can continue and we will contact you to arrange delivery.")}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      {deliveryOptions.map((option) => {
                        const selected = option.id === selectedDeliveryId;
                        const feeLabel = option.type === "pickup" ? t("استلام من الجيم", "Gym pickup") : `${t("رسوم الشحن", "Shipping fee")} ${formatCurrency(option.fee)}`;
                        const etaLabel =
                          option.type === "pickup"
                            ? t("استلام مباشر", "Instant pickup")
                            : option.estimatedDaysMin || option.estimatedDaysMax
                              ? lang === "ar"
                                ? `التوصيل خلال ${option.estimatedDaysMin ?? option.estimatedDaysMax} - ${option.estimatedDaysMax ?? option.estimatedDaysMin} يوم`
                                : `Delivery in ${option.estimatedDaysMin ?? option.estimatedDaysMax}-${option.estimatedDaysMax ?? option.estimatedDaysMin} days`
                              : t("مدة التوصيل حسب الشركة", "Delivery time depends on the carrier");
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setSelectedDeliveryId(option.id)}
                            style={{
                              borderRadius: 12,
                              border: selected ? `2px solid ${C.red}` : `1px solid ${C.border}`,
                              padding: 14,
                              textAlign: "right",
                              background: selected ? "rgba(233,30,99,.08)" : "transparent",
                              cursor: "pointer",
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ fontWeight: 800, color: C.white }}>{option.name}</div>
                              {selected && <I n="check" s={16} c={C.red} />}
                            </div>
                            <div style={{ color: C.gray, fontSize: 12 }}>{option.description || etaLabel}</div>
                            <div style={{ color: C.gold, fontWeight: 700, fontSize: 12 }}>{feeLabel}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedDelivery?.type === "pickup" ? (
                  <div className="card" style={{ marginTop: 12, padding: 14, background: "rgba(34,197,94,.08)", border: `1px solid ${C.success}33` }}>
                    <div style={{ color: C.success, fontWeight: 700, fontSize: 12 }}>{t("الدفع عند الاستلام متاح عند الاستلام من الجيم فقط.", "Cash on delivery is available only for gym pickup.")}</div>
                  </div>
                ) : (
                  <div className="card" style={{ marginTop: 12, padding: 14, background: "rgba(233,30,99,.08)", border: `1px solid ${C.red}33` }}>
                    <div style={{ color: C.red, fontWeight: 700, fontSize: 12 }}>{t("عند اختيار شركة شحن، يتم الدفع مسبقاً عبر إنستا باي أو فودافون كاش.", "When shipping is selected, payment is made in advance via InstaPay or Vodafone Cash.")}</div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setStep("address")}>{t("العودة للعنوان", "Back to address")}</button>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep("payment")}>{t("متابعة إلى الدفع", "Continue to payment")}</button>
                </div>
              </div>
            )}

            {step === "payment" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{t("طريقة الدفع", "Payment method")}</h2>
                <div className="card" style={{ padding: 20 }}>
                  {availablePayMethods.map((method) => {
                    const icon = method.id === "instapay" ? "⚡" : method.id === "vodafone_cash" ? "💳" : "💵";
                    return (
                    <div key={method.id} onClick={() => setPayMethod(method.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 8, border: payMethod === method.id ? `2px solid ${C.red}` : `1px solid ${C.border}`, marginBottom: 10, cursor: "pointer", background: payMethod === method.id ? "rgba(233,30,99,.08)" : "transparent" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: payMethod === method.id ? "rgba(233,30,99,.2)" : C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: payMethod === method.id ? C.white : C.gray }}>{method.label}</span>
                      {payMethod === method.id && <I n="check" s={16} c={C.red} />}
                    </div>
                  );
                  })}
                </div>
                <div className="card" style={{ padding: 16, marginTop: 12 }}>
                  <div onClick={() => setUseRewards(!useRewards)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${useRewards ? C.red : C.border}`, background: useRewards ? C.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {useRewards && <I n="check" s={11} c="#fff" />}
                    </div>
                    <span style={{ fontSize: 13, color: C.grayLight }}>{t("استخدام نقاط الولاء", "Use reward points")} ({(summary?.rewardPoints ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")} {t("نقطة", "points")} = <strong style={{ color: C.gold }}>{formatCurrency(rewardsValue)}</strong>)</span>
                  </div>
                </div>
                <div className="card" style={{ padding: 18, marginTop: 12, background: "rgba(200,162,0,.08)", border: `1px solid ${C.gold}33` }}>
                  <p style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>{t("الدفع يتم عبر الهاتف.", "Payment is completed via phone.")}</p>
                  <p style={{ color: C.gray, fontSize: 12, marginTop: 6 }}>{t("بعد تسجيل الطلب ستصلك صفحة التحويل الخاصة بوسيلة الدفع المختارة.", "After placing the order, you will receive the transfer page for the selected payment method.")}</p>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setStep("delivery")}>{t("العودة للشحن", "Back to shipping")}</button>
                  <button className="btn-primary" disabled={submitting} style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 15, opacity: submitting ? 0.7 : 1 }} onClick={submitOrder}>
                    {submitting ? t("جارٍ تسجيل الطلب...", "Submitting order...") : `${t("تأكيد الطلب", "Confirm order")} ${formatCurrency(total)}`}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 24, position: viewportWidth() < 1024 ? "static" : "sticky", top: 90 }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white, marginBottom: 16 }}>{t("ملخص الطلب", "Order summary")}</h3>
            {cartItems.map((item) => (
              <div key={`${item.productId}-${item.size ?? ""}`} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.gray }}>{item.name} × {item.qty}</span>
                <span style={{ fontWeight: 600, color: C.white }}>{formatCurrency(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>{t("الإجمالي الفرعي", "Subtotal")}</span><span style={{ color: C.white }}>{formatCurrency(subtotal)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>{t("نقاط الولاء المتاحة", "Available reward points")}</span><span style={{ color: C.gold }}>{formatCurrency(rewardsValue)}</span></div>
            {discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>{t("الخصم المطبق", "Applied discount")}</span><span style={{ color: C.success }}>- {formatCurrency(discount)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}>
              <span style={{ color: C.gray }}>{t("رسوم الشحن", "Shipping fee")}</span>
              <span style={{ color: C.white }}>{formatCurrency(shippingFee)}</span>
            </div>
            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{t("الإجمالي النهائي", "Final total")}</span>
              <span style={{ fontWeight: 900, color: C.red, fontSize: 22 }}>{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── WALLET PAGE ──────────────────────────────────────────────────────────────
const WalletPage = () => {
  const t = useT();
  const { lang } = useLang();
  const [amount, setAmount] = useState(200);
  const options = [100, 200, 500, 1000];
  const transactions = lang === "en"
    ? [
        { type: "credit", label: "Wallet top-up", amount: +500, date: "Jan 14", bonus: 50 },
        { type: "debit", label: "Morning Yoga booking", amount: -120, date: "Jan 12" },
        { type: "debit", label: "Luna shoes purchase", amount: -850, date: "Jan 10" },
        { type: "credit", label: "Referral reward", amount: +100, date: "Jan 8" },
        { type: "debit", label: "Pro plan", amount: -599, date: "Jan 1" },
      ]
    : [
        { type: "credit", label: "شحن المحفظة", amount: +500, date: "١٤ يناير", bonus: 50 },
        { type: "debit", label: "حجز يوجا الصباح", amount: -120, date: "١٢ يناير" },
        { type: "debit", label: "شراء حذاء Luna", amount: -850, date: "١٠ يناير" },
        { type: "credit", label: "مكافأة إحالة", amount: +100, date: "٨ يناير" },
        { type: "debit", label: "اشتراك برو", amount: -599, date: "١ يناير" },
      ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE8F0, #FFF5F8)`, padding: "64px 0", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 60%, rgba(200,162,0,.1), transparent 60%)" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>💳</div>
          <p style={{ color: C.gray, fontSize: 15 }}>{t("رصيد المحفظة الحالي", "Current wallet balance")}</p>
          <div style={{ fontSize: 72, fontWeight: 900, color: C.gold, margin: "12px 0" }}>
            150 <span style={{ fontSize: 30, color: C.gray }}>{lang === "en" ? "EGP" : "ج.م"}</span>
          </div>
          <p style={{ color: C.grayDark, fontSize: 13 }}>{t("صالح حتى ٣١ ديسمبر ٢٠٢٥", "Valid until Dec 31, 2025")}</p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 740, margin: "0 auto" }}>
          <div className="card" style={{ padding: 32, marginBottom: 28 }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 6 }}>{t("شحن المحفظة", "Top up wallet")}</h2>
            <p style={{ color: C.gray, fontSize: 13, marginBottom: 24 }}>{t("اشحني واحصلي على بونص إضافي!", "Top up and get extra bonus!")}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              {options.map(opt => (
                <button key={opt} onClick={() => setAmount(opt)} style={{ position: "relative", padding: "12px 22px", border: amount === opt ? `2px solid ${C.red}` : `1px solid ${C.border}`, borderRadius: 8, background: amount === opt ? "rgba(233,30,99,.12)" : C.bgCard2, color: amount === opt ? C.red : C.gray, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>
                  {formatCurrency(opt)}
                  {opt >= 200 && <span className="badge badge-gold" style={{ position: "absolute", top: -10, left: -8, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>+{Math.round(opt * 0.1)} {t("بونص", "bonus")}</span>}
                </button>
              ))}
            </div>
            <div style={{ background: C.bgCard2, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <h4 style={{ fontWeight: 700, color: C.gold, marginBottom: 10, fontSize: 13 }}>🎁 {t("قواعد البونص", "Bonus rules")}</h4>
              {[["أقل من 200 ج.م","لا بونص"],["200 - 499 ج.م","10% بونص إضافي"],["500 ج.م فأكثر","15% بونص + هدية"]].map(([r,v]) => (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.gray }}>{r}</span><span style={{ fontWeight: 600, color: C.white }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(200,162,0,.08)", border: `1px solid ${C.gold}33`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <I n="info" s={18} c={C.gold} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.gold }}>{t("ستحصلين على", "You will receive")} {formatCurrency(amount + (amount >= 200 ? Math.round(amount * 0.1) : 0))}</div>
                <div style={{ fontSize: 11, color: C.gray }}>{t("مقابل دفع", "For only")} {formatCurrency(amount)}</div>
              </div>
            </div>
            <button className="btn-gold" style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15 }}>
              <I n="wallet" s={18} c="#000" /> {t("شحن", "Top up")} {formatCurrency(amount)} {t("الآن", "now")}
            </button>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 20 }}>{t("سجل المعاملات", "Transaction history")}</h2>
            {transactions.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < transactions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: item.type === "credit" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: item.type === "credit" ? C.success : "#EF4444" }}>
                    {item.type === "credit" ? "↑" : "↓"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.white }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: C.gray }}>{item.date}</div>
                  </div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 800, color: item.type === "credit" ? C.success : "#EF4444", fontSize: 14 }}>
                    {item.type === "credit" ? "+" : "-"}{formatCurrency(Math.abs(item.amount))}
                  </div>
                  {item.bonus && <div style={{ fontSize: 10, color: C.gold }}>+{item.bonus} {t("بونص", "bonus")}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── REWARDS PAGE ─────────────────────────────────────────────────────────────
const RewardsPage = () => {
  const t = useT();
  const { lang } = useLang();
  const tiers = [
    { name: t("برونزي", "Bronze"), min: 0, max: 999, icon: "🥉", color: "#CD7F32" },
    { name: t("فضي", "Silver"), min: 1000, max: 2999, icon: "🥈", color: "#9CA3AF", current: true },
    { name: t("ذهبي", "Gold"), min: 3000, max: 4999, icon: "🥇", color: C.gold },
    { name: t("بلاتيني", "Platinum"), min: 5000, max: null, icon: "💎", color: "#A855F7" },
  ];
  const earnMethods = [
    { icon: "🏋️", label: t("حجز كلاس", "Book a class"), pts: t("+10 نقاط", "+10 points") },
    { icon: "🛍️", label: t("كل 10 ج.م شراء", "Every 10 EGP purchase"), pts: t("+1 نقطة", "+1 point") },
    { icon: "👥", label: t("دعوة صديقة", "Invite a friend"), pts: t("+200 نقطة", "+200 points") },
    { icon: "⭐", label: t("تقييم كلاس", "Review a class"), pts: t("+20 نقطة", "+20 points") },
    { icon: "🎂", label: t("عيد ميلادك", "Your birthday"), pts: t("+100 نقطة", "+100 points") },
    { icon: "📱", label: t("تسجيل يومي", "Daily check-in"), pts: t("+5 نقاط", "+5 points") },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFECF0, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <div style={{ fontSize: viewportWidth() < 768 ? 40 : 52, marginBottom: 12 }}>⭐</div>
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 42, fontWeight: 900, color: C.white, marginBottom: 8 }}>{t("نقاط", "Reward")} <span style={{ color: C.gold }}>{t("المكافآت", "points")}</span></h1>
          <div style={{ fontSize: viewportWidth() < 768 ? 48 : 68, fontWeight: 900, color: C.gold, margin: "12px 0" }}>2,400</div>
          <p style={{ color: C.gray }}>{t("نقطة", "1 point")} = <strong style={{ color: C.red }}>{formatCurrency(24)}</strong> {t("رصيد قابل للاستبدال", "redeemable balance")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", marginBottom: 32 }}>{t("مستويات", "Membership")} <span>{t("العضوية", "tiers")}</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr 1fr", "repeat(4, 1fr)", "repeat(4, 1fr)"), gap: 16, marginBottom: 56 }}>
            {tiers.map(t => (
              <div key={t.name} className="card" style={{ padding: 22, textAlign: "center", border: t.current ? `2px solid ${C.gold}` : `1px solid ${C.border}`, position: "relative" }}>
                {t.current && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#000", padding: "2px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{lang === "en" ? "Your current tier" : "مستواك الحالي"}</div>}
                <div style={{ fontSize: viewportWidth() < 768 ? 34 : 44, marginBottom: 10 }}>{t.icon}</div>
                <h3 style={{ fontWeight: 800, color: t.color }}>{t.name}</h3>
                <p style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>{t.min.toLocaleString(lang === "en" ? "en-US" : "ar-EG")}+ {lang === "en" ? "points" : "نقطة"}</p>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 40 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>{t("كيف", "How to")} <span>{t("تكسبين", "earn")}</span> {t("النقاط", "points")}</h2>
              <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 10 }}>
                {earnMethods.map(m => (
                  <div key={m.label} className="card" style={{ padding: 14 }}>
                    <div style={{ fontSize: 26, marginBottom: 6 }}>{m.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: C.white, marginBottom: 4 }}>{m.label}</div>
                    <span className="badge badge-gold" style={{ fontSize: 10 }}>{m.pts}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>{t("كيف", "How to")} <span>{t("تستبدلين", "redeem")}</span></h2>
              <div className="card" style={{ padding: 20 }}>
                {[
                  [t("100 نقطة", "100 points"), t("= 1 ج.م رصيد محفظة", "= 1 EGP wallet credit")],
                  [t("500 نقطة", "500 points"), t("= خصم 5%", "= 5% discount")],
                  [t("1000 نقطة", "1000 points"), t("= كلاس مجاني", "= Free class")],
                  [t("3000 نقطة", "3000 points"), t("= شهر اشتراك مجاني", "= Free membership month")],
                  [t("5000 نقطة", "5000 points"), t("= منتج هدية", "= Gift product")],
                ].map(([pts, val]) => (
                  <div key={pts} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{pts}</span>
                    <span style={{ fontSize: 12, color: C.gray }}>{val}</span>
                    <button className="btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>{t("استبدلي", "Redeem")}</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── REFERRAL PAGE ────────────────────────────────────────────────────────────
const ReferralPage = () => {
  const { lang } = useLang();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const code = "FZONE-2025-123";
  const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "64px 0", textAlign: "center" }}>
        <div className="container">
          <div style={{ fontSize: viewportWidth() < 768 ? 44 : 60, marginBottom: 14 }}>🎁</div>
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>{t("ادعي صاحبتك", "Invite your friend")} <span style={{ color: C.red }}>{t("واربحا معًا!", "and both win!")}</span></h1>
          <p style={{ color: C.gray, fontSize: 17, maxWidth: 460, margin: "0 auto" }}>{t("كل صديقة تشترك بدعوتك تحصلان معًا على خصم 20% على الاشتراك القادم.", "Every friend who joins through your invitation gives both of you 20% off your next membership.")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container" style={{ maxWidth: 680, margin: "0 auto" }}>
          <div className="card" style={{ padding: 36, textAlign: "center", marginBottom: 28, border: `1px solid ${C.red}33` }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 6 }}>{t("كودك الخاص", "Your referral code")}</h2>
            <p style={{ color: C.gray, fontSize: 13, marginBottom: 22 }}>{t("شاركيه مع صديقاتك واكسبي المكافآت", "Share it with your friends and earn rewards")}</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", background: "rgba(233,30,99,.08)", border: `1px solid ${C.red}33`, borderRadius: 10, padding: "14px 20px", marginBottom: 18 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: C.red, letterSpacing: 2, fontFamily: "monospace" }}>{code}</span>
              <button onClick={copy} style={{ background: copied ? C.success : C.red, border: "none", borderRadius: 6, padding: "7px 14px", color: "#fff", fontFamily: "'Cairo', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                {copied ? <><I n="check" s={13} c="#fff" /> {t("تم النسخ", "Copied")}</> : <><I n="copy" s={13} c="#fff" /> {t("نسخ الكود", "Copy code")}</>}
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button style={{ background: "#25D366", border: "none", borderRadius: 6, padding: "10px 18px", color: "#fff", fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <I n="whatsapp" s={15} c="#fff" /> {t("واتساب", "WhatsApp")}
              </button>
              <button style={{ background: "rgba(255,255,255,.08)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 18px", color: C.white, fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {t("نسخ الرابط", "Copy link")}
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 14, marginBottom: 28 }}>
            {[
              ["👥", "12", t("إحالة ناجحة", "Successful referrals")],
              ["💰", lang === "en" ? "240 EGP" : "240 ج.م", t("مكتسبة", "Earned")],
              ["🔄", "3", t("في الانتظار", "Pending")],
            ].map(([icon,val,lbl]) => (
              <div key={lbl} className="card" style={{ padding: 18, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.red }}>{val}</div>
                <div style={{ fontSize: 11, color: C.gray }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 28 }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 20 }}>{t("إزاي بيشتغل؟", "How it works")}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[
                [t("شاركي كودك", "Share your code"), t("أرسلي الكود لصديقاتك على واتساب أو الإنستجرام", "Send your code to friends on WhatsApp or Instagram"), C.red],
                [t("صديقتك تشتركي", "Your friend joins"), t("لما تشتركي بالكود بتاعك كلتيكما هتاخدوا خصم 20%", "When she joins using your code, you both get 20% off"), C.gold],
                [t("اكسبي المكافأة", "Earn the reward"), t("يضافلك 200 نقطة فور إتمام صديقتك الاشتراك", "You get 200 points once she completes the membership"), C.success],
              ].map(([title, desc, col], i) => (
                <div key={title} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: col, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, flexShrink: 0 }}>{i+1}</div>
                  <div>
                    <h4 style={{ fontWeight: 800, color: C.white, marginBottom: 4 }}>{title}</h4>
                    <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
const AccountPage = ({ navigate }: { navigate: (p: string) => void }) => {
  const t = useT();
  const { lang } = useLang();
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = [
    { id: "overview", label: t("نظرة عامة", "Overview"), icon: "home" },
    { id: "profile", label: t("بياناتي", "My profile"), icon: "user" },
    { id: "memberships", label: t("اشتراكاتي", "My memberships"), icon: "repeat" },
    { id: "bookings", label: t("حجوزاتي", "My bookings"), icon: "calendar" },
    { id: "orders", label: t("طلباتي", "My orders"), icon: "box" },
    { id: "wallet", label: t("المحفظة", "Wallet"), icon: "wallet" },
    { id: "rewards", label: t("النقاط", "Rewards"), icon: "star" },
    { id: "referrals", label: t("الإحالات", "Referrals"), icon: "share" },
  ];
  const bookings = lang === "en"
    ? [
        { name: "Morning Yoga", date: "Jan 15", time: "7:00 AM", status: "Upcoming", trainer: "Heba" },
        { name: "Zumba", date: "Jan 12", time: "9:30 AM", status: "Completed", trainer: "Manal" },
        { name: "Pilates", date: "Jan 10", time: "11:00 AM", status: "Cancelled", trainer: "Sahar" },
      ]
    : [
        { name: "يوجا الصباح", date: "١٥ يناير", time: "٧:٠٠ ص", status: "قادم", trainer: "هبة" },
        { name: "زومبا", date: "١٢ يناير", time: "٩:٣٠ ص", status: "مكتمل", trainer: "منال" },
        { name: "بيلاتس", date: "١٠ يناير", time: "١١:٠٠ ص", status: "ملغي", trainer: "سحر" },
      ];
  const orders = lang === "en"
    ? [
        { id: "#FZ001", item: "Luna Sport Shoes", date: "Jan 12", price: 850, status: "Delivered" },
        { id: "#FZ002", item: "Pro monthly plan", date: "Jan 01", price: 599, status: "Active" },
      ]
    : [
        { id: "#FZ001", item: "حذاء Luna Sport", date: "١٢ يناير", price: 850, status: "تم التسليم" },
        { id: "#FZ002", item: "باقة برو شهرية", date: "٠١ يناير", price: 599, status: "نشط" },
      ];

  return (
    <div>
      <div style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bgCard})`, borderBottom: `1px solid ${C.border}`, padding: "28px 0" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, background: "rgba(233,30,99,.2)", border: `2px solid ${C.red}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontWeight: 900, fontSize: 26 }}>{lang === "en" ? "F" : "ف"}</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: C.white }}>{lang === "en" ? "Fatma Mohamed" : "فاطمة محمد"}</h1>
            <p style={{ color: C.gray, fontSize: 13 }}>{lang === "en" ? "fatma@example.com · Member since Jan 2024" : "fatma@example.com آ· عضوة منذ يناير ٢٠٢٤"}</p>
            <span className="badge" style={{ marginTop: 6, display: "inline-flex" }}>👑 {t("عضوة Pro", "Pro member")}</span>
          </div>
        </div>
      </div>
      <div className="container" style={{ padding: "32px 24px", display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "240px 1fr"), gap: 28 }}>
        <aside>
          <div className="card" style={{ padding: 8 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", borderRadius: 8, border: "none", background: activeTab === t.id ? "rgba(233,30,99,.12)" : "none", color: activeTab === t.id ? C.red : C.gray, fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "right" }}>
                <I n={t.icon} s={15} c={activeTab === t.id ? C.red : C.gray} /> {t.label}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", borderRadius: 8, border: "none", background: "none", color: "#EF4444", fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <I n="logout" s={15} c="#EF4444" /> {t("تسجيل الخروج", "Log out")}
              </button>
            </div>
          </div>
        </aside>
        <main>
          {activeTab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 28 }}>
                {[
                  ["💳", lang === "en" ? "150 EGP" : "150 ج.م", t("رصيد المحفظة", "Wallet balance")],
                  ["⭐", "2,400", t("نقاط المكافآت", "Reward points")],
                  ["👑", "Pro", t("الاشتراك النشط", "Active plan")],
                  ["📅", lang === "en" ? "Jan 15" : "١٥ يناير", t("الحجز القادم", "Next booking")],
                ].map(([icon,val,lbl]) => (
                  <div key={lbl} className="card" style={{ padding: 18 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: C.red }}>{val}</div>
                    <div style={{ fontSize: 12, color: C.gray }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontWeight: 800, color: C.white, marginBottom: 14 }}>{t("الحجز القادم", "Next booking")}</h3>
                <div style={{ background: "rgba(233,30,99,.08)", border: `1px solid ${C.red}22`, borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.white }}>{lang === "en" ? "Morning Yoga" : "يوجا الصباح"}</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{lang === "en" ? "Sunday Jan 15 · 7:00 AM · with Heba Zarei" : "الأحد ١٥ يناير آ· ٧:٠٠ ص آ· مع هبة زارع"}</div>
                  </div>
                  <span className="badge badge-green">{t("قادم", "Upcoming")}</span>
                </div>
              </div>
            </div>
          )}
          {activeTab === "bookings" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>{t("حجوزاتي", "My bookings")}</h2>
              {bookings.map((b, i) => (
                <div key={i} className="card" style={{ padding: 18, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{b.name}</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{b.date} · {b.time} · {t("مع", "with")} {b.trainer}</div>
                  </div>
                  <span style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: b.status === "confirmed" ? "rgba(34,197,94,.12)" : b.status === "pending" ? "rgba(233,30,99,.12)" : "rgba(239,68,68,.1)", color: b.status === "confirmed" ? C.success : b.status === "pending" ? C.red : "#EF4444" }}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
          {activeTab === "orders" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>{t("طلباتي", "My orders")}</h2>
              {orders.map((o, i) => (
                <div key={i} className="card" style={{ padding: 18, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{o.item}</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{o.id} · {o.date}</div>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 900, color: C.red, fontSize: 15 }}>{o.price} {lang === "en" ? "EGP" : "ج.م"}</div>
                      <span style={{ padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: o.status === "confirmed" ? "rgba(34,197,94,.12)" : C.bgCard2, color: o.status === "confirmed" ? C.success : C.gray }}>{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === "profile" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>{t("بياناتي الشخصية", "Personal information")}</h2>
              <div className="card" style={{ padding: 28 }}>
                <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 14 }}>
                  {[
                    [t("الاسم الأول", "First name"), lang === "en" ? "Fatma" : "فاطمة"],
                    [t("اسم العائلة", "Last name"), lang === "en" ? "Mohamed" : "محمد"],
                    [t("البريد الإلكتروني", "Email"), "fatma@example.com"],
                    [t("رقم الجوال", "Phone"), "010XXXXXXXX"],
                    [t("تاريخ الميلاد", "Birth date"), lang === "en" ? "Mar 15, 1992" : "١٥ مارس ١٩٩٢"],
                    [t("المحافظة", "City"), lang === "en" ? "Beni Suef" : "بني سويف"],
                  ].map(([lbl, val]) => (
                    <div key={lbl}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{lbl}</label>
                      <input className="input" defaultValue={val} dir={typeof lbl === "string" && (lbl.includes("Email") || lbl.includes("Phone") || lbl.includes("البريد") || lbl.includes("رقم")) ? "ltr" : "rtl"} />
                    </div>
                  ))}
                </div>
                <button className="btn-primary" style={{ marginTop: 20 }}>{t("حفظ التغييرات", "Save changes")}</button>
              </div>
            </div>
          )}
          {["wallet","rewards","referrals","memberships"].includes(activeTab) && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 52, marginBottom: 18 }}>{activeTab === "wallet" ? "💳" : activeTab === "rewards" ? "🎁" : activeTab === "referrals" ? "🤝" : "⭐"}</div>
              <h3 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 10 }}>
                {activeTab === "wallet" ? t("المحفظة", "Wallet") : activeTab === "rewards" ? t("نقاط المكافآت", "Rewards") : activeTab === "referrals" ? t("برنامج الإحالة", "Referral program") : t("الاشتراكات", "Memberships")}
              </h3>
              <p style={{ color: C.gray, marginBottom: 20, fontSize: 14 }}>{t("روحي للصفحة المخصصة لكل التفاصيل", "Go to the dedicated page for full details")}</p>
              <button className="btn-primary">{t("عرض الصفحة الكاملة", "View full page")}</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// ─── TRAINERS PAGE ────────────────────────────────────────────────────────────
const TrainersPage = () => {
  const { lang } = useLang();
  const [trainers, setTrainers] = useState<PublicTrainer[]>([]);
  const [pageContent, setPageContent] = useState<TrainersPageContent>({
    badge: "فريقنا",
    title: "مدرباتنا المحترفات",
    subtitle: "أفضل فريق تدريبي في بني سويف",
    description: "تعرفي على فريق المدربات في فيت زون واختاري المدربة الأقرب لهدفك التدريبي.",
    highlight: "تخصصات واضحة وسجل جلسات لكل مدربة",
    ctaLabel: "احجزي مع المدربة المناسبة",
  });

  useEffect(() => {
    loadPublicApi().then((data) => {
      if (Array.isArray(data.trainers)) {
        setTrainers(data.trainers as PublicTrainer[]);
      }
      if (data.trainersPage && typeof data.trainersPage === "object") {
        setPageContent((current) => ({
          ...current,
          ...(data.trainersPage as Partial<TrainersPageContent>),
        }));
      }
    }).catch(() => {});
  }, []);

  const badge = lang === "en" ? pageContent.badgeEn ?? pageContent.badge : pageContent.badge;
  const title = lang === "en" ? pageContent.titleEn ?? pageContent.title : pageContent.title;
  const subtitle = lang === "en" ? pageContent.subtitleEn ?? pageContent.subtitle : pageContent.subtitle;
  const description = lang === "en" ? pageContent.descriptionEn ?? pageContent.description : pageContent.description;
  const highlight = lang === "en" ? pageContent.highlightEn ?? pageContent.highlight : pageContent.highlight;
  const ctaLabel = lang === "en" ? pageContent.ctaLabelEn ?? pageContent.ctaLabel : pageContent.ctaLabel;

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <span className="tag" style={{ marginBottom: 14, display: "inline-block" }}>{badge}</span>
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>
            {title}
          </h1>
          <p style={{ color: C.gray, fontSize: 17, marginBottom: 8 }}>{subtitle}</p>
          <p style={{ color: C.gray, fontSize: 15, maxWidth: 760, margin: "0 auto", lineHeight: 1.9 }}>{description}</p>
          <div style={{ marginTop: 18, color: C.red, fontWeight: 700, fontSize: 14 }}>{highlight}</div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {trainers.map((t, index) => (
              <div key={t.id} className="card card-hover" style={{ overflow: "hidden" }}>
                <div style={{ height: 260, background: "#fff" }}>
                  {t.image ? (
                    <img src={t.image} alt={t.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <GymImg type={`trainer${(index % 3) + 1}`} w="100%" h={260} />
                  )}
                </div>
                <div style={{ padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{t.name}</h3>
                    <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>⭐ {t.rating}</span>
                  </div>
                  <p style={{ color: C.red, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{t.specialty}</p>
                  <p style={{ color: C.gray, fontSize: 12, lineHeight: 1.8, marginBottom: 14 }}>{t.bio}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                    {t.certifications.map((cert) => (
                      <span key={cert} className="tag-gold" style={{ fontSize: 10 }}>
                        {cert}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.gray }}>
                      {t.sessionsCount.toLocaleString(lang === "en" ? "en-US" : "ar-EG")} {lang === "en" ? "sessions" : "جلسة"} · {t.classesCount.toLocaleString(lang === "en" ? "en-US" : "ar-EG")} {lang === "en" ? "classes" : "كلاسات"}
                    </span>
                    <button className="btn-outline-gold" style={{ padding: "5px 14px", fontSize: 11 }}>
                      {ctaLabel}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── BLOG PAGE ────────────────────────────────────────────────────────────────
const BlogPage = () => {
  const t = useT();
  const [activeArticle, setActiveArticle] = useState<PublicBlogPost | null>(null);
  const allLabel = t("الكل", "All");
  const [cat, setCat] = useState(allLabel);
  const [blog, setBlog] = useState<PublicBlog>({ categories: [], posts: [] });

  useEffect(() => {
    loadPublicApi()
      .then((data) => {
        if (data.blog && typeof data.blog === "object") {
          setBlog((current) => ({ ...current, ...(data.blog as PublicBlog) }));
        }
      })
      .catch(() => {});
  }, []);

  const categories =
    blog.categories.length > 0
      ? blog.categories
      : Array.from(new Set(blog.posts.map((post) => post.category).filter(Boolean)));
  const cats = [allLabel, ...categories];
  const activePosts = blog.posts.filter((post) => post.active !== false);
  const featured = activePosts.find((post) => post.featured) ?? activePosts[0];
  const rest = activePosts.filter(
    (post) => post.id !== featured?.id && (cat === allLabel || post.category === cat),
  );
  useEffect(() => {
    setCat(allLabel);
  }, [allLabel]);

  const renderMedia = (post: PublicBlogPost, height: number) => {
    if (post.videoUrl) {
      return (
        <video
          src={post.videoUrl}
          controls
          style={{ width: "100%", height, objectFit: "cover", borderRadius: 14 }}
        />
      );
    }
    if (post.coverImage) {
      return (
        <img
          src={post.coverImage}
          alt={post.title}
          style={{ width: "100%", height, objectFit: "cover", borderRadius: 14 }}
        />
      );
    }
    return <GymImg type="blog" w="100%" h={height} />;
  };

  if (activeArticle) {
    const a = activeArticle;
    return (
      <div>
        <div style={{ height: 300, position: "relative" }}>
          {renderMedia(a, 300)}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent, rgba(10,10,10,.9))" }} />
          <div style={{ position: "absolute", bottom: 28, left: 0, right: 0 }}><div className="container">
            <button onClick={() => setActiveArticle(null)} style={{ background: "rgba(255,255,255,.1)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 14px", color: C.white, cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: 10, fontSize: 13 }}>← {t("رجوع", "Back")}</button>
            <span className="tag" style={{ marginBottom: 10, display: "inline-flex" }}>{a.category}</span>
            <h1 style={{ color: C.white, fontSize: 30, fontWeight: 900 }}>{a.title}</h1>
          </div></div>
        </div>
        <div className="container" style={{ maxWidth: 740, padding: "40px 24px" }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, color: C.gray, fontSize: 13, flexWrap: "wrap" }}>
            <span>✍️ {a.author}</span><span>📅 {a.date}</span><span>⏱ {a.readTime} {t("قراءة", "read")}</span>
          </div>
          <div className="card" style={{ padding: 36 }}>
            {a.videoUrl ? (
              <div style={{ marginBottom: 20 }}>
                <video src={a.videoUrl} controls style={{ width: "100%", borderRadius: 14 }} />
              </div>
            ) : null}
            <p style={{ lineHeight: 2, fontSize: 15, color: C.grayLight }}>{a.content}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: viewportWidth() < 768 ? 30 : 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>{t("مدونة", "Blog")} <span style={{ color: C.red }}>{t("فيت زون", "Fit Zone")}</span></h1>
          <p style={{ color: C.gray, fontSize: 15 }}>{t("نصائح ومقالات في اللياقة والصحة النسائية", "Tips and articles on fitness and women’s health")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          {featured && (
            <div className="card card-hover" style={{ overflow: "hidden", marginBottom: 48, display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), cursor: "pointer", border: `1px solid ${C.red}22` }} onClick={() => setActiveArticle(featured)}>
              <div style={{ height: 300 }}>{renderMedia(featured, 300)}</div>
              <div style={{ padding: 36, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span className="badge" style={{ marginBottom: 14, display: "inline-flex", width: "fit-content" }}>{t("مقال مميز", "Featured")}</span>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: C.white, marginBottom: 14, lineHeight: 1.4 }}>{featured.title}</h2>
                <p style={{ color: C.gray, lineHeight: 1.7, marginBottom: 18, fontSize: 13 }}>
                  {(featured.summary || featured.content).substring(0, 80)}...
                </p>
                <div style={{ display: "flex", gap: 16, color: C.gray, fontSize: 12, marginBottom: 22 }}>
                  <span>✍️ {featured.author}</span><span>⏱ {featured.readTime}</span>
                </div>
                <button className="btn-primary" style={{ width: "fit-content" }}>{t("اقرئي المقال", "Read article")} →</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
            {cats.map(c => <button key={c} className={`tab ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr 1fr", "repeat(3, 1fr)"), gap: 24 }}>
            {rest.map(a => (
              <div key={a.title} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => setActiveArticle(a)}>
                <div style={{ height: 170 }}>{renderMedia(a, 170)}</div>
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span className="tag" style={{ fontSize: 11 }}>{a.category}</span>
                    <span style={{ color: C.gray, fontSize: 11 }}>{a.readTime}</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 14, color: C.white, lineHeight: 1.5, marginBottom: 10 }}>{a.title}</h3>
                  <span style={{ color: C.gray, fontSize: 11 }}>✍️ {a.author}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── CONTACT PAGE ─────────────────────────────────────────────────────────────
const ContactPage = () => {
  const t = useT();
  const defaultSubject = t("استفسار عام", "General inquiry");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [contactSubject, setContactSubject] = useState(defaultSubject);
  const [contactMessage, setContactMessage] = useState("");
  const [contactLoading, setContactLoading] = useState(false);
  const [contactResult, setContactResult] = useState<"success" | "error" | "auth" | null>(null);
  const [contactInfo, setContactInfo] = useState<PublicContact>(DEFAULT_CONTACT);
  const faqs = [
    { q: t("إيه ساعات العمل؟", "What are your working hours?"), a: t("بنشتغل من الأحد للخميس من الساعة ٧ الصبح لـ ١٠ بالليل، والجمعة والسبت من ٨ الصبح لـ ٨ بالليل.", "We operate Sunday to Thursday from 7 AM to 10 PM, and Friday and Saturday from 8 AM to 8 PM.") },
    { q: t("هل في كلاسات للأطفال؟", "Do you offer classes for kids?"), a: t("أيوه! عندنا برامج مخصصة للأطفال من سن ٤ سنوات. تواصلي معنا لمعرفة التفاصيل.", "Yes. We offer dedicated programs for children starting from age 4. Contact us for the details.") },
    { q: t("ممكن أجمد العضوية؟", "Can I freeze my membership?"), a: t("أيوه، تقدري تجمدي العضوية مرة في الشهر لمدة مش أكتر من أسبوعين.", "Yes, you can freeze your membership once per month for up to two weeks.") },
    { q: t("إيه طرق الدفع المتاحة؟", "What payment methods are available?"), a: t("نقبل كاش، بطاقات دفع، انستاباي، والمحفظة الرقمية.", "We accept cash, bank cards, InstaPay, and digital wallets.") },
    { q: t("هل في عروض للمجموعات؟", "Do you have group offers?"), a: t("أيوه! في عروض خاصة للمجموعات من ٤ أشخاص فأكثر بخصومات لحد ٣٠٪.", "Yes. We offer special deals for groups of 4 or more with discounts up to 30%.") },
  ];

  useEffect(() => {
    loadPublicApi()
      .then((data) => {
        if (data.contact && typeof data.contact === "object") {
          setContactInfo((current) => ({ ...current, ...(data.contact as Partial<PublicContact>) }));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setContactSubject(defaultSubject);
  }, [defaultSubject]);

  const whatsappLink = normalizeWhatsappLink(contactInfo.whatsapp);

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #FFE0EC, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <h1 style={{ fontSize: viewportWidth() < 768 ? 32 : 44, fontWeight: 900, color: C.white, marginBottom: 10 }}>{t("تواصلي", "Contact")} <span style={{ color: C.red }}>{t("معنا", "us")}</span></h1>
          <p style={{ color: C.gray, fontSize: 17 }}>{t("إحنا موجودين عشانك في أي وقت 💪", "We are here for you anytime 💪")}</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: responsiveColumns("1fr", "1fr", "1fr 1fr"), gap: 48 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 24 }}>{t("ابعتيلنا", "Send us")} <span>{t("رسالة", "a message")}</span></h2>
              <div className="card" style={{ padding: 28 }}>
                {contactResult === "success" ? (
                  <div style={{ textAlign: "center", padding: "32px 0" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                    <div style={{ fontWeight: 700, color: C.white, fontSize: 16, marginBottom: 8 }}>{t("تم إرسال رسالتك بنجاح!", "Your message was sent successfully!")}</div>
                    <div style={{ color: C.gray, fontSize: 13, marginBottom: 20 }}>{t("سيتم الرد عليك في أقرب وقت.", "We will reply as soon as possible.")}</div>
                    <button className="btn-primary" style={{ padding: "8px 24px", fontSize: 13 }} onClick={() => { setContactResult(null); setContactMessage(""); setContactSubject(defaultSubject); }}>{t("إرسال رسالة أخرى", "Send another message")}</button>
                  </div>
                ) : (
                  <>
                    {contactResult === "auth" && (
                      <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(234,179,8,.08)", border: "1px solid rgba(234,179,8,.25)", color: "#EAB308", fontSize: 13 }}>
                        {t("يجب", "You must")} <a href="/login" style={{ color: C.gold, fontWeight: 700 }}>{t("تسجيل الدخول", "log in")}</a> {t("أولاً لإرسال رسالة.", "first to send a message.")}
                      </div>
                    )}
                    {contactResult === "error" && (
                      <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 8, background: "rgba(233,30,99,.08)", border: "1px solid rgba(233,30,99,.25)", color: C.red, fontSize: 13 }}>
                        {t("حدث خطأ أثناء الإرسال. حاولي مرة أخرى أو تواصلي عبر واتساب.", "An error occurred while sending. Try again or contact us on WhatsApp.")}
                      </div>
                    )}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("الموضوع", "Subject")}</label>
                      <select className="select" value={contactSubject} onChange={e => setContactSubject(e.target.value)}>
                        <option>{t("استفسار عام", "General inquiry")}</option>
                        <option>{t("مشكلة في الحجز", "Booking issue")}</option>
                        <option>{t("اشتراكات", "Memberships")}</option>
                        <option>{t("شكوى", "Complaint")}</option>
                      </select>
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{t("الرسالة", "Message")}</label>
                      <textarea className="input" rows={4} placeholder={t("اكتبي رسالتك هنا...", "Write your message here...")} style={{ resize: "vertical" }} value={contactMessage} onChange={e => setContactMessage(e.target.value)} />
                    </div>
                    <button
                      className="btn-primary"
                      disabled={contactLoading || !contactMessage.trim()}
                      style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15, opacity: contactLoading || !contactMessage.trim() ? 0.6 : 1 }}
                      onClick={async () => {
                        if (!contactMessage.trim()) return;
                        setContactLoading(true);
                        setContactResult(null);
                        try {
                          const res = await fetch("/api/complaints", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ subject: contactSubject, message: contactMessage.trim() }),
                          });
                          if (res.status === 401) { setContactResult("auth"); }
                          else if (res.ok) { setContactResult("success"); }
                          else { setContactResult("error"); }
                        } catch { setContactResult("error"); }
                        finally { setContactLoading(false); }
                      }}
                    >
                      <I n="mail" s={16} c="#fff" /> {contactLoading ? t("جارٍ الإرسال...", "Sending...") : t("إرسال الرسالة", "Send message")}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div>
              <h2 className="section-title" style={{ marginBottom: 24 }}>{t("معلومات", "Contact")} <span>{t("التواصل", "info")}</span></h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {[
                  ["phone", contactInfo.phone],
                  ["mail", contactInfo.email],
                  ["map", contactInfo.address],
                  ["clock", contactInfo.hours],
                ].map(([icon, text]) => (
                  <div key={icon} className="card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, background: "rgba(233,30,99,.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <I n={icon} s={18} c={C.red} />
                    </div>
                    <span style={{ color: C.grayLight, fontSize: 13, lineHeight: 1.7 }}>{text}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(233,30,99,.08)", border: `1px solid ${C.red}33`, borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>📱</span>
                  <span style={{ fontWeight: 700, color: C.white }}>{t("تواصل سريع", "Quick contact")}</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <a href={`tel:${contactInfo.phone || "01001514535"}`} style={{ flex: 1, background: C.red, color: "#fff", padding: "10px", borderRadius: 6, textAlign: "center", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 }}>📞 {t("اتصال", "Call")}</a>
                  <a href={whatsappLink || "#"} target="_blank" rel="noreferrer" style={{ flex: 1, background: "#25D366", color: "#fff", padding: "10px", borderRadius: 6, textAlign: "center", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13, pointerEvents: whatsappLink ? "auto" : "none", opacity: whatsappLink ? 1 : 0.6 }}>💬 {t("واتساب", "WhatsApp")}</a>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 72 }}>
            <h2 className="section-title" style={{ textAlign: "center", marginBottom: 36 }}>{t("الأسئلة", "Frequently asked")} <span>{t("الشائعة", "questions")}</span></h2>
            <div style={{ maxWidth: 680, margin: "0 auto" }}>
              {faqs.map((f, i) => (
                <div key={i} className="card" style={{ marginBottom: 10, padding: 0 }}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", background: "none", border: "none", padding: "17px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontWeight: 600, fontSize: 14, color: C.white, textAlign: "right" }}>
                    {f.q} <I n={openFaq === i ? "minus" : "plus"} s={16} c={C.red} />
                  </button>
                  {openFaq === i && <div style={{ padding: "0 20px 17px", color: C.gray, lineHeight: 1.8, fontSize: 13 }}>{f.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
function RedirectToAccountTab({ tab }: { tab: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.location.href = `/account?tab=${tab}`;
  }, [tab]);

  return null;
}

export default function App() {
  const { lang } = useLang();
  const [page, setPage] = useState("home");
  const [summary, setSummary] = useState<UserSummary | null>(null);
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const pageFromUrl = new URL(window.location.href).searchParams.get("page");
    if (pageFromUrl) {
      setPage(pageFromUrl);
    }
  }, []);

  useEffect(() => {
    resetPublicApiCache();
    void loadPublicApi(true);
  }, [lang]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (page === "home") {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", page);
    }

    window.history.replaceState({}, "", url.toString());
  }, [page]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const response = await fetch("/api/me/summary", {
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "cache-control": "no-store",
          },
        });
        const data = await response.json();
        if (!cancelled) {
          setSummary(data);
        }
      } catch {
        if (!cancelled) {
          setSummary({ authenticated: false });
        }
      }
    };

    void loadSummary();

    const refresh = () => {
      void loadSummary();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  useEffect(() => {
    const syncCart = () => {
      setCartCount(readCart().reduce((sum, item) => sum + item.qty, 0));
    };

    syncCart();
    window.addEventListener("fitzone-cart-updated", syncCart);
    return () => window.removeEventListener("fitzone-cart-updated", syncCart);
  }, []);

  const navigate = (p: string) => {
    const accountTabs: Record<string, string> = {
      account: "profile",
      wallet: "wallet",
      rewards: "wallet",
      referral: "wallet",
    };

    if (p in accountTabs) {
      if (summary?.authenticated && (summary.user?.role === "admin" || summary.user?.role === "staff")) {
        window.location.href = "/admin";
        return;
      }

      const target = `/account?tab=${accountTabs[p]}`;
      window.location.href = summary?.authenticated
        ? target
        : `/login?callbackUrl=${encodeURIComponent(target)}`;
      return;
    }

    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pages = {
    home: <HomePage navigate={navigate} summary={summary} />,
    about: <AboutPage />,
    memberships: <MembershipsPage navigate={navigate} />,
    classes: <ClassesPage navigate={navigate} />,
    classDetail: <ClassDetailPage navigate={navigate} />,
    schedule: <SchedulePage />,
    offers: <OffersPage navigate={navigate} />,
    shop: <ShopPage navigate={navigate} />,
    productDetail: <ProductDetailPage navigate={navigate} walletBalance={summary?.walletBalance ?? 0} />,
    cart: <CartPage navigate={navigate} summary={summary} />,
    checkout: <CartPage navigate={navigate} summary={summary} />,
    wallet: <RedirectToAccountTab tab="wallet" />,
    rewards: <RedirectToAccountTab tab="wallet" />,
    referral: <RedirectToAccountTab tab="wallet" />,
    account: <RedirectToAccountTab tab="profile" />,
    trainers: <TrainersPage />,
    blog: <BlogPage />,
    contact: <ContactPage />,
  };

  return (
    <div className="app" dir={lang === "ar" ? "rtl" : "ltr"}>
      <style>{css}</style>
      <Header
        currentPage={page}
        navigate={navigate}
        cartCount={cartCount}
        walletBalance={(summary?.walletBalance ?? 0).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")}
        summary={summary}
      />
      <main>{pages[page as keyof typeof pages] || pages.home}</main>
      <Footer navigate={navigate} />
    </div>
  );
}










