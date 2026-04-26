import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import sharp from "sharp";

type MembershipCardInput = {
  memberName: string;
  membershipName: string;
  membershipNameEn?: string | null;
  offerTitle?: string | null;
  endDate: Date;
  qrPayload: string;
  cardCode: string;
};

export type MembershipCardAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  previewDataUrl: string;
};

type CardTheme = {
  name: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
  accentSoft: string;
  textMain: string;
  textMuted: string;
  badgeText: string;
};

function escapeXml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readLogoDataUrl() {
  const candidates = [
    path.join(process.cwd(), "public", "fitzone-logo-200.jpeg"),
    path.join(process.cwd(), "public", "fitzone-logo.jpeg"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const buffer = fs.readFileSync(candidate);
    const ext = path.extname(candidate).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }

  return null;
}

function chooseTheme(label: string): CardTheme {
  const value = label.toLowerCase();

  if (value.includes("trial") || value.includes("تجريب")) {
    return {
      name: "Trial",
      bgStart: "#1d4ed8",
      bgEnd: "#0f172a",
      accent: "#93c5fd",
      accentSoft: "#1e3a8a",
      textMain: "#ffffff",
      textMuted: "#dbeafe",
      badgeText: "#0f172a",
    };
  }

  if (value.includes("package") || value.includes("باقة")) {
    return {
      name: "Package",
      bgStart: "#7c3aed",
      bgEnd: "#111827",
      accent: "#e9d5ff",
      accentSoft: "#4c1d95",
      textMain: "#ffffff",
      textMuted: "#ede9fe",
      badgeText: "#2e1065",
    };
  }

  if (value.includes("offer") || value.includes("عرض")) {
    return {
      name: "Offer",
      bgStart: "#ea580c",
      bgEnd: "#431407",
      accent: "#fdba74",
      accentSoft: "#9a3412",
      textMain: "#ffffff",
      textMuted: "#ffedd5",
      badgeText: "#431407",
    };
  }

  if (value.includes("gold") || value.includes("ذه")) {
    return {
      name: "Gold",
      bgStart: "#ca8a04",
      bgEnd: "#1f2937",
      accent: "#fde68a",
      accentSoft: "#713f12",
      textMain: "#ffffff",
      textMuted: "#fef3c7",
      badgeText: "#422006",
    };
  }

  return {
    name: "Signature",
    bgStart: "#db2777",
    bgEnd: "#3b0a20",
    accent: "#f9a8d4",
    accentSoft: "#831843",
    textMain: "#ffffff",
    textMuted: "#fce7f3",
    badgeText: "#500724",
  };
}

function formatDate(value: Date) {
  return value.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function generateMembershipQrCard(input: MembershipCardInput): Promise<MembershipCardAttachment> {
  const theme = chooseTheme(`${input.membershipName} ${input.offerTitle ?? ""}`);
  const qrDataUrl = await QRCode.toDataURL(input.qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 320,
  });
  const logoDataUrl = readLogoDataUrl();
  const displayPlan = input.offerTitle?.trim() || input.membershipName;
  const displayName = input.memberName.trim() || "FitZone Member";
  const expiry = formatDate(input.endDate);
  const cardLabel = theme.name.toUpperCase();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" role="img" aria-label="FitZone Membership Card">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bgStart}"/>
      <stop offset="100%" stop-color="${theme.bgEnd}"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.90"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0.08"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="1200" height="720" rx="42" fill="url(#bg)"/>
  <circle cx="1040" cy="110" r="180" fill="${theme.accent}" opacity="0.10"/>
  <circle cx="170" cy="620" r="220" fill="${theme.accent}" opacity="0.07"/>
  <rect x="56" y="56" width="1088" height="608" rx="34" fill="none" stroke="rgba(255,255,255,0.14)"/>
  <rect x="56" y="530" width="1088" height="100" rx="26" fill="url(#glow)" opacity="0.65"/>

  <g transform="translate(84 82)">
    ${logoDataUrl ? `<rect x="0" y="0" width="94" height="94" rx="22" fill="#ffffff" fill-opacity="0.16"/>
    <image href="${logoDataUrl}" x="10" y="10" width="74" height="74" preserveAspectRatio="xMidYMid slice"/>` : ""}
    <text x="${logoDataUrl ? 116 : 0}" y="26" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">FITZONE MEMBERSHIP</text>
    <text x="${logoDataUrl ? 116 : 0}" y="66" font-size="52" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMain}" font-weight="900">FIT ZONE</text>
    <rect x="760" y="0" rx="18" ry="18" width="176" height="48" fill="${theme.accent}"/>
    <text x="848" y="31" text-anchor="middle" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${theme.badgeText}" font-weight="900">${escapeXml(cardLabel)}</text>
  </g>

  <g transform="translate(84 210)">
    <text x="0" y="0" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">Member</text>
    <text x="0" y="52" font-size="48" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMain}" font-weight="900">${escapeXml(displayName)}</text>

    <text x="0" y="136" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">Plan</text>
    <text x="0" y="188" font-size="42" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMain}" font-weight="900">${escapeXml(displayPlan)}</text>

    <text x="0" y="272" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">Valid Until</text>
    <text x="0" y="324" font-size="34" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMain}" font-weight="800">${escapeXml(expiry)}</text>

    <text x="0" y="402" font-size="20" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">Attendance Code</text>
    <text x="0" y="444" font-size="30" letter-spacing="2" font-family="Courier New, monospace" fill="${theme.accent}" font-weight="700">${escapeXml(input.cardCode)}</text>
  </g>

  <g transform="translate(836 182)" filter="url(#shadow)">
    <rect x="0" y="0" width="270" height="270" rx="28" fill="#ffffff"/>
    <image href="${qrDataUrl}" x="19" y="19" width="232" height="232"/>
  </g>

  <g transform="translate(816 484)">
    <text x="0" y="0" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}" font-weight="700">Scan this card at the gym</text>
    <text x="0" y="36" font-size="28" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMain}" font-weight="900">Fast Check-in Access</text>
    <text x="0" y="86" font-size="18" font-family="Arial, Helvetica, sans-serif" fill="${theme.textMuted}">
      Present this QR card to the front desk or staff scanner.
    </text>
  </g>
</svg>`;

  const svgBuffer = Buffer.from(svg, "utf8");
  const pngBuffer = await sharp(svgBuffer).png().toBuffer();
  return {
    filename: `fitzone-membership-card-${input.cardCode}.png`,
    content: pngBuffer,
    contentType: "image/png",
    previewDataUrl: `data:image/png;base64,${pngBuffer.toString("base64")}`,
  };
}
