"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

type ActionCenterItem = {
  id: string;
  type: string;
  status: "pending";
  sourceSection: string;
  sourceLabel: string;
  requesterType: string;
  requesterId: string | null;
  requesterName: string;
  title: string;
  description: string;
  createdAt: string;
  priority: "normal" | "high";
  actionSection: string;
  targetType: string;
  targetId: string;
};

type ActionCenterResponse = {
  pendingCount: number;
  items: ActionCenterItem[];
};

const REQUESTER_LABELS: Record<string, string> = {
  customer: "عميل",
  partner: "شريك",
  trainer: "مدربة",
  staff: "موظف",
  nutritionist: "دكتورة تغذية",
  system: "النظام",
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function Approvals() {
  const [data, setData] = useState<ActionCenterResponse>({
    pendingCount: 0,
    items: [],
  });
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/action-center", {
        cache: "no-store",
      });

      const payload = (await response.json().catch(() => ({
        pendingCount: 0,
        items: [],
      }))) as ActionCenterResponse;

      if (!response.ok) {
        setData({
          pendingCount: 0,
          items: [],
        });
        return;
      }

      setData({
        pendingCount:
          typeof payload.pendingCount === "number"
            ? payload.pendingCount
            : 0,
        items: Array.isArray(payload.items)
          ? payload.items
          : [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sources = useMemo(() => {
    return Array.from(
      new Map(
        data.items.map((item) => [
          item.sourceSection,
          item.sourceLabel,
        ]),
      ).entries(),
    );
  }, [data.items]);

  const visibleItems =
    sourceFilter === "all"
      ? data.items
      : data.items.filter(
          (item) => item.sourceSection === sourceFilter,
        );

  const openRequest = (item: ActionCenterItem) => {
    window.dispatchEvent(
      new CustomEvent("fitzone-admin-navigate", {
        detail: {
          section: item.actionSection,
        },
      }),
    );
  };

  return (
    <AdminSectionShell
      title="الطلبات والموافقات"
      subtitle="كل ما يحتاج مراجعة أو قرارًا إداريًا في مكان واحد."
      actions={
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl bg-white/10 px-4 py-2 text-xs font-black text-[#fff4f8] transition hover:bg-white/20 disabled:opacity-50"
        >
          {loading ? "جارٍ التحديث..." : "تحديث"}
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminCard>
          <div className="text-xs font-bold text-[#d7aabd]">
            في انتظار إجراء
          </div>
          <div className="mt-2 text-3xl font-black text-amber-300">
            {data.pendingCount}
          </div>
        </AdminCard>

        <AdminCard>
          <div className="text-xs font-bold text-[#d7aabd]">
            الأقسام الظاهرة لك
          </div>
          <div className="mt-2 text-3xl font-black text-[#fff4f8]">
            {sources.length}
          </div>
        </AdminCard>

        <AdminCard>
          <div className="text-xs font-bold text-[#d7aabd]">
            العرض الحالي
          </div>
          <div className="mt-2 text-3xl font-black text-pink-300">
            {visibleItems.length}
          </div>
        </AdminCard>
      </div>

      {sources.length > 1 && (
        <AdminCard>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSourceFilter("all")}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                sourceFilter === "all"
                  ? "bg-pink-600 text-white"
                  : "bg-white/5 text-[#d7aabd] hover:bg-white/10"
              }`}
            >
              الكل
            </button>

            {sources.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSourceFilter(key)}
                className={`rounded-xl px-4 py-2 text-xs font-black transition ${
                  sourceFilter === key
                    ? "bg-pink-600 text-white"
                    : "bg-white/5 text-[#d7aabd] hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </AdminCard>
      )}

      <AdminCard>
        {loading ? (
          <div className="py-14 text-center text-sm text-[#d7aabd]">
            جارٍ تحميل الطلبات...
          </div>
        ) : visibleItems.length === 0 ? (
          <AdminEmptyState
            title="لا توجد طلبات معلقة"
            description="لا يوجد حاليًا أي طلب يحتاج إجراءً منك."
          />
        ) : (
          <div className="space-y-3">
            {visibleItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-[rgba(255,188,219,0.14)] bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-pink-500/15 px-2.5 py-1 text-[11px] font-black text-pink-200">
                        {item.sourceLabel}
                      </span>

                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-200">
                        يحتاج إجراء
                      </span>
                    </div>

                    <div className="mt-3 text-base font-black text-[#fff4f8]">
                      {item.title}
                    </div>

                    <div className="mt-1 text-sm text-[#d7aabd]">
                      من:{" "}
                      <span className="font-bold text-white">
                        {item.requesterName}
                      </span>{" "}
                      •{" "}
                      {REQUESTER_LABELS[item.requesterType] ??
                        item.requesterType}
                    </div>

                    <div className="mt-2 text-sm text-[#d7aabd]">
                      {item.description}
                    </div>

                    <div className="mt-2 text-[11px] text-[#b98ea0]">
                      {formatDateTime(item.createdAt)}
                      {" • "}
                      {item.targetType}: {item.targetId}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openRequest(item)}
                    className="rounded-xl bg-[#ff4f93] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#ff2f7d]"
                  >
                    فتح الطلب
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </AdminSectionShell>
  );
}
