"use client";

import { useState, useEffect } from "react";

interface OverviewData {
  totalMembers:    number;
  activeMembers:   number;
  pendingOrders:   number;
  totalClasses:    number;
  totalProducts:   number;
  openComplaints:  number;
  monthlyRevenue:  number;
  monthlyData:     { month: string; revenue: number }[];
  planDistribution: { name: string; count: number }[];
  activity:        { type: string; text: string; time: string }[];
}

const PLAN_BAR_COLORS = ["bg-red-600", "bg-yellow-500", "bg-purple-500", "bg-blue-500", "bg-green-500"];

export default function Overview() {
  const [data, setData]     = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500 text-sm">جارٍ تحميل الإحصائيات...</div>
    </div>
  );
  if (!data) return <div className="text-red-400 text-center py-16">فشل تحميل البيانات</div>;

  const maxRev = Math.max(...data.monthlyData.map(m => m.revenue), 1);

  const stats = [
    { label: "إجمالي الأعضاء",   value: data.totalMembers.toLocaleString("ar-EG"),                      sub: `${data.activeMembers} اشتراك نشط`,     color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", icon: "👥" },
    { label: "الإيراد الشهري",    value: data.monthlyRevenue.toLocaleString("ar-EG") + " ج.م",             sub: "هذا الشهر",                              color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/20",  icon: "💰" },
    { label: "طلبات معلقة",       value: data.pendingOrders.toString(),                                   sub: "تحتاج مراجعة",                           color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/20",    icon: "📦" },
    { label: "شكاوى مفتوحة",     value: data.openComplaints.toString(),                                  sub: `${data.totalClasses} كلاس | ${data.totalProducts} منتج`, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", icon: "📩" },
  ];

  const totalMembers = data.planDistribution.reduce((s, p) => s + p.count, 0) || 1;

  const activityIcons: Record<string, string> = { member: "✅", order: "📦", complaint: "📩" };

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-5`}>
            <div className="text-2xl mb-3">{s.icon}</div>
            <div className={`text-2xl font-black ${s.color} mb-1`}>{s.value}</div>
            <div className="text-white text-sm font-bold mb-0.5">{s.label}</div>
            <div className="text-gray-500 text-xs">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-black mb-1">الإيراد — آخر 6 أشهر</h3>
          <p className="text-gray-500 text-xs mb-6">بالجنيه المصري</p>
          <div className="flex items-end gap-2 h-36">
            {data.monthlyData.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-t-md transition-all ${i === data.monthlyData.length - 1 ? "bg-red-600" : "bg-gray-700 hover:bg-yellow-500/60"}`}
                  style={{ height: `${(m.revenue / maxRev) * 100}%`, minHeight: m.revenue > 0 ? "4px" : "0" }}
                  title={`${m.month}: ${m.revenue.toLocaleString("ar-EG")} ج.م`}
                />
                <span className="text-gray-600 text-[9px]">{m.month.slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-gray-300"><span className="w-3 h-3 rounded-sm bg-red-600 inline-block" /> الشهر الحالي</span>
            <span className="flex items-center gap-1.5 text-gray-500"><span className="w-3 h-3 rounded-sm bg-gray-700 inline-block" /> شهور سابقة</span>
          </div>
        </div>

        {/* Plan distribution */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-white font-black mb-4">توزيع الباقات</h3>
          <div className="space-y-4">
            {data.planDistribution.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-4">لا توجد اشتراكات بعد</p>
            ) : data.planDistribution.map((plan, i) => {
              const pct = Math.round((plan.count / totalMembers) * 100);
              return (
                <div key={plan.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white">{plan.name}</span>
                    <span className="text-gray-400">{plan.count} ({pct}%)</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${PLAN_BAR_COLORS[i % PLAN_BAR_COLORS.length]}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 text-center">
            <div className="text-2xl font-black text-white">{data.activeMembers}</div>
            <div className="text-gray-500 text-xs">اشتراكات نشطة</div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-white font-black mb-4">آخر النشاطات</h3>
        {data.activity.length === 0 ? (
          <p className="text-gray-600 text-sm text-center py-4">لا يوجد نشاط بعد</p>
        ) : (
          <div className="space-y-3">
            {data.activity.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-800/60 last:border-0">
                <span className="text-lg">{activityIcons[a.type] ?? "•"}</span>
                <div className="flex-1">
                  <p className="text-gray-300 text-sm">{a.text}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{new Date(a.time).toLocaleDateString("ar-EG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
