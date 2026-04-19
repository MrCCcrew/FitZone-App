"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeliveryOption } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";
import { TranslateButton } from "./TranslateButton";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const EMPTY_OPTION: Omit<DeliveryOption, "id"> = {
  name: "",
  nameEn: "",
  type: "courier",
  description: "",
  descriptionEn: "",
  fee: 0,
  estimatedDaysMin: 1,
  estimatedDaysMax: 2,
  active: true,
  showCashOnDelivery: false,
  sortOrder: 0,
};

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
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-[rgba(255,188,219,0.16)] bg-[rgba(56,18,34,0.94)] p-6 shadow-[0_24px_70px_rgba(17,5,10,0.38)]"
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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <div>
        <div className="text-sm font-bold text-[#fff4f8]">{label}</div>
        {hint ? <div className="mt-1 text-xs leading-6 text-[#d7aabd]">{hint}</div> : null}
      </div>
      {children}
    </label>
  );
}

export default function DeliveryOptions() {
  const [options, setOptions] = useState<DeliveryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<DeliveryOption | Omit<DeliveryOption, "id"> | null>(null);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/delivery-options", { cache: "no-store" });
      const payload = await response.json();
      setOptions(Array.isArray(payload) ? payload : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const saveOption = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const isEdit = "id" in modal;
      const response = await fetch("/api/admin/delivery-options", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(payload?.error ?? "تعذر حفظ وسيلة التوصيل.");
        return;
      }

      await loadOptions();
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const deleteOption = async (id: string) => {
    if (!window.confirm("هل تريد حذف وسيلة التوصيل؟")) return;
    const response = await fetch("/api/admin/delivery-options", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر حذف وسيلة التوصيل.");
      return;
    }
    await loadOptions();
  };

  const toggleOption = async (option: DeliveryOption) => {
    const response = await fetch("/api/admin/delivery-options", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: option.id, active: !option.active }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      window.alert(payload?.error ?? "تعذر تحديث حالة وسيلة التوصيل.");
      return;
    }
    await loadOptions();
  };

  const stats = useMemo(
    () => [
      {
        label: "وسائل توصيل نشطة",
        value: options.filter((option) => option.active).length.toLocaleString("ar-EG"),
      },
      {
        label: "وسائل توصيل إجمالية",
        value: options.length.toLocaleString("ar-EG"),
      },
    ],
    [options],
  );

  return (
    <AdminSectionShell
      title="شركات التوصيل"
      subtitle="أضف شركات التوصيل أو خيارات الاستلام من النادي وحدد رسوم التوصيل والمدة المتوقعة."
      actions={
        <button
          onClick={() => setModal({ ...EMPTY_OPTION })}
          className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
        >
          + وسيلة توصيل
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <AdminCard key={stat.label}>
            <div className="text-2xl font-black text-[#fff4f8]">{stat.value}</div>
            <div className="mt-1 text-sm text-[#d7aabd]">{stat.label}</div>
          </AdminCard>
        ))}
      </div>

      {loading ? (
        <AdminCard className="flex h-48 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل وسائل التوصيل...</div>
        </AdminCard>
      ) : options.length === 0 ? (
        <AdminEmptyState title="لا توجد وسائل توصيل" description="أضف وسيلة توصيل أو خيار الاستلام من النادي." />
      ) : (
        <AdminCard className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[rgba(255,188,219,0.14)] px-5 py-4">
            <div className="text-sm text-[#d7aabd]">{options.length.toLocaleString("ar-EG")} وسيلة</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-[rgba(255,188,219,0.12)] text-right text-xs text-[#d7aabd]">
                  {["الاسم", "النوع", "الرسوم", "المدة", "الدفع عند الاستلام", "الحالة", "الإجراءات"].map((header) => (
                    <th key={header} className="px-5 py-4 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {options.map((option) => (
                  <tr
                    key={option.id}
                    className="border-b border-[rgba(255,188,219,0.08)] transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#fff4f8]">{option.name}</div>
                      {option.nameEn ? <div className="text-xs text-[#d7aabd]">{option.nameEn}</div> : null}
                      <div className="text-xs text-[#d7aabd]">{option.description || "بدون وصف إضافي"}</div>
                    </td>
                    <td className="px-5 py-4 text-[#d7aabd]">
                      {option.type === "pickup" ? "استلام من النادي" : "شركة توصيل"}
                    </td>
                    <td className="px-5 py-4 font-bold text-[#ffd166]">{option.fee.toLocaleString("ar-EG")} ج.م</td>
                    <td className="px-5 py-4 text-[#d7aabd]">
                      {option.estimatedDaysMin != null || option.estimatedDaysMax != null
                        ? `${option.estimatedDaysMin ?? "-"} - ${option.estimatedDaysMax ?? "-"} يوم`
                        : "غير محدد"}
                    </td>
                    <td className="px-5 py-4 text-[#d7aabd]">
                      {option.showCashOnDelivery ? "مسموح" : "غير مسموح"}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => void toggleOption(option)}
                        className={`relative h-5 w-10 rounded-full transition-colors ${option.active ? "bg-emerald-500" : "bg-white/15"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                            option.active ? "right-0.5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setModal(option)}
                          className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => void deleteOption(option.id)}
                          className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
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
        </AdminCard>
      )}

      {modal ? (
        <Modal title={"id" in modal ? "تعديل وسيلة التوصيل" : "إضافة وسيلة توصيل"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="اسم وسيلة التوصيل">
              <input
                value={modal.name}
                onChange={(event) => setModal({ ...modal, name: event.target.value })}
                className={INPUT}
              />
            </Field>

            <Field label="اسم وسيلة التوصيل بالإنجليزية">
              <div className="flex gap-2">
                <input
                  value={modal.nameEn ?? ""}
                  onChange={(event) => setModal({ ...modal, nameEn: event.target.value })}
                  className={`${INPUT} flex-1`}
                  dir="ltr"
                />
                <TranslateButton from={modal.name} onTranslated={(t) => setModal({ ...modal, nameEn: t })} />
              </div>
            </Field>

            <Field label="نوع التوصيل">
              <select
                value={modal.type}
                onChange={(event) => {
                  const type = event.target.value as DeliveryOption["type"];
                  setModal({ ...modal, type, showCashOnDelivery: type === "pickup" ? modal.showCashOnDelivery : false });
                }}
                className={INPUT}
              >
                <option value="courier">شركة توصيل</option>
                <option value="pickup">استلام من النادي</option>
              </select>
            </Field>

            <Field label="وصف مختصر">
              <textarea
                value={modal.description ?? ""}
                onChange={(event) => setModal({ ...modal, description: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
              />
            </Field>

            <Field label="وصف مختصر بالإنجليزية">
              <div className="space-y-1">
                <textarea
                  value={modal.descriptionEn ?? ""}
                  onChange={(event) => setModal({ ...modal, descriptionEn: event.target.value })}
                  className={`${INPUT} min-h-24 resize-y`}
                  dir="ltr"
                />
                <TranslateButton from={modal.description ?? ""} onTranslated={(t) => setModal({ ...modal, descriptionEn: t })} />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="رسوم التوصيل">
                <input
                  type="number"
                  value={modal.fee}
                  onChange={(event) => setModal({ ...modal, fee: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="ترتيب الظهور">
                <input
                  type="number"
                  value={modal.sortOrder}
                  onChange={(event) => setModal({ ...modal, sortOrder: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="أقل مدة توصيل (أيام)">
                <input
                  type="number"
                  value={modal.estimatedDaysMin ?? ""}
                  onChange={(event) => setModal({ ...modal, estimatedDaysMin: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
              <Field label="أقصى مدة توصيل (أيام)">
                <input
                  type="number"
                  value={modal.estimatedDaysMax ?? ""}
                  onChange={(event) => setModal({ ...modal, estimatedDaysMax: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.active}
                  onChange={(event) => setModal({ ...modal, active: event.target.checked })}
                />
                تفعيل وسيلة التوصيل
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                <input
                  type="checkbox"
                  checked={modal.showCashOnDelivery}
                  disabled={modal.type !== "pickup"}
                  onChange={(event) => setModal({ ...modal, showCashOnDelivery: event.target.checked })}
                />
                إظهار الدفع عند الاستلام (يظهر فقط مع الاستلام من النادي)
              </label>
            </div>

            <button
              onClick={() => void saveOption()}
              disabled={saving}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جاري حفظ وسيلة التوصيل..." : "حفظ وسيلة التوصيل"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
