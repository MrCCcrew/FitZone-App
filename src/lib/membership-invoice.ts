import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export type MembershipInvoiceDetails = {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  membershipName: string;
  membershipNameEn?: string | null;
  offerTitle?: string | null;
  offerTitleEn?: string | null;
  paymentMethod: string;
  originalPrice: number;
  membershipDiscount: number;
  discountCodeAmount: number;
  discountCode?: string | null;
  walletDeduct?: number;
  pointsDeduct?: number;
  finalAmount: number;
  startDate?: Date | null;
  endDate: Date;
  issuedAt?: Date;
};

function formatMoney(value: number) {
  return `${value.toFixed(2)} EGP`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function toSafeLatin(value: string | null | undefined, fallback: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return /[^\u0000-\u00ff]/.test(raw) ? fallback : raw;
}

function mapPaymentMethod(value: string | null | undefined) {
  switch ((value ?? "").toLowerCase()) {
    case "instapay":
      return "InstaPay";
    case "vodafone_cash":
      return "Vodafone Cash";
    case "cash":
      return "Cash";
    case "offer":
      return "Offer";
    default:
      return value ? value.replace(/_/g, " ") : "Membership";
  }
}

function getFontPath() {
  const candidate = path.join(process.cwd(), "public", "fonts", "SKR-HEAD1.ttf");
  return fs.existsSync(candidate) ? candidate : null;
}

export async function generateMembershipInvoicePdf(details: MembershipInvoiceDetails) {
  const fontPath = getFontPath();
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const brandFont = fontPath ?? "Helvetica-Bold";
    const regularFont = fontPath ?? "Helvetica";
    const boldFont = fontPath ?? "Helvetica-Bold";

    doc.font(brandFont).fontSize(24).fillColor("#E91E63").text("FITZONE", 42, 42);
    doc.font(regularFont).fontSize(10).fillColor("#555").text("Fitness Club Membership Invoice", 42, 72);
    doc.moveTo(42, 92).lineTo(553, 92).strokeColor("#E91E63").lineWidth(2).stroke();

    const issuedAt = details.issuedAt ?? new Date();
    const displayMembership = toSafeLatin(details.membershipNameEn || details.membershipName, "Membership plan");
    const displayOffer = toSafeLatin(details.offerTitleEn || details.offerTitle, "");
    const displayCustomer = toSafeLatin(details.customerName, "FitZone Member");

    let y = 112;
    doc.font(boldFont).fontSize(13).fillColor("#111").text("Invoice details", 42, y);
    y += 22;
    doc.font(regularFont).fontSize(10).fillColor("#222");
    doc.text(`Invoice No: ${details.invoiceNumber}`, 42, y);
    doc.text(`Issued at: ${formatDate(issuedAt)}`, 320, y, { width: 220, align: "right" });
    y += 18;
    doc.text(`Customer: ${displayCustomer}`, 42, y);
    doc.text(`Payment method: ${mapPaymentMethod(details.paymentMethod)}`, 320, y, { width: 220, align: "right" });
    y += 18;
    doc.text(`Email: ${details.customerEmail}`, 42, y);
    doc.text(`Membership: ${displayMembership}`, 320, y, { width: 220, align: "right" });
    y += 18;
    if (displayOffer) {
      doc.text(`Offer: ${displayOffer}`, 42, y);
      y += 18;
    }
    if (details.startDate) {
      doc.text(`Start date: ${formatDate(details.startDate)}`, 42, y);
      doc.text(`End date: ${formatDate(details.endDate)}`, 320, y, { width: 220, align: "right" });
      y += 24;
    } else {
      doc.text(`Valid until: ${formatDate(details.endDate)}`, 42, y);
      y += 24;
    }

    doc.font(boldFont).fontSize(13).fillColor("#111").text("Billing summary", 42, y);
    y += 16;

    const rows: Array<{ label: string; value: string; color?: string }> = [
      { label: "Original price", value: formatMoney(details.originalPrice) },
    ];
    if (details.membershipDiscount > 0) {
      rows.push({ label: "Membership discount", value: `- ${formatMoney(details.membershipDiscount)}`, color: "#B91C1C" });
    }
    if (details.discountCodeAmount > 0) {
      rows.push({
        label: details.discountCode ? `Promo code (${details.discountCode})` : "Promo code discount",
        value: `- ${formatMoney(details.discountCodeAmount)}`,
        color: "#B91C1C",
      });
    }
    if ((details.walletDeduct ?? 0) > 0) {
      rows.push({ label: "Wallet deduction", value: `- ${formatMoney(details.walletDeduct ?? 0)}`, color: "#B91C1C" });
    }
    if ((details.pointsDeduct ?? 0) > 0) {
      rows.push({ label: "Reward points deduction", value: `- ${formatMoney(details.pointsDeduct ?? 0)}`, color: "#B91C1C" });
    }
    rows.push({ label: "Final amount paid", value: formatMoney(details.finalAmount), color: "#E91E63" });

    const left = 42;
    const right = 553;
    const labelX = 54;
    const valueX = 360;
    rows.forEach((row, index) => {
      const rowTop = y + index * 28;
      doc.roundedRect(left, rowTop, right - left, 22, 4).fillAndStroke(index === rows.length - 1 ? "#FFF1F7" : "#FAFAFA", "#E5E7EB");
      doc.font(row.label === "Final amount paid" ? boldFont : regularFont).fontSize(10).fillColor("#222").text(row.label, labelX, rowTop + 6);
      doc.font(row.label === "Final amount paid" ? boldFont : regularFont).fontSize(10).fillColor(row.color ?? "#111").text(row.value, valueX, rowTop + 6, {
        width: 170,
        align: "right",
      });
    });

    y += rows.length * 28 + 26;
    doc.font(regularFont).fontSize(9).fillColor("#666").text(
      "This invoice is generated automatically after membership payment confirmation.",
      42,
      y,
      { width: 511, align: "center" },
    );

    doc.end();
  });
}
