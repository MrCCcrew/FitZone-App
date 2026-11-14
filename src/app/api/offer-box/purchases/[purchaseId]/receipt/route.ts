import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/app-session";
import { db } from "@/lib/db";
import { readOfferBoxCollection } from "@/lib/offer-box/collection-read-model";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ purchaseId: string }>;
  },
) {
  const user = await getCurrentAppUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: "UNAUTHORIZED" },
      { status: 401, headers },
    );
  }

  const { purchaseId } = await context.params;

  const purchase = await db.offerBoxPurchase.findFirst({
    where: {
      id: purchaseId,
      userId: user.id,
      redeemedUserMembershipId: null,
    },
    select: {
      id: true,
      userId: true,
      offerId: true,
      status: true,
      priceSnapshot: true,
      currency: true,
      offerSnapshot: true,
      paymentTransactionId: true,
      redeemedUserMembershipId: true,
      paidAt: true,
      createdAt: true,
      user: {
        select: { name: true, email: true },
      },
    },
  });

  if (!purchase) {
    return NextResponse.json(
      { error: "PURCHASE_NOT_FOUND" },
      { status: 404, headers },
    );
  }

  const payment = purchase.paymentTransactionId
    ? await db.paymentTransaction.findUnique({
        where: { id: purchase.paymentTransactionId },
        select: {
          id: true,
          userId: true,
          purpose: true,
          provider: true,
          status: true,
          amount: true,
          currency: true,
          paidAt: true,
          membershipId: true,
          offerId: true,
          metadata: true,
        },
      })
    : null;

  const collection = readOfferBoxCollection(purchase, payment);

  if (
    (collection.confirmedConsiderationAmount ?? collection.confirmedPaidAmount) <= 0 ||
    !collection.paidAt ||
    collection.needsFinancialReview
  ) {
    return NextResponse.json(
      { error: "PAYMENT_NOT_CONFIRMED" },
      { status: 409, headers },
    );
  }

  const receiptNumber = `OB-${purchase.id}`;
  const amount = (collection.confirmedConsiderationAmount ?? collection.confirmedPaidAmount).toFixed(2);

  const paidDate = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(new Date(collection.paidAt));

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FitZone — ${escapeHtml(receiptNumber)}</title>
<style>
  *{box-sizing:border-box}
  body{
    margin:0;background:#f4f4f7;color:#222;
    font-family:Arial,sans-serif;padding:32px 16px;
  }
  main{
    background:white;max-width:760px;margin:auto;
    padding:36px;border-radius:16px;
    border:1px solid #e4dce2;
  }
  h1{color:#9b245f;margin:0 0 8px}
  h2{font-size:22px;margin-bottom:26px}
  .muted{color:#666;font-size:13px}
  table{width:100%;border-collapse:collapse;margin:24px 0}
  th,td{
    padding:13px;border-bottom:1px solid #eee;
    text-align:right;overflow-wrap:anywhere;
  }
  th{width:38%;font-weight:normal;color:#666}
  .total{
    padding:22px;background:#f9eef4;color:#7f1d4e;
    font-weight:bold;font-size:24px;border-radius:12px;
  }
  @media print{
    body{background:white;padding:0}
    main{border:0;max-width:none;padding:15mm}
    .print-note{display:none}
  }
</style>
</head>
<body>
<main>
  <h1>FitZone Land</h1>
  <div class="muted">Women Gym</div>
  <h2>إيصال دفع — بوكس العروض</h2>
  <div class="muted" dir="ltr">${escapeHtml(receiptNumber)}</div>
  <table>
    <tr><th>اسم العميلة</th><td>${escapeHtml(purchase.user.name)}</td></tr>
    <tr><th>العرض</th><td>${escapeHtml(collection.offerTitle)}</td></tr>
    <tr><th>تاريخ الدفع</th><td>${escapeHtml(paidDate)}</td></tr>
    <tr><th>طريقة الدفع</th><td>Paymob</td></tr>
    <tr><th>رقم عملية الدفع</th><td dir="ltr">${escapeHtml(collection.paymentTransactionId)}</td></tr>
    <tr><th>حالة الدفع</th><td>مدفوع ومؤكد</td></tr>
  </table>
  <div class="total">إجمالي المبلغ المدفوع: ${escapeHtml(amount)} جنيه مصري</div>
  ${collection.confirmedConsiderationAmount !== undefined ? `<p>Paymob: ${escapeHtml(collection.confirmedPaidAmount.toFixed(2))} جنيه — المحفظة: ${escapeHtml((collection.walletPaidAmount ?? 0).toFixed(2))} جنيه — النقاط: ${escapeHtml((collection.pointsPaidAmount ?? 0).toFixed(2))} جنيه</p>` : ""}
  <p class="muted">إيصال إثبات دفع صادر عن سجل الشراء الإلكتروني، ولا يعني إنشاء اشتراك جديد.</p>
  <p class="muted print-note">يمكن طباعة هذا الإيصال أو حفظه بصيغة PDF من قائمة الطباعة في المتصفح.</p>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}