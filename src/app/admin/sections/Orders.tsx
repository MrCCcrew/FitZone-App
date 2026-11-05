"use client";
import { useCallback, useEffect, useState } from "react";

type OrderItem = { id: string; quantity: number; price: number; costPrice: number | null; vatAmount: number; size: string | null; color: string | null; product: { id: string; name: string; sku: string | null; image: string | null }; variant: { id: string; size: string | null; color: string | null; sku: string | null } | null };
type StatusHistory = { id: string; fromStatus: string | null; toStatus: string; notes: string | null; createdAt: string; performedBy: { id: string; name: string | null } | null };
type DeliveryCompany = { id: string; name: string; phone: string | null };
type Payment = { id: string; status: string; amount: number; paymentMethod: string; paidAt: string | null } | null;
type Order = {
  id: string; userId: string; businessUnit: string; subtotal: number; discountTotal: number; shippingFee: number; total: number;
  status: string; paymentMethod: string; notes: string | null; adminNotes: string | null;
  recipientName: string | null; recipientPhone: string | null; governorate: string | null; city: string | null; address: string | null;
  deliveryCompanyId: string | null; trackingNumber: string | null; inventoryDeducted: boolean;
  cancelledAt: string | null; deliveredAt: string | null; createdAt: string; updatedAt: string;
  customer: { id: string; name: string | null; email: string | null; phone: string | null };
  items: OrderItem[]; deliveryCompany: DeliveryCompany | null; statusHistory: StatusHistory[]; payment: Payment;
};
type Stats = { todayCount: number; todayRevenue: number; byStatus: Record<string, number> };
type Pagination = { total: number; page: number; limit: number; pages: number };

const STATUS_LABELS: Record<string, string> = {
  pending: "جديد", confirmed: "تم التأكيد", preparing: "جاري التجهيز",
  ready_to_ship: "جاهز للتوصيل", shipped_to_courier: "تم التسليم لشركة التوصيل",
  in_transit: "في الطريق", delivered: "تم التسليم", cancelled: "ملغي", returned: "مرتجع",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#f5c542", confirmed: "#3b82f6", preparing: "#a78bfa",
  ready_to_ship: "#fb923c", shipped_to_courier: "#22d3ee", in_transit: "#34d399",
  delivered: "#22c55e", cancelled: "#ef4444", returned: "#6b7280",
};
const STATUS_ORDER = ["pending","confirmed","preparing","ready_to_ship","shipped_to_courier","in_transit","delivered","cancelled","returned"];

const S = {
  card: { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 20 } as React.CSSProperties,
  input: { width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" } as React.CSSProperties,
  label: { fontSize: 11, color: "#9a8a90", marginBottom: 4, display: "block" } as React.CSSProperties,
};

function badge(status: string) {
  const color = STATUS_COLORS[status] ?? "#6b7280";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: color + "22", color, border: `1px solid ${color}44` }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function OrderDetail({ order, companies, onUpdate, onClose }: { order: Order; companies: DeliveryCompany[]; onUpdate: (o: Order) => void; onClose: () => void }) {
  const [newStatus, setNewStatus] = useState(order.status);
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [deliveryCompanyId, setDeliveryCompanyId] = useState(order.deliveryCompanyId ?? "");
  const [adminNotes, setAdminNotes] = useState(order.adminNotes ?? "");
  const [shippingFee, setShippingFee] = useState(order.shippingFee.toString());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleUpdate() {
    setSaving(true); setErr(null);
    const body: Record<string, unknown> = { id: order.id };
    if (newStatus !== order.status) body.status = newStatus;
    if (tracking !== (order.trackingNumber ?? "")) body.trackingNumber = tracking;
    if (deliveryCompanyId !== (order.deliveryCompanyId ?? "")) body.deliveryCompanyId = deliveryCompanyId || null;
    if (adminNotes !== (order.adminNotes ?? "")) body.adminNotes = adminNotes;
    if (parseFloat(shippingFee) !== order.shippingFee) body.shippingFee = parseFloat(shippingFee) || 0;

    const res = await fetch("/api/admin/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json() as { order?: Order; error?: string };
    setSaving(false);
    if (!res.ok || !d.order) { setErr(d.error ?? "خطأ"); return; }
    onUpdate(d.order);
  }

  const profit = order.items.reduce((s, i) => s + ((i.costPrice ?? 0) > 0 ? (i.price - (i.costPrice ?? 0)) * i.quantity : 0), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", zIndex: 100, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "30px 16px" }}>
      <div style={{ background: "#1a0812", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, width: "100%", maxWidth: 860, padding: 28 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>تفاصيل الطلب #{order.id.slice(-8).toUpperCase()}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 4 }}>{new Date(order.createdAt).toLocaleString("ar-EG")}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {badge(order.status)}
            <button onClick={onClose} style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: "#c9b9c1", padding: "7px 14px", cursor: "pointer" }}>✕ إغلاق</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Customer */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 10, fontSize: 13 }}>بيانات العميل</div>
            <div style={{ fontSize: 13, color: "#fff" }}>{order.recipientName ?? order.customer.name ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 4 }}>{order.recipientPhone ?? order.customer.phone ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>{order.customer.email ?? "—"}</div>
            <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 6, lineHeight: 1.6 }}>
              {[order.governorate, order.city, order.address].filter(Boolean).join("، ") || "—"}
            </div>
            {order.notes && <div style={{ fontSize: 12, color: "#f5c542", marginTop: 8, background: "rgba(245,197,66,.08)", borderRadius: 8, padding: "8px 10px" }}>📝 {order.notes}</div>}
          </div>

          {/* Payment */}
          <div style={S.card}>
            <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 10, fontSize: 13 }}>ملخص مالي</div>
            {[
              { label: "المجموع الفرعي", val: `${order.subtotal.toFixed(2)} ج.م` },
              { label: "الخصم", val: `-${order.discountTotal.toFixed(2)} ج.م`, color: "#22c55e" },
              { label: "التوصيل", val: `${order.shippingFee.toFixed(2)} ج.م` },
              { label: "الإجمالي", val: `${order.total.toFixed(2)} ج.م`, bold: true },
            ].map(({ label, val, color, bold }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#9a8a90" }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: bold ? 700 : 400, color: color ?? "#fff" }}>{val}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#9a8a90" }}>طريقة الدفع</span>
                <span style={{ fontSize: 12, color: "#fff" }}>{order.paymentMethod}</span>
              </div>
              {order.payment && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: "#9a8a90" }}>حالة الدفع</span>
                  <span style={{ fontSize: 12, color: order.payment.status === "paid" ? "#22c55e" : "#f5c542" }}>{order.payment.status === "paid" ? "✅ مدفوع" : "⏳ " + order.payment.status}</span>
                </div>
              )}
              {profit > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#22c55e" }}>💰 هامش الربح التقديري: {profit.toFixed(2)} ج.م</div>}
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 12, fontSize: 13 }}>المنتجات ({order.items.length})</div>
          <div style={{ display: "grid", gap: 8 }}>
            {order.items.map((item) => (
              <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center", background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 12px" }}>
                {item.product.image && <img src={item.product.image} alt={item.product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#fff" }}>{item.product.name}</div>
                  <div style={{ fontSize: 12, color: "#9a8a90" }}>
                    {item.product.sku && <span style={{ marginInlineEnd: 10 }}>SKU: {item.product.sku}</span>}
                    {(item.size ?? item.variant?.size) && <span style={{ marginInlineEnd: 8 }}>مقاس: {item.size ?? item.variant?.size}</span>}
                    {(item.color ?? item.variant?.color) && <span>لون: {item.color ?? item.variant?.color}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "end", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: "#fff" }}>× {item.quantity}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f5c542" }}>{(item.price * item.quantity).toFixed(2)} ج.م</div>
                  {item.costPrice && <div style={{ fontSize: 11, color: "#9a8a90" }}>تكلفة: {item.costPrice} ج.م</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ ...S.card, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 14, fontSize: 13 }}>إدارة الطلب</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={S.label}>تغيير الحالة</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)} style={S.input}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>شركة التوصيل</label>
              <select value={deliveryCompanyId} onChange={(e) => setDeliveryCompanyId(e.target.value)} style={S.input}>
                <option value="">— بدون شركة —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>رقم التتبع</label>
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} style={S.input} placeholder="أدخل رقم التتبع" dir="ltr" />
            </div>
            <div>
              <label style={S.label}>رسوم التوصيل (ج.م)</label>
              <input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} style={S.input} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={S.label}>ملاحظات داخلية (للأدمن فقط)</label>
              <textarea value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={2} style={{ ...S.input, resize: "vertical" }} placeholder="ملاحظات لا تظهر للعميل..." />
            </div>
          </div>
          {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 10 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={handleUpdate} disabled={saving} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#e91e63", color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
              {saving ? "جارٍ الحفظ..." : "حفظ التغييرات"}
            </button>
          </div>
        </div>

        {/* Timeline */}
        {order.statusHistory.length > 0 && (
          <div style={{ ...S.card, marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 14, fontSize: 13 }}>سجل الحالات (Timeline)</div>
            <div style={{ display: "grid", gap: 8 }}>
              {order.statusHistory.map((h) => (
                <div key={h.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_COLORS[h.toStatus] ?? "#6b7280", flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ fontSize: 13, color: "#fff" }}>
                      {h.fromStatus ? <><span style={{ color: STATUS_COLORS[h.fromStatus] ?? "#9a8a90" }}>{STATUS_LABELS[h.fromStatus] ?? h.fromStatus}</span> ← </> : ""}
                      <span style={{ color: STATUS_COLORS[h.toStatus] ?? "#fff", fontWeight: 700 }}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#9a8a90", marginTop: 2 }}>
                      {new Date(h.createdAt).toLocaleString("ar-EG")}
                      {h.performedBy && ` — ${h.performedBy.name ?? "النظام"}`}
                    </div>
                    {h.notes && <div style={{ fontSize: 12, color: "#f5c542", marginTop: 2 }}>{h.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [companies, setCompanies] = useState<DeliveryCompany[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), limit: "30" });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);

    const res = await fetch(`/api/admin/orders?${params.toString()}`);
    if (res.ok) {
      const d = await res.json() as { orders: Order[]; stats: Stats; pagination: Pagination };
      setOrders(d.orders);
      setStats(d.stats);
      setPagination(d.pagination);
    }
    setLoading(false);
  }, [statusFilter, search, dateFrom, dateTo, page]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    fetch("/api/admin/delivery-companies")
      .then((r) => r.json())
      .then((d: { companies: DeliveryCompany[] }) => setCompanies(d.companies ?? []))
      .catch(() => {});
  }, []);

  function handleUpdate(updated: Order) {
    setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
    setSelectedOrder(updated);
  }

  const statusBtns = ["all", ...STATUS_ORDER];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          companies={companies}
          onUpdate={handleUpdate}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>إدارة الطلبات</div>

      {/* Stats */}
      {stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "طلبات اليوم", value: stats.todayCount, color: "#e91e63" },
            { label: "مبيعات اليوم", value: `${stats.todayRevenue.toFixed(0)} ج.م`, color: "#f5c542" },
            { label: "جديد", value: stats.byStatus.pending ?? 0, color: STATUS_COLORS.pending },
            { label: "جاري التجهيز", value: (stats.byStatus.confirmed ?? 0) + (stats.byStatus.preparing ?? 0), color: STATUS_COLORS.preparing },
            { label: "في التوصيل", value: (stats.byStatus.shipped_to_courier ?? 0) + (stats.byStatus.in_transit ?? 0), color: STATUS_COLORS.in_transit },
            { label: "تم التسليم", value: stats.byStatus.delivered ?? 0, color: STATUS_COLORS.delivered },
            { label: "ملغي", value: stats.byStatus.cancelled ?? 0, color: STATUS_COLORS.cancelled },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
              <div style={{ fontSize: 11, color: "#9a8a90", marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {statusBtns.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} style={{ padding: "7px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: statusFilter === s ? 700 : 500, background: statusFilter === s ? (STATUS_COLORS[s] ?? "#e91e63") : "rgba(255,255,255,.07)", color: statusFilter === s ? "#fff" : "#c9b9c1", fontSize: 12 }}>
              {s === "all" ? "الكل" : STATUS_LABELS[s] ?? s}
              {s !== "all" && stats?.byStatus[s] ? ` (${stats.byStatus[s]})` : ""}
            </button>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "end" }}>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 بحث برقم الطلب، الهاتف، أو الاسم..." style={S.input} />
          <div>
            <label style={S.label}>من تاريخ</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={{ ...S.input, width: "auto" }} />
          </div>
          <div>
            <label style={S.label}>إلى تاريخ</label>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={{ ...S.input, width: "auto" }} />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", color: "#9a8a90", padding: 40 }}>جارٍ التحميل...</div>
      ) : orders.length === 0 ? (
        <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 50, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ color: "#9a8a90" }}>لا توجد طلبات</div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {orders.map((o) => (
            <div key={o.id} onClick={() => setSelectedOrder(o)} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "14px 18px", cursor: "pointer", display: "grid", gridTemplateColumns: "auto 1fr auto auto auto auto", gap: 14, alignItems: "center", transition: "background .15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.07)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,.04)")}
            >
              <div style={{ fontSize: 11, color: "#9a8a90", fontFamily: "monospace" }}>#{o.id.slice(-8).toUpperCase()}</div>
              <div>
                <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{o.recipientName ?? o.customer.name ?? "—"}</div>
                <div style={{ fontSize: 12, color: "#9a8a90" }}>{o.recipientPhone ?? o.customer.phone ?? "—"} {o.governorate && `· ${o.governorate}`}</div>
              </div>
              <div style={{ fontSize: 13, color: "#9a8a90", textAlign: "center" }}>
                <div>{o.items.length} منتج</div>
                {o.deliveryCompany && <div style={{ fontSize: 11, marginTop: 2 }}>🚚 {o.deliveryCompany.name}</div>}
              </div>
              <div style={{ textAlign: "end" }}>
                <div style={{ fontWeight: 700, color: "#f5c542", fontSize: 15 }}>{o.total.toFixed(0)} ج.م</div>
                <div style={{ fontSize: 11, color: "#9a8a90" }}>{o.paymentMethod}</div>
              </div>
              {badge(o.status)}
              <div style={{ fontSize: 11, color: "#9a8a90", textAlign: "end" }}>
                {new Date(o.createdAt).toLocaleDateString("ar-EG")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.5 : 1 }}>السابق</button>
          <span style={{ padding: "7px 14px", color: "#9a8a90", fontSize: 13 }}>صفحة {pagination.page} من {pagination.pages} (إجمالي {pagination.total} طلب)</span>
          <button disabled={page === pagination.pages} onClick={() => setPage((p) => p + 1)} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.06)", color: "#c9b9c1", cursor: page === pagination.pages ? "not-allowed" : "pointer", opacity: page === pagination.pages ? 0.5 : 1 }}>التالي</button>
        </div>
      )}
    </div>
  );
}
