"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Offer, Plan } from "../types";

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

export default function Subscriptions() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planModal, setPlanModal] = useState<Plan | typeof EMPTY_PLAN | null>(null);
  const [offerModal, setOfferModal] = useState<Offer | typeof EMPTY_OFFER | null>(null);
  const [featureInput, setFeatureInput] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  const planOptions = useMemo(
    () => plans.map((plan) => ({ id: plan.id, label: `${plan.name} - ${plan.price.toLocaleString("ar-EG")} ج.م` })),
    [plans],
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansResponse, offersResponse] = await Promise.all([
        fetch("/api/admin/memberships", { cache: "no-store" }),
        fetch("/api/admin/offers", { cache: "no-store" }),
      ]);

      const plansData = await plansResponse.json();
      const offersData = await offersResponse.json();
      setPlans(Array.isArray(plansData) ? plansData : []);
      setOffers(Array.isArray(offersData) ? offersData : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const savePlan = async () => {
    if (!planModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in planModal && Boolean(planModal.id);
      await fetch("/api/admin/memberships", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planModal),
      });
      await fetchData();
      setPlanModal(null);
      setFeatureInput("");
    } finally {
      setSaving(false);
    }
  };

  const deletePlan = async (id: string) => {
    if (!confirm("هل تريد حذف هذه الباقة؟")) return;
    await fetch("/api/admin/memberships", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchData();
  };

  const togglePlan = async (id: string, active: boolean) => {
    await fetch("/api/admin/memberships", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    await fetchData();
  };

  const saveOffer = async () => {
    if (!offerModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in offerModal && Boolean(offerModal.id);
      await fetch("/api/admin/offers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(offerModal),
      });
      await fetchData();
      setOfferModal(null);
    } finally {
      setSaving(false);
    }
  };

  const toggleOffer = async (id: string, active: boolean) => {
    await fetch("/api/admin/offers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    await fetchData();
  };

  const deleteOffer = async (id: string) => {
    if (!confirm("هل تريد حذف هذا العرض؟")) return;
    await fetch("/api/admin/offers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchData();
  };

  const addFeature = () => {
    if (!planModal || !featureInput.trim()) return;
    setPlanModal({
      ...planModal,
      features: [...(planModal.features ?? []), featureInput.trim()],
    });
    setFeatureInput("");
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

      const payload = await response.json();
      if (!response.ok || !payload.url) {
        alert(payload.error || "تعذر رفع الصورة الخاصة بالعرض.");
        return;
      }

      setOfferModal((current) =>
        current
          ? {
              ...current,
              image: payload.url,
            }
          : current,
      );
    } finally {
      setUploadingImage(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-gray-400">جارٍ تحميل الباقات والعروض...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-white">باقات الاشتراك</h3>
            <p className="text-sm text-gray-500">
              {plans.length} باقات - {plans.filter((plan) => plan.active).length} باقات نشطة
            </p>
          </div>
          <button
            onClick={() => setPlanModal(EMPTY_PLAN)}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
          >
            + إضافة باقة
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div key={plan.id} className={`rounded-2xl border p-5 ${plan.active ? "border-gray-700 bg-gray-800/60" : "border-gray-800 bg-gray-900 opacity-60"}`}>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="font-black text-white">{plan.name}</div>
                  <div className="text-xs text-gray-500">{DURATION_LABELS[plan.duration]}</div>
                </div>
                <button
                  onClick={() => togglePlan(plan.id, plan.active)}
                  className={`relative h-5 w-10 rounded-full transition-colors ${plan.active ? "bg-red-600" : "bg-gray-700"}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${plan.active ? "right-0.5" : "left-0.5"}`} />
                </button>
              </div>

              <div className="mb-0.5 text-2xl font-black text-yellow-400">{plan.price.toLocaleString("ar-EG")}</div>
              <div className="mb-3 text-xs text-gray-500">ج.م</div>
              <div className="mb-4 text-xs text-gray-400">{plan.membersCount} مشتركة نشطة</div>

              <ul className="mb-4 space-y-1">
                {plan.features.map((feature, index) => (
                  <li key={`${plan.id}-${index}`} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="text-red-500">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                <button
                  onClick={() => setPlanModal(plan)}
                  className="flex-1 rounded-lg bg-gray-700 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-600"
                >
                  تعديل
                </button>
                <button
                  onClick={() => deletePlan(plan.id)}
                  className="rounded-lg bg-red-900/50 px-3 py-2 text-xs font-bold text-red-400 transition-colors hover:bg-red-800"
                >
                  حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-white">العروض والخصومات</h3>
            <p className="text-sm text-gray-500">
              {offers.filter((offer) => offer.active).length} عروض نشطة - {offers.filter((offer) => offer.type === "special").length} عروض خاصة
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOfferModal({ ...EMPTY_OFFER, type: "percentage", title: "", discount: 10, validUntil: "" })}
              className="rounded-xl bg-yellow-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-yellow-400"
            >
              + إضافة عرض عادي
            </button>
            <button
              onClick={() => setOfferModal({ ...EMPTY_OFFER, type: "special", title: "عرض خاص", validUntil: "" })}
              className="rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-fuchsia-500"
            >
              + إضافة عرض خاص
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {offers.map((offer) => {
            const currentSubscribers = offer.currentSubscribers ?? 0;
            const remaining = offer.maxSubscribers ? Math.max(offer.maxSubscribers - currentSubscribers, 0) : null;
            return (
              <div key={offer.id} className="rounded-2xl border border-gray-800 bg-gray-950/70 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex flex-1 gap-4">
                    {offer.image ? (
                      <img
                        src={offer.image}
                        alt={offer.title}
                        className="h-24 w-24 rounded-2xl border border-gray-800 object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-dashed border-gray-700 bg-gray-900 text-xs text-gray-500">
                        بدون صورة
                      </div>
                    )}

                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-black text-white">{offer.title}</h4>
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${offer.type === "special" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-yellow-500/15 text-yellow-300"}`}>
                          {offer.type === "special" ? "عرض خاص" : offer.type === "fixed" ? "خصم ثابت" : "خصم نسبة"}
                        </span>
                        {offer.showOnHome && (
                          <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                            يظهر في الصفحة الرئيسية
                          </span>
                        )}
                      </div>

                      <p className="mb-2 text-sm text-gray-400">{offer.description || offer.appliesTo}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                        <span>ينتهي: {new Date(offer.validUntil).toLocaleString("ar-EG")}</span>
                        {offer.type === "special" ? (
                          <>
                            <span>السعر الخاص: {Number(offer.specialPrice || 0).toLocaleString("ar-EG")} ج.م</span>
                            <span>المشتركات الحاليّات: {currentSubscribers}</span>
                            {offer.maxSubscribers != null && <span>المتبقي: {remaining}</span>}
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
                      onClick={() => toggleOffer(offer.id, offer.active)}
                      className={`relative h-5 w-10 rounded-full transition-colors ${offer.active ? "bg-green-600" : "bg-gray-700"}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${offer.active ? "right-0.5" : "left-0.5"}`} />
                    </button>
                    <button
                      onClick={() => setOfferModal(offer)}
                      className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-gray-700"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => deleteOffer(offer.id)}
                      className="rounded-lg bg-red-900/50 px-3 py-2 text-xs font-bold text-red-400 transition-colors hover:bg-red-800"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {planModal && (
        <Modal title={"id" in planModal && planModal.id ? "تعديل الباقة" : "إضافة باقة"} onClose={() => { setPlanModal(null); setFeatureInput(""); }}>
          <div className="space-y-4">
            <Field label="اسم الباقة">
              <input
                value={planModal.name}
                onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })}
                className={INPUT}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
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

            <Field label="مميزات الباقة">
              <div className="mb-2 flex gap-2">
                <input
                  value={featureInput}
                  onChange={(event) => setFeatureInput(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addFeature()}
                  placeholder="أضيفي ميزة جديدة..."
                  className={INPUT}
                />
                <button onClick={addFeature} className="rounded-lg bg-red-600 px-3 text-sm font-bold text-white">
                  +
                </button>
              </div>
              <div className="space-y-2">
                {(planModal.features ?? []).map((feature, index) => (
                  <div key={`${feature}-${index}`} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-red-500">✓</span>
                    <span className="flex-1">{feature}</span>
                    <button
                      onClick={() =>
                        setPlanModal({
                          ...planModal,
                          features: planModal.features.filter((_, currentIndex) => currentIndex !== index),
                        })
                      }
                      className="text-gray-600 transition-colors hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </Field>

            <button
              onClick={savePlan}
              disabled={saving}
              className="w-full rounded-xl bg-red-600 py-3 font-black text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "جارٍ الحفظ..." : "حفظ الباقة"}
            </button>
          </div>
        </Modal>
      )}

      {offerModal && (
        <Modal title={"id" in offerModal && offerModal.id ? "تعديل العرض" : offerModal.type === "special" ? "إضافة عرض خاص" : "إضافة عرض عادي"} onClose={() => setOfferModal(null)}>
          <div className="space-y-4">
            <Field label="نوع العرض">
              <select
                value={offerModal.type}
                onChange={(event) => setOfferModal({ ...offerModal, type: event.target.value as Offer["type"] })}
                className={INPUT}
              >
                <option value="special">عرض خاص</option>
                <option value="percentage">خصم نسبة</option>
                <option value="fixed">خصم مبلغ ثابت</option>
              </select>
            </Field>

            <Field label="عنوان العرض">
              <input
                value={offerModal.title}
                onChange={(event) => setOfferModal({ ...offerModal, title: event.target.value })}
                className={INPUT}
                placeholder="مثال: عرض العضوية الصيفي"
              />
            </Field>

            <Field label="وصف مختصر">
              <textarea
                value={offerModal.description ?? ""}
                onChange={(event) => setOfferModal({ ...offerModal, description: event.target.value })}
                className={`${INPUT} min-h-24 resize-y`}
                placeholder="وصف قصير يظهر للعميل عن تفاصيل العرض."
              />
            </Field>

            {offerModal.type === "special" ? (
              <>
                <Field label="الباقة المرتبطة بالعرض">
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
                    <option value="">اختاري باقة</option>
                    {planOptions.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="قيمة الاشتراك الخاصة">
                    <input
                      type="number"
                      value={offerModal.specialPrice ?? 0}
                      onChange={(event) => setOfferModal({ ...offerModal, specialPrice: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                  <Field label="الحد الأقصى للمشتركات">
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
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="قيمة الخصم">
                    <input
                      type="number"
                      value={offerModal.discount}
                      onChange={(event) => setOfferModal({ ...offerModal, discount: Number(event.target.value) })}
                      className={INPUT}
                      dir="ltr"
                    />
                  </Field>
                  <Field label="يطبق على">
                    <input
                      value={offerModal.appliesTo}
                      onChange={(event) => setOfferModal({ ...offerModal, appliesTo: event.target.value })}
                      className={INPUT}
                      placeholder="مثال: جميع الباقات"
                    />
                  </Field>
                </div>
              </>
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

            <Field label="صورة العرض">
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
                  placeholder="أو ضعي رابط الصورة مباشرة"
                />
                {uploadingImage && <div className="text-xs text-gray-500">جارٍ رفع الصورة...</div>}
                {offerModal.image && (
                  <img
                    src={offerModal.image}
                    alt="صورة العرض"
                    className="h-40 w-full rounded-2xl border border-gray-800 object-cover"
                  />
                )}
              </div>
            </Field>

            <label className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/70 px-4 py-3 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={offerModal.showOnHome}
                onChange={(event) => setOfferModal({ ...offerModal, showOnHome: event.target.checked })}
              />
              إظهار هذا العرض بشكل مميز في الصفحة الرئيسية
            </label>

            <button
              onClick={saveOffer}
              disabled={saving || uploadingImage}
              className={`w-full rounded-xl py-3 font-black transition-colors disabled:opacity-50 ${offerModal.type === "special" ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500" : "bg-yellow-500 text-black hover:bg-yellow-400"}`}
            >
              {saving ? "جارٍ الحفظ..." : offerModal.type === "special" ? "حفظ العرض الخاص" : "حفظ العرض"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-red-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-black text-white">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 transition-colors hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
