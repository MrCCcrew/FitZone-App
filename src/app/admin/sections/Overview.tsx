"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

interface OverviewData {
  totalMembers: number;
  activeMembers: number;
  pendingOrders: number;
  totalClasses: number;
  totalProducts: number;
  openComplaints: number;
  monthlyRevenue: number;
  monthlyData: { month: string; revenue: number }[];
  planDistribution: { name: string; count: number }[];
  activity: { type: string; text: string; time: string }[];
}

const PLAN_BAR_COLORS = [
  "bg-[#ff4f93]",
  "bg-[#f8b94d]",
  "bg-[#8b5cf6]",
  "bg-[#3b82f6]",
  "bg-[#22c55e]",
];

const ACTIVITY_ICONS: Record<string, string> = {
  member: "✅",
  order: "📦",
  complaint: "📝",
};

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const response = await fetch("/api/admin/overview", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) {
          setData(payload);
        }
      } catch {
        if (!cancelled) {
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data) return [];

    return [
      {
        label: "إجمالي الأعضاء",
        value: data.totalMembers.toLocaleString("ar-EG"),
        sub: `${data.activeMembers.toLocaleString("ar-EG")} اشتراك نشط`,
        accent: "text-[#ffd166]",
        icon: "👥",
      },
      {
        label: "الإيراد الشهري",
        value: `${data.monthlyRevenue.toLocaleString("ar-EG")} ج.م`,
        sub: "إجمالي هذا الشهر",
        accent: "text-[#4ade80]",
        icon: "💰",
      },
      {
        label: "طلبات تحتاج متابعة",
        value: data.pendingOrders.toLocaleString("ar-EG"),
        sub: "طلبات لم تُؤكد بعد",
        accent: "text-[#fb7185]",
        icon: "📦",
      },
      {
        label: "شكاوى مفتوحة",
        value: data.openComplaints.toLocaleString("ar-EG"),
        sub: `${data.totalClasses.toLocaleString("ar-EG")} كلاس | ${data.totalProducts.toLocaleString("ar-EG")} منتج`,
        accent: "text-[#c084fc]",
        icon: "📝",
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <AdminSectionShell title="نظرة عامة" subtitle="ملخص سريع لأهم المؤشرات داخل النظام.">
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جارٍ تحميل بيانات لوحة التحكم...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  if (!data) {
    return (
      <AdminSectionShell title="نظرة عامة" subtitle="ملخص سريع لأهم المؤشرات داخل النظام.">
        <AdminCard>
          <AdminEmptyState
            title="تعذر تحميل البيانات"
            description="حدثت مشكلة أثناء تحميل إحصاءات لوحة التحكم. حاول تحديث الصفحة أو المحاولة بعد قليل."
          />
        </AdminCard>
      </AdminSectionShell>
    );
  }

  const maxRevenue = Math.max(...data.monthlyData.map((item) => item.revenue), 1);
  const totalPlanMembers = data.planDistribution.reduce((sum, plan) => sum + plan.count, 0) || 1;

  return (
    <AdminSectionShell
      title="نظرة عامة"
      subtitle="تابع الأعضاء والإيرادات والنشاط الأخير من مكان واحد."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <AdminCard key={stat.label}>
            <div className="text-2xl">{stat.icon}</div>
            <div className={`mt-3 text-2xl font-black ${stat.accent}`}>{stat.value}</div>
            <div className="mt-1 text-sm font-bold text-[#fff4f8]">{stat.label}</div>
            <div className="mt-1 text-xs text-[#d7aabd]">{stat.sub}</div>
          </AdminCard>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.75fr,1fr]">
        <AdminCard>
          <div className="mb-5">
            <h3 className="text-lg font-black text-[#fff4f8]">الإيراد خلال آخر 6 أشهر</h3>
            <p className="mt-1 text-xs text-[#d7aabd]">عرض بصري لتطور الدخل الشهري بالجنيه المصري.</p>
          </div>

          <div className="flex h-44 items-end gap-2">
            {data.monthlyData.map((item, index) => {
              const isCurrent = index === data.monthlyData.length - 1;
              const height = `${Math.max((item.revenue / maxRevenue) * 100, item.revenue > 0 ? 8 : 0)}%`;

              return (
                <div key={`${item.month}-${index}`} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-2xl transition-all ${
                      isCurrent ? "bg-[#ff4f93]" : "bg-white/15 hover:bg-[#ff97bf]/60"
                    }`}
                    style={{ height }}
                    title={`${item.month}: ${item.revenue.toLocaleString("ar-EG")} ج.م`}
                  />
                  <span className="text-[10px] text-[#d7aabd]">{item.month.slice(0, 3)}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-xs">
            <span className="flex items-center gap-2 text-[#fff4f8]">
              <span className="h-3 w-3 rounded-sm bg-[#ff4f93]" />
              الشهر الحالي
            </span>
            <span className="flex items-center gap-2 text-[#d7aabd]">
              <span className="h-3 w-3 rounded-sm bg-white/15" />
              الأشهر السابقة
            </span>
          </div>
        </AdminCard>

        <AdminCard>
          <div className="mb-5">
            <h3 className="text-lg font-black text-[#fff4f8]">توزيع الباقات</h3>
            <p className="mt-1 text-xs text-[#d7aabd]">نسبة كل باقة من إجمالي الاشتراكات النشطة.</p>
          </div>

          {data.planDistribution.length === 0 ? (
            <AdminEmptyState
              title="لا توجد اشتراكات بعد"
              description="عند بدء الاشتراكات سيظهر هنا توزيع الباقات وعدد المشتركات في كل باقة."
            />
          ) : (
            <div className="space-y-4">
              {data.planDistribution.map((plan, index) => {
                const percent = Math.round((plan.count / totalPlanMembers) * 100);

                return (
                  <div key={plan.name} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-bold text-[#fff4f8]">{plan.name}</span>
                      <span className="text-[#d7aabd]">
                        {plan.count.toLocaleString("ar-EG")} ({percent}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${PLAN_BAR_COLORS[index % PLAN_BAR_COLORS.length]}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              <div className="mt-5 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-4 text-center">
                <div className="text-2xl font-black text-[#fff4f8]">
                  {data.activeMembers.toLocaleString("ar-EG")}
                </div>
                <div className="mt-1 text-xs text-[#d7aabd]">اشتراكات نشطة حاليًا</div>
              </div>
            </div>
          )}
        </AdminCard>
      </div>

      <AdminCard>
        <div className="mb-5">
          <h3 className="text-lg font-black text-[#fff4f8]">آخر الأنشطة</h3>
          <p className="mt-1 text-xs text-[#d7aabd]">أحدث العمليات التي تمت داخل المنصة.</p>
        </div>

        {data.activity.length === 0 ? (
          <AdminEmptyState
            title="لا يوجد نشاط حديث"
            description="عند حدوث عمليات جديدة مثل اشتراكات أو طلبات أو شكاوى ستظهر هنا مباشرة."
          />
        ) : (
          <div className="space-y-3">
            {data.activity.map((activity, index) => (
              <div
                key={`${activity.time}-${index}`}
                className="flex items-start gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/10 px-4 py-3"
              >
                <div className="text-lg">{ACTIVITY_ICONS[activity.type] ?? "•"}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-7 text-[#fff4f8]">{activity.text}</div>
                  <div className="mt-1 text-xs text-[#d7aabd]">
                    {new Date(activity.time).toLocaleDateString("ar-EG", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSectionShell>
  );
}
