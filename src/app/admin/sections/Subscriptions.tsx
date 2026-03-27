"use client";

import { useState, useEffect, useCallback } from "react";
import type { Plan, Offer } from "../types";

const EMPTY_PLAN: Omit<Plan, "id" | "membersCount"> = { name: "", price: 0, duration: "monthly", features: [], active: true };
const EMPTY_OFFER: Omit<Offer, "id" | "usedCount"> = { title: "", discount: 0, type: "percentage", appliesTo: "جميع الباقات", validUntil: "", active: true };
const DURATION_LABELS: Record<Plan["duration"], string> = { monthly: "شهري", quarterly: "ربع سنوي", annual: "سنوي" };

export default function Subscriptions() {
  const [plans,      setPlans]      = useState<Plan[]>([]);
  const [offers,     setOffers]     = useState<Offer[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [planModal,  setPlanModal]  = useState<Plan | typeof EMPTY_PLAN | null>(null);
  const [offerModal, setOfferModal] = useState<Offer | typeof EMPTY_OFFER | null>(null);
  const [featInput,  setFeatInput]  = useState("");
  const [saving,     setSaving]     = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [p, o] = await Promise.all([
      fetch("/api/admin/memberships").then(r => r.json()),
      fetch("/api/admin/offers").then(r => r.json()),
    ]);
    setPlans(Array.isArray(p) ? p : []);
    setOffers(Array.isArray(o) ? o : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Plan CRUD ──────────────────────────────────────────────────────────────
  const savePlan = async () => {
    if (!planModal) return;
    setSaving(true);
    const isEdit = "id" in planModal && planModal.id;
    await fetch("/api/admin/memberships", {
      method:  isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(planModal),
    });
    await fetchAll();
    setPlanModal(null); setFeatInput(""); setSaving(false);
  };

  const deletePlan = async (id: string) => {
    if (!confirm("حذف الباقة؟")) return;
    await fetch("/api/admin/memberships", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await fetchAll();
  };

  const togglePlan = async (id: string, current: boolean) => {
    await fetch("/api/admin/memberships", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !current }) });
    await fetchAll();
  };

  // ── Offer CRUD ─────────────────────────────────────────────────────────────
  const saveOffer = async () => {
    if (!offerModal) return;
    setSaving(true);
    const isEdit = "id" in offerModal && (offerModal as Offer).id;
    await fetch("/api/admin/offers", {
      method:  isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(offerModal),
    });
    await fetchAll();
    setOfferModal(null); setSaving(false);
  };

  const toggleOffer = async (id: string, current: boolean) => {
    await fetch("/api/admin/offers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !current }) });
    await fetchAll();
  };

  const deleteOffer = async (id: string) => {
    if (!confirm("حذف العرض؟")) return;
    await fetch("/api/admin/offers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await fetchAll();
  };

  const addFeature = () => {
    if (!planModal || !featInput.trim()) return;
    setPlanModal({ ...planModal, features: [...(planModal.features ?? []), featInput.trim()] });
    setFeatInput("");
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-500 text-sm">جارٍ التحميل من قاعدة البيانات...</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Plans */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-black text-lg">باقات الاشتراك</h3>
            <p className="text-gray-500 text-sm">{plans.length} باقات — {plans.filter(p => p.active).length} نشطة</p>
          </div>
          <button onClick={() => setPlanModal(EMPTY_PLAN)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            + باقة جديدة
          </button>
        </div>

        {plans.length === 0 ? (
          <div className="text-center py-12 text-gray-600">
            <p className="text-4xl mb-3">💳</p>
            <p>لا توجد باقات بعد — أضف أول باقة</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div key={plan.id} className={`border rounded-2xl p-5 transition-all ${plan.active ? "bg-gray-800/60 border-gray-700" : "bg-gray-900 border-gray-800 opacity-60"}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-white font-black">{plan.name}</div>
                    <div className="text-gray-500 text-xs">{DURATION_LABELS[plan.duration]}</div>
                  </div>
                  <button onClick={() => togglePlan(plan.id, plan.active)} className={`relative w-10 h-5 rounded-full transition-colors ${plan.active ? "bg-red-600" : "bg-gray-700"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${plan.active ? "right-0.5" : "left-0.5"}`} />
                  </button>
                </div>
                <div className="text-2xl font-black text-yellow-400 mb-0.5">{plan.price.toLocaleString("ar-EG")}</div>
                <div className="text-gray-500 text-xs mb-3">ج.م</div>
                <div className="text-gray-400 text-xs mb-4">{plan.membersCount} عضو مشترك</div>
                <ul className="space-y-1 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-gray-400 text-xs flex items-center gap-1.5">
                      <span className="text-red-500">✓</span>{f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button onClick={() => setPlanModal(plan)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold py-2 rounded-lg transition-colors">تعديل</button>
                  <button onClick={() => deletePlan(plan.id)} className="bg-red-900/50 hover:bg-red-800 text-red-400 text-xs font-bold py-2 px-3 rounded-lg transition-colors">حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offers */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-white font-black text-lg">العروض والخصومات</h3>
            <p className="text-gray-500 text-sm">{offers.filter(o => o.active).length} عروض نشطة</p>
          </div>
          <button onClick={() => setOfferModal(EMPTY_OFFER)} className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            + عرض جديد
          </button>
        </div>

        {offers.length === 0 ? (
          <div className="text-center py-10 text-gray-600">
            <p className="text-4xl mb-3">🎁</p>
            <p>لا توجد عروض بعد — أضف أول عرض</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs">
                  <th className="text-right pb-3 font-medium">العرض</th>
                  <th className="text-right pb-3 font-medium">الخصم</th>
                  <th className="text-right pb-3 font-medium">يطبق على</th>
                  <th className="text-right pb-3 font-medium">صلاحية حتى</th>
                  <th className="text-right pb-3 font-medium">الحالة</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => (
                  <tr key={offer.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="py-3 text-white font-medium">{offer.title}</td>
                    <td className="py-3">
                      <span className="bg-yellow-500/20 text-yellow-400 font-black px-2 py-0.5 rounded-lg text-xs">
                        {offer.type === "percentage" ? `${offer.discount}%` : `${offer.discount} ج.م`}
                      </span>
                    </td>
                    <td className="py-3 text-gray-400">{offer.appliesTo}</td>
                    <td className="py-3 text-gray-400 text-xs">{offer.validUntil}</td>
                    <td className="py-3">
                      <button onClick={() => toggleOffer(offer.id, offer.active)} className={`relative w-10 h-5 rounded-full transition-colors ${offer.active ? "bg-green-600" : "bg-gray-700"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${offer.active ? "right-0.5" : "left-0.5"}`} />
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setOfferModal(offer)} className="text-gray-500 hover:text-yellow-400 transition-colors text-xs">تعديل</button>
                        <button onClick={() => deleteOffer(offer.id)} className="text-gray-500 hover:text-red-500 transition-colors text-xs">حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Modal */}
      {planModal && (
        <Modal title={"id" in planModal && planModal.id ? "تعديل الباقة" : "باقة جديدة"} onClose={() => { setPlanModal(null); setFeatInput(""); }}>
          <div className="space-y-4">
            <Field label="اسم الباقة">
              <input value={planModal.name} onChange={(e) => setPlanModal({ ...planModal, name: e.target.value })} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="السعر (ج.م)">
                <input type="number" value={planModal.price} onChange={(e) => setPlanModal({ ...planModal, price: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="المدة">
                <select value={planModal.duration} onChange={(e) => setPlanModal({ ...planModal, duration: e.target.value as Plan["duration"] })} className={INPUT}>
                  <option value="monthly">شهري (30 يوم)</option>
                  <option value="quarterly">ربع سنوي (90 يوم)</option>
                  <option value="annual">سنوي (365 يوم)</option>
                </select>
              </Field>
            </div>
            <Field label="المميزات">
              <div className="flex gap-2 mb-2">
                <input value={featInput} onChange={(e) => setFeatInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFeature()} placeholder="أضف ميزة..." className={INPUT} />
                <button onClick={addFeature} className="bg-red-600 text-white px-3 rounded-lg text-sm font-bold">+</button>
              </div>
              <div className="space-y-1">
                {(planModal.features ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-red-500">✓</span>
                    <span className="flex-1">{f}</span>
                    <button onClick={() => setPlanModal({ ...planModal, features: planModal.features.filter((_, j) => j !== i) })} className="text-gray-600 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            </Field>
            <button onClick={savePlan} disabled={saving} className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-colors">
              {saving ? "جارٍ الحفظ..." : "💾 حفظ الباقة"}
            </button>
          </div>
        </Modal>
      )}

      {/* Offer Modal */}
      {offerModal && (
        <Modal title={"id" in offerModal && (offerModal as Offer).id ? "تعديل العرض" : "عرض جديد"} onClose={() => setOfferModal(null)}>
          <div className="space-y-4">
            <Field label="عنوان العرض">
              <input value={offerModal.title} onChange={(e) => setOfferModal({ ...offerModal, title: e.target.value })} className={INPUT} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="قيمة الخصم">
                <input type="number" value={offerModal.discount} onChange={(e) => setOfferModal({ ...offerModal, discount: +e.target.value })} className={INPUT} dir="ltr" />
              </Field>
              <Field label="نوع الخصم">
                <select value={offerModal.type} onChange={(e) => setOfferModal({ ...offerModal, type: e.target.value as Offer["type"] })} className={INPUT}>
                  <option value="percentage">نسبة مئوية (%)</option>
                  <option value="fixed">مبلغ ثابت (ج.م)</option>
                </select>
              </Field>
            </div>
            <Field label="يطبق على">
              <input value={offerModal.appliesTo} onChange={(e) => setOfferModal({ ...offerModal, appliesTo: e.target.value })} className={INPUT} />
            </Field>
            <Field label="صلاحية حتى">
              <input type="date" value={offerModal.validUntil} onChange={(e) => setOfferModal({ ...offerModal, validUntil: e.target.value })} className={INPUT} dir="ltr" />
            </Field>
            <button onClick={saveOffer} disabled={saving} className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black py-3 rounded-xl transition-colors">
              {saving ? "جارٍ الحفظ..." : "💾 حفظ العرض"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const INPUT = "w-full bg-gray-800 border border-gray-700 focus:border-red-500 rounded-xl px-4 py-2.5 text-white text-sm outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-gray-500 text-xs mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-black text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
