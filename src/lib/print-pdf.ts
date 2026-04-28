/**
 * Print-to-PDF utility — opens a styled print window.
 * Arabic RTL is handled natively by the browser.
 */

const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', Arial, sans-serif;
    direction: rtl;
    background: #fff;
    color: #111;
    font-size: 13px;
    line-height: 1.6;
  }
  .page { padding: 32px 40px; max-width: 900px; margin: 0 auto; }
  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 3px solid #e91e63;
    padding-bottom: 16px;
    margin-bottom: 24px;
  }
  .logo { font-size: 28px; font-weight: 900; color: #e91e63; letter-spacing: 1px; }
  .logo span { color: #888; }
  .header-meta { text-align: left; font-size: 12px; color: #555; }
  .header-meta strong { display: block; font-size: 14px; color: #111; margin-bottom: 4px; }
  /* Title */
  .report-title { font-size: 20px; font-weight: 900; color: #111; margin-bottom: 4px; }
  .report-sub { font-size: 12px; color: #777; margin-bottom: 20px; }
  /* KPI cards */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi-card {
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 12px 14px;
    background: #fafafa;
  }
  .kpi-label { font-size: 11px; color: #777; margin-bottom: 4px; }
  .kpi-value { font-size: 17px; font-weight: 900; color: #111; }
  .kpi-value.green { color: #16a34a; }
  .kpi-value.red { color: #dc2626; }
  .kpi-value.orange { color: #d97706; }
  .kpi-value.pink { color: #e91e63; }
  /* Net profit box */
  .net-profit-box {
    border: 2px solid #e91e63;
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fff5f8;
  }
  .net-profit-label { font-size: 14px; font-weight: 700; color: #555; }
  .net-profit-value { font-size: 28px; font-weight: 900; }
  .net-profit-formula { font-size: 11px; color: #888; margin-top: 4px; }
  /* Section titles */
  .section-title {
    font-size: 14px;
    font-weight: 900;
    color: #111;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 6px;
    margin: 20px 0 12px;
  }
  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  thead tr { background: #e91e63; color: #fff; }
  thead th { padding: 8px 10px; text-align: right; font-weight: 700; }
  tbody tr:nth-child(even) { background: #fafafa; }
  tbody tr:hover { background: #fff0f5; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #f0f0f0; }
  tfoot tr { background: #f5f5f5; font-weight: 900; }
  tfoot td { padding: 8px 10px; border-top: 2px solid #ddd; }
  /* Invoice specific */
  .invoice-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 24px;
  }
  .invoice-info table { border: none; }
  .invoice-info td { border: none; padding: 3px 8px; }
  .invoice-info td:first-child { color: #777; font-weight: 600; }
  .invoice-box {
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 16px;
    background: #fafafa;
    margin-bottom: 20px;
  }
  .invoice-total {
    text-align: left;
    margin-top: 12px;
  }
  .invoice-total table { width: auto; margin-right: auto; margin-left: 0; }
  .invoice-total td { padding: 4px 12px; }
  .total-row td { font-size: 15px; font-weight: 900; color: #e91e63; border-top: 2px solid #e91e63; }
  /* Footer */
  .footer {
    margin-top: 32px;
    padding-top: 12px;
    border-top: 1px solid #eee;
    text-align: center;
    font-size: 11px;
    color: #aaa;
  }
  @media print {
    @page { margin: 16mm; size: A4; }
    body { font-size: 12px; }
    .no-print { display: none !important; }
  }
`;

function openPrint(html: string) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head>
    <meta charset="UTF-8"/>
    <title>FitZone — تقرير مالي</title>
    <style>${BASE_STYLES}</style>
  </head><body><div class="page">${html}</div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 600);
    };
  <\/script>
  </body></html>`);
  win.document.close();
}

function header(title: string, subtitle: string, dateRange?: string) {
  const now = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  return `
    <div class="header">
      <div>
        <div class="logo">FIT<span>ZONE</span></div>
        <div style="font-size:11px;color:#888;margin-top:4px;">بني سويف — مصر</div>
      </div>
      <div class="header-meta">
        <strong>${title}</strong>
        ${subtitle ? `<div>${subtitle}</div>` : ""}
        ${dateRange ? `<div>الفترة: ${dateRange}</div>` : ""}
        <div>تاريخ الإصدار: ${now}</div>
      </div>
    </div>
  `;
}

function footer() {
  return `<div class="footer">FitZone Fitness Club &copy; ${new Date().getFullYear()} — هذا المستند صادر آلياً من نظام الإدارة</div>`;
}

function fmt(n: number) {
  return n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ar-EG");
}

// ─── Store Financial Report ───────────────────────────────────────────────────

export interface StoreSummaryForPrint {
  grossSales: number;
  returnsTotal: number;
  salesRevenue: number;
  shippingRevenue: number;
  discountsGranted: number;
  purchaseInvoicesTotal: number;
  cogs: number;
  expenseTotal: number;
  feeTotal: number;
  grossProfit: number;
  netProfit: number;
  orderCount: number;
  returnCount: number;
  purchaseInvoiceCount: number;
}

export interface SaleRowForPrint {
  id: string; date: string; customerName: string; items: string;
  paymentMethod: string; total: number; shippingFee: number;
}

export interface PurchaseRowForPrint {
  id: string; date: string; referenceNumber: string | null;
  supplierName: string | null; totalCost: number;
  items: { productName: string; quantity: number; unitCost: number; totalCost: number }[];
}

export interface ReturnRowForPrint {
  id: string; date: string; customerName: string; items: string;
  paymentMethod: string; total: number;
}

export interface ExpenseRowForPrint {
  id: string; category: string; label: string;
  amount: number; vendor: string | null; expenseDate: string;
}

export function printStoreReport(opts: {
  summary: StoreSummaryForPrint;
  sales: SaleRowForPrint[];
  returns: ReturnRowForPrint[];
  purchases: PurchaseRowForPrint[];
  expenses: ExpenseRowForPrint[];
  dateRange: string;
}) {
  const s = opts.summary;

  const kpis = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">إجمالي المبيعات</div>
        <div class="kpi-value">${fmt(s.grossSales)} ج</div>
        <div style="font-size:11px;color:#888">${s.orderCount} طلب</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">المرتجعات</div>
        <div class="kpi-value red">− ${fmt(s.returnsTotal)} ج</div>
        <div style="font-size:11px;color:#888">${s.returnCount} طلب</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">صافي الإيرادات</div>
        <div class="kpi-value green">${fmt(s.salesRevenue)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">تكلفة البضاعة (COGS)</div>
        <div class="kpi-value orange">${fmt(s.cogs)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">إجمالي المشتريات</div>
        <div class="kpi-value orange">${fmt(s.purchaseInvoicesTotal)} ج</div>
        <div style="font-size:11px;color:#888">${s.purchaseInvoiceCount} فاتورة</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">الخصومات الممنوحة</div>
        <div class="kpi-value red">${fmt(s.discountsGranted)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">المصاريف</div>
        <div class="kpi-value red">${fmt(s.expenseTotal)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">العمولات والرسوم</div>
        <div class="kpi-value orange">${fmt(s.feeTotal)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">إجمالي الربح</div>
        <div class="kpi-value ${s.grossProfit >= 0 ? "green" : "red"}">${fmt(s.grossProfit)} ج</div>
      </div>
    </div>
    <div class="net-profit-box">
      <div>
        <div class="net-profit-label">صافي الربح</div>
        <div class="net-profit-formula">= ${fmt(s.salesRevenue)} إيرادات − ${fmt(s.cogs)} تكلفة − ${fmt(s.expenseTotal)} مصاريف − ${fmt(s.feeTotal)} عمولات</div>
      </div>
      <div class="net-profit-value ${s.netProfit >= 0 ? "green" : "red"}">${fmt(s.netProfit)} ج</div>
    </div>
  `;

  const salesTable = opts.sales.length === 0 ? "<p style='color:#888;font-size:12px'>لا توجد مبيعات في هذه الفترة</p>" : `
    <table>
      <thead><tr>
        <th>التاريخ</th><th>العميل</th><th>المنتجات</th><th>طريقة الدفع</th><th>الإجمالي</th>
      </tr></thead>
      <tbody>
        ${opts.sales.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.customerName}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.items}</td>
          <td>${r.paymentMethod}</td>
          <td style="font-weight:700;color:#16a34a">${fmt(r.total)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">الإجمالي (${opts.sales.length} طلب)</td>
        <td>${fmt(s.grossSales)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const returnsTable = opts.returns.length === 0 ? "" : `
    <div class="section-title">المرتجعات</div>
    <table>
      <thead><tr>
        <th>التاريخ</th><th>العميل</th><th>المنتجات</th><th>طريقة الدفع</th><th>المبلغ المرتجع</th>
      </tr></thead>
      <tbody>
        ${opts.returns.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.customerName}</td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.items}</td>
          <td>${r.paymentMethod}</td>
          <td style="font-weight:700;color:#dc2626">− ${fmt(r.total)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">إجمالي المرتجعات</td>
        <td>− ${fmt(s.returnsTotal)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const purchasesTable = opts.purchases.length === 0 ? "<p style='color:#888;font-size:12px'>لا توجد مشتريات في هذه الفترة</p>" : `
    <table>
      <thead><tr>
        <th>التاريخ</th><th>المورد</th><th>المرجع</th><th>الإجمالي</th>
      </tr></thead>
      <tbody>
        ${opts.purchases.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.supplierName ?? "—"}</td>
          <td>${r.referenceNumber ?? "—"}</td>
          <td style="font-weight:700;color:#d97706">${fmt(r.totalCost)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="3">الإجمالي (${opts.purchases.length} فاتورة)</td>
        <td>${fmt(s.purchaseInvoicesTotal)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const expensesTable = opts.expenses.length === 0 ? "<p style='color:#888;font-size:12px'>لا توجد مصاريف في هذه الفترة</p>" : `
    <table>
      <thead><tr>
        <th>التاريخ</th><th>المصروف</th><th>التصنيف</th><th>الجهة</th><th>المبلغ</th>
      </tr></thead>
      <tbody>
        ${opts.expenses.map(r => `<tr>
          <td>${fmtDate(r.expenseDate)}</td>
          <td>${r.label}</td>
          <td>${r.category}</td>
          <td>${r.vendor ?? "—"}</td>
          <td style="font-weight:700;color:#dc2626">${fmt(r.amount)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">إجمالي المصاريف</td>
        <td>${fmt(s.expenseTotal)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const html = `
    ${header("التقرير المالي — المتجر", "Store Financial Report", opts.dateRange)}
    <div class="report-title">التقرير المالي — المتجر</div>
    <div class="report-sub">ملخص مالي شامل للمتجر خلال الفترة المحددة</div>
    ${kpis}
    <div class="section-title">فواتير المبيعات</div>
    ${salesTable}
    ${returnsTable}
    <div class="section-title">فواتير المشتريات</div>
    ${purchasesTable}
    <div class="section-title">المصاريف</div>
    ${expensesTable}
    ${footer()}
  `;

  openPrint(html);
}

// ─── Club Financial Report ────────────────────────────────────────────────────

export interface ClubSummaryForPrint {
  membershipRevenue: number;
  bookingRevenue: number;
  totalRevenue: number;
  walletTopupCollected: number;
  walletTopupCount: number;
  walletBonusCost: number;
  redeemedPointsCost: number;
  currentPointsLiability: number;
  expenseTotal: number;
  feeTotal: number;
  grossProfit: number;
  netProfit: number;
  membershipCount: number;
  bookingCount: number;
}

export interface MembershipRowForPrint {
  id: string; date: string; customerName: string;
  membershipName: string; paymentAmount: number;
  paymentMethod: string; walletBonus: number; offerTitle: string | null;
}

export interface BookingRowForPrint {
  id: string; date: string; customerName: string;
  className: string; paymentMethod: string; paidAmount: number;
}

export function printClubReport(opts: {
  summary: ClubSummaryForPrint;
  memberships: MembershipRowForPrint[];
  bookings: BookingRowForPrint[];
  expenses: ExpenseRowForPrint[];
  pointValueEGP: number;
  dateRange: string;
}) {
  const s = opts.summary;

  const kpis = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">إيرادات الاشتراكات</div>
        <div class="kpi-value green">${fmt(s.membershipRevenue)} ج</div>
        <div style="font-size:11px;color:#888">${s.membershipCount} اشتراك</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">إيرادات الحجوزات</div>
        <div class="kpi-value green">${fmt(s.bookingRevenue)} ج</div>
        <div style="font-size:11px;color:#888">${s.bookingCount} حجز</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">إجمالي الإيرادات الفعلية</div>
        <div class="kpi-value pink">${fmt(s.totalRevenue)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">أموال محافظ مشحونة (التزام)</div>
        <div class="kpi-value orange">${fmt(s.walletTopupCollected)} ج</div>
        <div style="font-size:11px;color:#888">${s.walletTopupCount} عملية شحن</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">مكافآت محافظ ممنوحة</div>
        <div class="kpi-value red">${fmt(s.walletBonusCost)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">نقاط مستردة (تكلفة)</div>
        <div class="kpi-value red">${fmt(s.redeemedPointsCost)} ج</div>
        <div style="font-size:11px;color:#888">سعر النقطة: ${opts.pointValueEGP} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">التزامات النقاط الحالية</div>
        <div class="kpi-value orange">${fmt(s.currentPointsLiability)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">المصاريف</div>
        <div class="kpi-value red">${fmt(s.expenseTotal)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">العمولات والرسوم</div>
        <div class="kpi-value orange">${fmt(s.feeTotal)} ج</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px">
      <div class="invoice-box">
        <div style="font-size:12px;color:#777;margin-bottom:4px">إجمالي الربح</div>
        <div style="font-size:22px;font-weight:900;color:${s.grossProfit >= 0 ? "#16a34a" : "#dc2626"}">${fmt(s.grossProfit)} ج</div>
        <div style="font-size:11px;color:#888;margin-top:4px">= إيرادات − مكافآت محفظة − نقاط مستردة</div>
      </div>
      <div class="net-profit-box" style="margin-bottom:0">
        <div>
          <div class="net-profit-label">صافي الربح</div>
          <div class="net-profit-formula">= ${fmt(s.grossProfit)} إجمالي − ${fmt(s.expenseTotal)} مصاريف − ${fmt(s.feeTotal)} عمولات</div>
        </div>
        <div class="net-profit-value ${s.netProfit >= 0 ? "green" : "red"}">${fmt(s.netProfit)} ج</div>
      </div>
    </div>
  `;

  const membershipsTable = opts.memberships.length === 0 ? "<p style='color:#888;font-size:12px'>لا توجد اشتراكات في هذه الفترة</p>" : `
    <table>
      <thead><tr>
        <th>التاريخ</th><th>العضوة</th><th>الباقة</th><th>طريقة الدفع</th><th>المبلغ</th><th>مكافأة المحفظة</th>
      </tr></thead>
      <tbody>
        ${opts.memberships.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.customerName}</td>
          <td>${r.offerTitle ?? r.membershipName}</td>
          <td>${r.paymentMethod}</td>
          <td style="font-weight:700;color:#16a34a">${fmt(r.paymentAmount)} ج</td>
          <td style="color:#d97706">${r.walletBonus > 0 ? `+${fmt(r.walletBonus)} ج` : "—"}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">الإجمالي (${opts.memberships.length} اشتراك)</td>
        <td>${fmt(s.membershipRevenue)} ج</td>
        <td></td>
      </tr></tfoot>
    </table>
  `;

  const bookingsTable = opts.bookings.length === 0 ? "" : `
    <div class="section-title">فواتير الحجوزات</div>
    <table>
      <thead><tr>
        <th>التاريخ</th><th>العضوة</th><th>الكلاس</th><th>طريقة الدفع</th><th>المبلغ</th>
      </tr></thead>
      <tbody>
        ${opts.bookings.map(r => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td>${r.customerName}</td>
          <td>${r.className}</td>
          <td>${r.paymentMethod}</td>
          <td style="font-weight:700;color:#16a34a">${fmt(r.paidAmount)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">الإجمالي</td>
        <td>${fmt(s.bookingRevenue)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const expensesTable = opts.expenses.length === 0 ? "<p style='color:#888;font-size:12px'>لا توجد مصاريف في هذه الفترة</p>" : `
    <table>
      <thead><tr>
        <th>التاريخ</th><th>المصروف</th><th>التصنيف</th><th>الجهة</th><th>المبلغ</th>
      </tr></thead>
      <tbody>
        ${opts.expenses.map(r => `<tr>
          <td>${fmtDate(r.expenseDate)}</td>
          <td>${r.label}</td>
          <td>${r.category}</td>
          <td>${r.vendor ?? "—"}</td>
          <td style="font-weight:700;color:#dc2626">${fmt(r.amount)} ج</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="4">إجمالي المصاريف</td>
        <td>${fmt(s.expenseTotal)} ج</td>
      </tr></tfoot>
    </table>
  `;

  const html = `
    ${header("التقرير المالي — الجيم", "Club Financial Report", opts.dateRange)}
    <div class="report-title">التقرير المالي — الجيم</div>
    <div class="report-sub">ملخص مالي شامل للجيم خلال الفترة المحددة</div>
    ${kpis}
    <div class="section-title">فواتير الاشتراكات</div>
    ${membershipsTable}
    ${bookingsTable}
    <div class="section-title">المصاريف</div>
    ${expensesTable}
    ${footer()}
  `;

  openPrint(html);
}

// ─── Sales Invoice (single order) ────────────────────────────────────────────

export function printSalesInvoice(order: {
  id: string;
  date: string;
  customerName: string;
  paymentMethod: string;
  subtotal: number;
  shippingFee: number;
  total: number;
  items: { productName: string; quantity?: number; unitPrice?: number; total: number }[];
  discountAmount?: number;
}) {
  const invoiceNumber = order.id.slice(-8).toUpperCase();

  const rows = order.items.map(item => `
    <tr>
      <td>${item.productName}</td>
      <td style="text-align:center">${item.quantity ?? 1}</td>
      <td style="text-align:left">${item.unitPrice != null ? fmt(item.unitPrice) + " ج" : "—"}</td>
      <td style="text-align:left;font-weight:700">${fmt(item.total)} ج</td>
    </tr>
  `).join("");

  const html = `
    ${header("فاتورة مبيعات", `رقم الفاتورة: ${invoiceNumber}`)}
    <div class="invoice-header">
      <div class="invoice-box" style="min-width:260px">
        <div style="font-size:13px;font-weight:900;margin-bottom:10px;color:#e91e63">بيانات العميل</div>
        <table class="invoice-info">
          <tr><td>الاسم</td><td style="font-weight:700">${order.customerName}</td></tr>
          <tr><td>طريقة الدفع</td><td>${order.paymentMethod}</td></tr>
          <tr><td>التاريخ</td><td>${fmtDate(order.date)}</td></tr>
          <tr><td>رقم الفاتورة</td><td style="font-family:monospace;font-weight:700">${invoiceNumber}</td></tr>
        </table>
      </div>
    </div>
    <div class="section-title">بنود الفاتورة</div>
    <table>
      <thead><tr>
        <th>المنتج / الخدمة</th>
        <th style="text-align:center">الكمية</th>
        <th style="text-align:left">سعر الوحدة</th>
        <th style="text-align:left">الإجمالي</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="invoice-total">
      <table>
        <tr><td>المجموع الفرعي</td><td style="text-align:left;font-weight:700">${fmt(order.subtotal)} ج</td></tr>
        ${order.discountAmount ? `<tr><td style="color:#dc2626">الخصم</td><td style="text-align:left;font-weight:700;color:#dc2626">− ${fmt(order.discountAmount)} ج</td></tr>` : ""}
        ${order.shippingFee > 0 ? `<tr><td>رسوم التوصيل</td><td style="text-align:left;font-weight:700">${fmt(order.shippingFee)} ج</td></tr>` : ""}
        <tr class="total-row"><td>الإجمالي المستحق</td><td style="text-align:left">${fmt(order.total)} ج</td></tr>
      </table>
    </div>
    ${footer()}
  `;

  openPrint(html);
}

// ─── Partners & Commissions Report ───────────────────────────────────────────

export interface PartnerCommissionForPrint {
  partnerName: string;
  customerName: string;
  membershipName: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface PartnerWithdrawalForPrint {
  partnerName: string;
  partnerCategory: string;
  amount: number;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  processedAt: string | null;
}

export function printPartnersReport(opts: {
  commissions: PartnerCommissionForPrint[];
  withdrawals: PartnerWithdrawalForPrint[];
  categoryLabels: Record<string, string>;
}) {
  const totalPending = opts.commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
  const totalWithdrawn = opts.commissions.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.amount, 0);
  const approvedWithdrawals = opts.withdrawals.filter((w) => w.status === "approved");
  const pendingWithdrawalsCount = opts.withdrawals.filter((w) => w.status === "pending").length;

  const kpis = `
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">إجمالي العمولات</div>
        <div class="kpi-value pink">${fmt(totalPending + totalWithdrawn)} ج</div>
        <div style="font-size:11px;color:#888">${opts.commissions.length} عملية</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">عمولات معلقة</div>
        <div class="kpi-value orange">${fmt(totalPending)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">عمولات مسحوبة</div>
        <div class="kpi-value green">${fmt(totalWithdrawn)} ج</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">سحوبات معتمدة</div>
        <div class="kpi-value green">${fmt(approvedWithdrawals.reduce((s, w) => s + w.amount, 0))} ج</div>
        <div style="font-size:11px;color:#888">${approvedWithdrawals.length} طلب</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">طلبات سحب معلقة</div>
        <div class="kpi-value orange">${pendingWithdrawalsCount} طلب</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">إجمالي طلبات السحب</div>
        <div class="kpi-value">${opts.withdrawals.length} طلب</div>
      </div>
    </div>
  `;

  const STATUS_AR: Record<string, string> = {
    pending: "معلق", withdrawn: "مسحوبة", approved: "مدفوع", rejected: "مرفوض",
  };
  const statusBg = (s: string) =>
    s === "withdrawn" || s === "approved" ? "#14532d40" : s === "rejected" ? "#7f1d1d40" : "#713f1240";
  const statusColor = (s: string) =>
    s === "withdrawn" || s === "approved" ? "#86efac" : s === "rejected" ? "#fca5a5" : "#fde68a";
  const badge = (s: string) =>
    `<span style="padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;background:${statusBg(s)};color:${statusColor(s)}">${STATUS_AR[s] ?? s}</span>`;

  const commissionsTable = opts.commissions.length === 0
    ? "<p style='color:#888;font-size:12px'>لا توجد عمولات</p>"
    : `
    <table>
      <thead><tr>
        <th>الشريك</th><th>العميل</th><th>الاشتراك</th><th>العمولة</th><th>الحالة</th><th>التاريخ</th>
      </tr></thead>
      <tbody>
        ${opts.commissions.map((c) => `<tr>
          <td style="font-weight:700">${c.partnerName}</td>
          <td>${c.customerName}</td>
          <td>${c.membershipName}</td>
          <td style="font-weight:700;color:#16a34a">${fmt(c.amount)} ج</td>
          <td>${badge(c.status)}</td>
          <td style="color:#888">${fmtDate(c.createdAt)}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="3">الإجمالي (${opts.commissions.length} عملية)</td>
        <td>${fmt(totalPending + totalWithdrawn)} ج</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table>`;

  const withdrawalsTable = opts.withdrawals.length === 0
    ? "<p style='color:#888;font-size:12px'>لا توجد طلبات سحب</p>"
    : `
    <table>
      <thead><tr>
        <th>الشريك</th><th>الفئة</th><th>المبلغ</th><th>الحالة</th><th>تاريخ الطلب</th><th>تاريخ المعالجة</th>
      </tr></thead>
      <tbody>
        ${opts.withdrawals.map((w) => `<tr>
          <td style="font-weight:700">${w.partnerName}</td>
          <td>${opts.categoryLabels[w.partnerCategory] ?? w.partnerCategory}</td>
          <td style="font-weight:700;color:${w.status === "approved" ? "#16a34a" : w.status === "rejected" ? "#dc2626" : "#d97706"}">${fmt(w.amount)} ج</td>
          <td>${badge(w.status)}</td>
          <td style="color:#888">${fmtDate(w.createdAt)}</td>
          <td style="color:#888">${w.processedAt ? fmtDate(w.processedAt) : "—"}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td colspan="2">إجمالي المبالغ</td>
        <td>${fmt(opts.withdrawals.reduce((s, w) => s + w.amount, 0))} ج</td>
        <td colspan="3"></td>
      </tr></tfoot>
    </table>`;

  const html = `
    ${header("تقرير الشركاء والعمولات", "Partners & Commissions Report")}
    <div class="report-title">تقرير الشركاء والعمولات</div>
    <div class="report-sub">ملخص شامل للعمولات وطلبات السحب</div>
    ${kpis}
    <div class="section-title">تفاصيل العمولات</div>
    ${commissionsTable}
    <div class="section-title">طلبات السحب</div>
    ${withdrawalsTable}
    ${footer()}
  `;

  openPrint(html);
}

// ─── Purchase Invoice (single receipt) ───────────────────────────────────────

export function printPurchaseInvoice(receipt: {
  id: string;
  date: string;
  supplierName: string | null;
  referenceNumber: string | null;
  totalCost: number;
  items: { productName: string; quantity: number; unitCost: number; totalCost: number }[];
}) {
  const invoiceNumber = receipt.referenceNumber ?? receipt.id.slice(-8).toUpperCase();

  const rows = receipt.items.map(item => `
    <tr>
      <td>${item.productName}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:left">${fmt(item.unitCost)} ج</td>
      <td style="text-align:left;font-weight:700">${fmt(item.totalCost)} ج</td>
    </tr>
  `).join("");

  const html = `
    ${header("فاتورة مشتريات", `رقم المرجع: ${invoiceNumber}`)}
    <div class="invoice-header">
      <div class="invoice-box" style="min-width:260px">
        <div style="font-size:13px;font-weight:900;margin-bottom:10px;color:#e91e63">بيانات المورد</div>
        <table class="invoice-info">
          <tr><td>المورد</td><td style="font-weight:700">${receipt.supplierName ?? "—"}</td></tr>
          <tr><td>تاريخ الاستلام</td><td>${fmtDate(receipt.date)}</td></tr>
          <tr><td>رقم المرجع</td><td style="font-family:monospace;font-weight:700">${invoiceNumber}</td></tr>
        </table>
      </div>
    </div>
    <div class="section-title">بنود فاتورة الشراء</div>
    <table>
      <thead><tr>
        <th>المنتج</th>
        <th style="text-align:center">الكمية</th>
        <th style="text-align:left">سعر الوحدة</th>
        <th style="text-align:left">الإجمالي</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3">إجمالي فاتورة الشراء</td><td style="text-align:left">${fmt(receipt.totalCost)} ج</td></tr>
      </tfoot>
    </table>
    ${footer()}
  `;

  openPrint(html);
}
