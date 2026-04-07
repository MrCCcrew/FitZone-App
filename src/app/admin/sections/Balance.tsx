"use client";

import { useState, useEffect, useCallback } from "react";
import type { Transaction, Customer } from "../types";

interface BalanceCustomer extends Customer { tier?: string; }
interface BalanceData { customers: BalanceCustomer[]; transactions: Transaction[]; }

const TYPE_CONFIG: Record<Transaction["type"], { label: string; color: string; sign: string }> = {
  earn:   { label: "اكتساب نقاط",  color: "text-green-400",  sign: "+" },
  redeem: { label: "استبدال نقاط", color: "text-yellow-400", sign: "-" },
  topup:  { label: "شحن رصيد",    color: "text-blue-400",   sign: "+" },
  deduct: { label: "خصم نقاط",    color: "text-red-400",    sign: "-" },
};

const INPUT = "w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-black text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Balance() {
  const [customers, setCustomers] = useState<BalanceCustomer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [tab, setTab] = useState<"points" | "balance" | "history">("points");
  const [adjustModal, setAdjustModal] = useState<{ customer: BalanceCustomer; mode: "points" | "balance" } | null>(null);
  const [adjustValue, setAdjustValue] = useState(0);
  const [adjustType, setAdjustType] = useState<"add" | "deduct">("add");
  const [adjustReason, setAdjustReason] = useState("");
  const [topupModal, setTopupModal] = useState<BalanceCustomer | null>(null);
  const [topupAmount, setTopupAmount] = useState(0);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const d: BalanceData = await fetch("/api/admin/balance").then(r => r.json());
    setCustomers(d.customers ?? []);
    setTransactions(d.transactions ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const doAdjust = async () => {
    if (!adjustModal) return;
    const { customer, mode } = adjustModal;
    setSaving(true);
    const type = mode === "points"
      ? (adjustType === "add" ? "earn"  : "deduct")
      : (adjustType === "add" ? "topup" : "deduct");
    await fetch("/api/admin/balance", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: customer.id, type, points: adjustValue, amount: adjustValue, reason: adjustReason || (adjustType === "add" ? "إضافة يدوية" : "خصم يدوي") }),
    });
    await fetchAll();
    setAdjustModal(null); setAdjustValue(0); setAdjustReason(""); setAdjustType("add"); setSaving(false);
  };

  const doTopup = async () => {
    if (!topupModal || topupAmount <= 0) return;
    setSaving(true);
    await fetch("/api/admin/balance", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ userId: topupModal.id, type: "topup", amount: topupAmount, reason: "شحن رصيد من الإدارة" }),
    });
    await fetchAll();
    setTopupModal(null); setTopupAmount(0); setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500 text-sm">جارٍ تحميل بيانات الرصيد...</div></div>;

  const sortedByPoints = [...customers].sort((a, b) => b.points - a.points);
  const sortedByBalance = [...customers].sort((a, b) => b.balance - a.balance);
  const totalPoints = customers.reduce((s, c) => s + c.points, 0);
  const totalBalance = customers.reduce((s, c) => s + c.balance, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          ["🏅 إجمالي النقاط", totalPoints.toLocaleString("ar-EG") + " نقطة", "text-yellow-400", "border-yellow-500/20 bg-yellow-500/5"],
          ["💳 إجمالي الأرصدة", totalBalance.toLocaleString("ar-EG") + " ج.م", "text-blue-400", "border-blue-500/20 bg-blue-500/5"],
          ["🔄 إجمالي العمليات", transactions.length.toString(), "text-green-400", "border-green-500/20 bg-green-500/5"],
        ].map(([label, val, color, border]) => (
          <div key={label as string} className={`border rounded-2xl p-5 ${border}`}>
            <div className="text-gray-400 text-xs mb-2">{label}</div>
            <div className={`text-2xl font-black ${color}`}>{val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[["points", "🏅 النقاط"], ["balance", "💳 الرصيد"], ["history", "📜 السجل"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v as typeof tab)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${tab === v ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Points tab */}
      {tab === "points" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-white font-black">جدول النقاط</h3>
            <p className="text-gray-500 text-sm">نقاط الولاء لكل عضو</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  {["#", "العضو", "الباقة", "النقاط", "قيمة النقاط", ""].map((h) => (
                    <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedByPoints.map((c, i) => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? "bg-yellow-500 text-black" : i === 1 ? "bg-gray-400 text-black" : i === 2 ? "bg-amber-700 text-white" : "bg-gray-800 text-gray-400"}`}>
                        {i + 1}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-700 flex items-center justify-center text-white font-black text-sm">{c.avatar}</div>
                        <div>
                          <div className="text-white font-medium text-sm">{c.name}</div>
                          <div className="text-gray-500 text-xs">{c.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{c.plan}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400 font-black">{c.points.toLocaleString("ar-EG")}</span>
                        <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${Math.min((c.points / 3500) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400 text-xs">{Math.floor(c.points / 10)} ج.م</td>
                    <td className="py-3 px-4">
                      <button onClick={() => { setAdjustModal({ customer: c, mode: "points" }); setAdjustValue(0); }} className="text-yellow-500 hover:text-yellow-400 text-xs font-bold transition-colors">تعديل النقاط</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Balance tab */}
      {tab === "balance" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-white font-black">أرصدة الأعضاء</h3>
              <p className="text-gray-500 text-sm">الرصيد المدفوع مسبقاً بالجنيه المصري</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  {["العضو", "الباقة", "الرصيد الحالي", ""].map((h) => (
                    <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedByBalance.map((c) => (
                  <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-red-700 flex items-center justify-center text-white font-black text-sm">{c.avatar}</div>
                        <div>
                          <div className="text-white font-medium">{c.name}</div>
                          <div className="text-gray-500 text-xs">{c.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-400">{c.plan}</td>
                    <td className="py-3 px-4">
                      <span className={`font-black text-lg ${c.balance > 0 ? "text-blue-400" : "text-gray-600"}`}>
                        {c.balance.toLocaleString("ar-EG")} ج.م
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setTopupModal(c); setTopupAmount(0); }} className="text-blue-400 hover:text-blue-300 text-xs font-bold transition-colors">شحن رصيد</button>
                        <button onClick={() => { setAdjustModal({ customer: c, mode: "balance" }); setAdjustValue(0); }} className="text-gray-500 hover:text-red-400 text-xs font-bold transition-colors">خصم</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-white font-black">سجل المعاملات</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  {["العضو", "النوع", "النقاط", "المبلغ", "السبب", "التاريخ"].map((h) => (
                    <th key={h} className="text-right py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const cfg = TYPE_CONFIG[tx.type];
                  return (
                    <tr key={tx.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                      <td className="py-3 px-4 text-white font-medium">{tx.customerName}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                      </td>
                      <td className={`py-3 px-4 font-black ${tx.points !== 0 ? cfg.color : "text-gray-700"}`}>
                        {tx.points !== 0 ? `${cfg.sign}${Math.abs(tx.points)}` : "—"}
                      </td>
                      <td className={`py-3 px-4 font-black ${tx.amount !== 0 ? cfg.color : "text-gray-700"}`}>
                        {tx.amount !== 0 ? `${cfg.sign}${Math.abs(tx.amount)} ج.م` : "—"}
                      </td>
                      <td className="py-3 px-4 text-gray-400">{tx.reason}</td>
                      <td className="py-3 px-4 text-gray-500 text-xs">{tx.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust modal */}
      {adjustModal && (
        <Modal title={`تعديل ${adjustModal.mode === "points" ? "النقاط" : "الرصيد"} — ${adjustModal.customer.name}`} onClose={() => setAdjustModal(null)}>
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-gray-400 text-xs mb-1">{adjustModal.mode === "points" ? "النقاط الحالية" : "الرصيد الحالي"}</div>
              <div className="text-yellow-400 font-black text-2xl">
                {adjustModal.mode === "points" ? adjustModal.customer.points.toLocaleString("ar-EG") + " نقطة" : adjustModal.customer.balance.toLocaleString("ar-EG") + " ج.م"}
              </div>
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">نوع التعديل</label>
              <div className="grid grid-cols-2 gap-2">
                {[["add", "إضافة ✅"], ["deduct", "خصم ❌"]].map(([v, l]) => (
                  <button key={v} onClick={() => setAdjustType(v as typeof adjustType)} className={`py-2 rounded-xl text-sm font-bold transition-colors ${adjustType === v ? (v === "add" ? "bg-green-600 text-white" : "bg-red-600 text-white") : "bg-gray-800 text-gray-400"}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">القيمة</label>
              <input type="number" value={adjustValue} onChange={(e) => setAdjustValue(+e.target.value)} className={INPUT} dir="ltr" min={0} />
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">السبب</label>
              <input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="مثال: مكافأة حضور منتظم" className={INPUT} />
            </div>
            <button onClick={doAdjust} className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl transition-colors">✅ تأكيد التعديل</button>
          </div>
        </Modal>
      )}

      {/* Topup modal */}
      {topupModal && (
        <Modal title={`شحن رصيد — ${topupModal.name}`} onClose={() => setTopupModal(null)}>
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-xl p-3 text-center">
              <div className="text-gray-400 text-xs mb-1">الرصيد الحالي</div>
              <div className="text-blue-400 font-black text-2xl">{topupModal.balance.toLocaleString("ar-EG")} ج.م</div>
            </div>
            <div>
              <label className="block text-gray-500 text-xs mb-1.5">مبلغ الشحن (ج.م)</label>
              <div className="flex gap-2 mb-2">
                {[100, 200, 500, 1000].map((v) => (
                  <button key={v} onClick={() => setTopupAmount(v)} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${topupAmount === v ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                    {v}
                  </button>
                ))}
              </div>
              <input type="number" value={topupAmount} onChange={(e) => setTopupAmount(+e.target.value)} className={INPUT} dir="ltr" min={0} />
            </div>
            <button onClick={doTopup} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl transition-colors">💳 شحن الرصيد</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
