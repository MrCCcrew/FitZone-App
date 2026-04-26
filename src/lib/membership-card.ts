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
  const v = label.toLowerCase();

  // Trial / تجريبي
  if (v.includes("trial") || v.includes("تجريب"))
    return { name: "تجريبي", bgStart: "#1d4ed8", bgEnd: "#0a1128", accent: "#93c5fd", accentSoft: "#1e3a8a", textMain: "#fff", textMuted: "#bfdbfe", badgeText: "#0f172a" };

  // Annual / سنوي
  if (v.includes("year") || v.includes("سنو") || v.includes("annual") || v.includes("12 شهر") || v.includes("١٢"))
    return { name: "سنوي", bgStart: "#b45309", bgEnd: "#0c0900", accent: "#fde68a", accentSoft: "#78350f", textMain: "#fff", textMuted: "#fef3c7", badgeText: "#451a03" };

  // Semi-annual / نصف سنة / 6 months
  if (v.includes("6") || v.includes("نصف") || v.includes("semi") || v.includes("ستة") || v.includes("٦"))
    return { name: "نصف سنوي", bgStart: "#0e7490", bgEnd: "#020f14", accent: "#67e8f9", accentSoft: "#164e63", textMain: "#fff", textMuted: "#cffafe", badgeText: "#083344" };

  // Quarterly / ثلاثة أشهر / 3 months
  if (v.includes("3") || v.includes("ثلاث") || v.includes("quarter") || v.includes("ربع") || v.includes("٣"))
    return { name: "ثلاثة أشهر", bgStart: "#6d28d9", bgEnd: "#0d0718", accent: "#c4b5fd", accentSoft: "#4c1d95", textMain: "#fff", textMuted: "#ede9fe", badgeText: "#2e1065" };

  // Monthly / شهري
  if (v.includes("month") || v.includes("شهر"))
    return { name: "شهري", bgStart: "#065f46", bgEnd: "#011207", accent: "#6ee7b7", accentSoft: "#064e3b", textMain: "#fff", textMuted: "#d1fae5", badgeText: "#022c22" };

  // Kids / أطفال
  if (v.includes("kids") || v.includes("أطفال") || v.includes("child") || v.includes("طفل"))
    return { name: "أطفال", bgStart: "#0369a1", bgEnd: "#001220", accent: "#7dd3fc", accentSoft: "#075985", textMain: "#fff", textMuted: "#e0f2fe", badgeText: "#0c4a6e" };

  // Gift / هدية
  if (v.includes("gift") || v.includes("هدية"))
    return { name: "هدية", bgStart: "#be185d", bgEnd: "#150411", accent: "#f9a8d4", accentSoft: "#9d174d", textMain: "#fff", textMuted: "#fce7f3", badgeText: "#500724" };

  // Offer / عرض
  if (v.includes("offer") || v.includes("عرض") || v.includes("special") || v.includes("خاص"))
    return { name: "عرض خاص", bgStart: "#c2410c", bgEnd: "#180700", accent: "#fdba74", accentSoft: "#9a3412", textMain: "#fff", textMuted: "#ffedd5", badgeText: "#431407" };

  // Package / باقة
  if (v.includes("package") || v.includes("باقة"))
    return { name: "باقة", bgStart: "#7c3aed", bgEnd: "#0e0520", accent: "#e9d5ff", accentSoft: "#4c1d95", textMain: "#fff", textMuted: "#f3e8ff", badgeText: "#3b0764" };

  // Default — FitZone signature pink
  return { name: "عضوية", bgStart: "#9d174d", bgEnd: "#1a0411", accent: "#f9a8d4", accentSoft: "#831843", textMain: "#fff", textMuted: "#fce7f3", badgeText: "#500724" };
}

function planFontSize(len: number): number {
  if (len <= 16) return 38;
  if (len <= 24) return 30;
  if (len <= 32) return 24;
  return 19;
}

function splitPlanText(plan: string, maxCharsPerLine = 28): string[] {
  if (plan.length <= maxCharsPerLine) return [plan];
  // Split near middle at a space
  const mid = Math.floor(plan.length / 2);
  let idx = plan.lastIndexOf(" ", mid);
  if (idx === -1) idx = plan.indexOf(" ", mid);
  if (idx === -1) return [plan.slice(0, maxCharsPerLine - 1) + "…", plan.slice(maxCharsPerLine - 1)];
  return [plan.slice(0, idx), plan.slice(idx + 1)];
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
    width: 340,
  });
  const logoDataUrl = readLogoDataUrl();
  const displayPlan = input.offerTitle?.trim() || input.membershipName;
  const displayName = input.memberName.trim() || "FitZone Member";
  const expiry = formatDate(input.endDate);

  // Plan text — split into up to 2 lines and pick font size
  const planLines = splitPlanText(displayPlan, 26);
  const pFontSize = planFontSize(displayPlan.length);
  const planLineHeight = pFontSize + 10;

  // Name font size — shrink for long names
  const nameFontSize = displayName.length > 22 ? 34 : displayName.length > 16 ? 40 : 46;

  // Right panel starts at x=820; left content must stay within 700px from x=84
  const LEFT_MAX = 700;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680" role="img" aria-label="FitZone Membership Card">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bgStart}"/>
      <stop offset="100%" stop-color="${theme.bgEnd}"/>
    </linearGradient>
    <linearGradient id="stripe" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0.05"/>
    </linearGradient>
    <linearGradient id="qrbg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.97"/>
      <stop offset="100%" stop-color="#f0f0f0" stop-opacity="0.97"/>
    </linearGradient>
    <filter id="qs" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <clipPath id="left-clip">
      <rect x="0" y="0" width="${LEFT_MAX}" height="680"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1200" height="680" rx="40" fill="url(#bg)"/>

  <!-- Decorative orbs -->
  <circle cx="1080" cy="80"  r="200" fill="${theme.accent}" opacity="0.08"/>
  <circle cx="100"  cy="600" r="180" fill="${theme.accent}" opacity="0.06"/>
  <circle cx="600"  cy="-40" r="120" fill="${theme.accent}" opacity="0.05"/>

  <!-- Outer border -->
  <rect x="48" y="48" width="1104" height="584" rx="28" fill="none" stroke="${theme.accent}" stroke-opacity="0.2" stroke-width="1.5"/>

  <!-- Bottom accent stripe -->
  <rect x="48" y="580" width="1104" height="52" rx="20" fill="url(#stripe)" opacity="0.6"/>

  <!-- ── LEFT COLUMN ─────────────────────────────────────── -->
  <g transform="translate(76 72)" clip-path="url(#left-clip)">

    <!-- Logo + Brand -->
    ${logoDataUrl
      ? `<rect x="0" y="0" width="80" height="80" rx="18" fill="#fff" fill-opacity="0.15"/>
         <image href="${logoDataUrl}" x="8" y="8" width="64" height="64" preserveAspectRatio="xMidYMid slice"/>`
      : ""}
    <text x="${logoDataUrl ? 100 : 0}" y="22" font-size="16" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700" letter-spacing="2">FITZONE MEMBERSHIP</text>
    <text x="${logoDataUrl ? 100 : 0}" y="62" font-size="44" font-family="Arial,sans-serif" fill="${theme.textMain}" font-weight="900">FIT ZONE</text>

    <!-- Badge -->
    <rect x="570" y="2" width="120" height="36" rx="12" fill="${theme.accent}"/>
    <text x="630" y="25" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" fill="${theme.badgeText}" font-weight="900">${escapeXml(theme.name.toUpperCase())}</text>

    <!-- Divider -->
    <rect x="0" y="94" width="680" height="1.5" fill="${theme.accent}" opacity="0.25"/>

    <!-- Member -->
    <text x="0" y="128" font-size="15" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700" letter-spacing="1">MEMBER</text>
    <text x="0" y="175" font-size="${nameFontSize}" font-family="Arial,sans-serif" fill="${theme.textMain}" font-weight="900">${escapeXml(displayName)}</text>

    <!-- Plan -->
    <text x="0" y="220" font-size="15" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700" letter-spacing="1">PLAN</text>
    ${planLines.map((line, i) =>
      `<text x="0" y="${220 + 36 + i * planLineHeight}" font-size="${pFontSize}" font-family="Arial,sans-serif" fill="${theme.accent}" font-weight="900">${escapeXml(line)}</text>`
    ).join("\n    ")}

    <!-- Valid Until -->
    <text x="0" y="${220 + 36 + planLines.length * planLineHeight + 28}" font-size="15" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700" letter-spacing="1">VALID UNTIL</text>
    <text x="0" y="${220 + 36 + planLines.length * planLineHeight + 68}" font-size="28" font-family="Arial,sans-serif" fill="${theme.textMain}" font-weight="800">${escapeXml(expiry)}</text>

  </g>

  <!-- ── RIGHT COLUMN — QR ───────────────────────────────── -->
  <g transform="translate(820 80)" filter="url(#qs)">
    <!-- QR card -->
    <rect x="0" y="0" width="300" height="300" rx="24" fill="url(#qrbg)"/>
    <image href="${qrDataUrl}" x="20" y="20" width="260" height="260"/>
  </g>

  <!-- Scan label -->
  <text x="970" y="404" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700">اسكاني الكارت عند الدخول</text>

  <!-- ── BOTTOM STRIPE CONTENT ──────────────────────────── -->
  <g transform="translate(76 592)">
    <text x="0" y="0"  font-size="13" font-family="Arial,sans-serif" fill="${theme.textMuted}" font-weight="700" letter-spacing="1">ATTENDANCE CODE</text>
    <text x="0" y="28" font-size="26" font-family="Courier New,monospace" fill="${theme.accent}" font-weight="700" letter-spacing="3">${escapeXml(input.cardCode)}</text>
  </g>
  <text x="1124" y="620" text-anchor="end" font-size="13" font-family="Arial,sans-serif" fill="${theme.textMuted}" opacity="0.6">fitzoneland.com</text>

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
