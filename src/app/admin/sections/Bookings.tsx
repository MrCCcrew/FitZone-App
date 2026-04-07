"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type BookingRow = {
  id: string;
  status: "confirmed" | "cancelled" | "attended" | "noshow" | string;
  paidAmount: number;
  paymentMethod: string;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string };
  schedule: {
    id: string;
    date: string;
    time: string;
    availableSpots: number;
    class: { id: string; name: string; trainer: string };
  };
  membership: { id: string; name: string; status: string } | null;
};

type ScheduleOption = {
  id: string;
  date: string;
  time: string;
  availableSpots: number;
  class: { id: string; name: string };
};

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "مؤكد",
  attended: "تم الحضور",
  cancelled: "ملغي",
  noshow: "لم يحضر",
};

const STATUS_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-500/15 text-emerald-300",
  attended: "bg-sky-500/15 text-sky-300",
  cancelled: "bg-rose-500/15 text-rose-300",
  noshow: "bg-amber-500/15 text-amber-300",
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "كاش",
  free: "مجاني",
  wallet: "محفظة",
  card: "بطاقة",
  instapay: "إنستا باي",
  offer: "عرض خاص",
  manual_pending: "قيد الدفع",
};

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ar-EG");
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", { weekday: "long" }).format(date);
}

function formatPayment(method: string) {
  return PAYMENT_LABELS[method] ?? method;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-[#fff4f8]">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-[#d7aabd] transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Bookings() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [schedules, setSchedules] = useState<ScheduleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [rescheduleModal, setRescheduleModal] = useState<BookingRow | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedSchedule, setSelectedSchedule] = useState("");

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter);
      if (query.trim()) params.set("q", query.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const response = await fetch(`/api/admin/bookings?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      setBookings(Array.isArray(payload) ? payload : []);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, query, statusFilter]);

  const loadCustomers = useCallback(async () => {
    const response = await fetch("/api/admin/customers", { cache: "no-store" });
    const payload = await response.json();
    if (Array.isArray(payload)) {
      setCustomers(
        payload.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          phone: item.phone,
        })),
      );
    }
  }, []);

  const loadSchedules = useCallback(async (classId?: string) => {
    const params = classId ? `?classId=${classId}` : "";
    const response = await fetch(`/api/admin/schedules${params}`, { cache: "no-store" });
    const payload = await response.json();
    setSchedules(Array.isArray(payload) ? payload : []);
  }, []);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  useEffect(() => {
    if (addModal) {
      void loadCustomers();
      void loadSchedules();
    }
  }, [addModal, loadCustomers, loadSchedules]);

  useEffect(() => {
    if (rescheduleModal) {
      void loadSchedules(rescheduleModal.schedule.class.id);
      setSelectedSchedule("");
    }
  }, [loadSchedules, rescheduleModal]);

  const handleAction = async (bookingId: string, action: "attended" | "cancel" | "confirm") => {
    setWorking(true);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر تحديث الحجز.");
        return;
      }
      await loadBookings();
    } finally {
      setWorking(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleModal || !selectedSchedule) return;
    setWorking(true);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: rescheduleModal.id,
          action: "reschedule",
          scheduleId: selectedSchedule,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر تعديل الموعد.");
        return;
      }
      setRescheduleModal(null);
      await loadBookings();
    } finally {
      setWorking(false);
    }
  };

  const handleCreateBooking = async () => {
    if (!selectedCustomer || !selectedSchedule) {
      window.alert("يرجى اختيار العميل والموعد.");
      return;
    }
    setWorking(true);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedCustomer, scheduleId: selectedSchedule }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر إنشاء الحجز.");
        return;
      }
      setAddModal(false);
      setSelectedCustomer("");
      setSelectedSchedule("");
      await loadBookings();
    } finally {
      setWorking(false);
    }
  };

  const scheduleOptions = useMemo(
    () =>
      schedules.map((item) => ({
        value: item.id,
        label: `${item.class.name} • ${formatDay(item.date)} • ${formatDate(item.date)} • ${item.time}`,
        availableSpots: item.availableSpots,
      })),
    [schedules],
  );

  return (
    <AdminSectionShell
      title="الحجوزات"
      subtitle="إدارة حجوزات العملاء، تسجيل الحضور، وتعديل المواعيد عند الحاجة."
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadBookings()}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
          >
            تحديث
          </button>
          <button
            onClick={() => setAddModal(true)}
            className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
          >
            + إضافة حجز
          </button>
        </div>
      }
    >
      <AdminCard>
        <div className="flex flex-wrap gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم العميل أو الكلاس أو الهاتف..."
            className="min-w-60 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93] placeholder:text-gray-500"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={INPUT}>
            <option value="all">كل الحالات</option>
            <option value="confirmed">مؤكد</option>
            <option value="attended">تم الحضور</option>
            <option value="cancelled">ملغي</option>
            <option value="noshow">لم يحضر</option>
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={INPUT} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={INPUT} />
          <button
            onClick={() => loadBookings()}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
          >
            تطبيق
          </button>
        </div>
      </AdminCard>

      <AdminCard className="overflow-hidden p-0">
        {loading ? (
          <div className="flex h-56 items-center justify-center text-sm text-[#d7aabd]">جارٍ تحميل الحجوزات...</div>
        ) : bookings.length === 0 ? (
          <div className="p-5">
            <AdminEmptyState title="لا توجد حجوزات" description="لا توجد حجوزات مطابقة للفلاتر الحالية." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-right text-xs text-[#d7aabd]">
                  {[
                    "العميل",
                    "الكلاس",
                    "اليوم/الوقت",
                    "الحالة",
                    "الاشتراك",
                    "الدفع",
                    "إجراءات",
                  ].map((header) => (
                    <th key={header} className="px-5 py-4 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-[rgba(255,188,219,0.08)] transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#fff4f8]">{booking.user.name}</div>
                      <div className="mt-1 text-xs text-[#d7aabd]">{booking.user.phone}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#fff4f8]">{booking.schedule.class.name}</div>
                      <div className="mt-1 text-xs text-[#d7aabd]">المدربة: {booking.schedule.class.trainer}</div>
                    </td>
                    <td className="px-5 py-4 text-[#d7aabd]">
                      <div>{formatDay(booking.schedule.date)}</div>
                      <div className="mt-1 text-xs text-[#b98ea0]">{formatDate(booking.schedule.date)} • {booking.schedule.time}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[booking.status] ?? "bg-white/10 text-white/70"}`}>
                        {STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#d7aabd]">
                      {booking.membership?.name ?? "بدون اشتراك"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#fff4f8]">{booking.paidAmount.toLocaleString("ar-EG")} ج.م</div>
                      <div className="mt-1 text-xs text-[#d7aabd]">{formatPayment(booking.paymentMethod)}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setRescheduleModal(booking)}
                          className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[#fff4f8] transition-colors hover:bg-white/10"
                        >
                          تعديل الموعد
                        </button>
                        {booking.status !== "attended" && (
                          <button
                            onClick={() => handleAction(booking.id, "attended")}
                            disabled={working}
                            className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            تسجيل حضور
                          </button>
                        )}
                        {booking.status !== "cancelled" && (
                          <button
                            onClick={() => handleAction(booking.id, "cancel")}
                            disabled={working}
                            className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            إلغاء
                          </button>
                        )}
                        {booking.status === "cancelled" && (
                          <button
                            onClick={() => handleAction(booking.id, "confirm")}
                            disabled={working}
                            className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            إعادة تفعيل
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {addModal && (
        <Modal title="إضافة حجز جديد" onClose={() => setAddModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">اختيار العميل</label>
              <select
                value={selectedCustomer}
                onChange={(event) => setSelectedCustomer(event.target.value)}
                className={INPUT}
              >
                <option value="">اختاري عميلة</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} • {customer.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">اختيار الموعد</label>
              <select
                value={selectedSchedule}
                onChange={(event) => setSelectedSchedule(event.target.value)}
                className={INPUT}
              >
                <option value="">اختاري الموعد</option>
                {scheduleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} • {item.availableSpots} مقاعد متاحة
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCreateBooking}
              disabled={working}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {working ? "جارٍ الحفظ..." : "تأكيد الحجز"}
            </button>
          </div>
        </Modal>
      )}

      {rescheduleModal && (
        <Modal title="تعديل الموعد" onClose={() => setRescheduleModal(null)}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/20 p-4 text-sm text-[#d7aabd]">
              <div className="font-bold text-[#fff4f8]">{rescheduleModal.user.name}</div>
              <div className="mt-1">الكلاس: {rescheduleModal.schedule.class.name}</div>
              <div className="mt-1">الموعد الحالي: {formatDay(rescheduleModal.schedule.date)} • {formatDate(rescheduleModal.schedule.date)} • {rescheduleModal.schedule.time}</div>
            </div>

            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">اختيار الموعد الجديد</label>
              <select
                value={selectedSchedule}
                onChange={(event) => setSelectedSchedule(event.target.value)}
                className={INPUT}
              >
                <option value="">اختاري الموعد</option>
                {scheduleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} • {item.availableSpots} مقاعد متاحة
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleReschedule}
              disabled={working}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {working ? "جارٍ التعديل..." : "تأكيد التعديل"}
            </button>
          </div>
        </Modal>
      )}
    </AdminSectionShell>
  );
}
