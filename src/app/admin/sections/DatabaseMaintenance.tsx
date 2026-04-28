"use client";

import { useEffect, useMemo, useState } from "react";

type BackupInfo = {
  name: string;
  size: number;
  createdAt: string;
};

type TransactionRecord = {
  id: string;
  userName: string | null;
  userEmail: string | null;
  amount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
};

type OrderRecord = {
  id: string;
  userName: string | null;
  userEmail: string | null;
  total: number;
  status: string;
  createdAt: string;
};

type MembershipRecord = {
  id: string;
  userName: string | null;
  userEmail: string | null;
  membershipName: string | null;
  status: string;
  startDate: string;
  endDate: string;
};

type PlanRecord = {
  id: string;
  name: string;
  kind: string;
  price: number;
  priceBefore: number | null;
  priceAfter: number | null;
  duration: number;
  sessionsCount: number | null;
  isActive: boolean;
};

type OfferRecord = {
  id: string;
  title: string;
  type: string;
  discount: number;
  isActive: boolean;
  showOnHome: boolean;
  expiresAt: string;
};

type UserRecord = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
};

type ActionResult = {
  ok: boolean;
  message: string;
  backup?: BackupInfo;
};

type RecordsTab = "transactions" | "orders" | "memberships" | "plans" | "offers" | "users" | "inventoryMovements" | "partners" | "partnerCommissions" | "partnerWithdrawals";

type PartnerRecord = {
  id: string; name: string; category: string; email: string | null;
  commissionRate: number; commissionType: string; isActive: boolean; createdAt: string;
};

type PartnerCommissionRecord = {
  id: string; partnerName: string; customerName: string | null; customerEmail: string | null;
  membershipName: string | null; amount: number; status: string; createdAt: string;
};

type PartnerWithdrawalRecord = {
  id: string; partnerName: string; partnerCategory: string; amount: number;
  status: string; adminNotes: string | null; createdAt: string; processedAt: string | null;
};

type InventoryMovementRecord = {
  id: string;
  productName: string;
  type: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
};

function formatSize(bytes: number) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value > 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function DatabaseMaintenance() {
  const [masterPassword, setMasterPassword] = useState("");
  const [preserveSiteContent, setPreserveSiteContent] = useState(true);
  const [resetUsers, setResetUsers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [clearTarget, setClearTarget] = useState<"sales" | "purchases" | "both">("sales");
  const [clearLoading, setClearLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreFile, setRestoreFile] = useState("");
  const [restoreResult, setRestoreResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [restoreFullLoading, setRestoreFullLoading] = useState(false);
  const [restoreFullProgress, setRestoreFullProgress] = useState(0);
  const [restoreFullFile, setRestoreFullFile] = useState("");
  const [restoreFullResult, setRestoreFullResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [recordsTab, setRecordsTab] = useState<RecordsTab>("transactions");
  const [recordsQuery, setRecordsQuery] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [inventoryMovements, setInventoryMovements] = useState<InventoryMovementRecord[]>([]);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [partnerCommissions, setPartnerCommissions] = useState<PartnerCommissionRecord[]>([]);
  const [partnerWithdrawals, setPartnerWithdrawals] = useState<PartnerWithdrawalRecord[]>([]);

  const loadBackups = async () => {
    try {
      const res = await fetch("/api/admin/db-maintenance", { cache: "no-store" });
      const data = await res.json();
      if (Array.isArray(data.backups)) {
        setBackups(data.backups as BackupInfo[]);
      }
    } catch {}
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  const runAction = async (action: "backup" | "reset") => {
    setMessage(null);
    if (!masterPassword.trim()) {
      setMessage({ ok: false, message: "أدخلي كلمة المرور الرئيسية أولًا." });
      return;
    }
    if (action === "reset") {
      const first = window.confirm("تأكيد أخير: سيتم أخذ نسخة احتياطية ثم تصفير البيانات بالكامل. هل تريدين المتابعة؟");
      if (!first) return;
      const second = window.confirm("سيتم حذف كل البيانات المسجّلة. هل أنتِ متأكدة؟");
      if (!second) return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/db-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          masterPassword,
          preserveSiteContent,
          resetUsers,
        }),
      });
      const data = await res.json();
      const ok = res.ok;
      setMessage({
        ok,
        message: data?.message ?? (ok ? "تم تنفيذ العملية." : "حدث خطأ أثناء التنفيذ."),
        backup: data?.backup,
      });
      if (ok) {
        setMasterPassword("");
        void loadBackups();
      }
    } catch {
      setMessage({ ok: false, message: "تعذر الاتصال بالخادم الآن." });
    } finally {
      setLoading(false);
    }
  };

  const loadRecords = async (tab = recordsTab, query = recordsQuery) => {
    setRecordsLoading(true);
    try {
      const params = new URLSearchParams({ type: tab, q: query });
      const res = await fetch(`/api/admin/db-maintenance/records?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (tab === "transactions" && Array.isArray(data.items)) setTransactions(data.items as TransactionRecord[]);
      if (tab === "orders" && Array.isArray(data.items)) setOrders(data.items as OrderRecord[]);
      if (tab === "memberships" && Array.isArray(data.items)) setMemberships(data.items as MembershipRecord[]);
      if (tab === "plans" && Array.isArray(data.items)) setPlans(data.items as PlanRecord[]);
      if (tab === "offers" && Array.isArray(data.items)) setOffers(data.items as OfferRecord[]);
      if (tab === "users" && Array.isArray(data.items)) setUsers(data.items as UserRecord[]);
      if (tab === "inventoryMovements" && Array.isArray(data.items)) setInventoryMovements(data.items as InventoryMovementRecord[]);
      if (tab === "partners" && Array.isArray(data.items)) setPartners(data.items as PartnerRecord[]);
      if (tab === "partnerCommissions" && Array.isArray(data.items)) setPartnerCommissions(data.items as PartnerCommissionRecord[]);
      if (tab === "partnerWithdrawals" && Array.isArray(data.items)) setPartnerWithdrawals(data.items as PartnerWithdrawalRecord[]);
    } catch {}
    setRecordsLoading(false);
  };

  const updateRecordStatus = async (type: RecordsTab, id: string, status: string) => {
    if (!masterPassword.trim()) {
      setMessage({ ok: false, message: "أدخلي كلمة المرور الرئيسية أولًا." });
      return;
    }
    setRecordsLoading(true);
    try {
      const res = await fetch("/api/admin/db-maintenance/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-status", type, id, status, masterPassword }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, message: data?.message ?? "تم تحديث الحالة." });
      if (res.ok) void loadRecords();
    } catch {
      setMessage({ ok: false, message: "تعذر تحديث السجل الآن." });
    }
    setRecordsLoading(false);
  };

  const deleteRecord = async (type: RecordsTab, id: string) => {
    if (!masterPassword.trim()) {
      setMessage({ ok: false, message: "أدخلي كلمة المرور الرئيسية أولًا." });
      return;
    }
    const sure = window.confirm("هل تريدين حذف السجل نهائيًا؟ لا يمكن التراجع.");
    if (!sure) return;
    setRecordsLoading(true);
    try {
      const res = await fetch("/api/admin/db-maintenance/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", type, id, masterPassword }),
      });
      const data = await res.json();
      setMessage({ ok: res.ok, message: data?.message ?? "تم حذف السجل." });
      if (res.ok) void loadRecords();
    } catch {
      setMessage({ ok: false, message: "تعذر حذف السجل الآن." });
    }
    setRecordsLoading(false);
  };

  const tabs = useMemo(
    () => [
      { id: "transactions", label: "المعاملات المالية" },
      { id: "orders", label: "طلبات المتجر" },
      { id: "memberships", label: "اشتراكات العملاء" },
      { id: "plans", label: "الاشتراكات والباقات" },
      { id: "offers", label: "العروض" },
      { id: "users", label: "الحسابات" },
      { id: "inventoryMovements", label: "حركات المخزون" },
      { id: "partners", label: "الشركاء" },
      { id: "partnerCommissions", label: "عمولات الشركاء" },
      { id: "partnerWithdrawals", label: "سحوبات الشركاء" },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-red-500/30 bg-red-950/20 p-6 text-sm text-red-200">
        <div className="mb-2 text-base font-bold">منطقة حساسة</div>
        <p>هذا القسم مخصص لإدارة قاعدة البيانات وإعادة الضبط الشامل. يُنصح باستخدامه فقط عند الضرورة.</p>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
        <div className="mb-4 text-lg font-bold text-white">نسخ احتياطي وإعادة ضبط</div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">كلمة المرور الرئيسية</label>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="أدخلي كلمة المرور الرئيسية"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none"
            />
          </div>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={preserveSiteContent}
                onChange={(e) => setPreserveSiteContent(e.target.checked)}
              />
              الاحتفاظ بمحتوى تصميم الموقع (الصفحات والمحتوى)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={resetUsers} onChange={(e) => setResetUsers(e.target.checked)} />
              حذف جميع الحسابات (العملاء + الأدمن + الاستاف)
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => runAction("backup")}
            disabled={loading}
            className="rounded-2xl border border-gray-700 bg-gray-900 px-5 py-2 text-sm font-bold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            إنشاء نسخة احتياطية الآن
          </button>
          <button
            type="button"
            onClick={() => runAction("reset")}
            disabled={loading}
            className="rounded-2xl bg-red-600 px-5 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            تصفير قاعدة البيانات
          </button>
        </div>

        {message ? (
          <div
            className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
              message.ok
                ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
                : "border border-red-500/30 bg-red-950/30 text-red-200"
            }`}
          >
            {message.message}
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
        <div className="mb-4 text-lg font-bold text-white">آخر النسخ الاحتياطية</div>
        {backups.length === 0 ? (
          <div className="text-sm text-gray-400">لا توجد نسخ احتياطية مسجلة بعد.</div>
        ) : (
          <div className="space-y-2">
            {backups.map((backup) => (
              <div
                key={backup.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-2 text-sm text-gray-200"
              >
                <div>{backup.name}</div>
                <div className="text-xs text-gray-400">{backup.createdAt}</div>
                <div className="text-xs text-gray-400">{formatSize(backup.size)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Restore products from backup ── */}
      {backups.length > 0 && (
        <div className="rounded-3xl border border-blue-500/30 bg-blue-950/20 p-6">
          <div className="mb-1 text-lg font-bold text-white">🔄 استرجاع المنتجات من نسخة احتياطية</div>
          <p className="mb-4 text-sm text-blue-200/70">
            اختاري نسخة احتياطية لاسترجاع جدول المنتجات منها. سيتم استبدال المنتجات الحالية بالمنتجات المحفوظة في النسخة المختارة.
          </p>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">كلمة المرور الرئيسية</label>
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الرئيسية"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">اختر النسخة الاحتياطية</label>
              <select
                value={restoreFile}
                onChange={(e) => { setRestoreFile(e.target.value); setRestoreResult(null); }}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">اختر ملف النسخة الاحتياطية</option>
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} — {b.createdAt} ({formatSize(b.size)})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Progress bar while loading */}
          {restoreLoading && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-blue-300">
                <span>جارٍ قراءة النسخة الاحتياطية واستعادة المنتجات...</span>
                <span>{restoreProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-blue-950/60 border border-blue-500/20">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${restoreProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-blue-400/70 text-center">يرجى الانتظار، لا تغلق الصفحة...</p>
            </div>
          )}

          {/* Result message */}
          {restoreResult && !restoreLoading && (
            <div className={`mb-4 rounded-2xl px-4 py-4 text-sm ${
              restoreResult.ok
                ? "border border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                : "border border-red-500/30 bg-red-950/30 text-red-200"
            }`}>
              {restoreResult.ok ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-base font-bold text-emerald-300">
                    <span>✅</span> تم الاسترجاع بنجاح بدون أخطاء
                  </div>
                  <div className="text-xs text-emerald-400/80">{restoreResult.message}</div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>❌</span> {restoreResult.message}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={restoreLoading}
            onClick={async () => {
              if (!masterPassword.trim()) { setRestoreResult({ ok: false, message: "أدخل كلمة المرور الرئيسية أولاً." }); return; }
              if (!restoreFile) { setRestoreResult({ ok: false, message: "اختر ملف النسخة الاحتياطية أولاً." }); return; }
              const confirmed = window.confirm(`سيتم استبدال المنتجات الحالية بالمنتجات من:\n${restoreFile}\n\nهل تريد المتابعة؟`);
              if (!confirmed) return;

              setRestoreLoading(true);
              setRestoreResult(null);
              setRestoreProgress(0);

              // Animate progress to 85% while waiting for server
              const interval = setInterval(() => {
                setRestoreProgress((p) => {
                  if (p >= 85) { clearInterval(interval); return 85; }
                  return p + (p < 40 ? 8 : p < 70 ? 4 : 2);
                });
              }, 200);

              try {
                const res = await fetch("/api/admin/db-maintenance", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restore-products", masterPassword, backupFile: restoreFile }),
                });
                clearInterval(interval);
                setRestoreProgress(100);
                await new Promise((r) => setTimeout(r, 400));
                const data = await res.json();
                setRestoreResult({ ok: res.ok, message: data?.message ?? (res.ok ? "تم الاسترجاع بنجاح." : "حدث خطأ أثناء الاسترجاع.") });
                if (res.ok) setMasterPassword("");
              } catch {
                clearInterval(interval);
                setRestoreProgress(0);
                setRestoreResult({ ok: false, message: "تعذر الاتصال بالخادم." });
              } finally {
                setRestoreLoading(false);
              }
            }}
            className="rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {restoreLoading ? "جارٍ الاسترجاع..." : "🔄 استرجاع المنتجات"}
          </button>
        </div>
      )}

      {/* ── Restore full database from backup ── */}
      {backups.length > 0 && (
        <div className="rounded-3xl border border-violet-500/30 bg-violet-950/20 p-6">
          <div className="mb-1 text-lg font-bold text-white">🗄️ استرجاع قاعدة البيانات بالكامل</div>
          <p className="mb-3 text-sm text-violet-200/70">
            يسترجع جميع الجداول كما كانت لحظة أخذ النسخة الاحتياطية — مفيد لاسترعادة كل شيء دفعة واحدة بعد صيانة كبيرة.
          </p>
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-950/30 px-4 py-3 text-xs text-violet-200/80 space-y-1">
            <div>⚠️ سيتم استبدال <strong>جميع بيانات قاعدة البيانات الحالية</strong> بمحتوى النسخة المختارة.</div>
            <div>⚠️ يشمل ذلك: المنتجات، العملاء، الاشتراكات، الطلبات، المحتوى، وكل شيء آخر.</div>
            <div>✅ لا يؤثر على ملفات الخادم أو الإعدادات خارج قاعدة البيانات.</div>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">كلمة المرور الرئيسية</label>
              <input
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الرئيسية"
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-violet-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-gray-400">اختر النسخة الاحتياطية</label>
              <select
                value={restoreFullFile}
                onChange={(e) => { setRestoreFullFile(e.target.value); setRestoreFullResult(null); }}
                className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
              >
                <option value="">اختر ملف النسخة الاحتياطية</option>
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>{b.name} — {b.createdAt} ({formatSize(b.size)})</option>
                ))}
              </select>
            </div>
          </div>

          {restoreFullLoading && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-xs text-violet-300">
                <span>جارٍ استرجاع قاعدة البيانات بالكامل...</span>
                <span>{restoreFullProgress}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-950/60 border border-violet-500/20">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${restoreFullProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-violet-400/70 text-center">يرجى الانتظار، لا تغلق الصفحة...</p>
            </div>
          )}

          {restoreFullResult && !restoreFullLoading && (
            <div className={`mb-4 rounded-2xl px-4 py-4 text-sm ${
              restoreFullResult.ok
                ? "border border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
                : "border border-red-500/30 bg-red-950/30 text-red-200"
            }`}>
              {restoreFullResult.ok ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-base font-bold text-emerald-300">
                    <span>✅</span> تم استرجاع قاعدة البيانات بالكامل بنجاح
                  </div>
                  <div className="text-xs text-emerald-400/80">{restoreFullResult.message}</div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>❌</span> {restoreFullResult.message}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={restoreFullLoading}
            onClick={async () => {
              if (!masterPassword.trim()) { setRestoreFullResult({ ok: false, message: "أدخل كلمة المرور الرئيسية أولاً." }); return; }
              if (!restoreFullFile) { setRestoreFullResult({ ok: false, message: "اختر ملف النسخة الاحتياطية أولاً." }); return; }
              const c1 = window.confirm(`تحذير: سيتم استبدال كل بيانات قاعدة البيانات بمحتوى:\n${restoreFullFile}\n\nهل تريد المتابعة؟`);
              if (!c1) return;
              const c2 = window.confirm("تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟");
              if (!c2) return;

              setRestoreFullLoading(true);
              setRestoreFullResult(null);
              setRestoreFullProgress(0);

              const interval = setInterval(() => {
                setRestoreFullProgress((p) => {
                  if (p >= 85) { clearInterval(interval); return 85; }
                  return p + (p < 40 ? 8 : p < 70 ? 4 : 2);
                });
              }, 300);

              try {
                const res = await fetch("/api/admin/db-maintenance", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restore-full", masterPassword, backupFile: restoreFullFile }),
                });
                clearInterval(interval);
                setRestoreFullProgress(100);
                await new Promise((r) => setTimeout(r, 400));
                const data = await res.json();
                setRestoreFullResult({ ok: res.ok, message: data?.message ?? (res.ok ? "تم الاسترجاع بنجاح." : "حدث خطأ أثناء الاسترجاع.") });
                if (res.ok) { setMasterPassword(""); void loadBackups(); }
              } catch {
                clearInterval(interval);
                setRestoreFullProgress(0);
                setRestoreFullResult({ ok: false, message: "تعذر الاتصال بالخادم." });
              } finally {
                setRestoreFullLoading(false);
              }
            }}
            className="rounded-2xl bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {restoreFullLoading ? "جارٍ الاسترجاع..." : "🗄️ استرجاع قاعدة البيانات بالكامل"}
          </button>
        </div>
      )}

      {/* ── Clear inventory data ── */}
      <div className="rounded-3xl border border-orange-500/30 bg-orange-950/20 p-6">
        <div className="mb-1 text-lg font-bold text-white">مسح حركات البيع والشراء</div>
        <p className="mb-5 text-sm text-orange-200/70">
          تُستخدم هذه الأداة لمسح بيانات المبيعات أو الشراء التجريبية قبل بدء التشغيل الفعلي.
          سيتم أخذ نسخة احتياطية تلقائياً قبل التنفيذ.
        </p>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">كلمة المرور الرئيسية</label>
            <input
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="أدخل كلمة المرور الرئيسية"
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium text-gray-400">نوع البيانات المراد مسحها</label>
            <select
              value={clearTarget}
              onChange={(e) => setClearTarget(e.target.value as "sales" | "purchases" | "both")}
              className="w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none"
            >
              <option value="sales">حركات البيع فقط (InventoryMovement نوع sale/return)</option>
              <option value="purchases">فواتير الشراء فقط + إعادة ضبط متوسط التكلفة</option>
              <option value="both">الكل — بيع + شراء + إعادة ضبط التكلفة</option>
            </select>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-orange-500/20 bg-orange-950/30 px-4 py-3 text-xs text-orange-200/80 space-y-1">
          <div>⚠️ <strong>حركات البيع:</strong> تُحذف سجلات البيع من جدول InventoryMovement المرتبطة بالطلبات — لا يُحذف الطلب نفسه.</div>
          <div>⚠️ <strong>فواتير الشراء:</strong> تُحذف الفواتير وبنودها وحركات الشراء، ويُعاد ضبط متوسط التكلفة لكل المنتجات إلى صفر.</div>
          <div>✅ بيانات العملاء والاشتراكات والمنتجات لا تتأثر.</div>
        </div>

        <button
          type="button"
          disabled={clearLoading}
          onClick={async () => {
            if (!masterPassword.trim()) {
              setMessage({ ok: false, message: "أدخل كلمة المرور الرئيسية أولاً." });
              return;
            }
            const label =
              clearTarget === "sales" ? "حركات البيع" :
              clearTarget === "purchases" ? "فواتير الشراء وحركاتها" :
              "جميع حركات البيع والشراء";
            const confirmed = window.confirm(`تأكيد: سيتم مسح ${label} نهائياً بعد أخذ نسخة احتياطية. هل تريد المتابعة؟`);
            if (!confirmed) return;
            const confirmed2 = window.confirm(`تأكيد أخير: لا يمكن التراجع. هل أنت متأكد؟`);
            if (!confirmed2) return;
            setClearLoading(true);
            setMessage(null);
            try {
              const res = await fetch("/api/admin/db-maintenance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "clear-inventory", masterPassword, clearTarget }),
              });
              const data = await res.json();
              setMessage({ ok: res.ok, message: data?.message ?? (res.ok ? "تم التنفيذ." : "حدث خطأ."), backup: data?.backup });
              if (res.ok) { setMasterPassword(""); void loadBackups(); }
            } catch {
              setMessage({ ok: false, message: "تعذر الاتصال بالخادم." });
            } finally {
              setClearLoading(false);
            }
          }}
          className="rounded-2xl bg-orange-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {clearLoading ? "جارٍ التنفيذ..." : "🗑️ مسح البيانات المحددة"}
        </button>
      </div>

      <div className="rounded-3xl border border-gray-800 bg-gray-950/70 p-6">
        <div className="mb-4 text-lg font-bold text-white">إدارة السجلات المالية والحسابات</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setRecordsTab(tab.id as RecordsTab);
                void loadRecords(tab.id as RecordsTab, recordsQuery);
              }}
              className={`rounded-2xl px-4 py-2 text-sm font-bold ${
                recordsTab === tab.id ? "bg-pink-600 text-white" : "bg-gray-900 text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={recordsQuery}
            onChange={(e) => setRecordsQuery(e.target.value)}
            placeholder="ابحثي بالاسم أو البريد أو رقم السجل"
            className="min-w-[220px] flex-1 rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => loadRecords()}
            className="rounded-2xl border border-gray-700 bg-gray-900 px-4 py-2 text-sm font-bold text-gray-200"
          >
            تحديث القائمة
          </button>
        </div>

        {recordsLoading ? <div className="text-sm text-gray-400">جارٍ تحميل البيانات...</div> : null}

        {recordsTab === "transactions" ? (
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد معاملات حالياً.</div>
            ) : (
              transactions.map((tx) => (
                <div key={tx.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{tx.userName ?? "عميل"}</div>
                      <div className="text-xs text-gray-400">{tx.userEmail ?? "-"}</div>
                    </div>
                    <div className="text-xs text-gray-400">{tx.createdAt}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-300">
                    <span>القيمة: {tx.amount} ج.م</span>
                    <span>الوسيلة: {tx.paymentMethod}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={tx.status}
                      onChange={(e) => updateRecordStatus("transactions", tx.id, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                    >
                      {["pending", "requires_action", "paid", "failed", "cancelled", "expired"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteRecord("transactions", tx.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "orders" ? (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد طلبات حالياً.</div>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{order.userName ?? "عميل"}</div>
                      <div className="text-xs text-gray-400">{order.userEmail ?? "-"}</div>
                    </div>
                    <div className="text-xs text-gray-400">{order.createdAt}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-300">
                    <span>الإجمالي: {order.total} ج.م</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={order.status}
                      onChange={(e) => updateRecordStatus("orders", order.id, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                    >
                      {["pending", "confirmed", "delivered", "cancelled"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteRecord("orders", order.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "memberships" ? (
          <div className="space-y-3">
            {memberships.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد اشتراكات حالياً.</div>
            ) : (
              memberships.map((membership) => (
                <div key={membership.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{membership.userName ?? "عميل"}</div>
                      <div className="text-xs text-gray-400">{membership.userEmail ?? "-"}</div>
                    </div>
                    <div className="text-xs text-gray-400">{membership.membershipName ?? "اشتراك"}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-300">
                    <span>بداية: {membership.startDate}</span>
                    <span>نهاية: {membership.endDate}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={membership.status}
                      onChange={(e) => updateRecordStatus("memberships", membership.id, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                    >
                      {["active", "expired", "cancelled"].map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteRecord("memberships", membership.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "plans" ? (
          <div className="space-y-3">
            {plans.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد اشتراكات أو باقات مسجلة.</div>
            ) : (
              plans.map((plan) => (
                <div key={plan.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{plan.name}</div>
                      <div className="text-xs text-gray-400">{plan.kind}</div>
                    </div>
                    <div className="text-xs text-gray-400">نشط: {plan.isActive ? "نعم" : "لا"}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-300">
                    <span>السعر: {plan.price} ج.م</span>
                    {plan.priceBefore ? <span>قبل الخصم: {plan.priceBefore} ج.م</span> : null}
                    {plan.priceAfter ? <span>بعد الخصم: {plan.priceAfter} ج.م</span> : null}
                    <span>المدة: {plan.duration} يوم</span>
                    {plan.sessionsCount ? <span>الحصص: {plan.sessionsCount}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={plan.isActive ? "active" : "inactive"}
                      onChange={(e) => updateRecordStatus("plans", plan.id, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                    >
                      {["active", "inactive"].map((status) => (
                        <option key={status} value={status}>
                          {status === "active" ? "نشط" : "غير نشط"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteRecord("plans", plan.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "offers" ? (
          <div className="space-y-3">
            {offers.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد عروض حالياً.</div>
            ) : (
              offers.map((offer) => (
                <div key={offer.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{offer.title}</div>
                      <div className="text-xs text-gray-400">{offer.type}</div>
                    </div>
                    <div className="text-xs text-gray-400">{offer.expiresAt}</div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-300">
                    <span>الخصم: {offer.discount}</span>
                    <span>عرض على الرئيسية: {offer.showOnHome ? "نعم" : "لا"}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={offer.isActive ? "active" : "inactive"}
                      onChange={(e) => updateRecordStatus("offers", offer.id, e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-white"
                    >
                      {["active", "inactive"].map((status) => (
                        <option key={status} value={status}>
                          {status === "active" ? "نشط" : "غير نشط"}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => deleteRecord("offers", offer.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "users" ? (
          <div className="space-y-3">
            {users.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد حسابات حالياً.</div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{user.name ?? "بدون اسم"}</div>
                      <div className="text-xs text-gray-400">{user.email ?? "-"}</div>
                    </div>
                    <div className="text-xs text-gray-400">{user.role}</div>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">تاريخ الإنشاء: {user.createdAt}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => deleteRecord("users", user.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف الحساب
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "inventoryMovements" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-950/20 px-4 py-3 text-xs text-yellow-200/80">
              حركات نوع <strong>sale</strong> هي المصدر الوحيد لحساب تكلفة البضاعة (COGS). حذف حركة خاطئة يُصحح الحسابات فوراً.
            </div>
            {inventoryMovements.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد حركات مخزون. اضغط "تحديث القائمة" أولاً.</div>
            ) : (
              inventoryMovements.map((mv) => (
                <div key={mv.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div className="font-bold">{mv.productName}</div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      mv.type === "sale" ? "bg-red-500/20 text-red-300" :
                      mv.type === "return" ? "bg-emerald-500/20 text-emerald-300" :
                      mv.type === "purchase" ? "bg-blue-500/20 text-blue-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>
                      {mv.type === "sale" ? "بيع" : mv.type === "return" ? "مرتجع" : mv.type === "purchase" ? "شراء" : mv.type}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>التغيير: {mv.quantityChange > 0 ? "+" : ""}{mv.quantityChange}</span>
                    <span>قبل: {mv.quantityBefore} → بعد: {mv.quantityAfter}</span>
                    {mv.unitCost != null && <span>تكلفة الوحدة: {mv.unitCost} ج.م</span>}
                    {mv.unitCost != null && <span className="text-orange-300 font-bold">أثر على COGS: {Math.abs(mv.quantityChange) * mv.unitCost} ج.م</span>}
                  </div>
                  {(mv.referenceType || mv.referenceId) && (
                    <div className="mt-1 text-[11px] text-gray-600">
                      مرجع: {mv.referenceType ?? ""} — {mv.referenceId ?? ""}
                    </div>
                  )}
                  {mv.notes && <div className="mt-1 text-[11px] text-gray-500">{mv.notes}</div>}
                  <div className="mt-1 text-[11px] text-gray-600">{mv.createdAt}</div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => deleteRecord("inventoryMovements", mv.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف الحركة
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "partners" ? (
          <div className="space-y-3">
            {partners.length === 0 ? (
              <div className="text-sm text-gray-400">لا يوجد شركاء حالياً. اضغط "تحديث القائمة" أولاً.</div>
            ) : (
              partners.map((p) => (
                <div key={p.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{p.name}</div>
                      {p.email && <div className="text-xs text-gray-400">{p.email}</div>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-gray-700 px-2.5 py-0.5 text-[11px] text-gray-300">{p.category}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
                        {p.isActive ? "نشط" : "غير نشط"}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>العمولة: {p.commissionRate}% ({p.commissionType})</span>
                    <span>تاريخ الإنشاء: {p.createdAt}</span>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => deleteRecord("partners", p.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف الشريك
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "partnerCommissions" ? (
          <div className="space-y-3">
            {partnerCommissions.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد عمولات حالياً. اضغط "تحديث القائمة" أولاً.</div>
            ) : (
              partnerCommissions.map((c) => (
                <div key={c.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{c.partnerName}</div>
                      <div className="text-xs text-gray-400">{c.customerName ?? "-"} {c.customerEmail ? `(${c.customerEmail})` : ""}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      c.status === "paid" ? "bg-emerald-500/20 text-emerald-300" :
                      c.status === "pending" ? "bg-yellow-500/20 text-yellow-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>
                      {c.status === "paid" ? "مدفوع" : c.status === "pending" ? "معلق" : c.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>المبلغ: {c.amount} ج.م</span>
                    {c.membershipName && <span>الاشتراك: {c.membershipName}</span>}
                    <span>{c.createdAt}</span>
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => deleteRecord("partnerCommissions", c.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف العمولة
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        {recordsTab === "partnerWithdrawals" ? (
          <div className="space-y-3">
            {partnerWithdrawals.length === 0 ? (
              <div className="text-sm text-gray-400">لا توجد سحوبات حالياً. اضغط "تحديث القائمة" أولاً.</div>
            ) : (
              partnerWithdrawals.map((w) => (
                <div key={w.id} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-200">
                    <div>
                      <div className="font-bold">{w.partnerName}</div>
                      <div className="text-xs text-gray-400">{w.partnerCategory}</div>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      w.status === "approved" ? "bg-emerald-500/20 text-emerald-300" :
                      w.status === "pending" ? "bg-yellow-500/20 text-yellow-300" :
                      w.status === "rejected" ? "bg-red-500/20 text-red-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>
                      {w.status === "approved" ? "موافق عليه" : w.status === "pending" ? "معلق" : w.status === "rejected" ? "مرفوض" : w.status}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                    <span>المبلغ: {w.amount} ج.م</span>
                    <span>تاريخ الطلب: {w.createdAt}</span>
                    {w.processedAt && <span>تاريخ المعالجة: {w.processedAt}</span>}
                  </div>
                  {w.adminNotes && <div className="mt-1 text-[11px] text-gray-500">ملاحظات: {w.adminNotes}</div>}
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => deleteRecord("partnerWithdrawals", w.id)}
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300"
                    >
                      حذف طلب السحب
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
