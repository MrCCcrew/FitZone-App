'use client';
import { useState } from "react";

// ─── FIT ZONE BRAND COLORS ─────────────────────────────────────────────────
const C = {
  bg: "#0A0A0A",
  bgCard: "#141414",
  bgCard2: "#1C1C1C",
  border: "#2A2A2A",
  red: "#E63916",
  redDark: "#B52D10",
  redLight: "#FF4D25",
  gold: "#C8A200",
  goldLight: "#F0C420",
  goldDark: "#8A6E00",
  white: "#FFFFFF",
  gray: "#9A9A9A",
  grayLight: "#C5C5C5",
  grayDark: "#3A3A3A",
  success: "#22C55E",
  successDark: "#16A34A",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&family=Tajawal:wght@300;400;500;700;900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html{scroll-behavior:smooth;}
  body{font-family:'Cairo','Tajawal',sans-serif;direction:rtl;background:${C.bg};color:${C.white};}
  .app{min-height:100vh;}

  .btn-primary{background:${C.red};color:#fff;border:none;padding:12px 28px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;letter-spacing:.3px;}
  .btn-primary:hover{background:${C.redLight};transform:translateY(-1px);box-shadow:0 6px 20px rgba(230,57,22,.35);}
  .btn-gold{background:linear-gradient(135deg,${C.gold},${C.goldLight});color:#000;border:none;padding:12px 28px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;display:inline-flex;align-items:center;gap:8px;}
  .btn-gold:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(200,162,0,.35);}
  .btn-outline{background:transparent;color:${C.red};border:2px solid ${C.red};padding:10px 26px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s;}
  .btn-outline:hover{background:${C.red};color:#fff;}
  .btn-outline-gold{background:transparent;color:${C.gold};border:1.5px solid ${C.gold};padding:8px 20px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
  .btn-outline-gold:hover{background:${C.gold};color:#000;}
  .btn-ghost{background:rgba(255,255,255,.06);color:${C.white};border:1px solid ${C.border};padding:10px 22px;border-radius:6px;font-family:'Cairo',sans-serif;font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;}
  .btn-ghost:hover{background:rgba(255,255,255,.12);}

  .card{background:${C.bgCard};border-radius:12px;border:1px solid ${C.border};overflow:hidden;}
  .card-hover{transition:transform .2s,border-color .2s,box-shadow .2s;}
  .card-hover:hover{transform:translateY(-3px);border-color:${C.red}55;box-shadow:0 8px 32px rgba(230,57,22,.12);}

  .section{padding:72px 0;}
  .container{max-width:1280px;margin:0 auto;padding:0 24px;}

  .tag{display:inline-flex;align-items:center;background:rgba(230,57,22,.15);color:${C.red};padding:4px 14px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;}
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
    .grid-mobile-1{grid-template-columns:1fr!important;}
    .grid-mobile-2{grid-template-columns:1fr 1fr!important;}
  }

  .glow-red{box-shadow:0 0 30px rgba(230,57,22,.2);}
  .glow-gold{box-shadow:0 0 30px rgba(200,162,0,.2);}

  .noise-overlay::after{content:'';position:absolute;inset:0;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.03'/%3E%3C/svg%3E");pointer-events:none;}
`;

// ─── ICONS ─────────────────────────────────────────────────────────────────
const I = ({ n, s = 20, c = "currentColor" }) => {
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
      {d[n]?.split(" M").map((path, i) => <path key={i} d={i === 0 ? path : "M" + path} />)}
    </svg>
  );
};

// ─── FIT ZONE LOGO ─────────────────────────────────────────────────────────
const FZLogo = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="29" fill="#1A1A1A" stroke={C.gold} strokeWidth="1.5"/>
    <circle cx="30" cy="30" r="26" fill="none" stroke={C.red} strokeWidth=".5" strokeDasharray="2 3"/>
    {/* Athlete silhouette */}
    <ellipse cx="30" cy="16" rx="3.5" ry="3.5" fill={C.white}/>
    <path d="M24 26 Q30 22 36 26 L34 38 L30 35 L26 38 Z" fill={C.white}/>
    <path d="M26 38 L23 46 M34 38 L37 46" stroke={C.white} strokeWidth="2" strokeLinecap="round"/>
    <path d="M28 26 L20 30 M32 26 L40 30" stroke={C.white} strokeWidth="2" strokeLinecap="round"/>
    {/* Small figure icons */}
    {[-12,-6,0,6,12].map((x,i) => <circle key={i} cx={30+x} cy={53} r="1.2" fill={C.gold} opacity={i===2?1:.6}/>)}
    {/* FIT ZONE text */}
    <text x="30" y="50" textAnchor="middle" fontSize="6" fontWeight="bold" fill={C.gold} fontFamily="'Cairo',sans-serif" letterSpacing=".5">FIT ZONE</text>
  </svg>
);

// ─── GYM VISUAL PLACEHOLDERS ───────────────────────────────────────────────
const GymImg = ({ type = "hero", w = "100%", h = 300 }) => {
  const configs = {
    hero: {
      bg1: "#1A0A02", bg2: "#2D0F05",
      content: (
        <>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#heroGrad)"/>
          <defs><radialGradient id="heroGrad" cx="30%" cy="50%"><stop offset="0%" stopColor="#3D1208"/><stop offset="100%" stopColor="#0A0A0A"/></radialGradient></defs>
          {/* Gym equipment silhouettes */}
          <ellipse cx="75%" cy="85%" rx="120" ry="40" fill="#1A1A1A" opacity=".8"/>
          <rect x="60%" y="35%" width="8" height="50%" fill="#252525" rx="3"/>
          <rect x="55%" y="40%" width="18%" height="8" fill="#2A2A2A" rx="2"/>
          <ellipse cx="55%" cy="40%" rx="18" ry="18" fill="#222"/>
          <ellipse cx="73%" cy="40%" rx="18" ry="18" fill="#222"/>
          {/* Athlete outline */}
          <ellipse cx="32%" cy="28%" rx="22" ry="22" fill="#E63916" opacity=".15"/>
          <ellipse cx="32%" cy="21%" rx="8" ry="8" fill="#888"/>
          <path d="M 28% 29% Q 32% 25% 36% 29% L 35% 55% L 32% 52% L 29% 55% Z" fill="#999"/>
          {/* FITZONE on wall */}
          <rect x="15%" y="60%" width="35%" height="22" fill="#E63916" opacity=".15" rx="2"/>
          <text x="32%" y="74%" textAnchor="middle" fontSize="18" fontWeight="900" fill="#E63916" fontFamily="'Cairo',sans-serif" letterSpacing="3" opacity=".8">FITZONE</text>
          {/* Red glow */}
          <radialGradient id="redGlow" cx="32%" cy="50%"><stop offset="0%" stopColor="#E63916" stopOpacity=".08"/><stop offset="100%" stopColor="#E63916" stopOpacity="0"/></radialGradient>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#redGlow)"/>
        </>
      )
    },
    yoga: {
      content: (
        <>
          <defs><linearGradient id="yg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A0030"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#yg)"/>
          <circle cx="50%" cy="40%" r="60" fill="rgba(139,0,200,.1)"/>
          <ellipse cx="50%" cy="42%" rx="12" ry="12" fill="#666"/>
          <path d="M 44% 50% Q 50% 45% 56% 50% L 54% 70% L 50% 68% L 46% 70% Z" fill="#777"/>
          <text x="50%" y="88%" textAnchor="middle" fontSize="14" fontWeight="700" fill="#9B59B6" fontFamily="'Cairo',sans-serif">يوجا</text>
          <text x="50%" y="96%" textAnchor="middle" fontSize="9" fill="#666" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    zumba: {
      content: (
        <>
          <defs><linearGradient id="zg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#2D0A08"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#zg)"/>
          <circle cx="50%" cy="40%" r="50" fill="rgba(230,57,22,.12)"/>
          <ellipse cx="50%" cy="36%" rx="11" ry="11" fill="#888"/>
          <path d="M 44% 44% Q 48% 40% 52% 42% Q 56% 44% 58% 52% L 52% 66% L 48% 64% Z" fill="#777"/>
          <text x="50%" y="86%" textAnchor="middle" fontSize="14" fontWeight="700" fill={C.red} fontFamily="'Cairo',sans-serif">زومبا</text>
          <text x="50%" y="95%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    strength: {
      content: (
        <>
          <defs><linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A1000"/><stop offset="100%" stopColor="#080808"/></linearGradient></defs>
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
          <defs><linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#001A2D"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pg)"/>
          <circle cx="50%" cy="40%" r="45" fill="rgba(14,165,233,.08)"/>
          <ellipse cx="50%" cy="35%" rx="11" ry="11" fill="#777"/>
          <path d="M 44% 43% L 56% 43% L 54% 65% L 50% 62% L 46% 65% Z" fill="#666"/>
          <text x="50%" y="85%" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0EA5E9" fontFamily="'Cairo',sans-serif">بيلاتس</text>
          <text x="50%" y="94%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    cardio: {
      content: (
        <>
          <defs><linearGradient id="cg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A0800"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#cg)"/>
          <circle cx="50%" cy="38%" r="50" fill="rgba(249,115,22,.1)"/>
          <text x="50%" y="45%" textAnchor="middle" fontSize="28" fill="rgba(249,115,22,.6)">🏃‍♀️</text>
          <text x="50%" y="80%" textAnchor="middle" fontSize="13" fontWeight="700" fill="#F97316" fontFamily="'Cairo',sans-serif">كارديو</text>
          <text x="50%" y="92%" textAnchor="middle" fontSize="9" fill="#555" fontFamily="'Cairo',sans-serif">FIT ZONE</text>
        </>
      )
    },
    trainer1: {
      content: (
        <>
          <defs><radialGradient id="t1g" cx="50%" cy="40%"><stop offset="0%" stopColor="#3D1208"/><stop offset="100%" stopColor="#0A0A0A"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t1g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(230,57,22,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#333"/>
          <path d="M 36% 48% Q 50% 42% 64% 48% L 62% 80% L 50% 76% L 38% 80% Z" fill="#3A3A3A"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">هبة زارع</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill={C.gold} fontFamily="'Cairo',sans-serif">مدربة رئيسية</text>
        </>
      )
    },
    trainer2: {
      content: (
        <>
          <defs><radialGradient id="t2g" cx="50%" cy="40%"><stop offset="0%" stopColor="#100020"/><stop offset="100%" stopColor="#0A0A0A"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t2g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(139,0,200,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#2D2D2D"/>
          <path d="M 36% 48% Q 50% 42% 64% 48% L 62% 80% L 50% 76% L 38% 80% Z" fill="#333"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">منال علي</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill="#9B59B6" fontFamily="'Cairo',sans-serif">مدربة يوجا</text>
        </>
      )
    },
    trainer3: {
      content: (
        <>
          <defs><radialGradient id="t3g" cx="50%" cy="40%"><stop offset="0%" stopColor="#0D1800"/><stop offset="100%" stopColor="#0A0A0A"/></radialGradient></defs>
          <rect width="100%" height="100%" fill="url(#t3g)"/>
          <circle cx="50%" cy="38%" r="45" fill="rgba(34,197,94,.08)"/>
          <ellipse cx="50%" cy="32%" rx="20" ry="20" fill="#2A2A2A"/>
          <path d="M 36% 48% Q 50% 42% 64% 48% L 62% 80% L 50% 76% L 38% 80% Z" fill="#303030"/>
          <rect x="5%" y="78%" width="90%" height="1" fill={C.border}/>
          <text x="50%" y="90%" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.white} fontFamily="'Cairo',sans-serif">سحر كمال</text>
          <text x="50%" y="98%" textAnchor="middle" fontSize="8" fill={C.success} fontFamily="'Cairo',sans-serif">مدربة قوة</text>
        </>
      )
    },
    product1: {
      content: (
        <>
          <defs><linearGradient id="pr1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A1A1A"/><stop offset="100%" stopColor="#0D0D0D"/></linearGradient></defs>
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
          <defs><linearGradient id="pr2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0D1A0D"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pr2)"/>
          <text x="50%" y="48%" textAnchor="middle" fontSize="48" fill="rgba(34,197,94,.7)">🧴</text>
          <rect x="15%" y="68%" width="70%" height="1" fill={C.border}/>
          <text x="50%" y="82%" textAnchor="middle" fontSize="11" fill={C.gray} fontFamily="'Cairo',sans-serif">مكملات غذائية</text>
        </>
      )
    },
    product3: {
      content: (
        <>
          <defs><linearGradient id="pr3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A100D"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#pr3)"/>
          <text x="50%" y="48%" textAnchor="middle" fontSize="48" fill="rgba(230,57,22,.7)">🏋️‍♀️</text>
          <rect x="15%" y="68%" width="70%" height="1" fill={C.border}/>
          <text x="50%" y="82%" textAnchor="middle" fontSize="11" fill={C.gray} fontFamily="'Cairo',sans-serif">معدات رياضية</text>
        </>
      )
    },
    blog: {
      content: (
        <>
          <defs><linearGradient id="blg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#1A0500"/><stop offset="100%" stopColor="#0A0A0A"/></linearGradient></defs>
          <rect width="100%" height="100%" fill="url(#blg)"/>
          <circle cx="50%" cy="40%" r="40" fill="rgba(230,57,22,.08)"/>
          <text x="50%" y="50%" textAnchor="middle" fontSize="32" fill="rgba(230,57,22,.6)">📰</text>
          <text x="50%" y="80%" textAnchor="middle" fontSize="10" fill={C.gray} fontFamily="'Cairo',sans-serif">FIT ZONE BLOG</text>
        </>
      )
    },
    offer: {
      content: (
        <>
          <defs>
            <linearGradient id="og" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1A0800"/>
              <stop offset="100%" stopColor="#0D0D0D"/>
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
            <linearGradient id="grg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1A0800"/>
              <stop offset="100%" stopColor="#050505"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#grg)"/>
          {/* Gym interior simulation */}
          <rect x="0" y="60%" width="100%" height="40%" fill="#111"/>
          <rect x="10%" y="40%" width="3" height="60%" fill="#2A2A2A"/>
          <rect x="30%" y="38%" width="3" height="60%" fill="#2A2A2A"/>
          <rect x="50%" y="40%" width="3" height="60%" fill="#2A2A2A"/>
          <rect x="70%" y="38%" width="3" height="60%" fill="#2A2A2A"/>
          <rect x="90%" y="40%" width="3" height="60%" fill="#2A2A2A"/>
          {/* Dumbbells on rack */}
          {[15,25,35,45,55,65,75,85].map((x,i) => (
            <ellipse key={i} cx={`${x}%`} cy="85%" rx="12" ry="6" fill={i%2===0?"#2D2D2D":"#252525"} stroke="#333" strokeWidth=".5"/>
          ))}
          {/* FITZONE sign */}
          <rect x="15%" y="20%" width="70%" height="28" fill="rgba(230,57,22,.2)" rx="3"/>
          <text x="50%" y="38%" textAnchor="middle" fontSize="16" fontWeight="900" fill={C.red} fontFamily="'Cairo',sans-serif" letterSpacing="4">FITZONE</text>
          {/* Atmosphere */}
          <radialGradient id="atmG" cx="50%" cy="80%"><stop offset="0%" stopColor="#E63916" stopOpacity=".06"/><stop offset="100%" stopColor="transparent"/></radialGradient>
          <rect x="0" y="0" width="100%" height="100%" fill="url(#atmG)"/>
        </>
      )
    },
  };
  const cfg = configs[type] || configs.hero;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${typeof w === "number" ? w : 400} ${h}`} preserveAspectRatio="xMidYMid slice" style={{ display: "block", borderRadius: "inherit" }}>
      {cfg.content}
    </svg>
  );
};

// ─── HEADER ─────────────────────────────────────────────────────────────────
const Header = ({ currentPage, navigate, cartCount = 2, walletBalance = "150" }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = [
    { id: "home", label: "الرئيسية" },
    { id: "memberships", label: "الاشتراكات" },
    { id: "classes", label: "الكلاسات" },
    { id: "schedule", label: "الجدول" },
    { id: "shop", label: "المتجر" },
    { id: "offers", label: "العروض" },
    { id: "trainers", label: "المدربات" },
    { id: "blog", label: "المدونة" },
  ];
  return (
    <header style={{ background: "rgba(10,10,10,.95)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, zIndex: 100 }}>
      {/* Top bar */}
      <div style={{ background: C.red, padding: "6px 0", textAlign: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>📞 01001514535 · بني سويف · أول نادي للسيدات والأطفال 💪</span>
      </div>
      <div className="container" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <div onClick={() => navigate("home")} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
          <FZLogo size={42} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.white, letterSpacing: 1, lineHeight: 1 }}>FIT ZONE</div>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2, lineHeight: 1 }}>FITNESS CLUB</div>
          </div>
        </div>
        <nav className="hide-mobile" style={{ display: "flex", gap: 2 }}>
          {navItems.map(item => (
            <button key={item.id} onClick={() => navigate(item.id)} style={{ background: "none", border: "none", padding: "8px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer", color: currentPage === item.id ? C.red : C.gray, fontFamily: "'Cairo', sans-serif", transition: "color .2s", borderBottom: currentPage === item.id ? `2px solid ${C.red}` : "2px solid transparent" }}>
              {item.label}
            </button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => navigate("wallet")} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(230,57,22,.12)", border: `1px solid ${C.red}33`, borderRadius: 6, padding: "6px 12px", cursor: "pointer", color: C.red, fontSize: 12, fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
            <I n="wallet" s={14} c={C.red} />
            <span className="hide-mobile">{walletBalance} ج.م</span>
          </button>
          <button onClick={() => navigate("cart")} style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 8 }}>
            <I n="cart" s={20} c={C.gray} />
            {cartCount > 0 && <span style={{ position: "absolute", top: 2, left: 2, width: 16, height: 16, background: C.red, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700 }}>{cartCount}</span>}
          </button>
          <button onClick={() => navigate("account")} style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}>
            <I n="user" s={20} c={C.gray} />
          </button>
          <button className="btn-primary hide-mobile" onClick={() => navigate("memberships")} style={{ padding: "8px 18px", fontSize: 13 }}>
            اشتركي الآن
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
          <button className="btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }} onClick={() => navigate("memberships")}>اشتركي الآن</button>
        </div>
      )}
    </header>
  );
};

// ─── FOOTER ─────────────────────────────────────────────────────────────────
const Footer = ({ navigate }) => (
  <footer style={{ background: "#080808", borderTop: `1px solid ${C.border}`, padding: "64px 0 32px" }}>
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
          <p style={{ color: C.gray, fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>أول نادي لياقة بدنية للسيدات والأطفال في بني سويف. جودة عالية، مدربات محترفات، نتائج حقيقية.</p>
          <div style={{ display: "flex", gap: 10 }}>
            {[["instagram","#E1306C"],["whatsapp","#25D366"]].map(([icon, col]) => (
              <button key={icon} style={{ width: 34, height: 34, background: C.bgCard2, border: `1px solid ${C.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <I n={icon} s={16} c={col} />
              </button>
            ))}
          </div>
        </div>
        {[
          { title: "الخدمات", links: [["memberships","الاشتراكات"],["classes","الكلاسات"],["schedule","الجدول الأسبوعي"],["shop","المتجر"],["offers","العروض"]] },
          { title: "حسابي", links: [["account","ملفي الشخصي"],["wallet","المحفظة"],["rewards","نقاط المكافآت"],["referral","الإحالات"]] },
          { title: "تواصل معنا", links: [["contact","اتصلي بنا"],["blog","المدونة"],["contact","الأسئلة الشائعة"],["trainers","المدربات"]] },
        ].map(col => (
          <div key={col.title}>
            <h4 style={{ fontWeight: 700, marginBottom: 16, color: C.white, fontSize: 14 }}>{col.title}</h4>
            {col.links.map(([page, label]) => (
              <button key={label} onClick={() => navigate(page)} style={{ display: "block", background: "none", border: "none", color: C.gray, fontSize: 13, padding: "5px 0", cursor: "pointer", fontFamily: "'Cairo', sans-serif", textAlign: "right", transition: "color .2s" }}>
                {label}
              </button>
            ))}
          </div>
        ))}
        <div>
          <h4 style={{ fontWeight: 700, marginBottom: 16, color: C.white, fontSize: 14 }}>معلومات التواصل</h4>
          {[["phone","01001514535"],["mail","itsfitzoone@gmail.com"],["map","بني سويف، مقابل بنك القاهرة"]].map(([icon, text]) => (
            <div key={text} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10, color: C.gray, fontSize: 12 }}>
              <I n={icon} s={14} c={C.red} /><span>{text}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ color: C.grayDark, fontSize: 12 }}>© 2025 FIT ZONE Fitness Club. جميع الحقوق محفوظة.</p>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ color: C.grayDark, fontSize: 11 }}>صُمّم بـ ❤️ لفريق فيت زون</span>
        </div>
      </div>
    </div>
  </footer>
);

// ─── HOME PAGE ───────────────────────────────────────────────────────────────
const HomePage = ({ navigate }) => {
  const classes = [
    { icon: "🧘", name: "يوجا", count: "12 كلاس", color: "#9B59B6", bg: "rgba(155,89,182,.1)", border: "rgba(155,89,182,.3)" },
    { icon: "💃", name: "زومبا", count: "8 كلاس", color: C.red, bg: "rgba(230,57,22,.08)", border: "rgba(230,57,22,.2)" },
    { icon: "🏋️", name: "قوة", count: "15 كلاس", color: C.gold, bg: "rgba(200,162,0,.08)", border: "rgba(200,162,0,.2)" },
    { icon: "🤸", name: "بيلاتس", count: "10 كلاس", color: "#0EA5E9", bg: "rgba(14,165,233,.08)", border: "rgba(14,165,233,.2)" },
    { icon: "🏃", name: "كارديو", count: "6 كلاس", color: "#F97316", bg: "rgba(249,115,22,.08)", border: "rgba(249,115,22,.2)" },
  ];
  const memberships = [
    { name: "ليت", price: 299, period: "شهر", features: ["4 كلاسات/شهر", "جدول أسبوعي", "تطبيق موبايل"], color: C.gray, popular: false },
    { name: "برو", price: 599, period: "شهر", features: ["كلاسات غير محدودة", "مدربة خاصة", "خصم 10% متجر", "محفظة رقمية", "نقاط مكافآت"], color: C.red, popular: true },
    { name: "بريميوم", price: 999, period: "شهر", features: ["كل مزايا Pro", "جلسات خاصة 4", "خصم 25% متجر", "أولوية الحجز"], color: C.gold, popular: false },
  ];
  const trainers = [
    { name: "هبة زارع", specialty: "مدربة رئيسية · يوجا & قوة", rating: 4.9, sessions: 520, type: "trainer1" },
    { name: "منال علي", specialty: "زومبا & كارديو", rating: 4.8, sessions: 380, type: "trainer2" },
    { name: "سحر كمال", specialty: "قوة & بيلاتس", rating: 4.9, sessions: 415, type: "trainer3" },
  ];
  const testimonials = [
    { name: "أميرة السيد", text: "أحسن جيم في بني سويف! المدربات محترفين جداً والأجواء بنتشجع تتمرن كل يوم. خسرت ١٥ كيلو في ٤ شهور!", rating: 5 },
    { name: "هنا محمد", text: "من أول ما اشتركت حسيت بفرق. الجدول مناسب ومرن ويناسب أم شغالة. أنصح بيه كل ست.", rating: 5 },
    { name: "ريم أحمد", text: "المحفظة ونقاط المكافآت بتخليك توفري كتير. النظام سهل والحجز بيحصل في ثواني.", rating: 5 },
  ];
  const products = [
    { name: "حذاء رياضي Luna", price: 850, oldPrice: 1200, type: "product1", badge: "الأكثر مبيعًا" },
    { name: "بروتين نسائي 1kg", price: 450, oldPrice: null, type: "product2", badge: null },
    { name: "طقم معدات يوجا", price: 680, oldPrice: 900, type: "product3", badge: "خصم 25%" },
  ];
  const schedulePreview = [
    { time: "07:00", name: "يوجا الصباح", trainer: "هبة", spots: 5, color: "#9B59B6" },
    { time: "09:00", name: "زومبا", trainer: "منال", spots: 2, color: C.red },
    { time: "11:00", name: "بيلاتس", trainer: "سحر", spots: 8, color: C.gold },
    { time: "17:00", name: "قوة وتحمل", trainer: "هبة", spots: 0, color: "#888" },
  ];

  return (
    <div>
      {/* ─ HERO ─ */}
      <section style={{ position: "relative", minHeight: 600, display: "flex", alignItems: "center", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <GymImg type="gymReal" w="100%" h={600} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(10,10,10,.95) 40%, rgba(10,10,10,.5) 100%)" }} />
        </div>
        <div className="container" style={{ position: "relative", zIndex: 1 }}>
          <div style={{ maxWidth: 580 }}>
            <div className="tag" style={{ marginBottom: 20, display: "inline-flex" }}>💪 أول نادي للسيدات في بني سويف</div>
            <h1 style={{ fontSize: 56, fontWeight: 900, lineHeight: 1.1, color: C.white, marginBottom: 20 }}>
              ابدئي رحلتك<br />
              مع <span style={{ color: C.red, textShadow: `0 0 30px ${C.red}66` }}>FIT ZONE</span>
            </h1>
            <p style={{ fontSize: 17, color: C.gray, lineHeight: 1.8, marginBottom: 36, maxWidth: 460 }}>
              النادي الوحيد المخصص للسيدات والأطفال. كلاسات متنوعة، مدربات محترفات، ونتائج حقيقية في بيئة آمنة ومريحة.
            </p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={() => navigate("memberships")} style={{ fontSize: 16, padding: "14px 36px" }}>
                <I n="star" s={16} c="#fff" /> اشتركي الآن
              </button>
              <button className="btn-outline" onClick={() => navigate("classes")} style={{ fontSize: 16, padding: "14px 36px" }}>
                احجزي كلاس تجريبي
              </button>
            </div>
            <div style={{ display: "flex", gap: 40, marginTop: 48 }}>
              {[["500+","عضوة نشطة"],["50+","كلاس أسبوعيًا"],["3","مدربات محترفات"]].map(([n,l]) => (
                <div key={l}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: C.red }}>{n}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Floating card */}
        <div style={{ position: "absolute", left: "5%", bottom: 40, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12, zIndex: 2 }}>
          <div style={{ width: 36, height: 36, background: "rgba(230,57,22,.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>🏆</div>
          <div><div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>مشتركات اليوم</div><div style={{ fontSize: 11, color: C.red }}>+12 عضوة جديدة</div></div>
        </div>
      </section>

      {/* ─ QUICK ACTIONS ─ */}
      <section style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: "0" }}>
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
            {[
              { icon: "repeat", label: "الاشتراكات", page: "memberships", sub: "باقات متنوعة" },
              { icon: "calendar", label: "الجدول الأسبوعي", page: "schedule", sub: "احجزي مقعدك" },
              { icon: "box", label: "المتجر", page: "shop", sub: "منتجات رياضية" },
              { icon: "wallet", label: "شحن المحفظة", page: "wallet", sub: "بونص حتى 15%" },
            ].map(({ icon, label, page, sub }) => (
              <button key={page} onClick={() => navigate(page)} style={{ background: "none", border: "none", borderLeft: `1px solid ${C.border}`, padding: "20px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, fontFamily: "'Cairo', sans-serif", transition: "background .2s" }}>
                <div style={{ width: 44, height: 44, background: "rgba(230,57,22,.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
      <section className="section">
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="tag" style={{ marginBottom: 12, display: "inline-block" }}>كلاساتنا</span>
            <h2 className="section-title">كلاسات تناسب <span>كل أهدافك</span></h2>
            <p className="section-sub">تشكيلة متنوعة من الكلاسات مع أفضل المدربات</p>
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            {classes.map(c => (
              <button key={c.name} onClick={() => navigate("classes")} style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "22px 28px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, minWidth: 110, transition: "transform .2s, box-shadow .2s", fontFamily: "'Cairo', sans-serif" }}>
                <span style={{ fontSize: 36 }}>{c.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.name}</span>
                <span style={{ fontSize: 11, color: C.gray }}>{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─ MEMBERSHIPS ─ */}
      <section className="section" style={{ background: C.bgCard }}>
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="tag" style={{ marginBottom: 12, display: "inline-block" }}>الأسعار</span>
            <h2 className="section-title">اختاري <span>الباقة</span> المناسبة</h2>
            <p className="section-sub">باقات بأسعار تنافسية تبدأ من 299 ج.م / شهر</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {memberships.map(m => (
              <div key={m.name} className={`card card-hover`} style={{ padding: 32, position: "relative", border: m.popular ? `2px solid ${C.red}` : `1px solid ${C.border}`, transform: m.popular ? "scale(1.03)" : "none" }}>
                {m.popular && (
                  <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: C.red, color: "#fff", padding: "4px 20px", borderRadius: 4, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>⭐ الأكثر شعبية</div>
                )}
                <h3 style={{ fontSize: 20, fontWeight: 900, color: C.white }}>باقة {m.name}</h3>
                <div style={{ margin: "16px 0 24px" }}>
                  <span className="price-currency" style={{ color: m.color }}>ج.م </span>
                  <span className="price-big" style={{ color: m.color }}>{m.price}</span>
                  <span style={{ color: C.gray, fontSize: 13 }}> / {m.period}</span>
                </div>
                <div className="divider" />
                <ul style={{ listStyle: "none", marginBottom: 28 }}>
                  {m.features.map(f => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 14, color: C.grayLight, borderBottom: `1px solid ${C.border}` }}>
                      <I n="check" s={14} c={m.popular ? C.red : C.gold} /> {f}
                    </li>
                  ))}
                </ul>
                <button className={m.popular ? "btn-primary" : "btn-outline"} style={{ width: "100%", justifyContent: "center", background: m.popular ? C.red : "transparent", borderColor: m.color, color: m.popular ? "#fff" : m.color }} onClick={() => navigate("memberships")}>
                  اشتركي الآن
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ SCHEDULE PREVIEW ─ */}
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
            <div>
              <h2 className="section-title">كلاسات <span>اليوم</span></h2>
              <p style={{ color: C.gray, fontSize: 14 }}>الأحد ١٥ يناير ٢٠٢٥ · بني سويف</p>
            </div>
            <button className="btn-outline" onClick={() => navigate("schedule")}>الجدول الكامل</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {schedulePreview.map(s => (
              <div key={s.time} className="card" style={{ padding: 20, borderRight: `3px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ background: `${s.color}22`, color: s.color, padding: "4px 12px", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>{s.time}</span>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, background: s.spots === 0 ? "rgba(239,68,68,.15)" : s.spots < 4 ? "rgba(234,179,8,.12)" : "rgba(34,197,94,.12)", color: s.spots === 0 ? "#EF4444" : s.spots < 4 ? "#EAB308" : C.success, fontWeight: 600 }}>
                    {s.spots === 0 ? "ممتلئ" : s.spots < 4 ? `${s.spots} متبقية` : "متاح"}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.white, marginBottom: 4 }}>{s.name}</div>
                <div style={{ color: C.gray, fontSize: 13, marginBottom: 16 }}>مع {s.trainer}</div>
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: 13, opacity: s.spots === 0 ? .5 : 1 }} disabled={s.spots === 0} onClick={() => navigate("classDetail")}>
                  {s.spots === 0 ? "ممتلئ" : "احجزي الآن"}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ WALLET + REWARDS BANNER ─ */}
      <section style={{ background: `linear-gradient(135deg, #1A0800 0%, ${C.bgCard} 100%)`, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "64px 0" }}>
        <div className="container" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <span className="tag-gold" style={{ marginBottom: 16, display: "inline-flex" }}>💳 نظام المحفظة والمكافآت</span>
            <h2 style={{ fontSize: 36, fontWeight: 900, color: C.white, marginBottom: 16, lineHeight: 1.2 }}>اشحني محفظتك<br /><span style={{ color: C.gold }}>واكسبي أكثر</span></h2>
            <p style={{ color: C.gray, fontSize: 15, lineHeight: 1.8, marginBottom: 28 }}>بونص إضافي مع كل شحن! اشحني بـ 200 ج.م واحصلي على 20 ج.م إضافية. اكسبي نقاط مع كل عملية واستبديليها بخصومات حصرية.</p>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-gold" onClick={() => navigate("wallet")} style={{ fontSize: 14, padding: "11px 24px" }}>
                <I n="wallet" s={16} c="#000" /> اشحني الآن
              </button>
              <button className="btn-ghost" onClick={() => navigate("rewards")} style={{ fontSize: 14 }}>نقاطي</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[["💳","150 ج.م","رصيد المحفظة"],["⭐","2,400","نقاط المكافآت"],["🎁","20%","خصم الإحالة"],["👑","Pro","مستوى العضوية"]].map(([icon,val,lbl]) => (
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
              <h2 className="section-title">المتجر <span>الرياضي</span></h2>
              <p className="section-sub">منتجات مختارة لتعزيز أدائك</p>
            </div>
            <button className="btn-outline" onClick={() => navigate("shop")}>تسوقي الآن</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {products.map(p => (
              <div key={p.name} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => navigate("productDetail")}>
                <div style={{ height: 200, position: "relative" }}>
                  <GymImg type={p.type} w="100%" h={200} />
                  {p.badge && <span className="badge" style={{ position: "absolute", top: 12, right: 12 }}>{p.badge}</span>}
                </div>
                <div style={{ padding: 20 }}>
                  <h3 style={{ fontWeight: 700, marginBottom: 10, fontSize: 15, color: C.white }}>{p.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ fontWeight: 900, color: C.red, fontSize: 20 }}>{p.price} ج.م</span>
                    {p.oldPrice && <span style={{ textDecoration: "line-through", color: C.gray, fontSize: 13 }}>{p.oldPrice} ج.م</span>}
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 13 }}>
                    <I n="cart" s={14} c="#fff" /> أضيفي للسلة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ REFERRAL ─ */}
      <section style={{ background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "56px 0" }}>
        <div className="container" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>🎁</div>
          <h2 style={{ fontSize: 32, fontWeight: 900, color: C.white, marginBottom: 12 }}>دعوي صاحبتك <span style={{ color: C.red }}>واربحا معًا!</span></h2>
          <p style={{ color: C.gray, fontSize: 16, marginBottom: 28, maxWidth: 480 }}>ادعي صديقتك للاشتراك معكِ في فيت زون وكلتيكما هتاخدوا خصم 20% على الاشتراك القادم.</p>
          <button className="btn-primary" onClick={() => navigate("referral")} style={{ fontSize: 15, padding: "14px 40px" }}>
            <I n="share" s={16} c="#fff" /> اشتركي في برنامج الإحالة
          </button>
        </div>
      </section>

      {/* ─ TRAINERS ─ */}
      <section className="section">
        <div className="container">
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2 className="section-title">مدرباتنا <span>المحترفات</span></h2>
            <p className="section-sub">فريق من أفضل المدربات لمساعدتك في تحقيق أهدافك</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {trainers.map(t => (
              <div key={t.name} className="card card-hover" style={{ padding: 0, overflow: "hidden", textAlign: "center" }}>
                <div style={{ height: 200 }}><GymImg type={t.type} w="100%" h={200} /></div>
                <div style={{ padding: "20px 24px 24px" }}>
                  <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{t.name}</h3>
                  <p style={{ color: C.red, fontSize: 13, fontWeight: 600, marginTop: 4, marginBottom: 16 }}>{t.specialty}</p>
                  <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 16 }}>
                    <div><div style={{ fontWeight: 700, color: C.gold }}>⭐ {t.rating}</div><div style={{ fontSize: 11, color: C.gray }}>التقييم</div></div>
                    <div><div style={{ fontWeight: 700, color: C.white }}>{t.sessions}</div><div style={{ fontSize: 11, color: C.gray }}>جلسة</div></div>
                  </div>
                  <button className="btn-outline-gold" style={{ width: "100%" }} onClick={() => navigate("trainers")}>عرض الملف</button>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {testimonials.map(t => (
              <div key={t.name} className="card" style={{ padding: 28, borderRight: `3px solid ${C.red}` }}>
                <div style={{ display: "flex", marginBottom: 12 }}>
                  {[...Array(t.rating)].map((_,i) => <span key={i} style={{ color: C.gold, fontSize: 16 }}>⭐</span>)}
                </div>
                <p style={{ color: C.gray, lineHeight: 1.8, fontSize: 14, marginBottom: 20 }}>"{t.text}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 38, height: 38, background: "rgba(230,57,22,.2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontWeight: 700 }}>{t.name[0]}</div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{t.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── MEMBERSHIPS PAGE ─────────────────────────────────────────────────────────
const MembershipsPage = ({ navigate }) => {
  const [tab, setTab] = useState("monthly");
  const [openFaq, setOpenFaq] = useState(null);
  const plans = [
    { name: "ليت", m: 299, a: 239, features: { classes: "4 كلاسات/شهر", trainer: "—", shopDiscount: "—", wallet: "—", booking: "عادي", sessions: "—" }, color: C.gray },
    { name: "برو", m: 599, a: 479, features: { classes: "غير محدود", trainer: "✓", shopDiscount: "10%", wallet: "✓", booking: "عادي", sessions: "—" }, color: C.red, popular: true },
    { name: "بريميوم", m: 999, a: 799, features: { classes: "غير محدود", trainer: "✓✓", shopDiscount: "25%", wallet: "✓", booking: "أولوية", sessions: "4 جلسات" }, color: C.gold },
    { name: "VIP", m: 1499, a: 1199, features: { classes: "غير محدود", trainer: "مخصصة", shopDiscount: "40%", wallet: "✓", booking: "VIP", sessions: "8 جلسات" }, color: "#A855F7" },
  ];
  const faqs = [
    { q: "هل يمكن إلغاء الاشتراك في أي وقت؟", a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. سيستمر الاشتراك حتى نهاية الفترة المدفوعة." },
    { q: "كيف أحجز الكلاسات؟", a: "بعد الاشتراك، يمكنك الحجز مباشرة من صفحة الجدول الأسبوعي أو من تفاصيل الكلاس." },
    { q: "هل يمكن تجميد الاشتراك؟", a: "نعم، نتيح تجميد الاشتراك لمدة تصل إلى شهرين في السنة." },
    { q: "ما طرق الدفع المتاحة؟", a: "نقبل النقدي، بطاقات الدفع، إنستاباي، والمحفظة الرقمية." },
    { q: "هل يوجد كلاسات للأطفال؟", a: "نعم! لدينا برامج مخصصة للأطفال من سن 4 سنوات فأكثر." },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "64px 0" }}>
        <div className="container" style={{ textAlign: "center" }}>
          <span className="tag" style={{ marginBottom: 16, display: "inline-block" }}>الأسعار والباقات</span>
          <h1 style={{ fontSize: 44, fontWeight: 900, marginBottom: 12, color: C.white }}>اختاري <span style={{ color: C.red }}>باقتك</span></h1>
          <p style={{ color: C.gray, fontSize: 16, marginBottom: 32 }}>كلاسات ممتازة بأسعار مناسبة تبدأ من 299 ج.م / شهر</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button className={`tab ${tab === "monthly" ? "active" : ""}`} onClick={() => setTab("monthly")}>شهري</button>
            <button className={`tab ${tab === "annual" ? "active" : ""}`} onClick={() => setTab("annual")}>
              سنوي <span style={{ background: C.red, color: "#fff", borderRadius: 4, padding: "1px 8px", fontSize: 11, marginRight: 6 }}>وفري 20%</span>
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
            {plans.map(p => (
              <div key={p.name} className="card" style={{ padding: 28, position: "relative", border: p.popular ? `2px solid ${C.red}` : `1px solid ${C.border}` }}>
                {p.popular && <div style={{ position: "absolute", top: -12, right: 16, background: C.red, color: "#fff", padding: "3px 14px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>الأكثر شعبية</div>}
                <h3 style={{ fontWeight: 900, fontSize: 20, color: C.white }}>باقة {p.name}</h3>
                <div style={{ margin: "14px 0 20px" }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: p.color }}>{tab === "monthly" ? p.m : p.a}</span>
                  <span style={{ color: C.gray, fontSize: 12 }}> ج.م / شهر</span>
                </div>
                {Object.entries(p.features).map(([k,v]) => {
                  const labels = { classes: "الكلاسات", trainer: "مدربة خاصة", shopDiscount: "خصم المتجر", wallet: "محفظة", booking: "الحجز", sessions: "جلسات خاصة" };
                  return (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.border}`, fontSize: 12 }}>
                      <span style={{ color: C.gray }}>{labels[k]}</span>
                      <span style={{ fontWeight: 700, color: v === "—" ? C.grayDark : C.white }}>{v}</span>
                    </div>
                  );
                })}
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 20, background: p.popular ? C.red : "transparent", border: `2px solid ${p.color}`, color: p.popular ? "#fff" : p.color, fontFamily: "'Cairo', sans-serif", padding: "10px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .2s" }}>
                  اشتركي الآن
                </button>
              </div>
            ))}
          </div>
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

      <div style={{ position: "sticky", bottom: 0, background: C.bgCard, borderTop: `1px solid ${C.border}`, padding: "14px 0", zIndex: 50 }}>
        <div className="container" style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 16 }}>
          <p style={{ fontWeight: 600, color: C.gray, fontSize: 14 }}>مستعدة تبدئي رحلتك مع فيت زون؟</p>
          <button className="btn-primary" style={{ padding: "10px 32px" }}>اشتركي الآن</button>
        </div>
      </div>
    </div>
  );
};

// ─── OFFERS PAGE ──────────────────────────────────────────────────────────────
const OffersPage = ({ navigate }) => {
  const offers = [
    { title: "عرض رمضان", discount: "30%", desc: "خصم على كل الاشتراكات طول الشهر الكريم", badge: "🌙", expires: "٣ أيام", color: C.gold },
    { title: "العضوة الجديدة", discount: "50%", desc: "أول شهر بنص التمن للعضوات الجدد فقط!", badge: "✨", expires: "دائم", color: C.red },
    { title: "باقة الصاحبتين", discount: "20%", desc: "اشتركي مع صديقتك وكلتيكما تأخدوا خصم", badge: "👯‍♀️", expires: "أسبوع", color: "#9B59B6" },
  ];
  const bundles = [
    { name: "باقة التحول الكامل", items: ["اشتراك برو شهرين", "حذاء رياضي", "بروتين نسائي", "جلسة تقييم مجانية"], price: 1800, oldPrice: 2500 },
    { name: "باقة البداية الذكية", items: ["اشتراك ليت شهر", "طقم معدات يوجا"], price: 799, oldPrice: 1100 },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, #100D00, ${C.bg})`, padding: "64px 0", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 30% 50%, rgba(200,162,0,.08), transparent 60%), radial-gradient(circle at 70% 50%, rgba(230,57,22,.08), transparent 60%)" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>عروض <span style={{ color: C.red }}>حصرية</span> لكِ</h1>
          <p style={{ color: C.gray, fontSize: 17 }}>متوفرش العروض دي! هتدفعي أقل وتتمريني أكتر 💪</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title" style={{ marginBottom: 32 }}>العروض <span>الحالية</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {offers.map(o => (
              <div key={o.title} className="card card-hover" style={{ padding: 0, overflow: "hidden", border: `1px solid ${o.color}33` }}>
                <div style={{ background: `linear-gradient(135deg, ${o.color}33, ${o.color}11)`, padding: "36px 24px", textAlign: "center", borderBottom: `1px solid ${o.color}22` }}>
                  <div style={{ fontSize: 44, marginBottom: 12 }}>{o.badge}</div>
                  <div style={{ fontSize: 56, fontWeight: 900, color: o.color, lineHeight: 1 }}>{o.discount}</div>
                  <div style={{ color: C.gray, fontSize: 13, marginTop: 4 }}>خصم</div>
                </div>
                <div style={{ padding: "20px 24px" }}>
                  <h3 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 8 }}>{o.title}</h3>
                  <p style={{ color: C.gray, fontSize: 13, marginBottom: 16 }}>{o.desc}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontSize: 12, color: C.gray }}>⏰ ينتهي خلال: {o.expires}</span>
                  </div>
                  <button style={{ width: "100%", padding: "10px", borderRadius: 6, border: `2px solid ${o.color}`, background: "transparent", color: o.color, fontFamily: "'Cairo', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }} onClick={() => navigate("memberships")}>
                    استفيدي الآن
                  </button>
                </div>
              </div>
            ))}
          </div>

          <h2 className="section-title" style={{ marginTop: 64, marginBottom: 32 }}>الباقات <span>المجمعة</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24 }}>
            {bundles.map(b => (
              <div key={b.name} className="card" style={{ padding: 28 }}>
                <span className="badge" style={{ marginBottom: 16, display: "inline-flex" }}>وفري {Math.round((1 - b.price / b.oldPrice) * 100)}%</span>
                <h3 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>{b.name}</h3>
                <ul style={{ marginBottom: 24 }}>
                  {b.items.map(item => (
                    <li key={item} style={{ display: "flex", gap: 10, padding: "8px 0", fontSize: 14, color: C.grayLight, borderBottom: `1px solid ${C.border}` }}>
                      <I n="check" s={14} c={C.success} /> {item}
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: C.red }}>{b.price}</span>
                  <span style={{ color: C.gray, fontSize: 14 }}>ج.م</span>
                  <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 15 }}>{b.oldPrice} ج.م</span>
                </div>
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => navigate("cart")}>أضيفي للسلة</button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── CLASSES PAGE ─────────────────────────────────────────────────────────────
const ClassesPage = ({ navigate }) => {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("الكل");
  const types = ["الكل", "يوجا", "زومبا", "قوة", "بيلاتس", "كارديو"];
  const classes = [
    { name: "يوجا الصباح", trainer: "هبة زارع", duration: "60 دقيقة", intensity: "متوسط", spots: 8, type: "yoga", price: 120 },
    { name: "زومبا حارة", trainer: "منال علي", duration: "45 دقيقة", intensity: "عالي", spots: 2, type: "zumba", price: 100 },
    { name: "بيلاتس للمبتدئات", trainer: "سحر كمال", duration: "50 دقيقة", intensity: "خفيف", spots: 12, type: "pilates", price: 130 },
    { name: "قوة وعضلات", trainer: "هبة زارع", duration: "55 دقيقة", intensity: "عالي", spots: 0, type: "strength", price: 140 },
    { name: "كارديو إنترفال", trainer: "منال علي", duration: "40 دقيقة", intensity: "عالي جدًا", spots: 5, type: "cardio", price: 110 },
    { name: "تأمل وتنفس", trainer: "سحر كمال", duration: "45 دقيقة", intensity: "خفيف", spots: 15, type: "yoga", price: 90 },
  ];
  const intensityColors = { "خفيف": C.success, "متوسط": "#EAB308", "عالي": C.red, "عالي جدًا": "#A855F7" };
  const typeMap = { yoga: "يوجا", zumba: "زومبا", strength: "قوة", pilates: "بيلاتس", cardio: "كارديو" };
  const filtered = classes.filter(c =>
    (filterType === "الكل" || typeMap[c.type] === filterType) &&
    (search === "" || c.name.includes(search) || c.trainer.includes(search))
  );

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>الكلاسات</h1>
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
            {filtered.map(c => (
              <div key={c.name} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => navigate("classDetail")}>
                <div style={{ height: 180 }}><GymImg type={c.type} w="100%" h={180} /></div>
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
                    <span style={{ background: c.spots === 0 ? "rgba(239,68,68,.12)" : c.spots < 4 ? "rgba(234,179,8,.12)" : "rgba(34,197,94,.12)", color: c.spots === 0 ? "#EF4444" : c.spots < 4 ? "#EAB308" : C.success, padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {c.spots === 0 ? "ممتلئ" : `${c.spots} مقعد`}
                    </span>
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center", opacity: c.spots === 0 ? .5 : 1, padding: "9px", fontSize: 13 }} disabled={c.spots === 0} onClick={e => { e.stopPropagation(); navigate("classDetail"); }}>
                    {c.spots === 0 ? "قائمة الانتظار" : "احجزي الآن"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── CLASS DETAIL ─────────────────────────────────────────────────────────────
const ClassDetailPage = ({ navigate }) => {
  const sessions = [
    { date: "الأحد ١٥ يناير", time: "07:00 ص", spots: 5, price: 120 },
    { date: "الثلاثاء ١٧ يناير", time: "07:00 ص", spots: 8, price: 120 },
    { date: "الخميس ١٩ يناير", time: "07:00 ص", spots: 0, price: 120 },
  ];
  return (
    <div>
      <div style={{ height: 340, position: "relative" }}>
        <GymImg type="yoga" w="100%" h={340} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,10,10,.3) 0%, rgba(10,10,10,.85) 100%)" }} />
        <div style={{ position: "absolute", bottom: 32, left: 0, right: 0 }}><div className="container">
          <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>يوجا</span>
          <h1 style={{ color: C.white, fontSize: 38, fontWeight: 900 }}>يوجا الصباح</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {[["clock","60 دقيقة"],["fire","متوسط"],["users","12 مقعد متاح"]].map(([icon, text]) => (
              <span key={text} style={{ color: C.gray, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                <I n={icon} s={13} c={C.gray} /> {text}
              </span>
            ))}
          </div>
        </div></div>
      </div>
      <div className="container" style={{ padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 40 }}>
          <div>
            <div className="card" style={{ padding: 28, marginBottom: 20 }}>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 14 }}>عن الكلاس</h2>
              <p style={{ color: C.gray, lineHeight: 1.8, fontSize: 14 }}>كلاس يوجا الصباح هو رحلة تأملية جميلة تجمع بين حركات اليوغا التقليدية وتقنيات التنفس العميق. مثالي لبداية يومك بطاقة إيجابية وجسم مرن.</p>
              <h3 style={{ fontWeight: 700, color: C.white, marginTop: 20, marginBottom: 14 }}>الفوائد</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
                  <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>هبة زارع</h3>
                  <p style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>يوجا & قوة</p>
                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: C.gray }}>⭐ 4.9 تقييم</span>
                    <span style={{ fontSize: 12, color: C.gray }}>520 جلسة</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 24, position: "sticky", top: 86 }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white, marginBottom: 16 }}>اختاري الموعد</h3>
            {sessions.map(s => (
              <div key={s.date} className="card" style={{ padding: 14, marginBottom: 12, border: `1px solid ${C.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.white }}>{s.date}</div>
                    <div style={{ color: C.gray, fontSize: 12 }}>{s.time}</div>
                  </div>
                  <span style={{ background: s.spots === 0 ? "rgba(239,68,68,.12)" : "rgba(34,197,94,.12)", color: s.spots === 0 ? "#EF4444" : C.success, padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, height: "fit-content" }}>
                    {s.spots === 0 ? "ممتلئ" : `${s.spots} متاح`}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 900, color: C.red }}>{s.price} ج.م</span>
                  <button className="btn-primary" style={{ padding: "5px 14px", fontSize: 12, opacity: s.spots === 0 ? .4 : 1 }} disabled={s.spots === 0} onClick={() => navigate("checkout")}>
                    {s.spots === 0 ? "انتظار" : "احجزي"}
                  </button>
                </div>
              </div>
            ))}
            <div className="divider" />
            <div style={{ background: "rgba(200,162,0,.08)", border: `1px solid ${C.gold}33`, borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <I n="wallet" s={15} c={C.gold} />
                <span style={{ fontWeight: 700, fontSize: 13, color: C.gold }}>رصيد المحفظة: 150 ج.م</span>
              </div>
              <p style={{ fontSize: 11, color: C.gray }}>يمكنك الدفع من محفظتك مباشرة</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SCHEDULE PAGE ────────────────────────────────────────────────────────────
const SchedulePage = ({ navigate }) => {
  const [activeDay, setActiveDay] = useState("الأحد");
  const days = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
  const schedule = {
    "الأحد": [
      { time: "07:00", name: "يوجا الصباح", trainer: "هبة", dur: "60د", spots: 5, intensity: "متوسط", color: "#9B59B6" },
      { time: "09:30", name: "زومبا حارة", trainer: "منال", dur: "45د", spots: 2, intensity: "عالي", color: C.red },
      { time: "11:00", name: "بيلاتس", trainer: "سحر", dur: "50د", spots: 10, intensity: "خفيف", color: "#0EA5E9" },
      { time: "17:00", name: "قوة وتحمل", trainer: "هبة", dur: "55د", spots: 0, intensity: "عالي", color: C.gold },
      { time: "19:00", name: "كارديو", trainer: "منال", dur: "40د", spots: 7, intensity: "عالي جدًا", color: "#F97316" },
    ],
    "الاثنين": [
      { time: "08:00", name: "تأمل وتنفس", trainer: "سحر", dur: "45د", spots: 15, intensity: "خفيف", color: C.success },
      { time: "10:00", name: "يوجا متقدم", trainer: "هبة", dur: "60د", spots: 4, intensity: "عالي", color: "#9B59B6" },
      { time: "18:00", name: "زومبا", trainer: "منال", dur: "45د", spots: 0, intensity: "عالي", color: C.red },
    ],
  };
  const iColors = { "خفيف": C.success, "متوسط": "#EAB308", "عالي": C.red, "عالي جدًا": "#A855F7" };
  const todaySchedule = schedule[activeDay] || schedule["الأحد"];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "48px 0 32px" }}>
        <div className="container">
          <h1 style={{ fontSize: 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>الجدول الأسبوعي</h1>
          <p style={{ color: C.gray, fontSize: 15 }}>اكتشفي مواعيد الكلاسات لأسبوعكِ</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, marginBottom: 28 }}>
            {days.map(d => <button key={d} className={`tab ${activeDay === d ? "active" : ""}`} onClick={() => setActiveDay(d)} style={{ whiteSpace: "nowrap" }}>{d}</button>)}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <select className="select" style={{ width: "auto" }}><option>كل الأنواع</option><option>يوجا</option><option>زومبا</option><option>قوة</option></select>
            <select className="select" style={{ width: "auto" }}><option>كل المدربات</option><option>هبة</option><option>منال</option><option>سحر</option></select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {todaySchedule.map(s => (
              <div key={s.time} className="card" style={{ overflow: "hidden", display: "grid", gridTemplateColumns: "100px 4px 1fr" }}>
                <div style={{ background: `${s.color}12`, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 10px" }}>
                  <span style={{ fontWeight: 900, color: s.color, fontSize: 16 }}>{s.time}</span>
                </div>
                <div style={{ background: s.color }} />
                <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: C.white, marginBottom: 3 }}>{s.name}</div>
                    <div style={{ color: C.gray, fontSize: 12 }}>مع {s.trainer} · {s.dur}</div>
                    <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                      <span style={{ background: `${iColors[s.intensity]}22`, color: iColors[s.intensity], padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{s.intensity}</span>
                      <span style={{ background: s.spots === 0 ? "rgba(239,68,68,.12)" : s.spots < 4 ? "rgba(234,179,8,.12)" : "rgba(34,197,94,.12)", color: s.spots === 0 ? "#EF4444" : s.spots < 4 ? "#EAB308" : C.success, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                        {s.spots === 0 ? "ممتلئ" : s.spots < 4 ? `${s.spots} متبقية` : "متاح"}
                      </span>
                    </div>
                  </div>
                  <button className="btn-primary" style={{ opacity: s.spots === 0 ? .4 : 1, padding: "8px 20px", fontSize: 13 }} disabled={s.spots === 0} onClick={() => navigate("classDetail")}>
                    {s.spots === 0 ? "ممتلئ" : "احجزي"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── SHOP PAGE ────────────────────────────────────────────────────────────────
const ShopPage = ({ navigate }) => {
  const [cat, setCat] = useState("الكل");
  const categories = ["الكل", "أحذية", "ملابس", "مكملات", "معدات"];
  const products = [
    { name: "حذاء Luna Sport", price: 850, oldPrice: 1200, type: "product1", cat: "أحذية", badge: "الأكثر مبيعًا", rating: 4.9 },
    { name: "بروتين وايت لايت 1kg", price: 450, oldPrice: null, type: "product2", cat: "مكملات", badge: null, rating: 4.7 },
    { name: "طقم معدات يوغا", price: 680, oldPrice: 900, type: "product3", cat: "معدات", badge: "خصم 25%", rating: 4.8 },
    { name: "حذاء Flex Run", price: 720, oldPrice: null, type: "product1", cat: "أحذية", badge: null, rating: 4.6 },
    { name: "أوميغا 3 نسائي", price: 220, oldPrice: 300, type: "product2", cat: "مكملات", badge: "خصم 27%", rating: 4.9 },
    { name: "طقم أدوات تمدد", price: 350, oldPrice: null, type: "product3", cat: "معدات", badge: null, rating: 4.5 },
  ];
  const filtered = products.filter(p => cat === "الكل" || p.cat === cat);

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>المتجر الرياضي</h1>
          <p style={{ color: C.gray, fontSize: 15 }}>منتجات رياضية مختارة خصيصًا لكِ</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 32 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map(c => <button key={c} className={`tab ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
            </div>
            <select className="select" style={{ width: "auto" }}>
              <option>الأحدث</option><option>السعر: من الأعلى</option><option>الأقل</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 24 }}>
            {filtered.map(p => (
              <div key={p.name} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => navigate("productDetail")}>
                <div style={{ height: 200, position: "relative" }}>
                  <GymImg type={p.type} w="100%" h={200} />
                  {p.badge && <span className="badge" style={{ position: "absolute", top: 12, right: 12 }}>{p.badge}</span>}
                  <button style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,.5)", border: "none", width: 30, height: 30, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <I n="heart" s={13} c={C.red} />
                  </button>
                </div>
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", marginBottom: 6 }}>
                    {[...Array(5)].map((_,i) => <span key={i} style={{ color: i < Math.floor(p.rating) ? C.gold : C.border, fontSize: 12 }}>★</span>)}
                    <span style={{ fontSize: 11, color: C.gray, marginRight: 4 }}>({p.rating})</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.white }}>{p.name}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <span style={{ fontWeight: 900, color: C.red, fontSize: 20 }}>{p.price} ج.م</span>
                    {p.oldPrice && <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 12 }}>{p.oldPrice}</span>}
                  </div>
                  <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "8px", fontSize: 12 }} onClick={e => { e.stopPropagation(); navigate("cart"); }}>
                    <I n="cart" s={13} c="#fff" /> أضيفي للسلة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

// ─── PRODUCT DETAIL ───────────────────────────────────────────────────────────
const ProductDetailPage = ({ navigate }) => {
  const [qty, setQty] = useState(1);
  const [selectedSize, setSelectedSize] = useState("M");
  const [selectedColor, setSelectedColor] = useState(C.red);

  return (
    <div>
      <div className="container" style={{ padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "start" }}>
          <div>
            <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 12 }}><GymImg type="product1" w="100%" h={380} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {["product1","product2","product3","product1"].map((t, i) => (
                <div key={i} style={{ borderRadius: 8, overflow: "hidden", border: i === 0 ? `2px solid ${C.red}` : `1px solid ${C.border}`, cursor: "pointer" }}>
                  <GymImg type={t} w="100%" h={70} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <span className="tag" style={{ marginBottom: 12, display: "inline-flex" }}>أحذية رياضية</span>
            <h1 style={{ fontSize: 30, fontWeight: 900, color: C.white, marginBottom: 12 }}>حذاء Luna Sport</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ display: "flex" }}>{[...Array(5)].map((_,i) => <span key={i} style={{ color: C.gold, fontSize: 18 }}>★</span>)}</div>
              <span style={{ color: C.gray, fontSize: 13 }}>4.9 (128 تقييم)</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 24 }}>
              <span style={{ fontSize: 42, fontWeight: 900, color: C.red }}>850</span>
              <span style={{ color: C.gray }}>ج.م</span>
              <span style={{ textDecoration: "line-through", color: C.grayDark, fontSize: 16 }}>1,200 ج.م</span>
              <span className="badge">وفري 29%</span>
            </div>
            <div className="divider" />
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, color: C.white, marginBottom: 10 }}>المقاس</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {["36","37","38","39","40","41"].map(s => (
                  <button key={s} onClick={() => setSelectedSize(s)} style={{ width: 42, height: 42, borderRadius: 8, border: selectedSize === s ? `2px solid ${C.red}` : `1px solid ${C.border}`, background: selectedSize === s ? "rgba(230,57,22,.15)" : C.bgCard2, color: selectedSize === s ? C.red : C.gray, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif", fontSize: 13 }}>{s}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontWeight: 700, color: C.white, marginBottom: 10 }}>اللون</h3>
              <div style={{ display: "flex", gap: 8 }}>
                {[C.red, C.gold, "#1F2937", "#9B59B6"].map(col => (
                  <button key={col} onClick={() => setSelectedColor(col)} style={{ width: 34, height: 34, borderRadius: "50%", background: col, border: selectedColor === col ? `3px solid ${C.white}` : "3px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => setQty(Math.max(1, qty-1))} style={{ width: 38, height: 38, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white, fontSize: 18 }}>-</button>
                <span style={{ width: 38, textAlign: "center", fontWeight: 700, color: C.white }}>{qty}</span>
                <button onClick={() => setQty(qty+1)} style={{ width: 38, height: 38, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white, fontSize: 18 }}>+</button>
              </div>
              <span style={{ color: C.gray, fontSize: 13 }}>الإجمالي: <strong style={{ color: C.red }}>{qty * 850} ج.م</strong></span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }} onClick={() => navigate("cart")}>
                <I n="cart" s={18} c="#fff" /> أضيفي للسلة
              </button>
              <button className="btn-outline" style={{ width: "100%", justifyContent: "center", padding: "14px", fontSize: 15 }} onClick={() => navigate("checkout")}>
                اشتري الآن
              </button>
              <button style={{ width: "100%", padding: "12px", borderRadius: 6, border: `1.5px solid ${C.gold}`, background: "rgba(200,162,0,.08)", color: C.gold, fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => navigate("checkout")}>
                <I n="wallet" s={15} c={C.gold} /> ادفعي بالمحفظة (رصيدك: 150 ج.م)
              </button>
            </div>
            <div style={{ background: C.bgCard2, borderRadius: 10, padding: 14, marginTop: 18 }}>
              {[["truck","شحن داخل بني سويف مجاني"],["repeat","إرجاع خلال 14 يوم"],["check","ضمان المنتج الأصلي"]].map(([icon, text]) => (
                <div key={text} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 12, color: C.gray }}>
                  <I n={icon} s={14} c={C.success} /> {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CART / CHECKOUT ──────────────────────────────────────────────────────────
const CartPage = ({ navigate }) => {
  const [step, setStep] = useState("cart");
  const [payMethod, setPayMethod] = useState("card");
  const [useRewards, setUseRewards] = useState(false);
  const cartItems = [
    { name: "حذاء Luna Sport", price: 850, qty: 1, size: "38", type: "product1" },
    { name: "باقة برو شهرية", price: 599, qty: 1, size: null, type: "offer" },
  ];
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const discount = useRewards ? 24 : 0;
  const total = subtotal - discount;

  if (step === "success") return (
    <div style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, textAlign: "center" }}>
      <div style={{ width: 90, height: 90, background: "rgba(34,197,94,.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, marginBottom: 24 }}>✅</div>
      <h1 style={{ fontSize: 34, fontWeight: 900, color: C.white, marginBottom: 10 }}>تم الطلب بنجاح! 🎉</h1>
      <p style={{ color: C.gray, fontSize: 15, marginBottom: 6 }}>رقم الطلب: #FZ2025-1234</p>
      <p style={{ color: C.gray, fontSize: 13, marginBottom: 32 }}>هتوصلك رسالة تأكيد على موبايلك</p>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
        <button className="btn-primary" onClick={() => navigate("account")}>عرض طلباتي</button>
        <button className="btn-ghost" onClick={() => navigate("home")}>الرئيسية</button>
      </div>
    </div>
  );

  return (
    <div>
      <section style={{ background: C.bgCard, borderBottom: `1px solid ${C.border}`, padding: "28px 0" }}>
        <div className="container">
          <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
            {[["cart","السلة"],["address","الشحن"],["payment","الدفع"]].map(([s, label], i) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: step === s ? C.red : C.grayDark, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13 }}>{i+1}</div>
                <span style={{ fontWeight: 700, fontSize: 14, color: step === s ? C.white : C.gray }}>{label}</span>
                {i < 2 && <span style={{ color: C.grayDark }}>—</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container" style={{ padding: "40px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 28, alignItems: "start" }}>
          <div>
            {step === "cart" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>سلة التسوق</h2>
                {cartItems.map(item => (
                  <div key={item.name} className="card" style={{ padding: 18, marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ width: 70, height: 70, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}><GymImg type={item.type} w={70} h={70} /></div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{item.name}</h3>
                      {item.size && <p style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>المقاس: {item.size}</p>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}>
                      <button style={{ width: 30, height: 30, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white }}>-</button>
                      <span style={{ width: 28, textAlign: "center", fontSize: 13, fontWeight: 700, color: C.white }}>{item.qty}</span>
                      <button style={{ width: 30, height: 30, background: C.bgCard2, border: "none", cursor: "pointer", color: C.white }}>+</button>
                    </div>
                    <span style={{ fontWeight: 900, color: C.red, width: 80, textAlign: "center", fontSize: 15 }}>{item.price} ج.م</span>
                  </div>
                ))}
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15, marginTop: 14 }} onClick={() => setStep("address")}>
                  متابعة للشحن ←
                </button>
              </div>
            )}
            {step === "address" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>عنوان الشحن</h2>
                <div className="card" style={{ padding: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>الاسم الأول</label><input className="input" placeholder="فاطمة" /></div>
                    <div><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>اسم العائلة</label><input className="input" placeholder="محمد" /></div>
                  </div>
                  <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>رقم الجوال</label><input className="input" placeholder="01XXXXXXXXX" dir="ltr" /></div>
                  <div style={{ marginBottom: 14 }}><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>المحافظة</label><select className="select"><option>بني سويف</option><option>القاهرة</option><option>الجيزة</option></select></div>
                  <div><label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>العنوان التفصيلي</label><input className="input" placeholder="الشارع، رقم المبنى، الدور" /></div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setStep("cart")}>← رجوع</button>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setStep("payment")}>متابعة للدفع ←</button>
                </div>
              </div>
            )}
            {step === "payment" && (
              <div>
                <h2 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 20 }}>طريقة الدفع</h2>
                <div className="card" style={{ padding: 20 }}>
                  {[["card","💳","بطاقة دفع"],["instapay","📱","انستاباي"],["wallet","💰","المحفظة (150 ج.م)"],["wallet-card","🔄","محفظة + بطاقة"]].map(([id,icon,label]) => (
                    <div key={id} onClick={() => setPayMethod(id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: 14, borderRadius: 8, border: payMethod === id ? `2px solid ${C.red}` : `1px solid ${C.border}`, marginBottom: 10, cursor: "pointer", background: payMethod === id ? "rgba(230,57,22,.08)" : "transparent" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: payMethod === id ? "rgba(230,57,22,.2)" : C.bgCard2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{icon}</div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: payMethod === id ? C.white : C.gray }}>{label}</span>
                      {payMethod === id && <I n="check" s={16} c={C.red} />}
                    </div>
                  ))}
                  {payMethod === "card" && (
                    <div style={{ marginTop: 16, padding: 16, background: C.bgCard2, borderRadius: 10 }}>
                      <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>رقم البطاقة</label><input className="input" placeholder="XXXX XXXX XXXX XXXX" dir="ltr" /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>تاريخ الانتهاء</label><input className="input" placeholder="MM/YY" dir="ltr" /></div>
                        <div><label style={{ fontSize: 11, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>CVV</label><input className="input" placeholder="XXX" dir="ltr" /></div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="card" style={{ padding: 16, marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                    <input className="input" placeholder="كود الخصم" style={{ flex: 1 }} />
                    <button className="btn-outline" style={{ whiteSpace: "nowrap", padding: "10px 16px" }}>تطبيق</button>
                  </div>
                  <div onClick={() => setUseRewards(!useRewards)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "10px 0" }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${useRewards ? C.red : C.border}`, background: useRewards ? C.red : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {useRewards && <I n="check" s={11} c="#fff" />}
                    </div>
                    <span style={{ fontSize: 13, color: C.grayLight }}>استخدمي نقاطك (2,400 نقطة = <strong style={{ color: C.gold }}>24 ج.م</strong>)</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button className="btn-ghost" onClick={() => setStep("address")}>← رجوع</button>
                  <button className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 15 }} onClick={() => setStep("success")}>
                    ادفعي الآن — {total} ج.م ✓
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 24, position: "sticky", top: 90 }}>
            <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white, marginBottom: 16 }}>ملخص الطلب</h3>
            {cartItems.map(item => (
              <div key={item.name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.gray }}>{item.name} × {item.qty}</span>
                <span style={{ fontWeight: 600, color: C.white }}>{item.price * item.qty} ج.م</span>
              </div>
            ))}
            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>المجموع</span><span style={{ color: C.white }}>{subtotal} ج.م</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>الشحن</span><span style={{ color: C.success }}>مجاني</span></div>
            {discount > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13 }}><span style={{ color: C.gray }}>خصم النقاط</span><span style={{ color: C.success }}>- {discount} ج.م</span></div>}
            <div className="divider" />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: C.white }}>الإجمالي</span>
              <span style={{ fontWeight: 900, color: C.red, fontSize: 22 }}>{total} ج.م</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── WALLET PAGE ──────────────────────────────────────────────────────────────
const WalletPage = () => {
  const [amount, setAmount] = useState(200);
  const options = [100, 200, 500, 1000];
  const transactions = [
    { type: "credit", label: "شحن المحفظة", amount: +500, date: "١٤ يناير", bonus: 50 },
    { type: "debit", label: "حجز يوجا الصباح", amount: -120, date: "١٢ يناير" },
    { type: "debit", label: "شراء حذاء Luna", amount: -850, date: "١٠ يناير" },
    { type: "credit", label: "مكافأة إحالة", amount: +100, date: "٨ يناير" },
    { type: "debit", label: "اشتراك برو", amount: -599, date: "١ يناير" },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0800, #0D0D0D)`, padding: "64px 0", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 60%, rgba(200,162,0,.1), transparent 60%)" }} />
        <div className="container" style={{ position: "relative" }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>💳</div>
          <p style={{ color: C.gray, fontSize: 15 }}>رصيد المحفظة الحالي</p>
          <div style={{ fontSize: 72, fontWeight: 900, color: C.gold, margin: "12px 0" }}>
            150 <span style={{ fontSize: 30, color: C.gray }}>ج.م</span>
          </div>
          <p style={{ color: C.grayDark, fontSize: 13 }}>صالح حتى ٣١ ديسمبر ٢٠٢٥</p>
        </div>
      </section>

      <section className="section">
        <div className="container" style={{ maxWidth: 740, margin: "0 auto" }}>
          <div className="card" style={{ padding: 32, marginBottom: 28 }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 6 }}>شحن المحفظة</h2>
            <p style={{ color: C.gray, fontSize: 13, marginBottom: 24 }}>اشحني واحصلي على بونص إضافي!</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
              {options.map(opt => (
                <button key={opt} onClick={() => setAmount(opt)} style={{ position: "relative", padding: "12px 22px", border: amount === opt ? `2px solid ${C.red}` : `1px solid ${C.border}`, borderRadius: 8, background: amount === opt ? "rgba(230,57,22,.12)" : C.bgCard2, color: amount === opt ? C.red : C.gray, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo', sans-serif" }}>
                  {opt} ج.م
                  {opt >= 200 && <span className="badge badge-gold" style={{ position: "absolute", top: -10, left: -8, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>+{Math.round(opt * 0.1)} بونص</span>}
                </button>
              ))}
            </div>
            <div style={{ background: C.bgCard2, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <h4 style={{ fontWeight: 700, color: C.gold, marginBottom: 10, fontSize: 13 }}>🎁 قواعد البونص</h4>
              {[["أقل من 200 ج.م","لا بونص"],["200 - 499 ج.م","10% بونص إضافي"],["500 ج.م فأكثر","15% بونص + هدية"]].map(([r,v]) => (
                <div key={r} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.gray }}>{r}</span><span style={{ fontWeight: 600, color: C.white }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(200,162,0,.08)", border: `1px solid ${C.gold}33`, borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <I n="info" s={18} c={C.gold} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.gold }}>ستحصلين على {amount + (amount >= 200 ? Math.round(amount * 0.1) : 0)} ج.م</div>
                <div style={{ fontSize: 11, color: C.gray }}>مقابل دفع {amount} ج.م فقط</div>
              </div>
            </div>
            <button className="btn-gold" style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15 }}>
              <I n="wallet" s={18} c="#000" /> شحن {amount} ج.م الآن
            </button>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 20 }}>سجل المعاملات</h2>
            {transactions.map((t, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: i < transactions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 8, background: t.type === "credit" ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: t.type === "credit" ? C.success : "#EF4444" }}>
                    {t.type === "credit" ? "↑" : "↓"}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.white }}>{t.label}</div>
                    <div style={{ fontSize: 11, color: C.gray }}>{t.date}</div>
                  </div>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 800, color: t.type === "credit" ? C.success : "#EF4444", fontSize: 14 }}>
                    {t.type === "credit" ? "+" : ""}{t.amount} ج.م
                  </div>
                  {t.bonus && <div style={{ fontSize: 10, color: C.gold }}>+{t.bonus} بونص</div>}
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
  const tiers = [
    { name: "برونز", min: 0, max: 999, icon: "🥉", color: "#CD7F32" },
    { name: "فضي", min: 1000, max: 2999, icon: "🥈", color: "#9CA3AF", current: true },
    { name: "ذهبي", min: 3000, max: 4999, icon: "🥇", color: C.gold },
    { name: "بلاتيني", min: 5000, max: null, icon: "💎", color: "#A855F7" },
  ];
  const earnMethods = [
    { icon: "🏋️", label: "حجز كلاس", pts: "+10 نقطة" },
    { icon: "🛍️", label: "كل 10 ج.م شراء", pts: "+1 نقطة" },
    { icon: "👥", label: "دعوة صديقة", pts: "+200 نقطة" },
    { icon: "⭐", label: "تقييم كلاس", pts: "+20 نقطة" },
    { icon: "🎂", label: "عيد ميلادك", pts: "+100 نقطة" },
    { icon: "📱", label: "تسجيل يومي", pts: "+5 نقاط" },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A1000, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <div style={{ fontSize: 52, marginBottom: 12 }}>⭐</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, color: C.white, marginBottom: 8 }}>نقاط <span style={{ color: C.gold }}>المكافآت</span></h1>
          <div style={{ fontSize: 68, fontWeight: 900, color: C.gold, margin: "12px 0" }}>2,400</div>
          <p style={{ color: C.gray }}>نقطة = <strong style={{ color: C.red }}>24 ج.م</strong> رصيد قابل للاستبدال</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2 className="section-title" style={{ textAlign: "center", marginBottom: 32 }}>مستويات <span>العضوية</span></h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 56 }}>
            {tiers.map(t => (
              <div key={t.name} className="card" style={{ padding: 22, textAlign: "center", border: t.current ? `2px solid ${C.gold}` : `1px solid ${C.border}`, position: "relative" }}>
                {t.current && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: C.gold, color: "#000", padding: "2px 12px", borderRadius: 4, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>مستواكِ الحالي</div>}
                <div style={{ fontSize: 44, marginBottom: 10 }}>{t.icon}</div>
                <h3 style={{ fontWeight: 800, color: t.color }}>{t.name}</h3>
                <p style={{ fontSize: 11, color: C.gray, marginTop: 6 }}>{t.min.toLocaleString()}+ نقطة</p>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 20 }}>كيف <span>تكسبي</span> النقاط؟</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
              <h2 className="section-title" style={{ marginBottom: 20 }}>كيف <span>تستبدلي</span>؟</h2>
              <div className="card" style={{ padding: 20 }}>
                {[["100 نقطة","= 1 ج.م رصيد محفظة"],["500 نقطة","= خصم 5%"],["1000 نقطة","= كلاس مجاني"],["3000 نقطة","= شهر اشتراك مجاني"],["5000 نقطة","= منتج هدية"]].map(([pts, val]) => (
                  <div key={pts} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontWeight: 700, color: C.gold, fontSize: 14 }}>{pts}</span>
                    <span style={{ fontSize: 12, color: C.gray }}>{val}</span>
                    <button className="btn-primary" style={{ padding: "4px 10px", fontSize: 11 }}>استبدلي</button>
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
  const [copied, setCopied] = useState(false);
  const code = "FZONE-2025-123";
  const copy = () => { setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "64px 0", textAlign: "center" }}>
        <div className="container">
          <div style={{ fontSize: 60, marginBottom: 14 }}>🎁</div>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>دعوي صاحبتك <span style={{ color: C.red }}>واكسبوا معًا!</span></h1>
          <p style={{ color: C.gray, fontSize: 17, maxWidth: 460, margin: "0 auto" }}>كل صديقة تشتركي بدعوتها هتاخدوا كلتيكما خصم 20% على الاشتراك القادم</p>
        </div>
      </section>
      <section className="section">
        <div className="container" style={{ maxWidth: 680, margin: "0 auto" }}>
          <div className="card" style={{ padding: 36, textAlign: "center", marginBottom: 28, border: `1px solid ${C.red}33` }}>
            <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 6 }}>كودك الخاص</h2>
            <p style={{ color: C.gray, fontSize: 13, marginBottom: 22 }}>شاركيه مع صديقاتك واكسبي المكافآت</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", background: "rgba(230,57,22,.08)", border: `1px solid ${C.red}33`, borderRadius: 10, padding: "14px 20px", marginBottom: 18 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: C.red, letterSpacing: 2, fontFamily: "monospace" }}>{code}</span>
              <button onClick={copy} style={{ background: copied ? C.success : C.red, border: "none", borderRadius: 6, padding: "7px 14px", color: "#fff", fontFamily: "'Cairo', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                {copied ? <><I n="check" s={13} c="#fff" /> تم!</> : <><I n="copy" s={13} c="#fff" /> نسخ</>}
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button style={{ background: "#25D366", border: "none", borderRadius: 6, padding: "10px 18px", color: "#fff", fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <I n="whatsapp" s={15} c="#fff" /> واتساب
              </button>
              <button style={{ background: "rgba(255,255,255,.08)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "10px 18px", color: C.white, fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                نسخ الرابط
              </button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
            {[["👥","12","إحالة ناجحة"],["💰","240 ج.م","مكتسبة"],["🔄","3","في الانتظار"]].map(([icon,val,lbl]) => (
              <div key={lbl} className="card" style={{ padding: 18, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: C.red }}>{val}</div>
                <div style={{ fontSize: 11, color: C.gray }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 28 }}>
            <h3 style={{ fontWeight: 800, fontSize: 18, color: C.white, marginBottom: 20 }}>إزاي بيشتغل؟</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {[["شاركي كودك","أرسلي الكود لصديقاتك على واتساب أو الإنستجرام", C.red],["صديقتك تشتركي","لما تشتركي بالكود بتاعك كلتيكما هتاخدوا خصم 20%", C.gold],["اكسبي المكافأة","يضافلك 200 نقطة فور إتمام صديقتك الاشتراك", C.success]].map(([title, desc, col], i) => (
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
const AccountPage = ({ navigate }) => {
  const [activeTab, setActiveTab] = useState("overview");
  const tabs = [
    { id: "overview", label: "نظرة عامة", icon: "home" },
    { id: "profile", label: "بياناتي", icon: "user" },
    { id: "memberships", label: "اشتراكاتي", icon: "repeat" },
    { id: "bookings", label: "حجوزاتي", icon: "calendar" },
    { id: "orders", label: "طلباتي", icon: "box" },
    { id: "wallet", label: "المحفظة", icon: "wallet" },
    { id: "rewards", label: "النقاط", icon: "star" },
    { id: "referrals", label: "الإحالات", icon: "share" },
  ];
  const bookings = [
    { name: "يوجا الصباح", date: "١٥ يناير", time: "٧:٠٠ ص", status: "قادم", trainer: "هبة" },
    { name: "زومبا", date: "١٢ يناير", time: "٩:٣٠ ص", status: "مكتمل", trainer: "منال" },
    { name: "بيلاتس", date: "١٠ يناير", time: "١١:٠٠ ص", status: "ملغي", trainer: "سحر" },
  ];
  const orders = [
    { id: "#FZ001", item: "حذاء Luna Sport", date: "١٢ يناير", price: 850, status: "تم التسليم" },
    { id: "#FZ002", item: "باقة برو شهرية", date: "٠١ يناير", price: 599, status: "نشط" },
  ];

  return (
    <div>
      <div style={{ background: `linear-gradient(135deg, #1A0500, ${C.bgCard})`, borderBottom: `1px solid ${C.border}`, padding: "28px 0" }}>
        <div className="container" style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, background: "rgba(230,57,22,.2)", border: `2px solid ${C.red}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: C.red, fontWeight: 900, fontSize: 26 }}>ف</div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: C.white }}>فاطمة محمد</h1>
            <p style={{ color: C.gray, fontSize: 13 }}>fatma@example.com · عضوة منذ يناير ٢٠٢٤</p>
            <span className="badge" style={{ marginTop: 6, display: "inline-flex" }}>👑 عضوة Pro</span>
          </div>
        </div>
      </div>
      <div className="container" style={{ padding: "32px 24px", display: "grid", gridTemplateColumns: "240px 1fr", gap: 28 }}>
        <aside>
          <div className="card" style={{ padding: 8 }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", borderRadius: 8, border: "none", background: activeTab === t.id ? "rgba(230,57,22,.12)" : "none", color: activeTab === t.id ? C.red : C.gray, fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "right" }}>
                <I n={t.icon} s={15} c={activeTab === t.id ? C.red : C.gray} /> {t.label}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 6 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 14px", borderRadius: 8, border: "none", background: "none", color: "#EF4444", fontFamily: "'Cairo', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <I n="logout" s={15} c="#EF4444" /> تسجيل الخروج
              </button>
            </div>
          </div>
        </aside>
        <main>
          {activeTab === "overview" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, marginBottom: 28 }}>
                {[["💳","150 ج.م","رصيد المحفظة"],["⭐","2,400","نقاط المكافآت"],["👑","Pro","الاشتراك النشط"],["📅","١٥ يناير","الحجز القادم"]].map(([icon,val,lbl]) => (
                  <div key={lbl} className="card" style={{ padding: 18 }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: C.red }}>{val}</div>
                    <div style={{ fontSize: 12, color: C.gray }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <div className="card" style={{ padding: 20 }}>
                <h3 style={{ fontWeight: 800, color: C.white, marginBottom: 14 }}>الحجز القادم</h3>
                <div style={{ background: "rgba(230,57,22,.08)", border: `1px solid ${C.red}22`, borderRadius: 8, padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.white }}>يوجا الصباح</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>الأحد ١٥ يناير · ٧:٠٠ ص · مع هبة زارع</div>
                  </div>
                  <span className="badge badge-green">قادم</span>
                </div>
              </div>
            </div>
          )}
          {activeTab === "bookings" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>حجوزاتي</h2>
              {bookings.map((b, i) => (
                <div key={i} className="card" style={{ padding: 18, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{b.name}</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{b.date} · {b.time} · مع {b.trainer}</div>
                  </div>
                  <span style={{ padding: "3px 12px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: b.status === "قادم" ? "rgba(34,197,94,.12)" : b.status === "مكتمل" ? "rgba(230,57,22,.12)" : "rgba(239,68,68,.1)", color: b.status === "قادم" ? C.success : b.status === "مكتمل" ? C.red : "#EF4444" }}>
                    {b.status}
                  </span>
                </div>
              ))}
            </div>
          )}
          {activeTab === "orders" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>طلباتي</h2>
              {orders.map((o, i) => (
                <div key={i} className="card" style={{ padding: 18, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: C.white }}>{o.item}</div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>{o.id} · {o.date}</div>
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 900, color: C.red, fontSize: 15 }}>{o.price} ج.م</div>
                    <span style={{ padding: "2px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: o.status === "نشط" ? "rgba(34,197,94,.12)" : C.bgCard2, color: o.status === "نشط" ? C.success : C.gray }}>{o.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === "profile" && (
            <div>
              <h2 style={{ fontWeight: 800, fontSize: 20, color: C.white, marginBottom: 20 }}>بياناتي الشخصية</h2>
              <div className="card" style={{ padding: 28 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {[["الاسم الأول","فاطمة"],["اسم العائلة","محمد"],["البريد الإلكتروني","fatma@example.com"],["رقم الجوال","010XXXXXXXX"],["تاريخ الميلاد","١٥ مارس ١٩٩٢"],["المحافظة","بني سويف"]].map(([lbl, val]) => (
                    <div key={lbl}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{lbl}</label>
                      <input className="input" defaultValue={val} dir={lbl.includes("البريد") || lbl.includes("الجوال") ? "ltr" : "rtl"} />
                    </div>
                  ))}
                </div>
                <button className="btn-primary" style={{ marginTop: 20 }}>حفظ التغييرات</button>
              </div>
            </div>
          )}
          {["wallet","rewards","referrals","memberships"].includes(activeTab) && (
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 52, marginBottom: 18 }}>{activeTab === "wallet" ? "💳" : activeTab === "rewards" ? "⭐" : activeTab === "referrals" ? "🎁" : "👑"}</div>
              <h3 style={{ fontWeight: 800, fontSize: 22, color: C.white, marginBottom: 10 }}>
                {activeTab === "wallet" ? "محفظتي" : activeTab === "rewards" ? "نقاطي" : activeTab === "referrals" ? "إحالاتي" : "اشتراكاتي"}
              </h3>
              <p style={{ color: C.gray, marginBottom: 20, fontSize: 14 }}>روحي للصفحة المخصصة لكل التفاصيل</p>
              <button className="btn-primary">عرض الصفحة الكاملة</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

// ─── TRAINERS PAGE ────────────────────────────────────────────────────────────
const TrainersPage = () => {
  const trainers = [
    { name: "هبة زارع", specialty: "يوجا & قوة", bio: "المدربة المؤسسة لفيت زون. حاصلة على شهادات دولية في اليوغا والتدريب القوة. خبرة 8 سنوات.", rating: 4.9, sessions: 520, type: "trainer1", certs: ["RYT-500","ACE-CPT"] },
    { name: "منال علي", specialty: "زومبا & كارديو", bio: "بطلة زومبا مصر ٢٠٢٢. متخصصة في الكارديو الحاري وكلاسات الرقص. طاقتها بتعدي!", rating: 4.8, sessions: 380, type: "trainer2", certs: ["Zumba B1","AFAA"] },
    { name: "سحر كمال", specialty: "بيلاتس & إطالة", bio: "متخصصة في البيلاتس العلاجي وإعادة التأهيل. مثالية لحالات الإصابات والأمهات الجدد.", rating: 4.9, sessions: 415, type: "trainer3", certs: ["BASI Pilates","CPT"] },
    { name: "دينا عمر", specialty: "تأمل & يوجا", bio: "مدربة روحية تجمع اليوغا بالتأمل لتحقيق التوازن الداخلي. كلاساتها هادية ومريحة.", rating: 4.7, sessions: 290, type: "trainer1", certs: ["RYT-200","Mindfulness"] },
    { name: "ريم حسن", specialty: "HIIT & كارديو", bio: "متخصصة في تمارين الشدة العالية. هتحرقي أكتر سعرات في وقت أقل مع ريم!", rating: 4.8, sessions: 350, type: "trainer2", certs: ["NASM-CPT","HIIT Cert"] },
    { name: "نور محمد", specialty: "قوة & لياقة عامة", bio: "مدربة القوة والتحمل. متخصصة في تشكيل الجسم وبناء العضلات النسائية.", rating: 4.9, sessions: 460, type: "trainer3", certs: ["NSCA","FMS Level 2"] },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <span className="tag" style={{ marginBottom: 14, display: "inline-block" }}>فريقنا</span>
          <h1 style={{ fontSize: 44, fontWeight: 900, color: C.white, marginBottom: 12 }}>مدرباتنا <span style={{ color: C.red }}>المحترفات</span></h1>
          <p style={{ color: C.gray, fontSize: 17 }}>أفضل فريق تدريبي في بني سويف</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {trainers.map(t => (
              <div key={t.name} className="card card-hover" style={{ overflow: "hidden" }}>
                <div style={{ height: 200 }}><GymImg type={t.type} w="100%" h={200} /></div>
                <div style={{ padding: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <h3 style={{ fontWeight: 800, fontSize: 17, color: C.white }}>{t.name}</h3>
                    <span style={{ color: C.gold, fontWeight: 700, fontSize: 13 }}>⭐ {t.rating}</span>
                  </div>
                  <p style={{ color: C.red, fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{t.specialty}</p>
                  <p style={{ color: C.gray, fontSize: 12, lineHeight: 1.7, marginBottom: 14 }}>{t.bio}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                    {t.certs.map(c => <span key={c} className="tag-gold" style={{ fontSize: 10 }}>{c}</span>)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.gray }}>{t.sessions} جلسة</span>
                    <button className="btn-outline-gold" style={{ padding: "5px 14px", fontSize: 11 }}>عرض الملف</button>
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
  const [activeArticle, setActiveArticle] = useState(null);
  const [cat, setCat] = useState("الكل");
  const cats = ["الكل","لياقة","تغذية","صحة","تحفيز"];
  const articles = [
    { title: "١٠ تمارين يومية تغير جسمك في ٣٠ يوم", cat: "لياقة", readTime: "5 دق", author: "هبة زارع", date: "١٤ يناير", featured: true, content: "ابدئي يومك بالتمارين دي البسيطة وهتحسي بفرق حقيقي في طاقتك ولياقتك خلال شهر واحد بس..." },
    { title: "أكلي إيه قبل وبعد التمرين عشان تحرقي أكتر", cat: "تغذية", readTime: "7 دق", author: "منال علي", date: "١٢ يناير", featured: false, content: "التغذية بتحدد ٧٠٪ من نتايجك الرياضية. اعرفي أسرار الأكل الصح قبل وبعد الجيم..." },
    { title: "إزاي تتعاملي مع الإجهاد الرياضي؟", cat: "صحة", readTime: "4 دق", author: "سحر كمال", date: "١٠ يناير", featured: false, content: "الإجهاد الرياضي حقيقي ومؤثر على أداءك. اعرفي علاماته وإزاي تتغلبي عليه..." },
    { title: "خطة تمرين ٤ أسابيع للمبتدئات", cat: "لياقة", readTime: "8 دق", author: "هبة زارع", date: "٨ يناير", featured: false, content: "خطة مدروسة علميًا للي بتبدأ رحلتها الرياضية لأول مرة..." },
  ];

  if (activeArticle) {
    const a = activeArticle;
    return (
      <div>
        <div style={{ height: 300, position: "relative" }}>
          <GymImg type="blog" w="100%" h={300} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent, rgba(10,10,10,.9))" }} />
          <div style={{ position: "absolute", bottom: 28, left: 0, right: 0 }}><div className="container">
            <button onClick={() => setActiveArticle(null)} style={{ background: "rgba(255,255,255,.1)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 14px", color: C.white, cursor: "pointer", fontFamily: "'Cairo', sans-serif", marginBottom: 10, fontSize: 13 }}>← رجوع</button>
            <span className="tag" style={{ marginBottom: 10, display: "inline-flex" }}>{a.cat}</span>
            <h1 style={{ color: C.white, fontSize: 30, fontWeight: 900 }}>{a.title}</h1>
          </div></div>
        </div>
        <div className="container" style={{ maxWidth: 740, padding: "40px 24px" }}>
          <div style={{ display: "flex", gap: 16, marginBottom: 28, color: C.gray, fontSize: 13, flexWrap: "wrap" }}>
            <span>✍️ {a.author}</span><span>📅 {a.date}</span><span>⏱ {a.readTime} قراءة</span>
          </div>
          <div className="card" style={{ padding: 36 }}>
            <p style={{ lineHeight: 2, fontSize: 15, color: C.grayLight }}>{a.content}</p>
            <p style={{ lineHeight: 2, fontSize: 15, color: C.gray, marginTop: 18 }}>التمرين المنتظم بيحسن مستوى اللياقة البدنية ويقوي الجسم تدريجيًا. الالتزام بروتين محدد بيساعد على بناء العضلات وتحسين الكارديو...</p>
          </div>
        </div>
      </div>
    );
  }

  const featured = articles.find(a => a.featured);
  const rest = articles.filter(a => !a.featured && (cat === "الكل" || a.cat === cat));

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "48px 0" }}>
        <div className="container">
          <h1 style={{ fontSize: 40, fontWeight: 900, color: C.white, marginBottom: 8 }}>مدونة <span style={{ color: C.red }}>فيت زون</span></h1>
          <p style={{ color: C.gray, fontSize: 15 }}>نصائح ومقالات في اللياقة والصحة النسائية</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          {featured && (
            <div className="card card-hover" style={{ overflow: "hidden", marginBottom: 48, display: "grid", gridTemplateColumns: "1fr 1fr", cursor: "pointer", border: `1px solid ${C.red}22` }} onClick={() => setActiveArticle(featured)}>
              <div style={{ height: 300 }}><GymImg type="blog" w="100%" h={300} /></div>
              <div style={{ padding: 36, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span className="badge" style={{ marginBottom: 14, display: "inline-flex", width: "fit-content" }}>مقال مميز</span>
                <h2 style={{ fontSize: 26, fontWeight: 900, color: C.white, marginBottom: 14, lineHeight: 1.4 }}>{featured.title}</h2>
                <p style={{ color: C.gray, lineHeight: 1.7, marginBottom: 18, fontSize: 13 }}>{featured.content.substring(0,80)}...</p>
                <div style={{ display: "flex", gap: 16, color: C.gray, fontSize: 12, marginBottom: 22 }}>
                  <span>✍️ {featured.author}</span><span>⏱ {featured.readTime}</span>
                </div>
                <button className="btn-primary" style={{ width: "fit-content" }}>اقرئي المقال →</button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
            {cats.map(c => <button key={c} className={`tab ${cat === c ? "active" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {rest.map(a => (
              <div key={a.title} className="card card-hover" style={{ cursor: "pointer" }} onClick={() => setActiveArticle(a)}>
                <div style={{ height: 170 }}><GymImg type="blog" w="100%" h={170} /></div>
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <span className="tag" style={{ fontSize: 11 }}>{a.cat}</span>
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
  const [openFaq, setOpenFaq] = useState(null);
  const faqs = [
    { q: "إيه ساعات العمل؟", a: "بنشتغل من الأحد للخميس من الساعة ٧ الصبح لـ ١٠ بالليل، والجمعة والسبت من ٨ الصبح لـ ٨ بالليل." },
    { q: "هل في كلاسات للأطفال؟", a: "أيوه! عندنا برامج مخصصة للأطفال من سن ٤ سنوات. تواصلي معنا لمعرفة التفاصيل." },
    { q: "ممكن أجمد العضوية؟", a: "أيوه، تقدري تجمدي العضوية مرة في الشهر لمدة مش أكتر من أسبوعين." },
    { q: "إيه طرق الدفع المتاحة؟", a: "نقبل كاش، بطاقات دفع، انستاباي، والمحفظة الرقمية." },
    { q: "هل في عروض للمجموعات؟", a: "أيوه! في عروض خاصة للمجموعات من ٤ أشخاص فأكثر بخصومات لحد ٣٠٪." },
  ];

  return (
    <div>
      <section style={{ background: `linear-gradient(135deg, #1A0500, ${C.bg})`, padding: "60px 0", textAlign: "center" }}>
        <div className="container">
          <h1 style={{ fontSize: 44, fontWeight: 900, color: C.white, marginBottom: 10 }}>تواصلي <span style={{ color: C.red }}>معنا</span></h1>
          <p style={{ color: C.gray, fontSize: 17 }}>إحنا موجودين عشانك في أي وقت 💪</p>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
            <div>
              <h2 className="section-title" style={{ marginBottom: 24 }}>ابعتيلنا <span>رسالة</span></h2>
              <div className="card" style={{ padding: 28 }}>
                {[["الاسم","text","اسمك"],["البريد الإلكتروني","email","بريدك الإلكتروني"],["رقم الجوال","tel","01XXXXXXXXX"]].map(([label, type, ph]) => (
                  <div key={label} style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>{label}</label>
                    <input className="input" type={type} placeholder={ph} dir={type !== "text" ? "ltr" : "rtl"} />
                  </div>
                ))}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>الموضوع</label>
                  <select className="select"><option>استفسار عام</option><option>مشكلة في الحجز</option><option>اشتراكات</option><option>شكوى</option></select>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: C.gray, display: "block", marginBottom: 6 }}>الرسالة</label>
                  <textarea className="input" rows={4} placeholder="اكتبي رسالتك هنا..." style={{ resize: "vertical" }} />
                </div>
                <button className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 15 }}>
                  <I n="mail" s={16} c="#fff" /> إرسال الرسالة
                </button>
              </div>
            </div>
            <div>
              <h2 className="section-title" style={{ marginBottom: 24 }}>معلومات <span>التواصل</span></h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {[["phone","01001514535 / +20 1001514535"],["mail","itsfitzoone@gmail.com"],["map","بني سويف، مقابل بنك القاهرة، بجوار شاهر للسياحة فوق كازيون"],["clock","أحد-خميس: ٧ص-١٠م | جمعة-سبت: ٨ص-٨م"]].map(([icon, text]) => (
                  <div key={icon} className="card" style={{ padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ width: 40, height: 40, background: "rgba(230,57,22,.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <I n={icon} s={18} c={C.red} />
                    </div>
                    <span style={{ color: C.grayLight, fontSize: 13, lineHeight: 1.7 }}>{text}</span>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(230,57,22,.08)", border: `1px solid ${C.red}33`, borderRadius: 10, padding: 20 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>📱</span>
                  <span style={{ fontWeight: 700, color: C.white }}>تواصل سريع</span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <a href="tel:01001514535" style={{ flex: 1, background: C.red, color: "#fff", padding: "10px", borderRadius: 6, textAlign: "center", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 }}>📞 اتصال</a>
                  <a href="https://wa.me/201001514535" style={{ flex: 1, background: "#25D366", color: "#fff", padding: "10px", borderRadius: 6, textAlign: "center", textDecoration: "none", fontFamily: "'Cairo', sans-serif", fontWeight: 700, fontSize: 13 }}>💬 واتساب</a>
                </div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 72 }}>
            <h2 className="section-title" style={{ textAlign: "center", marginBottom: 36 }}>الأسئلة <span>الشائعة</span></h2>
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
export default function App() {
  const [page, setPage] = useState("home");

  const navigate = (p) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pages = {
    home: <HomePage navigate={navigate} />,
    memberships: <MembershipsPage navigate={navigate} />,
    classes: <ClassesPage navigate={navigate} />,
    classDetail: <ClassDetailPage navigate={navigate} />,
    schedule: <SchedulePage navigate={navigate} />,
    offers: <OffersPage navigate={navigate} />,
    shop: <ShopPage navigate={navigate} />,
    productDetail: <ProductDetailPage navigate={navigate} />,
    cart: <CartPage navigate={navigate} />,
    checkout: <CartPage navigate={navigate} />,
    wallet: <WalletPage />,
    rewards: <RewardsPage />,
    referral: <ReferralPage />,
    account: <AccountPage navigate={navigate} />,
    trainers: <TrainersPage />,
    blog: <BlogPage />,
    contact: <ContactPage />,
  };

  return (
    <div className="app">
      <style>{css}</style>
      <Header currentPage={page} navigate={navigate} />
      <main>{pages[page] || pages.home}</main>
      <Footer navigate={navigate} />
    </div>
  );
}