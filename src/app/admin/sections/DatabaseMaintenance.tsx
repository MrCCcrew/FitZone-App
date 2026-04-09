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
  createdAt: string;
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

type RecordsTab = "transactions" | "orders" | "memberships" | "plans" | "offers" | "users";

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

  const [recordsTab, setRecordsTab] = useState<RecordsTab>("transactions");
  const [recordsQuery, setRecordsQuery] = useState("");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [memberships, setMemberships] = useState<MembershipRecord[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);

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
                    <div className="text-xs text-gray-400">{plan.createdAt}</div>
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
      </div>
    </div>
  );
}
