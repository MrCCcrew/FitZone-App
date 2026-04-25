"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type AttendanceCheckInRow = {
  id: string;
  createdAt: string;
  checkInType: string;
  notes: string | null;
  user: { id: string; name: string; email: string; phone: string };
  passLabel: string | null;
  scannedBy: { id: string; name: string } | null;
  booking: {
    id: string;
    className: string;
    trainerName: string;
    date: string;
    time: string;
  } | null;
  privateSession: {
    id: string;
    type: string;
    trainerName: string;
  } | null;
};

type AttendanceFeedback =
  | { ok: true; text: string; details?: string }
  | { ok: false; text: string; details?: string };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
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
  gift: "🎁 هدية من الإدارة",
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
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
  const [attendanceMode, setAttendanceMode] = useState<"class" | "private">("class");
  const [attendanceScheduleId, setAttendanceScheduleId] = useState("");
  const [attendanceCheckIns, setAttendanceCheckIns] = useState<AttendanceCheckInRow[]>([]);
  const [attendanceSchedules, setAttendanceSchedules] = useState<ScheduleOption[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [scanInput, setScanInput] = useState("");
  const [scanFeedback, setScanFeedback] = useState<AttendanceFeedback | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [giftModal, setGiftModal] = useState(false);
  const [giftCustomer, setGiftCustomer] = useState("");
  const [giftSchedule, setGiftSchedule] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftWorking, setGiftWorking] = useState(false);
  const [giftSuccess, setGiftSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const scanInFlightRef = useRef(false);

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

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current != null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    scanInFlightRef.current = false;
  }, []);

  const loadAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("mode", attendanceMode);
      params.set("date", new Date().toISOString());
      if (attendanceMode === "class" && attendanceScheduleId) params.set("scheduleId", attendanceScheduleId);

      const response = await fetch(`/api/admin/attendance?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      setAttendanceSchedules(Array.isArray(payload.schedules) ? payload.schedules : []);
      setAttendanceCheckIns(Array.isArray(payload.checkIns) ? payload.checkIns : []);
    } finally {
      setAttendanceLoading(false);
    }
  }, [attendanceMode, attendanceScheduleId]);

  const submitScan = useCallback(
    async (rawValue: string) => {
      const value = rawValue.trim();
      if (!value) return;

      setWorking(true);
      setScanFeedback(null);
      try {
        const response = await fetch("/api/admin/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanValue: value,
            scheduleId: attendanceMode === "class" ? attendanceScheduleId || null : null,
            mode: attendanceMode,
          }),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setScanFeedback({
            ok: false,
            text: payload.error ?? "تعذر تسجيل الحضور.",
          });
          return;
        }

        const result = payload.result ?? {};
        setScanFeedback({
          ok: true,
          text: payload.alreadyCheckedIn ? "تم تسجيل هذا الحضور مسبقًا." : "تم تسجيل الحضور بنجاح.",
          details:
            attendanceMode === "class"
              ? `${result.customerName ?? ""} - ${result.className ?? ""}`
              : `${result.customerName ?? ""} - ${result.trainerName ?? ""}`,
        });
        setScanInput("");
        stopCamera();
        await Promise.all([loadAttendance(), loadBookings()]);
      } finally {
        setWorking(false);
      }
    },
    [attendanceMode, attendanceScheduleId, loadAttendance, loadBookings, stopCamera],
  );

  const startCamera = useCallback(async () => {
    const BarcodeDetectorCtor = (window as WindowWithBarcodeDetector).BarcodeDetector;

    if (attendanceMode === "class" && !attendanceScheduleId) {
      setCameraError("اختَر الكلاس أو الموعد أولًا قبل بدء المسح.");
      return;
    }

    stopCamera();
    setCameraError(null);
    setScanFeedback(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = BarcodeDetectorCtor ? new BarcodeDetectorCtor({ formats: ["qr_code"] }) : null;
      setCameraActive(true);

      scanIntervalRef.current = window.setInterval(async () => {
        if (scanInFlightRef.current || !videoRef.current || !canvasRef.current) return;
        if (videoRef.current.readyState < 2) return;

        scanInFlightRef.current = true;
        try {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;
          const context = canvas.getContext("2d");
          if (!context) return;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          let rawValue = "";

          if (detector) {
            const codes = await detector.detect(canvas);
            rawValue = codes[0]?.rawValue?.trim() ?? "";
          }

          if (!rawValue) {
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const fallbackResult = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "attemptBoth",
            });
            rawValue = fallbackResult?.data?.trim() ?? "";
          }
          if (rawValue) {
            await submitScan(rawValue);
          }
        } catch {
          // ignore transient camera detection errors
        } finally {
          scanInFlightRef.current = false;
        }
      }, 900);

      if (!detector) {
        setCameraError("تم تشغيل المسح بوضع التوافق لأن المتصفح لا يدعم BarcodeDetector.");
      }
    } catch {
      setCameraError("تعذر فتح الكاميرا على هذا الجهاز أو المتصفح.");
      stopCamera();
    }
  }, [attendanceMode, attendanceScheduleId, stopCamera, submitScan]);

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

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    if (attendanceMode === "private") {
      setAttendanceScheduleId("");
    }
    setScanFeedback(null);
    stopCamera();
  }, [attendanceMode, stopCamera]);

  useEffect(() => {
    if (attendanceMode !== "class") return;
    if (!attendanceScheduleId && attendanceSchedules.length > 0) {
      setAttendanceScheduleId(attendanceSchedules[0].id);
    }
  }, [attendanceMode, attendanceScheduleId, attendanceSchedules]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleDelete = async (bookingId: string) => {
    const confirmed = window.confirm("هل تريد حذف هذا الحجز نهائياً؟ لا يمكن التراجع.");
    if (!confirmed) return;
    setWorking(true);
    try {
      const response = await fetch("/api/admin/bookings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر حذف الحجز.");
        return;
      }
      await loadBookings();
    } finally {
      setWorking(false);
    }
  };

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

  const handleSendGift = async () => {
    if (!giftCustomer || !giftSchedule) {
      window.alert("يرجى اختيار العميل والموعد.");
      return;
    }
    setGiftWorking(true);
    setGiftSuccess(null);
    try {
      const response = await fetch("/api/admin/gift-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: giftCustomer, scheduleId: giftSchedule, note: giftNote || undefined }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(payload.error ?? "تعذر إرسال الهدية.");
        return;
      }
      const customer = customers.find((c) => c.id === giftCustomer);
      setGiftSuccess(`تم إرسال الهدية وإشعار البريد الإلكتروني لـ ${customer?.name ?? "العميلة"} بنجاح ✅`);
      setGiftCustomer("");
      setGiftSchedule("");
      setGiftNote("");
      await loadBookings();
    } finally {
      setGiftWorking(false);
    }
  };

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
            onClick={() => {
              setGiftSuccess(null);
              setGiftCustomer("");
              setGiftSchedule("");
              setGiftNote("");
              void loadSchedules();
              void loadCustomers();
              setGiftModal(true);
            }}
            className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-purple-500"
          >
            🎁 هدية تجريبية
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

      <AdminCard>
        <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="text-base font-black text-[#fff4f8]">الحضور بالـ QR</h3>
                <p className="mt-1 text-sm text-[#d7aabd]">
                  سجّل حضور العميل مباشرة من الكود، مع ربطه بالكلاس أو جلسة البرايفيت.
                </p>
              </div>
              <button
                onClick={() => void loadAttendance()}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
              >
                تحديث سجل الحضور
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={attendanceMode}
                onChange={(event) => setAttendanceMode(event.target.value as "class" | "private")}
                className={INPUT}
              >
                <option value="class">حضور كلاس</option>
                <option value="private">برايفيت / ميني برايفيت</option>
              </select>

              <select
                value={attendanceScheduleId}
                onChange={(event) => setAttendanceScheduleId(event.target.value)}
                className={INPUT}
                disabled={attendanceMode !== "class"}
              >
                <option value="">اختَر الموعد</option>
                {attendanceSchedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.class.name} • {formatDay(schedule.date)} • {formatDate(schedule.date)} • {schedule.time}
                  </option>
                ))}
              </select>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void startCamera()}
                  className="flex-1 rounded-xl bg-[#ff4f93] px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                >
                  فتح الكاميرا
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-[#fff4f8] transition-colors hover:bg-white/20"
                >
                  إيقاف
                </button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                placeholder="الصق كود الـ QR هنا عند الحاجة"
                className={INPUT}
              />
              <button
                type="button"
                onClick={() => void submitScan(scanInput)}
                disabled={working || !scanInput.trim()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                تسجيل الحضور
              </button>
            </div>

            {scanFeedback ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${scanFeedback.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-red-500/30 bg-red-500/10 text-red-200"}`}>
                <div className="font-bold">{scanFeedback.text}</div>
                {scanFeedback.details ? <div className="mt-1 opacity-90">{scanFeedback.details}</div> : null}
              </div>
            ) : null}

            {cameraError ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {cameraError}
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-[rgba(255,188,219,0.16)] bg-black/25">
              <div className="border-b border-[rgba(255,188,219,0.12)] px-4 py-3 text-sm font-bold text-[#fff4f8]">
                {cameraActive ? "الكاميرا تعمل الآن" : "منطقة المسح بالكاميرا"}
              </div>
              <div className="relative flex min-h-[280px] items-center justify-center bg-black/40 p-3">
                <video ref={videoRef} className={`max-h-[340px] w-full rounded-xl object-cover ${cameraActive ? "block" : "hidden"}`} muted playsInline />
                {!cameraActive ? (
                  <div className="text-center text-sm text-[#d7aabd]">
                    افتح الكاميرا لبدء قراءة QR العميل مباشرة من شاشة الهاتف.
                  </div>
                ) : null}
                <canvas ref={canvasRef} className="hidden" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-base font-black text-[#fff4f8]">آخر عمليات الحضور</h3>
              <p className="mt-1 text-sm text-[#d7aabd]">سجل سريع لآخر عمليات المسح المسجلة اليوم.</p>
            </div>

            {attendanceLoading ? (
              <div className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/20 px-4 py-8 text-center text-sm text-[#d7aabd]">
                جارٍ تحميل سجل الحضور...
              </div>
            ) : attendanceCheckIns.length === 0 ? (
              <div className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/20 px-4 py-8 text-center text-sm text-[#d7aabd]">
                لا توجد عمليات حضور مسجلة اليوم لهذا الوضع.
              </div>
            ) : (
              <div className="space-y-3">
                {attendanceCheckIns.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/20 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-black text-[#fff4f8]">{item.user.name}</div>
                        <div className="mt-1 text-xs text-[#d7aabd]">{formatDateTime(item.createdAt)}</div>
                      </div>
                      <span className="rounded-full bg-pink-500/15 px-2.5 py-1 text-[11px] font-bold text-pink-200">
                        {item.checkInType === "class"
                          ? "كلاس"
                          : item.checkInType === "mini_private"
                            ? "ميني برايفيت"
                            : "برايفيت"}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-[#d7aabd]">
                      {item.booking ? (
                        <div>الكلاس: <span className="font-bold text-white">{item.booking.className}</span> • {item.booking.time}</div>
                      ) : null}
                      {item.privateSession ? (
                        <div>المدربة: <span className="font-bold text-white">{item.privateSession.trainerName}</span></div>
                      ) : null}
                      {item.scannedBy ? (
                        <div>تم التسجيل بواسطة: <span className="font-bold text-white">{item.scannedBy.name}</span></div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                        <button
                          onClick={() => handleDelete(booking.id)}
                          disabled={working}
                          className="rounded-lg bg-rose-900/30 px-3 py-2 text-xs text-rose-400 transition-colors hover:bg-rose-900/50 disabled:opacity-50"
                        >
                          حذف
                        </button>
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
      {giftModal && (
        <Modal
          title="🎁 إهداء حصة تجريبية مجانية"
          onClose={() => { setGiftModal(false); setGiftSuccess(null); }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[#d7aabd] leading-relaxed">
              أرسل للعميلة حصة تجريبية مجانية — ستصلها كارت الاشتراك مع رمز QR على بريدها الإلكتروني وتظهر في صفحتها الشخصية. التكلفة صفر ولا تؤثر على الحسابات.
            </p>

            {giftSuccess && (
              <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-4 py-3 text-sm font-bold text-emerald-300">
                {giftSuccess}
              </div>
            )}

            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">العميلة</label>
              <select
                value={giftCustomer}
                onChange={(e) => setGiftCustomer(e.target.value)}
                className={INPUT}
              >
                <option value="">اختاري العميلة</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">الموعد (الكلاس والوقت)</label>
              <select
                value={giftSchedule}
                onChange={(e) => setGiftSchedule(e.target.value)}
                className={INPUT}
              >
                <option value="">اختاري الموعد</option>
                {scheduleOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} • {item.availableSpots} مقاعد
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs text-[#d7aabd]">ملاحظة للعميلة (اختياري)</label>
              <textarea
                value={giftNote}
                onChange={(e) => setGiftNote(e.target.value)}
                placeholder="مثال: نتمنى لكِ تجربة رائعة!"
                rows={2}
                className="w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-purple-500 placeholder:text-gray-500 resize-none"
              />
            </div>

            <button
              onClick={() => void handleSendGift()}
              disabled={giftWorking || !giftCustomer || !giftSchedule}
              className="w-full rounded-xl bg-purple-600 py-3 text-sm font-black text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
            >
              {giftWorking ? "جارٍ الإرسال..." : "إرسال الهدية وبريد QR 🎁"}
            </button>
          </div>
        </Modal>
      )}

    </AdminSectionShell>
  );
}
