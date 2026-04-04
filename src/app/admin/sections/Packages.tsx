"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Goal, Plan } from "../types";
import { AdminCard, AdminEmptyState, AdminSectionShell } from "./shared";

const INPUT =
  "w-full rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-[#ff4f93]";

const EMPTY_PLAN: Omit<Plan, "id" | "membersCount"> = {
  name: "",
  price: 0,
  priceBefore: null,
  priceAfter: null,
  duration: 30,
  cycle: "custom",
  features: [],
  active: true,
  kind: "package",
  goalIds: [],
  classSessions: [],
  productRewards: [],
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

export default function Packages() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [classes, setClasses] = useState<Array<{ type: string; label: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [featureInput, setFeatureInput] = useState("");
  const [classSessionDraft, setClassSessionDraft] = useState<{ classType: string; sessions: number }>({
    classType: "",
    sessions: 1,
  });
  const [productRewardDraft, setProductRewardDraft] = useState<{ productId: string; quantity: number }>({
    productId: "",
    quantity: 1,
  });
  const [planModal, setPlanModal] = useState<Plan | typeof EMPTY_PLAN | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansResponse, goalsResponse, classesResponse, productsResponse] = await Promise.all([
        fetch("/api/admin/memberships?kind=package", { cache: "no-store" }),
        fetch("/api/admin/goals", { cache: "no-store" }),
        fetch("/api/admin/classes", { cache: "no-store" }),
        fetch("/api/admin/products", { cache: "no-store" }),
      ]);
      const payload = await plansResponse.json();
      const goalsPayload = await goalsResponse.json();
        const classesPayload = await classesResponse.json().catch(() => []);
      const productsPayload = await productsResponse.json().catch(() => []);
      setPlans(Array.isArray(payload) ? payload : []);
      setGoals(Array.isArray(goalsPayload) ? goalsPayload.filter((goal) => goal.active) : []);
        const classesList = Array.isArray(classesPayload)
          ? classesPayload
          : Array.isArray((classesPayload as { classes?: unknown[] })?.classes)
            ? (classesPayload as { classes: unknown[] }).classes
            : [];
        const unique = new Map<string, string>();
        classesList.forEach((item: { type?: string; subType?: string; active?: boolean }) => {
          if (item?.active === false) return;
          const type = (item.type ?? "").trim();
          if (!type) return;
          if (!unique.has(type)) unique.set(type, type);
        });
        setClasses(Array.from(unique, ([type, label]) => ({ type, label })));
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

  const goalLookup = useMemo(() => new Map(goals.map((goal) => [goal.id, goal.name])), [goals]);

  const addFeature = () => {
    if (!planModal || !featureInput.trim()) return;
    setPlanModal({
      ...planModal,
      features: [...(planModal.features ?? []), featureInput.trim()],
    });
    setFeatureInput("");
  };

  const addClassSession = () => {
    if (!planModal || !classSessionDraft.classType || classSessionDraft.sessions <= 0) return;
    const existing = planModal.classSessions ?? [];
    const next = existing.filter((item) => item.classId !== classSessionDraft.classType);
    next.push({ classId: classSessionDraft.classType, sessions: classSessionDraft.sessions });
    setPlanModal({ ...planModal, classSessions: next });
    setClassSessionDraft({ classType: "", sessions: 1 });
  };

  const removeClassSession = (classId: string) => {
    if (!planModal) return;
    setPlanModal({
      ...planModal,
      classSessions: (planModal.classSessions ?? []).filter((item) => item.classId !== classId),
    });
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

  const savePlan = async () => {
    if (!planModal) return;
    setSaving(true);
    try {
      const isEdit = "id" in planModal && Boolean(planModal.id);
      const response = await fetch("/api/admin/memberships", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...planModal, kind: "package" }),
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

  if (loading) {
    return (
      <AdminSectionShell title="الباقات" subtitle="إدارة باقات النادي بشكل منفصل عن الاشتراكات.">
        <AdminCard className="flex h-64 items-center justify-center">
          <div className="text-sm text-[#d7aabd]">جاري تحميل الباقات...</div>
        </AdminCard>
      </AdminSectionShell>
    );
  }

  return (
    <AdminSectionShell title="الباقات" subtitle="أنشئ باقات النادي واعرضها للعميل بشكل منفصل عن الاشتراكات.">
      <AdminCard>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-[#fff4f8]">باقات النادي</h3>
            <p className="mt-1 text-sm text-[#d7aabd]">
              {plans.length.toLocaleString("ar-EG")} باقة - {plans.filter((plan) => plan.active).length.toLocaleString("ar-EG")} باقة نشطة
            </p>
          </div>
          <button
            onClick={() => setPlanModal({ ...EMPTY_PLAN })}
            className="rounded-xl bg-[#ff4f93] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff2f7d]"
          >
            + إضافة باقة
          </button>
        </div>

        {plans.length === 0 ? (
          <AdminEmptyState title="لا توجد باقات بعد" description="ابدئي بإضافة أول باقة لتظهر في صفحة الباقات." />
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
                    <div className="mt-1 text-xs text-[#d7aabd]">مدة التدريب: {plan.duration} يوم</div>
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

                  {plan.priceBefore ? (
                    <div className="text-xs text-[#d7aabd] line-through">
                      {plan.priceBefore.toLocaleString("ar-EG")} ج.م
                    </div>
                  ) : null}
                  <div className="text-2xl font-black text-[#ffd166]">
                    {(plan.priceAfter ?? plan.price).toLocaleString("ar-EG")}
                  </div>
                  <div className="text-xs text-[#d7aabd]">ج.م</div>
                <div className="mt-3 text-xs text-[#d7aabd]">{plan.membersCount.toLocaleString("ar-EG")} مشتركة نشطة</div>
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

      {planModal ? (
        <Modal title={"id" in planModal && planModal.id ? "تعديل الباقة" : "إضافة باقة"} onClose={() => { setPlanModal(null); setFeatureInput(""); }}>
          <div className="space-y-4">
            <Field label="اسم الباقة">
              <input value={planModal.name} onChange={(event) => setPlanModal({ ...planModal, name: event.target.value })} className={INPUT} />
            </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="السعر بعد الخصم">
                  <input
                    type="number"
                    value={planModal.price}
                    onChange={(event) => setPlanModal({ ...planModal, price: Number(event.target.value) })}
                    className={INPUT}
                    dir="ltr"
                  />
                </Field>

                <Field label="مدة التدريب (بالأيام)">
                  <input
                    type="number"
                    value={planModal.duration}
                    onChange={(event) => setPlanModal({ ...planModal, duration: Number(event.target.value) })}
                    className={INPUT}
                    dir="ltr"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="السعر قبل الخصم">
                  <input
                    type="number"
                    value={planModal.priceBefore ?? ""}
                    onChange={(event) =>
                      setPlanModal({
                        ...planModal,
                        priceBefore: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    className={INPUT}
                    dir="ltr"
                  />
                </Field>

                <Field label="السعر النهائي (اختياري)">
                  <input
                    type="number"
                    value={planModal.priceAfter ?? ""}
                    onChange={(event) =>
                      setPlanModal({
                        ...planModal,
                        priceAfter: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    className={INPUT}
                    dir="ltr"
                  />
                </Field>
              </div>

              <Field label="الأهداف المرتبطة" hint="اختاري الأهداف التي يظهر معها هذه الباقة في رحلة الاختيار.">
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

              <Field
                label="تخصيص حصص لكلاسات محددة"
                hint="اختاري الكلاس وحددي عدد الحصص المسموح بها ضمن هذه الباقة."
              >
                <div className="flex flex-wrap gap-2">
                  <select
                    value={classSessionDraft.classType}
                    onChange={(event) =>
                      setClassSessionDraft({ ...classSessionDraft, classType: event.target.value })
                    }
                    className={INPUT}
                  >
                    <option value="">اختاري نوع الكلاس</option>
                    {classes.map((item) => (
                      <option key={item.type} value={item.type}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={classSessionDraft.sessions}
                    onChange={(event) =>
                      setClassSessionDraft({ ...classSessionDraft, sessions: Number(event.target.value) })
                    }
                    className={`${INPUT} w-32`}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={addClassSession}
                    className="rounded-lg bg-[#ff4f93] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d]"
                  >
                    إضافة
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(planModal.classSessions ?? []).map((entry) => (
                    <div
                      key={entry.classId}
                      className="flex items-center justify-between rounded-xl border border-[rgba(255,188,219,0.12)] bg-black/15 px-4 py-3 text-sm text-[#fff4f8]"
                    >
                      <div>
                        {classes.find((item) => item.type === entry.classId)?.label ?? entry.classId ?? "كلاس"}
                        <span className="mr-2 text-xs text-[#d7aabd]">
                          ({entry.sessions} حصة)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeClassSession(entry.classId)}
                        className="text-[#d7aabd] transition-colors hover:text-rose-300"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </Field>

              <Field
                label="منتجات مميزة داخل الباقة"
                hint="اختاري منتج من المتجر وحددي الكمية التي تُخصم من المخزون بعد شراء الباقة."
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

            <Field label="مميزات الباقة" hint="أضف كل ميزة ثم اضغط زر الإضافة لتظهر ضمن قائمة الباقة.">
              <div className="mb-3 flex gap-2">
                <input value={featureInput} onChange={(event) => setFeatureInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFeature(); } }} placeholder="مثال: قياس إنبودي أو متابعة غذائية" className={INPUT} />
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

            <button onClick={() => void savePlan()} disabled={saving} className="w-full rounded-xl bg-[#ff4f93] py-3 text-sm font-black text-white transition-colors hover:bg-[#ff2f7d] disabled:opacity-50">
              {saving ? "جاري حفظ الباقة..." : "حفظ الباقة"}
            </button>
          </div>
        </Modal>
      ) : null}
    </AdminSectionShell>
  );
}
