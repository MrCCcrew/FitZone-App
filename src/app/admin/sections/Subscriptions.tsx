"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Offer, Plan } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const EMPTY_PLAN: Omit<Plan, "id" | "membersCount"> = {
  name: "",
  price: 0,
  duration: "monthly",
  features: [],
  active: true,
};

const EMPTY_OFFER: Omit<Offer, "id" | "usedCount" | "currentSubscribers"> = {
  title: "",
  discount: 0,
  type: "special",
  appliesTo: "",
  membershipId: null,
  validUntil: "",
  active: true,
  description: "",
  specialPrice: 0,
  maxSubscribers: 50,
  image: "",
  showOnHome: true,
};

const DURATION_LABELS: Record<Plan["duration"], string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  annual: "سنوي",
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

export default function Subscriptions() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [planModal, setPlanModal] = useState<Plan | typeof EMPTY_PLAN | null>(null);
  const [offerModal, setOfferModal] = useState<Offer | typeof EMPTY_OFFER | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansResponse, offersResponse] = await Promise.all([
        fetch("/api/admin/memberships", { cache: "no-store" }),
        fetch("/api/admin/offers", { cache: "no-store" }),
      ]);

      const plansPayload = await plansResponse.json();
      const offersPayload = await offersResponse.json();
      setPlans(Array.isArray(plansPayload) ? plansPayload : []);
      setOffers(Array.isArray(offersPayload) ? offersPayload : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const planOptions = useMemo(
    () => plans.map((plan) => ({ id: plan.id, label: `${plan.name} - ${plan.price.toLocaleString("ar-EG")} ج.م` })),
    [plans],
  );

  const addFeature = () => {
    if (!planModal || !featureInput.trim()) return;
    setPlanModal({
      ...planModal,
      features: [...(planModal.features ?? []), featureInput.trim()],
    });
    setFeatureInput("");
  };

  const savePlan = async () => {
    if (!planModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in planModal && Boolean(planModal.id);
      const response = await fetch("/api/admin/memberships", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planModal),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر حفظ الباقة.");
        return;
      }

      await loadData();
      setPlanModal(null);
      setFeatureInput("");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذه الباقة؟")) return;

    const response = await fetch("/api/admin/memberships", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر حذف الباقة.");
      return;
    }

    await loadData();
  };

  const togglePlan = async (id: string, active: boolean) => {
    const response = await fetch("/api/admin/memberships", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر تحديث حالة الباقة.");
      return;
    }

    await loadData();
  };

  const saveOffer = async () => {
    if (!offerModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in offerModal && Boolean(offerModal.id);
      const response = await fetch("/api/admin/offers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offerModal),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        window.alert(payload?.error ?? "تعذر حفظ العرض حاليًا.");
        return;
      }

      await loadData();
      setOfferModal(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleOffer = async (id: string, active: boolean) => {
    const response = await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر تحديث حالة العرض.");
      return;
    }

    await loadData();
  };

  const deleteOffer = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا العرض؟")) return;

    const response = await fetch("/api/admin/offers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر حذف العرض.");
      return;
    }

    await loadData();
  };

  const uploadOfferImage = async (file: File) => {
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        window.alert(payload?.error ?? "تعذر رفع صورة العرض.");
        return;
      }

      setOfferModal((current) => (current ? { ...current, image: payload.url } : current));
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <AdminSectionShell title="الاشتراكات والعروض" subtitle="إدارة الباقات والعروض الخاصة والخصومات.">
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جارٍ تحميل الباقات والعروض...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell title="الاشتراكات والعروض" subtitle="أنشئ باقات العضوية والعروض الخاصة وخصص ظهورها في الصفحة الرئيسية.">
      <AdminCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">باقات الاشتراك</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              {plans.length.toLocaleString("ar-EG")} باقات - {plans.filter((plan) => plan.active).length.toLocaleString("ar-EG")} باقات نشطة
            </p>
          </div>
          <button
            onClick={() => setPlanModal(EMPTY_PLAN)}
            className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
          >
            + إضافة باقة
          </button>
        </div>

        {plans.length === 0 ? (
          <AdminEmptyState
            title="لا توجد باقات بعد"
            description="ابدأ بإضافة أول باقة اشتراك لتظهر في صفحة النادي وفي شاشة الإدارة."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-[24px] border p-5 ${
                  plan.active
                    ? "border-[rgba(255,188,219,0.16)] bg-black/15"
                    : "border-[rgba(255,188,219,0.08)] bg-black/10 opacity-65"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[#fff4f8]">{plan.name}</div>
                    <div className="mt-1 text-xs text-[#d7aabd]">{DURATION_LABELS[plan.duration]}</div>
                  </div>
                  <button
                    onClick={() => void togglePlan(plan.id, plan.active)}
                    className={`relative h-5 w-10 rounded-full transition-colors ${plan.active ? "bg-[#ff4f93]" : "bg-white/15"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                        plan.active ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                <div className="text-2xl font-black text-[#ffd166]">{plan.price.toLocaleString("ar-EG")}</div>
                <div className="text-xs text-[#d7aabd]">ج.م</div>
                <div className="mt-3 text-xs text-[#d7aabd]">{plan.membersCount.toLocaleString("ar-EG")} مشتركة نشطة</div>

                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, index) => (
                    <li key={`${plan.id}-${index}`} className="flex items-start gap-2 text-xs text-[#fff4f8]">
                      <span className="mt-0.5 text-[#ff97bf]">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => setPlanModal(plan)}
                    className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => void deletePlan(plan.id)}
                    className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">العروض والخصومات</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              {offers.filter((offer) => offer.active).length.toLocaleString("ar-EG")} عروض نشطة -{" "}
              {offers.filter((offer) => offer.type === "special").length.toLocaleString("ar-EG")} عروض خاصة
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setOfferModal({ ...EMPTY_OFFER, type: "percentage", title: "", discount: 10, validUntil: "" })}
              className="rounded-xl bg-[#ffd166] px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-[#ffcc55]"
            >
              + إضافة عرض عادي
            </button>
            <button
              onClick={() => setOfferModal({ ...EMPTY_OFFER, type: "special", title: "عرض خاص", validUntil: "" })}
              className="rounded-xl bg-[#c026d3] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#d946ef]"
            >
              + إضافة عرض خاص
            </button>
          </div>
        </div>

        {offers.length === 0 ? (
          <AdminEmptyState
            title="لا توجد عروض بعد"
            description="أضف عرضًا عاديًا أو عرضًا خاصًا مع صورة ومدة وعدد مشتركين ليظهر للعميل بشكل مميز."
          />
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const currentSubscribers = offer.currentSubscribers ?? 0;
              const remaining =
                offer.maxSubscribers != null ? Math.max(offer.maxSubscribers - currentSubscribers, 0) : null;

              return (
                <div
                  key={offer.id}
                  className="rounded-[24px] border border-[rgba(255,188,219,0.14)] bg-black/15 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex flex-1 gap-4">
                      {offer.image ? (
                        <img
                          src={offer.image}
                          alt={offer.title}
                          className="h-24 w-24 rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-[rgba(255,188,219,0.18)] bg-white/5 text-xs text-[#d7aabd]">
                          بدون صورة
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-black text-[#fff4f8]">{offer.title}</h4>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-bold ${
                              offer.type === "special"
                                ? "bg-fuchsia-500/15 text-fuchsia-300"
                                : offer.type === "fixed"
                                  ? "bg-[#ffd166]/15 text-[#ffd166]"
                                  : "bg-[#8bc5ff]/15 text-[#8bc5ff]"
                            }`}
                          >
                            {offer.type === "special"
                              ? "عرض خاص"
                              : offer.type === "fixed"
                                ? "خصم بمبلغ ثابت"
                                : "خصم بنسبة"}
                          </span>
                          {offer.showOnHome ? (
                            <span className="rounded-full bg-[#ff4f93]/15 px-3 py-1 text-xs font-bold text-[#ff97bf]">
                              يظهر في الصفحة الرئيسية
                            </span>
                          ) : null}
                        </div>

                        <p className="text-sm leading-7 text-[#d7aabd]">{offer.description || offer.appliesTo || "بدون وصف إضافي"}</p>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#d7aabd]">
                          <span>ينتهي: {new Date(offer.validUntil).toLocaleString("ar-EG")}</span>
                          {offer.type === "special" ? (
                            <>
                              <span>السعر الخاص: {Number(offer.specialPrice || 0).toLocaleString("ar-EG")} ج.م</span>
                              <span>المشتركات الحاليّات: {currentSubscribers.toLocaleString("ar-EG")}</span>
                              {offer.maxSubscribers != null ? (
                                <span>المتبقي: {remaining?.toLocaleString("ar-EG")}</span>
                              ) : null}
                              <span>
                                الباقة: {offer.membershipId ? planOptions.find((plan) => plan.id === offer.membershipId)?.label ?? "مرتبطة بباقة" : "غير مرتبطة بباقة"}
                              </span>
                            </>
                          ) : (
                            <span>
                              قيمة الخصم: {offer.type === "percentage" ? `${offer.discount}%` : `${offer.discount} ج.م`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => void toggleOffer(offer.id, offer.active)}
                        className={`relative h-5 w-10 rounded-full transition-colors ${offer.active ? "bg-emerald-500" : "bg-white/15"}`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                            offer.active ? "right-0.5" : "left-0.5"
                          }`}
                        />
                      </button>
                      <button
                        onClick={() => setOfferModal(offer)}
                        className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-[#fff4f8] transition-colors hover:bg-white/10"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => void deleteOffer(offer.id)}
                        className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/20"
                      >
                        حذف
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {planModal ? (
        <Modal title={"id" in planModal && planModal.id ? "تعديل الباقة" : "إضافة باقة"} onClose={() => {
          setPlanModal(null);
          setFeatureInput("");
        }}>
          <div className="space-y-4">
            <Field label="اسم الباقة">
              <input
                value={planModal.name}
                onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })}
                className={INPUT}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="السعر">
                <input
                  type="number"
                  value={planModal.price}
                  onChange={(event) => setPlanModal({ ...planModal, price: Number(event.target.value) })}
                  className={INPUT}
                  dir="ltr"
                />
              </Field>

              <Field label="المدة">
                <select
                  value={planModal.duration}
                  onChange={(event) => setPlanModal({ ...planModal, duration: event.target.value as Plan["duration"] })}
                  className={INPUT}
                >
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="annual">سنوي</option>
                </select>
              </Field>
            </div>

            <Field label="مميزات الباقة" hint="أضف كل ميزة ثم اضغط زر الإضافة لتظهر ضمن قائمة الباقة.">
              <div className="mb-3 flex gap-2">
                <input
                  value={featureInput}
                  onChange={(event) => setFeatureInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addFeature();
                    }
                  }}
                  placeholder="مثال: متابعة شهرية مع المدربة"
                  className={INPUT}
                />
                <button
                  type="button"
                  onClick={addFeature}
                  className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                >
                  +
                </button>
              </div>

              <div className="space-y-2">
                {(planModal.features ?? []).map((feature, index) => (
                  <div
                    key={`${feature}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3"
                  >
                    <span className="text-[#ff97bf]">✓</span>
                    <span className="flex-1 text-sm text-[#fff4f8]">{feature}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPlanModal({
                          ...planModal,
                          features: planModal.features.filter((_, currentIndex) => currentIndex !== index),
                        })
                      }
                      className="text-[#d7aabd] transition-colors hover:text-rose-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </Field>

            <button
              onClick={() => void savePlan()}
              disabled={saving}
              className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50"
            >
              {saving ? "جارٍ حفظ الباقة..." : "حفظ الباقة"}
            </button>
          </div>
        </Modal>
      ) : null}

      {offerModal ? (
        <Modal
          title={
            "id" in offerModal && offerModal.id
              ? "تعديل العرض"
              : offerModal.type === "special"
                ? "إضافة عرض خاص"
                : "إضافة عرض عادي"
          }
          onClose={() => setOfferModal(null)}
        >
          <div className="space-y-4">
            <Field label="نوع العرض">
              <select
                value={offerModal.type}
                onChange={(event) => setOfferModal({ ...offerModal, type: event.target.value as Offer["type"] })}
                className={INPUT}
              >
                <option value="special">عرض خاص</option>
                <option value="percentage">خصم بنسبة</option>
                <option value="fixed">خصم بمبلغ ثابت</option>
              </select>
            </Field>

            <Field label="عنوان العرض">
              <input
                value={offerModal.title}
                onChange={(event) => setOfferModal({ ...offerModal, title: event.target.value })}
                className={INPUT}
                placeholder="مثال: عرض الصيف"
              />
            </Field>

            <Field label="وصف مختصر" hint="يظهر هذا النص للعميل داخل الصفحة الرئيسية وصفحة الاشتراكات إن فُعّل العرض هناك.">
              <textarea
                value={offerModal.description ?? ""}
                onChange={(event) => setOfferModal({ ...offerModal, description: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
                placeholder="صف العرض بشكل مختصر ومقنع."
              />
            </Field>

            {offerModal.type === "special" ? (
              <>
                <Field label="الباقة المرتبطة" hint="اختياري. يمكنك تركه فارغًا لو كان العرض الخاص غير مرتبط بباقة محددة.">
                  <select
                    value={offerModal.membershipId ?? ""}
                    onChange={(event) => {
                      const selected = plans.find((plan) => plan.id === event.target.value);
                      setOfferModal({
                        ...offerModal,
                        membershipId: event.target.value || null,
                        appliesTo: selected?.name ?? "",
                      });
                    }}
                    className={INPUT}
                  >
                    <option value="">غير مرتبط بباقة</option>
                    {planOptions.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="قيمة الاشتراك الخاصة">
                    <input
                      type="number"
                      value={offerModal.specialPrice ?? 0}
                      onChange={(event) => setOfferModal({ ...offerModal, specialPrice: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                  <Field label="الحد الأقصى للمشتركين">
                    <input
                      type="number"
                      value={offerModal.maxSubscribers ?? 0}
                      onChange={(event) => setOfferModal({ ...offerModal, maxSubscribers: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                </div>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="قيمة الخصم">
                  <input
                    type="number"
                    value={offerModal.discount}
                    onChange={(event) => setOfferModal({ ...offerModal, discount: Number(event.target.value) })}
                    className={INPUT}
                    dir="ltr"
                  />
                </Field>
                <Field label="ينطبق على">
                  <input
                    value={offerModal.appliesTo}
                    onChange={(event) => setOfferModal({ ...offerModal, appliesTo: event.target.value })}
                    className={INPUT}
                    placeholder="مثال: جميع الاشتراكات أو فئة محددة"
                  />
                </Field>
              </div>
            )}

            <Field label="ينتهي العرض في">
              <input
                type="datetime-local"
                value={offerModal.validUntil}
                onChange={(event) => setOfferModal({ ...offerModal, validUntil: event.target.value })}
                className={INPUT}
                dir="ltr"
              />
            </Field>

            <Field
              label="صورة العرض"
              hint="المقاس الموصى به 1600 × 900 بكسل بنسبة 16:9 حتى تظهر بوضوح في الصفحة الرئيسية."
            >
              <div className="space-y-3">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadOfferImage(file);
                    }
                  }}
                  className={INPUT}
                />
                <input
                  value={offerModal.image ?? ""}
                  onChange={(event) => setOfferModal({ ...offerModal, image: event.target.value })}
                  className={INPUT}
                  placeholder="أو ضع رابط الصورة المباشر"
                />
                {uploadingImage ? <div className="text-xs text-[#d7aabd]">جارٍ رفع صورة العرض...</div> : null}
                {offerModal.image ? (
                  <img
                    src={offerModal.image}
                    alt="صورة العرض"
                    className="h-44 w-full rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                  />
                ) : null}
              </div>
            </Field>

            <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
              <input
                type="checkbox"
                checked={offerModal.showOnHome}
                onChange={(event) => setOfferModal({ ...offerModal, showOnHome: event.target.checked })}
              />
              إظهار هذا العرض بشكل مميز في الصفحة الرئيسية
            </label>

            <button
              onClick={() => void saveOffer()}
              disabled={saving || uploadingImage}
              className={`w-full rounded-xl py-3 text-sm font-black transition-colors disabled:opacity-50 ${
                offerModal.type === "special"
                  ? "bg-[#c026d3] text-white hover:bg-[#d946ef]"
                  : "bg-[#ffd166] text-black hover:bg-[#ffcc55]"
              }`}
            >
              {saving
                ? "جارٍ حفظ العرض..."
                : offerModal.type === "special"
                  ? "حفظ العرض الخاص"
                  : "حفظ العرض"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
