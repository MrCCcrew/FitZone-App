"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Goal, Offer, Plan } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

type PlanDraft = Plan & {
  discountType?: "percentage" | "fixed";
  discountValue?: number | null;
};

const EMPTY_PLAN: Omit<PlanDraft, "id" | "membersCount"> = {
  name: "",
  price: 0,
  duration: 30,
  cycle: "monthly",
  sessionsCount: 8,
  features: [],
  active: true,
  kind: "subscription",
  goalIds: [],
  productRewards: [],
  priceBefore: null,
  priceAfter: null,
  image: "",
  sortOrder: 0,
  discountType: "percentage",
  discountValue: null,
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
  showMaxSubscribers: true,
};

const CYCLE_LABELS: Record<NonNullable<Plan["cycle"]>, string> = {
  monthly: "شهري",
  quarterly: "ربع سنوي",
  semi_annual: "نصف سنوي",
  annual: "سنوي",
  custom: "مخصص",
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
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState("");
  const [productRewardDraft, setProductRewardDraft] = useState<{ productId: string; quantity: number }>({
    productId: "",
    quantity: 1,
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingPlanImage, setUploadingPlanImage] = useState(false);
  const [planModal, setPlanModal] = useState<PlanDraft | typeof EMPTY_PLAN | null>(null);
  const [offerModal, setOfferModal] = useState<Offer | typeof EMPTY_OFFER | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansResponse, allPlansResponse, offersResponse, goalsResponse, productsResponse] = await Promise.all([
        fetch("/api/admin/memberships?kind=subscription", { cache: "no-store" }),
        fetch("/api/admin/memberships", { cache: "no-store" }),
        fetch("/api/admin/offers", { cache: "no-store" }),
        fetch("/api/admin/goals", { cache: "no-store" }),
        fetch("/api/admin/products", { cache: "no-store" }),
      ]);

      const plansPayload = await plansResponse.json();
      const allPlansPayload = await allPlansResponse.json();
      const offersPayload = await offersResponse.json();
      const goalsPayload = await goalsResponse.json();
      const productsPayload = await productsResponse.json().catch(() => []);
      setPlans(Array.isArray(plansPayload) ? plansPayload : []);
      setAllPlans(Array.isArray(allPlansPayload) ? allPlansPayload : []);
      setOffers(Array.isArray(offersPayload) ? offersPayload : []);
      setGoals(Array.isArray(goalsPayload) ? goalsPayload.filter((goal) => goal.active) : []);
      setProducts(
        Array.isArray(productsPayload)
          ? productsPayload
              .filter((item: { id?: string; name?: string; active?: boolean }) => item?.id && item?.name && item?.active !== false)
              .map((item: { id: string; name: string }) => ({ id: item.id, name: item.name }))
          : [],
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const planOptions = useMemo(
    () =>
      allPlans.map((plan) => ({
        id: plan.id,
        label: `${plan.name} - ${(plan.priceAfter ?? plan.price).toLocaleString("ar-EG")} ج.م`,
      })),
    [allPlans],
  );

  const goalLookup = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.name])), [goals]);

  const addFeature = () => {
    if (!planModal || !featureInput.trim()) return;
    setPlanModal({
      ...planModal,
      features: [...(planModal.features ?? []), featureInput.trim()],
    });
    setFeatureInput("");
  };

  const addProductReward = () => {
    if (!planModal || !productRewardDraft.productId || productRewardDraft.quantity <= 0) return;
    const existing = planModal.productRewards ?? [];
    const next = existing.filter((item) => item.productId !== productRewardDraft.productId);
    next.push({ productId: productRewardDraft.productId, quantity: productRewardDraft.quantity });
    setPlanModal({ ...planModal, productRewards: next });
    setProductRewardDraft({ productId: "", quantity: 1 });
  };

  const removeProductReward = (productId: string) => {
    if (!planModal) return;
    setPlanModal({
      ...planModal,
      productRewards: (planModal.productRewards ?? []).filter((item) => item.productId !== productId),
    });
  };

  const toggleGoalForPlan = (goalId: string) => {
    if (!planModal) return;
    const current = planModal.goalIds ?? [];
    setPlanModal({
      ...planModal,
      goalIds: current.includes(goalId) ? current.filter((id) => id !== goalId) : [...current, goalId],
    });
  };

  const computeDiscountedPrice = (price: number, type?: "percentage" | "fixed", value?: number | null) => {
    if (!value || value <= 0) return { priceBefore: null, priceAfter: null };
    const base = Number(price || 0);
    if (base <= 0) return { priceBefore: null, priceAfter: null };
    const discounted =
      type === "fixed" ? base - value : base * (1 - Math.min(Math.max(value, 0), 100) / 100);
    const safe = Math.max(0, Number(discounted.toFixed(2)));
    return { priceBefore: base, priceAfter: safe };
  };

  const deriveDiscount = (plan: Plan): { discountType: "percentage" | "fixed"; discountValue: number | null } => {
    if (!plan.priceBefore || !plan.priceAfter) {
      return { discountType: "percentage", discountValue: null };
    }
    if (plan.priceBefore <= plan.priceAfter) {
      return { discountType: "percentage", discountValue: null };
    }
    const percent = Math.round((1 - plan.priceAfter / plan.priceBefore) * 100);
    return { discountType: "percentage", discountValue: Number.isFinite(percent) ? percent : null };
  };

  const withDiscountDraft = (plan: Plan): PlanDraft => {
    const derived = deriveDiscount(plan);
    return { ...plan, discountType: derived.discountType, discountValue: derived.discountValue };
  };

  const savePlan = async () => {
    if (!planModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in planModal && Boolean(planModal.id);
      const discount = computeDiscountedPrice(planModal.price, planModal.discountType, planModal.discountValue);
      const payload = {
        ...planModal,
        kind: "subscription",
        priceBefore: discount.priceBefore,
        priceAfter: discount.priceAfter,
      };
      const response = await fetch("/api/admin/memberships", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        window.alert(payload.error ?? "تعذر حفظ الاشتراك.");
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
    if (!window.confirm("هل تريد حذف هذا الاشتراك؟")) return;

    const response = await fetch("/api/admin/memberships", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      window.alert(payload.error ?? "تعذر حذف الاشتراك.");
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
      window.alert(payload.error ?? "تعذر تحديث حالة الاشتراك.");
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
        window.alert(payload?.error ?? "تعذر حفظ العرض حالياً.");
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

  const uploadPlanImage = async (file: File) => {
    setUploadingPlanImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "memberships");

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.url) {
        window.alert(payload?.error ?? "تعذر رفع صورة الاشتراك.");
        return;
      }

      setPlanModal((current) => (current ? { ...current, image: payload.url } : current));
    } finally {
      setUploadingPlanImage(false);
    }
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
      <AdminSectionShell title="الاشتراكات والعروض" subtitle="إدارة الاشتراكات والعروض الخاصة والخصومات.">
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل الاشتراكات والعروض...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell title="الاشتراكات والعروض" subtitle="أنشئ اشتراكات العضوية والعروض الخاصة وخصص ظهورها في الصفحة الرئيسية.">
      <AdminCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">اشتراكات النادي</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              {plans.length.toLocaleString("ar-EG")} اشتراك - {plans.filter((plan) => plan.active).length.toLocaleString("ar-EG")} اشتراك نشط
            </p>
          </div>
          <button
            onClick={() => setPlanModal({ ...EMPTY_PLAN })}
            className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
          >
            + إضافة اشتراك
          </button>
        </div>

        {plans.length === 0 ? (
          <AdminEmptyState title="لا توجد اشتراكات بعد" description="ابدئي بإضافة أول اشتراك ليظهر في صفحة الاشتراكات ولوحة الإدارة." />
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
                {plan.image ? (
                  <img
                    src={plan.image}
                    alt={plan.name}
                    className="mb-4 h-32 w-full rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                  />
                ) : (
                  <div className="mb-4 flex h-32 items-center justify-center rounded-2xl border border-dashed border-[rgba(255,188,219,0.18)] text-xs text-[#d7aabd]">
                    بدون صورة
                  </div>
                )}
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black text-[#fff4f8]">{plan.name}</div>
                    <div className="mt-1 text-xs text-[#d7aabd]">{CYCLE_LABELS[plan.cycle ?? "monthly"]}</div>
                    <div className="mt-1 text-xs text-[#d7aabd]">ترتيب: {plan.sortOrder ?? 0}</div>
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

                <div className="text-2xl font-black text-[#ffd166]">{(plan.priceAfter ?? plan.price).toLocaleString("ar-EG")}</div>
                <div className="text-xs text-[#d7aabd]">ج.م</div>
                {plan.priceBefore && plan.priceBefore > (plan.priceAfter ?? plan.price) ? (
                  <div className="mt-1 text-xs text-[#d7aabd] line-through">
                    {plan.priceBefore.toLocaleString("ar-EG")} ج.م
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-[#d7aabd]">
                  {plan.sessionsCount ? `عدد الحصص: ${plan.sessionsCount}` : "عدد الحصص غير محدد"}
                </div>
                <div className="mt-1 text-xs text-[#d7aabd]">مدة التدريب: {plan.duration} يوم</div>
                <div className="mt-1 text-xs text-[#d7aabd]">{plan.membersCount.toLocaleString("ar-EG")} مشتركة نشطة</div>
                {plan.goalIds?.length ? (
                  <div className="mt-2 text-xs text-[#d7aabd]">
                    الأهداف: {plan.goalIds.map((goalId) => goalLookup.get(goalId) ?? "هدف").join("، ")}
                  </div>
                ) : null}

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
                    onClick={() => setPlanModal(withDiscountDraft(plan))}
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
          <AdminEmptyState title="لا توجد عروض بعد" description="أضف عرضًا عاديًا أو عرضًا خاصًا مع صورة ومدة وعدد مشتركين ليظهر للعميل بشكل مميز." />
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => {
              const currentSubscribers = offer.currentSubscribers ?? 0;
              const remaining =
                offer.showMaxSubscribers && offer.maxSubscribers != null
                  ? Math.max(offer.maxSubscribers - currentSubscribers, 0)
                  : null;

              return (
                <div key={offer.id} className="rounded-[24px] border border-[rgba(255,188,219,0.14)] bg-black/15 p-5">
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
                            {offer.type === "special" ? "عرض خاص" : offer.type === "fixed" ? "خصم بمبلغ ثابت" : "خصم بنسبة"}
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
                              <span>المشتركات الحالية: {currentSubscribers.toLocaleString("ar-EG")}</span>
                              {remaining != null ? <span>المتبقي: {remaining.toLocaleString("ar-EG")}</span> : null}
                              <span>
                                الباقة أو الاشتراك:{" "}
                                {offer.membershipId
                                  ? planOptions.find((plan) => plan.id === offer.membershipId)?.label ?? "مرتبط باشتراك"
                                  : "غير مرتبط"}
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
        <Modal title={"id" in planModal && planModal.id ? "تعديل الاشتراك" : "إضافة اشتراك"} onClose={() => { setPlanModal(null); setFeatureInput(""); }}>
          <div className="space-y-4">
            <Field label="اسم الاشتراك">
              <input value={planModal.name} onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })} className={INPUT} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="السعر">
                <input type="number" value={planModal.price} onChange={(event) => setPlanModal({ ...planModal, price: Number(event.target.value) })} className={INPUT} dir="ltr" />
              </Field>

              <Field label="الدورة">
                <select value={planModal.cycle ?? "monthly"} onChange={(event) => setPlanModal({ ...planModal, cycle: event.target.value as Plan["cycle"] })} className={INPUT}>
                  <option value="monthly">شهري</option>
                  <option value="quarterly">ربع سنوي</option>
                  <option value="semi_annual">نصف سنوي</option>
                  <option value="annual">سنوي</option>
                  <option value="custom">مخصص</option>
                </select>
              </Field>

              <Field label="ترتيب الظهور" hint="أرقام أصغر تظهر أولًا.">
                <input
                  type="number"
                  value={planModal.sortOrder ?? 0}
                  onChange={(event) =>
                    setPlanModal({ ...planModal, sortOrder: Number(event.target.value) })
                  }
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="نوع الخصم" hint="اختاري نسبة مئوية أو مبلغ ثابت.">
                <select
                  value={planModal.discountType ?? "percentage"}
                  onChange={(event) =>
                    setPlanModal({ ...planModal, discountType: event.target.value as "percentage" | "fixed" })
                  }
                  className={INPUT}
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </Field>
              <Field label="قيمة الخصم" hint="اتركيها فارغة إذا لا يوجد خصم.">
                <input
                  type="number"
                  value={planModal.discountValue ?? ""}
                  onChange={(event) =>
                    setPlanModal({
                      ...planModal,
                      discountValue: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  className={INPUT}
                  dir="ltr"
                />
              </Field>
            </div>

            <Field label="صورة الاشتراك" hint="المقاس المثالي: 436 × 280 بكسل (نسبة 1.56:1) — تملأ الكارت بالكامل بدون قص ولا مسافات.">
              <div className="flex flex-wrap gap-2">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadPlanImage(file);
                  }}
                  className="block w-full text-sm text-[#d7aabd] file:mr-3 file:rounded-lg file:border-0 file:bg-[#ff4f93] file:px-4 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-[#ff2f7d]"
                />
                <input
                  value={planModal.image ?? ""}
                  onChange={(event) => setPlanModal({ ...planModal, image: event.target.value })}
                  className={INPUT}
                  placeholder="أو ضع رابط الصورة المباشر"
                />
              </div>
              {uploadingPlanImage ? <div className="text-xs text-[#d7aabd]">جاري رفع صورة الاشتراك...</div> : null}
              {planModal.image ? (
                <img
                  src={planModal.image}
                  alt="صورة الاشتراك"
                  className="mt-2 h-44 w-full rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover"
                />
              ) : null}
            </Field>

            {planModal.discountValue && planModal.discountValue > 0 ? (
              <div className="rounded-xl border border-[rgba(255,188,219,0.18)] bg-black/20 p-4 text-sm text-[#fff4f8]">
                السعر بعد الخصم:{" "}
                {computeDiscountedPrice(planModal.price, planModal.discountType, planModal.discountValue).priceAfter?.toLocaleString("ar-EG") ??
                  planModal.price.toLocaleString("ar-EG")}{" "}
                ج.م
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="عدد الحصص">
                <input type="number" value={planModal.sessionsCount ?? ""} onChange={(event) => setPlanModal({ ...planModal, sessionsCount: event.target.value ? Number(event.target.value) : null })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="مدة التدريب (بالأيام)">
                <input type="number" value={planModal.duration} onChange={(event) => setPlanModal({ ...planModal, duration: Number(event.target.value) })} className={INPUT} dir="ltr" />
              </Field>
            </div>

            <Field label="الأهداف المرتبطة" hint="اختاري الأهداف التي يظهر معها هذا الاشتراك في رحلة الاختيار.">
              <div className="grid gap-2 sm:grid-cols-2">
                {goals.map((goal) => {
                  const active = planModal.goalIds?.includes(goal.id);
                  return (
                    <button
                      key={goal.id}
                      type="button"
                      onClick={() => toggleGoalForPlan(goal.id)}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-bold transition-colors ${
                        active
                          ? "border-[#ff4f93] bg-[#ff4f93]/10 text-[#fff4f8]"
                          : "border-[rgba(255,188,219,0.12)] bg-black/15 text-[#d7aabd]"
                      }`}
                    >
                      <span>{goal.name}</span>
                      <span>{active ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="مميزات الاشتراك" hint="أضف كل ميزة ثم اضغط زر الإضافة لتظهر ضمن قائمة الاشتراك.">
              <div className="mb-3 flex gap-2">
                <input value={featureInput} onChange={(event) => setFeatureInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFeature(); } }} placeholder="مثال: متابعة شهرية مع المدربة" className={INPUT} />
                <button type="button" onClick={addFeature} className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]">
                  +
                </button>
              </div>

              <div className="space-y-2">
                {(planModal.features ?? []).map((feature, index) => (
                  <div key={`${feature}-${index}`} className="flex items-center gap-2 rounded-xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3">
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

            <Field
              label="منتجات مميزة داخل الاشتراك"
              hint="اختاري منتج من المتجر وحددي الكمية التي تخصم من المخزون بعد شراء الاشتراك."
            >
              <div className="flex flex-wrap gap-2">
                <select
                  value={productRewardDraft.productId}
                  onChange={(event) =>
                    setProductRewardDraft({ ...productRewardDraft, productId: event.target.value })
                  }
                  className={INPUT}
                >
                  <option value="">اختاري المنتج</option>
                  {products.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={productRewardDraft.quantity}
                  onChange={(event) =>
                    setProductRewardDraft({ ...productRewardDraft, quantity: Number(event.target.value) })
                  }
                  className={`${INPUT} w-32`}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={addProductReward}
                  className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                >
                  إضافة
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(planModal.productRewards ?? []).map((entry) => (
                  <div
                    key={entry.productId}
                    className="flex items-center justify-between rounded-xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]"
                  >
                    <div>
                      {products.find((item) => item.id === entry.productId)?.name ?? "منتج"}
                      <span className="mr-2 text-xs text-[#d7aabd]">({entry.quantity} قطعة)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeProductReward(entry.productId)}
                      className="text-[#d7aabd] transition-colors hover:text-rose-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </Field>

            <button onClick={() => void savePlan()} disabled={saving} className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50">
              {saving ? "جاري حفظ الاشتراك..." : "حفظ الاشتراك"}
            </button>
          </div>
        </Modal>
      ) : null}

      {offerModal ? (
        <Modal title={"id" in offerModal && offerModal.id ? "تعديل العرض" : offerModal.type === "special" ? "إضافة عرض خاص" : "إضافة عرض عادي"} onClose={() => setOfferModal(null)}>
          <div className="space-y-4">
            <Field label="نوع العرض">
              <select value={offerModal.type} onChange={(event) => setOfferModal({ ...offerModal, type: event.target.value as Offer["type"] })} className={INPUT}>
                <option value="special">عرض خاص</option>
                <option value="percentage">خصم بنسبة</option>
                <option value="fixed">خصم بمبلغ ثابت</option>
              </select>
            </Field>

            <Field label="عنوان العرض">
              <input value={offerModal.title} onChange={(event) => setOfferModal({ ...offerModal, title: event.target.value })} className={INPUT} placeholder="مثال: عرض الصيف" />
            </Field>

            <Field label="وصف مختصر" hint="يظهر هذا النص للعميل داخل الصفحة الرئيسية وصفحة الاشتراكات إن فُعّل العرض هناك.">
              <textarea value={offerModal.description ?? ""} onChange={(event) => setOfferModal({ ...offerModal, description: event.target.value })} className={`${INPUT} min-h-24 resize-y`} placeholder="صف العرض بشكل مختصر ومقنع." />
            </Field>

            {offerModal.type === "special" ? (
              <>
                <Field label="الاشتراك المرتبط" hint="اختياري. يمكنك تركه فارغًا لو كان العرض الخاص غير مرتبط باشتراك محدد.">
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
                    <option value="">غير مرتبط باشتراك</option>
                    {planOptions.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="قيمة الاشتراك الخاصة">
                    <input type="number" value={offerModal.specialPrice ?? 0} onChange={(event) => setOfferModal({ ...offerModal, specialPrice: Number(event.target.value) })} className={INPUT} dir="ltr" />
                  </Field>
                  <Field label="الحد الأقصى للمشتركات">
                    <input type="number" value={offerModal.maxSubscribers ?? 0} onChange={(event) => setOfferModal({ ...offerModal, maxSubscribers: Number(event.target.value) })} className={INPUT} dir="ltr" />
                  </Field>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
                  <input
                    type="checkbox"
                    checked={offerModal.showMaxSubscribers !== false}
                    onChange={(event) => setOfferModal({ ...offerModal, showMaxSubscribers: event.target.checked })}
                  />
                  إظهار الحد الأقصى والمتبقي للمشتركين داخل الموقع
                </label>
              </>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="قيمة الخصم">
                  <input type="number" value={offerModal.discount} onChange={(event) => setOfferModal({ ...offerModal, discount: Number(event.target.value) })} className={INPUT} dir="ltr" />
                </Field>
                <Field label="ينطبق على">
                  <input value={offerModal.appliesTo} onChange={(event) => setOfferModal({ ...offerModal, appliesTo: event.target.value })} className={INPUT} placeholder="مثال: جميع الاشتراكات أو فئة محددة" />
                </Field>
              </div>
            )}

            <Field label="ينتهي العرض في">
              <input type="datetime-local" value={offerModal.validUntil} onChange={(event) => setOfferModal({ ...offerModal, validUntil: event.target.value })} className={INPUT} dir="ltr" />
            </Field>

            <Field label="صورة العرض" hint="المقاس المثالي: 1020 × 720 بكسل (نسبة 1.4:1) — تملأ مساحة العرض كاملاً بدون قص ولا مسافات.">
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
                <input value={offerModal.image ?? ""} onChange={(event) => setOfferModal({ ...offerModal, image: event.target.value })} className={INPUT} placeholder="أو ضع رابط الصورة المباشر" />
                {uploadingImage ? <div className="text-xs text-[#d7aabd]">جاري رفع صورة العرض...</div> : null}
                {offerModal.image ? <img src={offerModal.image} alt="صورة العرض" className="h-44 w-full rounded-2xl border border-[rgba(255,188,219,0.14)] object-cover" /> : null}
              </div>
            </Field>

            <label className="flex items-center gap-3 rounded-2xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]">
              <input type="checkbox" checked={offerModal.showOnHome} onChange={(event) => setOfferModal({ ...offerModal, showOnHome: event.target.checked })} />
              إظهار هذا العرض بشكل مميز في الصفحة الرئيسية
            </label>

            <button
              onClick={() => void saveOffer()}
              disabled={saving || uploadingImage}
              className={`w-full rounded-xl py-3 text-sm font-black transition-colors disabled:opacity-50 ${
                offerModal.type === "special" ? "bg-[#c026d3] text-white hover:bg-[#d946ef]" : "bg-[#ffd166] text-black hover:bg-[#ffcc55]"
              }`}
            >
              {saving ? "جاري حفظ العرض..." : offerModal.type === "special" ? "حفظ العرض الخاص" : "حفظ العرض"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
