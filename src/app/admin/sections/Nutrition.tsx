"use client";

import { useCallback, useEffect, useState } from "react";
import type { NutritionistProfileRow, NutritionSessionRow } from "../types";

// Flat keys stored by the booking form → display label
const FLAT_LABELS: { key: string; label: string }[] = [
  { key: "fullName",      label: "الاسم الكامل" },
  { key: "phone",         label: "رقم الهاتف" },
  { key: "age",           label: "العمر" },
  { key: "weight",        label: "الوزن الحالي (كجم)" },
  { key: "height",        label: "الطول (سم)" },
  { key: "waist",         label: "محيط الخصر (سم)" },
  { key: "hips",          label: "محيط الأرداف (سم)" },
  { key: "arm",           label: "محيط العضد (سم)" },
  { key: "medications",   label: "أدوية حالية" },
  { key: "allergyDetails",label: "تفاصيل الحساسية" },
  { key: "notes",         label: "ملاحظات إضافية" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار المراجعة",
  awaiting_slot: "بانتظار اختيار الموعد",
  approved: "تم التأكيد",
  paid: "تم الدفع",
  completed: "مكتمل",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#f5c542",
  awaiting_slot: "#a78bfa",
  approved: "#3b82f6",
  paid: "#22c55e",
  completed: "#6ee7b7",
  rejected: "#ef4444",
  cancelled: "#6b7280",
};

function fmtVal(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "نعم" : "لا";
  if (Array.isArray(val)) return (val as unknown[]).map(String).join("، ") || "—";
  return String(val);
}

function NutritionFormDetails({ formData }: { formData: Record<string, unknown> }) {
  const goals = formData.goals as string[] | undefined;
  const goalsOther = formData.goalsOther as string | undefined;
  const allGoals = [...(goals ?? []), ...(goalsOther?.trim() ? [goalsOther.trim()] : [])];

  const medHistory = formData.medHistory as string[] | undefined;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Basic Info + Measurements */}
      <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 8, fontSize: 13 }}>البيانات الأساسية والقياسات</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {FLAT_LABELS.map(({ key, label }) => {
            const val = formData[key];
            if (val === null || val === undefined || val === "") return null;
            return (
              <div key={key} style={{ fontSize: 12 }}>
                <span style={{ color: "#9a8a90" }}>{label}: </span>
                <span style={{ color: "#fff" }}>{fmtVal(val)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Goals */}
      {allGoals.length > 0 && (
        <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 8, fontSize: 13 }}>الهدف من الاستشارة</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allGoals.map((g) => (
              <span key={g} style={{ background: "rgba(233,30,99,.15)", border: "1px solid rgba(233,30,99,.3)", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#ffb7d0" }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {/* Medical History */}
      {(medHistory?.length ?? 0) > 0 && (
        <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontWeight: 700, color: "#f5c542", marginBottom: 8, fontSize: 13 }}>التاريخ المرضي</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {medHistory!.map((c) => (
              <span key={c} style={{ background: "rgba(245,197,66,.1)", border: "1px solid rgba(245,197,66,.25)", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#f5c542" }}>{c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type SlotEntry = { label: string; day: string; time: string };

// ── Profile Form ───────────────────────────────────────────────────────────────
function ProfileForm({ profile, staffUsers, onSave, onClose }: {
  profile: NutritionistProfileRow | null;
  staffUsers: { id: string; name: string; email: string }[];
  onSave: () => void;
  onClose: () => void;
}) {
  const [userId, setUserId] = useState(profile?.userId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [image, setImage] = useState(profile?.image ?? "");
  const [isActive, setIsActive] = useState(profile?.isActive ?? true);
  const [showOnHome, setShowOnHome] = useState(profile?.showOnHome ?? true);
  const [slots, setSlots] = useState<SlotEntry[]>(profile?.slots ?? []);
  const [consFee, setConsFee] = useState(profile?.consultationFee ?? 400);
  const [consMemFee, setConsMemFee] = useState(profile?.consultationFeeMember ?? 300);
  const [followFee, setFollowFee] = useState(profile?.followupFee ?? 100);
  const [followMemFee, setFollowMemFee] = useState(profile?.followupFeeMember ?? 50);
  const [commissionRate, setCommissionRate] = useState(profile?.commissionRate ?? 0);
  const [commissionType, setCommissionType] = useState(profile?.commissionType ?? "percentage");
  const [newSlotLabel, setNewSlotLabel] = useState("");
  const [newSlotDay, setNewSlotDay] = useState("الأحد");
  const [newSlotTime, setNewSlotTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "nutritionists");
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !(payload as { url?: string }).url) throw new Error((payload as { error?: string }).error ?? "تعذر رفع الصورة");
      setImage((payload as { url: string }).url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "تعذر رفع الصورة");
    } finally {
      setUploading(false);
    }
  }

  const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

  async function handleSave() {
    if (!userId || !name) { setError("userId و الاسم مطلوبان"); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/admin/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile?.id,
        userId, name, bio: bio || null, image: image || null,
        isActive, showOnHome, slots,
        consultationFee: consFee, consultationFeeMember: consMemFee,
        followupFee: followFee, followupFeeMember: followMemFee,
        commissionRate, commissionType,
      }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError((d as { error?: string }).error ?? "خطأ"); return; }
    onSave();
  }

  function addSlot() {
    if (!newSlotLabel.trim()) return;
    setSlots((prev) => [...prev, { label: newSlotLabel.trim(), day: newSlotDay, time: newSlotTime }]);
    setNewSlotLabel("");
  }

  const inputSt: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 13, outline: "none" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: "#9a8a90" }}>حساب المستخدم</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} style={{ ...inputSt, marginTop: 4 }}>
            <option value="">— اختر مستخدم —</option>
            {staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#9a8a90" }}>الاسم</label>
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputSt, marginTop: 4 }} placeholder="اسم الدكتورة" />
        </div>
      </div>
      <div>
        <label style={{ fontSize: 11, color: "#9a8a90" }}>نبذة</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} style={{ ...inputSt, marginTop: 4, resize: "vertical" }} />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <label style={{ fontSize: 11, color: "#9a8a90" }}>صورة الدكتورة</label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.currentTarget.value = ""; }}
          style={{ fontSize: 13, color: "#d7aabd" }}
          disabled={uploading}
        />
        <input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          style={{ ...inputSt }}
          placeholder="أو أدخلي رابط الصورة مباشرة"
          dir="ltr"
        />
        {uploading && <div style={{ fontSize: 12, color: "#f59e0b" }}>جارٍ رفع الصورة...</div>}
        {uploadError && <div style={{ fontSize: 12, color: "#f87171" }}>{uploadError}</div>}
        {image && (
          <div style={{ width: 100, height: 100, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.15)" }}>
            <img src={image} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        {[
          { label: "سعر الكشف", val: consFee, set: setConsFee },
          { label: "كشف عضو", val: consMemFee, set: setConsMemFee },
          { label: "إعادة كشف", val: followFee, set: setFollowFee },
          { label: "إعادة كشف عضو", val: followMemFee, set: setFollowMemFee },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label style={{ fontSize: 11, color: "#9a8a90" }}>{label} (ج.م)</label>
            <input type="number" value={val} onChange={(e) => set(Number(e.target.value))} style={{ ...inputSt, marginTop: 4 }} />
          </div>
        ))}
      </div>
      {/* Commission settings */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "end" }}>
        <div>
          <label style={{ fontSize: 11, color: "#9a8a90" }}>نسبة/قيمة العمولة (إحالات + جلسات)</label>
          <input type="number" min="0" step="0.1" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} style={{ ...inputSt, marginTop: 4, width: 140 }} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "#9a8a90" }}>نوع العمولة</label>
          <select value={commissionType} onChange={(e) => setCommissionType(e.target.value)} style={{ ...inputSt, marginTop: 4 }}>
            <option value="percentage">نسبة مئوية (%)</option>
            <option value="fixed">مبلغ ثابت (ج.م)</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> نشط
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={showOnHome} onChange={(e) => setShowOnHome(e.target.checked)} /> يظهر في الهوم
        </label>
      </div>

      {/* Slots */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#f5c542", marginBottom: 8 }}>المواعيد المتاحة</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 11, color: "#9a8a90" }}>الوصف</label>
            <input value={newSlotLabel} onChange={(e) => setNewSlotLabel(e.target.value)} placeholder="مثال: الأحد 10 صباحاً" style={{ ...inputSt, marginTop: 4 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#9a8a90" }}>اليوم</label>
            <select value={newSlotDay} onChange={(e) => setNewSlotDay(e.target.value)} style={{ ...inputSt, marginTop: 4 }}>
              {days.map((d) => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#9a8a90" }}>الوقت</label>
            <input type="time" value={newSlotTime} onChange={(e) => setNewSlotTime(e.target.value)} style={{ ...inputSt, marginTop: 4 }} />
          </div>
          <button onClick={addSlot} style={{ padding: "8px 14px", background: "#c9a227", border: "none", borderRadius: 8, color: "#000", fontWeight: 700, cursor: "pointer" }}>+ إضافة</button>
        </div>
        {slots.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9a8a90" }}>لا توجد مواعيد محددة</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {slots.map((sl, i) => (
              <span key={i} style={{ background: "rgba(201,162,39,.15)", border: "1px solid rgba(201,162,39,.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {sl.label}
                <button onClick={() => setSlots((prev) => prev.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "8px 18px", background: "transparent", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, color: "#c9b9c1", cursor: "pointer" }}>إلغاء</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", background: "#e91e63", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
          {saving ? "جارٍ الحفظ..." : "حفظ"}
        </button>
      </div>
    </div>
  );
}

// ── Session Card ───────────────────────────────────────────────────────────────
function SessionCard({ session, onAction, onDelete }: { session: NutritionSessionRow; onAction: () => void; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [proposedInput, setProposedInput] = useState("");
  const [doctorNote, setDoctorNote] = useState(session.doctorNote ?? "");
  const [loading, setLoading] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");

  async function sendRescheduleRequest() {
    if (!rescheduleSlot.trim()) {
      alert("يرجى إدخال الموعد الجديد المقترح");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/admin/nutrition/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        proposedNewSlot: rescheduleSlot.trim(),
        doctorReason: rescheduleReason.trim() || undefined,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert((d as { error?: string }).error ?? "خطأ في إرسال الطلب");
      return;
    }
    alert("تم إرسال طلب تغيير الموعد للعميلة");
    setShowRescheduleForm(false);
    setRescheduleSlot("");
    setRescheduleReason("");
    onAction();
  }

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setLoading(true);
    await fetch("/api/admin/nutrition", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, action, doctorNote: doctorNote || undefined, ...extra }),
    });
    setLoading(false);
    onAction();
  }

  const statusColor = STATUS_COLORS[session.status] ?? "#6b7280";
  const typeLabel = session.type === "consultation" ? "كشف" : "إعادة كشف";

  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: `1px solid rgba(255,255,255,.1)`, borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{ padding: "14px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}
        onClick={() => setOpen((o) => !o)}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: statusColor + "22", color: statusColor, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, border: `1px solid ${statusColor}44` }}>
            {STATUS_LABELS[session.status] ?? session.status}
          </span>
          <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{session.user.name ?? "—"}</span>
          <span style={{ color: "#9a8a90", fontSize: 12 }}>{session.user.phone ?? session.user.email ?? ""}</span>
          <span style={{ background: session.type === "consultation" ? "rgba(59,130,246,.2)" : "rgba(168,85,247,.2)", color: session.type === "consultation" ? "#3b82f6" : "#a855f7", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700 }}>{typeLabel}</span>
          {session.isGymMember && <span style={{ color: "#22c55e", fontSize: 11 }}>✓ عضو</span>}
          <span style={{ color: "#f5c542", fontWeight: 700, fontSize: 13 }}>{session.price} ج.م</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {session.selectedSlot && <span style={{ color: "#c9a227", fontSize: 12 }}>📅 {session.selectedSlot}</span>}
          <span style={{ color: "#9a8a90", fontSize: 11 }}>{new Date(session.createdAt).toLocaleDateString("ar-EG")}</span>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm("هل أنت متأكد من حذف هذا الطلب؟")) onDelete(session.id); }}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}
            title="حذف الطلب"
          >🗑️</button>
          <span style={{ color: "#9a8a90" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          {/* Form Data */}
          {session.formData && (
            <div style={{ marginTop: 14 }}>
              <NutritionFormDetails formData={session.formData} />
            </div>
          )}

          {/* Proposed slots display */}
          {session.proposedSlots.length > 0 && (
            <div style={{ marginTop: 12, background: "rgba(167,139,250,.1)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, marginBottom: 6 }}>المواعيد المقترحة:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {session.proposedSlots.map((sl) => (
                  <span key={sl} style={{ background: "rgba(167,139,250,.15)", border: "1px solid rgba(167,139,250,.3)", borderRadius: 20, padding: "3px 10px", fontSize: 12, color: "#c4b5fd" }}>{sl}</span>
                ))}
              </div>
            </div>
          )}

          {/* Doctor note */}
          {session.doctorNote && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#9a8a90" }}>ملاحظة: {session.doctorNote}</div>
          )}

          {/* Actions */}
          {["pending", "awaiting_slot", "approved"].includes(session.status) && (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <textarea
                value={doctorNote}
                onChange={(e) => setDoctorNote(e.target.value)}
                placeholder="ملاحظة للعميل (اختياري)"
                rows={2}
                style={{ width: "100%", background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />

              {session.status === "pending" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 12, color: "#9a8a90" }}>اقتراح مواعيد للعميل (مفصولة بفاصلة):</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={proposedInput}
                      onChange={(e) => setProposedInput(e.target.value)}
                      placeholder="الأحد 10 صباحاً، الاثنين 4 مساءً"
                      style={{ flex: 1, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, outline: "none" }}
                    />
                    <button
                      onClick={() => act("propose_slots", { proposedSlots: proposedInput.split("،").map((s) => s.trim()).filter(Boolean) })}
                      disabled={loading || !proposedInput.trim()}
                      style={{ padding: "8px 14px", background: "#7c3aed", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      إرسال المواعيد
                    </button>
                  </div>
                  <button onClick={() => act("approve")} disabled={loading} style={{ padding: "8px 16px", background: "#16a34a", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    تأكيد مباشر (بدون موعد)
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {session.status === "approved" && (
                  <button onClick={() => act("complete")} disabled={loading} style={{ padding: "7px 14px", background: "#0284c7", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                    تم الكشف ✓
                  </button>
                )}
                {session.status === "paid" && (
                  <button onClick={() => setShowRescheduleForm(true)} disabled={loading} style={{ padding: "7px 14px", background: "#f59e0b", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                    📅 طلب تغيير الموعد
                  </button>
                )}
                <button onClick={() => act("reject")} disabled={loading} style={{ padding: "7px 14px", background: "#dc2626", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}>
                  رفض
                </button>
                <button onClick={() => act("cancel")} disabled={loading} style={{ padding: "7px 14px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>
                  إلغاء
                </button>
              </div>

              {/* Reschedule Request Form */}
              {showRescheduleForm && (
                <div style={{ marginTop: 14, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b" }}>طلب تغيير موعد الجلسة</div>
                  <div>
                    <label style={{ fontSize: 11, color: "#9a8a90", display: "block", marginBottom: 4 }}>الموعد الجديد المقترح</label>
                    <input
                      value={rescheduleSlot}
                      onChange={(e) => setRescheduleSlot(e.target.value)}
                      placeholder="مثال: الأحد 15 يوليو الساعة 10 صباحاً"
                      style={{ width: "100%", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "#9a8a90", display: "block", marginBottom: 4 }}>سبب التغيير (اختياري)</label>
                    <textarea
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      placeholder="سبب الظرف الطارئ..."
                      rows={2}
                      style={{ width: "100%", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "8px 10px", color: "#fff", fontSize: 12, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => void sendRescheduleRequest()} disabled={loading} style={{ padding: "8px 14px", background: "#f59e0b", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12, flex: 1 }}>
                      إرسال الطلب
                    </button>
                    <button onClick={() => setShowRescheduleForm(false)} disabled={loading} style={{ padding: "8px 14px", background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}>
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Nutrition({ adminRole = "admin" }: { adminRole?: string }) {
  void adminRole;
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [tab, setTab] = useState<"sessions" | "profiles" | "my">("sessions");
  const [sessions, setSessions] = useState<NutritionSessionRow[]>([]);
  const [profiles, setProfiles] = useState<NutritionistProfileRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<NutritionistProfileRow | null>(null);
  const [refundRequests, setRefundRequests] = useState<Array<{
    id: string;
    proposedNewSlot: string | null;
    doctorReason: string | null;
    clientReason: string | null;
    refundAmount: number | null;
    session: {
      id: string;
      price: number;
      selectedSlot: string | null;
      user: { id: string; name: string | null; phone: string | null };
    };
  }>>([]);

  const loadRefundRequests = useCallback(async () => {
    const res = await fetch("/api/admin/nutrition/reschedule?status=client_wants_refund");
    if (res.ok) {
      const d = await res.json() as { requests: typeof refundRequests };
      setRefundRequests(d.requests ?? []);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    if (tab === "sessions" || tab === "my") {
      const [sessionsRes] = await Promise.all([
        fetch(`/api/admin/nutrition?view=sessions&status=${statusFilter}`),
        loadRefundRequests(),
      ]);
      if (sessionsRes.ok) {
        const d = await sessionsRes.json() as { sessions: NutritionSessionRow[]; hasOwnProfile?: boolean };
        setSessions(d.sessions);
        if (typeof d.hasOwnProfile === "boolean") setIsOwnProfile(d.hasOwnProfile);
      }
    } else {
      const [profilesRes, staffRes] = await Promise.all([
        fetch("/api/admin/nutrition?view=profiles"),
        fetch("/api/admin/settings/staff"),
      ]);
      if (profilesRes.ok) { const d = await profilesRes.json() as { profiles: NutritionistProfileRow[] }; setProfiles(d.profiles); }
      if (staffRes.ok) { const d = await staffRes.json() as { employees: { id: string; name: string; email: string }[] }; setStaffUsers(d.employees); }
    }
    setLoading(false);
  }, [tab, statusFilter, loadRefundRequests]);

  useEffect(() => { load(); }, [load]);

  // ── My Settings state ──────────────────────────────────────────────────────
  const [mySection, setMySection] = useState<"slots" | "questions" | "links">("slots");
  const [myLoading, setMyLoading] = useState(false);
  const [mySlots, setMySlots] = useState<{ label: string; day: string; time: string }[]>([]);
  const [myQuestions, setMyQuestions] = useState<{ id: string; label: string; type: string; required: boolean; options?: string[] }[]>([]);
  const [myLinks, setMyLinks] = useState<{ id: string; token: string; label: string | null; clickCount: number; isActive: boolean }[]>([]);
  const [myCommissions, setMyCommissions] = useState<{ id: string; amount: number; status: string; createdAt: string; userMembership?: { user?: { name?: string } } }[]>([]);
  const [myCommissionSummary, setMyCommissionSummary] = useState({ totalEarned: 0, pendingEarned: 0 });
  const [myCommissionRate, setMyCommissionRate] = useState(0);
  const [myCommissionType, setMyCommissionType] = useState("percentage");
  const [newSlotLabel, setNewSlotLabel] = useState("");
  const [newSlotDay, setNewSlotDay] = useState("الأحد");
  const [newSlotTime, setNewSlotTime] = useState("10:00");
  const [slotsSaving, setSlotsSaving] = useState(false);
  const [slotsMsg, setSlotsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newQLabel, setNewQLabel] = useState("");
  const [newQType, setNewQType] = useState("text");
  const [newQRequired, setNewQRequired] = useState(false);
  const [newQOptions, setNewQOptions] = useState("");
  const [questionsSaving, setQuestionsSaving] = useState(false);
  const [questionsMsg, setQuestionsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [linkCreating, setLinkCreating] = useState(false);
  const [linksMsg, setLinksMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadMy = useCallback(async () => {
    setMyLoading(true);
    const [sRes, lRes] = await Promise.all([
      fetch("/api/nutritionist/slots", { cache: "no-store" }),
      fetch("/api/nutritionist/links", { cache: "no-store" }),
    ]);
    const sData = await sRes.json().catch(() => ({})) as { profile?: { slots?: typeof mySlots; questions?: typeof myQuestions; commissionRate?: number; commissionType?: string } };
    const lData = await lRes.json().catch(() => ({})) as { links?: typeof myLinks; commissions?: typeof myCommissions; summary?: typeof myCommissionSummary };
    if (sData.profile) {
      setMySlots(sData.profile.slots ?? []);
      setMyQuestions(sData.profile.questions ?? []);
      setMyCommissionRate(sData.profile.commissionRate ?? 0);
      setMyCommissionType(sData.profile.commissionType ?? "percentage");
    }
    if (lData.links) {
      setMyLinks(lData.links);
      setMyCommissions(lData.commissions ?? []);
      setMyCommissionSummary(lData.summary ?? { totalEarned: 0, pendingEarned: 0 });
    }
    setMyLoading(false);
  }, []);

  useEffect(() => { if (tab === "my") void loadMy(); }, [tab, loadMy]);

  const saveSlots = async () => {
    setSlotsSaving(true); setSlotsMsg(null);
    const res = await fetch("/api/nutritionist/slots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slots: mySlots }) });
    setSlotsMsg(res.ok ? { ok: true, text: "تم حفظ المواعيد ✓" } : { ok: false, text: "خطأ في الحفظ" });
    setSlotsSaving(false);
  };

  const saveQuestions = async () => {
    setQuestionsSaving(true); setQuestionsMsg(null);
    const res = await fetch("/api/nutritionist/slots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: myQuestions }) });
    setQuestionsMsg(res.ok ? { ok: true, text: "تم حفظ الأسئلة ✓" } : { ok: false, text: "خطأ في الحفظ" });
    setQuestionsSaving(false);
  };

  const createLink = async () => {
    setLinkCreating(true); setLinksMsg(null);
    const res = await fetch("/api/nutritionist/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newLinkLabel.trim() || null }) });
    const d = await res.json().catch(() => ({})) as { link?: (typeof myLinks)[0] };
    if (res.ok && d.link) { setMyLinks((prev) => [d.link!, ...prev]); setNewLinkLabel(""); }
    else setLinksMsg({ ok: false, text: "خطأ في الإنشاء" });
    setLinkCreating(false);
  };

  const toggleLink = async (link: (typeof myLinks)[0]) => {
    const res = await fetch("/api/nutritionist/links", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id, isActive: !link.isActive }) });
    if (res.ok) setMyLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, isActive: !l.isActive } : l));
  };

  const deleteLink = async (id: string) => {
    if (!confirm("حذف هذا الرابط؟")) return;
    const res = await fetch(`/api/nutritionist/links?id=${id}`, { method: "DELETE" });
    if (res.ok) setMyLinks((prev) => prev.filter((l) => l.id !== id));
  };

  // ── helpers ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };

  const statuses = ["all", "pending", "awaiting_slot", "approved", "paid", "completed", "rejected", "cancelled"];

  const btnSt = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontWeight: active ? 700 : 500,
    background: active ? "#e91e63" : "rgba(255,255,255,.07)", color: active ? "#fff" : "#c9b9c1", fontSize: 13,
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 10 }}>
        <button style={btnSt(tab === "sessions")} onClick={() => setTab("sessions")}>الطلبات</button>
        {isOwnProfile && (
          <button style={btnSt(tab === "my")} onClick={() => setTab("my")}>⚙️ إعداداتي</button>
        )}
        {!isOwnProfile && (
          <button style={btnSt(tab === "profiles")} onClick={() => setTab("profiles")}>إدارة الدكتورة</button>
        )}
      </div>

      {/* Sessions Tab */}
      {tab === "sessions" && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {statuses.map((s) => (
              <button key={s} style={btnSt(statusFilter === s)} onClick={() => setStatusFilter(s)}>
                {s === "all" ? "الكل" : STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>

          {/* Refund Requests Section */}
          {refundRequests.length > 0 && (
            <div style={{ background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.3)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#ef4444", marginBottom: 10 }}>⚠ طلبات استرجاع معلقة ({refundRequests.length})</div>
              <div style={{ display: "grid", gap: 8 }}>
                {refundRequests.map((req) => (
                  <div key={req.id} style={{ background: "rgba(255,255,255,.05)", borderRadius: 10, padding: 12, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "#fff", fontSize: 13 }}>{req.session.user.name ?? "—"}</div>
                        <div style={{ fontSize: 12, color: "#9a8a90" }}>{req.session.user.phone ?? "—"}</div>
                        <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 4 }}>
                          الموعد الحالي: <span style={{ color: "#f5c542" }}>{req.session.selectedSlot ?? "—"}</span>
                        </div>
                        {req.proposedNewSlot && (
                          <div style={{ fontSize: 12, color: "#9a8a90" }}>
                            الموعد المقترح: <span style={{ color: "#f59e0b" }}>{req.proposedNewSlot}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#ef4444" }}>
                        {req.refundAmount ?? req.session.price} ج.م
                      </div>
                    </div>
                    {req.clientReason && (
                      <div style={{ fontSize: 12, color: "#c9b9c1", background: "rgba(0,0,0,.2)", borderRadius: 6, padding: "6px 10px" }}>
                        <span style={{ color: "#9a8a90" }}>سبب الرفض: </span>{req.clientReason}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={async () => {
                          if (!confirm("هل أنت متأكدة من الموافقة على استرجاع المبلغ؟")) return;
                          const res = await fetch("/api/admin/nutrition/reschedule", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ requestId: req.id, action: "approve_refund" }),
                          });
                          if (res.ok) {
                            alert("تمت الموافقة وإضافة المبلغ لمحفظة العميلة");
                            load();
                          } else {
                            const d = await res.json().catch(() => ({}));
                            alert((d as { error?: string }).error ?? "خطأ");
                          }
                        }}
                        style={{ flex: 1, padding: "8px 12px", background: "#22c55e", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                      >
                        ✓ موافقة على الاسترجاع
                      </button>
                      <button
                        onClick={async () => {
                          const reason = prompt("سبب الرفض (اختياري):");
                          if (reason === null) return; // user cancelled
                          const res = await fetch("/api/admin/nutrition/reschedule", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ requestId: req.id, action: "reject_refund", reason: reason || undefined }),
                          });
                          if (res.ok) {
                            alert("تم رفض طلب الاسترجاع");
                            load();
                          } else {
                            const d = await res.json().catch(() => ({}));
                            alert((d as { error?: string }).error ?? "خطأ");
                          }
                        }}
                        style={{ padding: "8px 12px", background: "rgba(239,68,68,.2)", border: "1px solid rgba(239,68,68,.4)", borderRadius: 8, color: "#ef4444", fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                      >
                        ✗ رفض
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div style={{ color: "#9a8a90", textAlign: "center", padding: 40 }}>جارٍ التحميل...</div>
          ) : sessions.length === 0 ? (
            <div style={{ color: "#9a8a90", textAlign: "center", padding: 40 }}>لا توجد طلبات</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  onAction={load}
                  onDelete={async (id) => {
                    await fetch(`/api/admin/nutrition?sessionId=${id}`, { method: "DELETE" });
                    load();
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* My Settings Tab */}
      {tab === "my" && isOwnProfile && (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Sub-tabs */}
          <div style={{ display: "flex", gap: 8 }}>
            {(["slots", "questions", "links"] as const).map((s) => (
              <button key={s} style={{ ...btnSt(mySection === s), borderRadius: 8, padding: "6px 14px", fontSize: 12 }} onClick={() => setMySection(s)}>
                {s === "slots" ? "📅 المواعيد" : s === "questions" ? "❓ أسئلة الحجز" : "🔗 روابط الإحالة"}
              </button>
            ))}
          </div>

          {myLoading && <div style={{ color: "#9a8a90", padding: 20, textAlign: "center" }}>جارٍ التحميل...</div>}

          {/* SLOTS */}
          {!myLoading && mySection === "slots" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#9a8a90" }}>المواعيد المتاحة للعملاء عند الحجز</div>
              {mySlots.length === 0 && <div style={{ color: "#9a8a90", fontSize: 13 }}>لا توجد مواعيد بعد</div>}
              {mySlots.map((slot, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{slot.label}</div>
                    <div style={{ fontSize: 12, color: "#9a8a90" }}>{slot.day} — {slot.time}</div>
                  </div>
                  <button onClick={() => setMySlots((p) => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>🗑</button>
                </div>
              ))}
              <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 14, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#c9b9c1" }}>إضافة موعد جديد</div>
                <input style={inp} placeholder="وصف الموعد (مثال: الأحد 10 صباحاً)" value={newSlotLabel} onChange={(e) => setNewSlotLabel(e.target.value)} />
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ ...inp, flex: 1 }} value={newSlotDay} onChange={(e) => setNewSlotDay(e.target.value)}>
                    {["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <input style={{ ...inp, flex: 1 }} type="time" value={newSlotTime} onChange={(e) => setNewSlotTime(e.target.value)} />
                </div>
                <button onClick={() => { if (newSlotLabel.trim()) { setMySlots((p) => [...p, { label: newSlotLabel.trim(), day: newSlotDay, time: newSlotTime }]); setNewSlotLabel(""); } }} style={{ padding: "8px 16px", background: "#e91e63", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ إضافة</button>
              </div>
              {slotsMsg && <div style={{ padding: "8px 12px", borderRadius: 8, background: slotsMsg.ok ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: slotsMsg.ok ? "#22c55e" : "#ef4444", fontSize: 13 }}>{slotsMsg.text}</div>}
              <button onClick={() => void saveSlots()} disabled={slotsSaving} style={{ padding: "10px 20px", background: "#e91e63", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: slotsSaving ? 0.6 : 1 }}>
                {slotsSaving ? "جارٍ الحفظ..." : "💾 حفظ المواعيد"}
              </button>
            </div>
          )}

          {/* QUESTIONS */}
          {!myLoading && mySection === "questions" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 12, color: "#9a8a90" }}>أسئلة إضافية تظهر للعميل عند الحجز</div>
              {myQuestions.length === 0 && <div style={{ color: "#9a8a90", fontSize: 13 }}>لا توجد أسئلة بعد</div>}
              {myQuestions.map((q, i) => (
                <div key={q.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{q.label}</div>
                    <div style={{ fontSize: 12, color: "#9a8a90" }}>{q.type}{q.required ? " — مطلوب" : ""}{q.options?.length ? ` — [${q.options.join(", ")}]` : ""}</div>
                  </div>
                  <button onClick={() => setMyQuestions((p) => p.filter((_, idx) => idx !== i))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>🗑</button>
                </div>
              ))}
              <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 14, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#c9b9c1" }}>إضافة سؤال جديد</div>
                <input style={inp} placeholder="نص السؤال" value={newQLabel} onChange={(e) => setNewQLabel(e.target.value)} />
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select style={{ ...inp, flex: 1 }} value={newQType} onChange={(e) => setNewQType(e.target.value)}>
                    <option value="text">نص قصير</option>
                    <option value="textarea">نص طويل</option>
                    <option value="select">قائمة منسدلة</option>
                    <option value="radio">اختيار واحد</option>
                    <option value="checkbox">اختيار متعدد</option>
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#c9b9c1", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={newQRequired} onChange={(e) => setNewQRequired(e.target.checked)} />
                    مطلوب
                  </label>
                </div>
                {["select","radio","checkbox"].includes(newQType) && (
                  <input style={inp} placeholder="الخيارات مفصولة بفاصلة" value={newQOptions} onChange={(e) => setNewQOptions(e.target.value)} />
                )}
                <button onClick={() => { if (!newQLabel.trim()) return; const opts = newQOptions.split(",").map((s) => s.trim()).filter(Boolean); setMyQuestions((p) => [...p, { id: Date.now().toString(), label: newQLabel.trim(), type: newQType, required: newQRequired, options: opts.length ? opts : undefined }]); setNewQLabel(""); setNewQOptions(""); setNewQRequired(false); }} style={{ padding: "8px 16px", background: "#e91e63", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>+ إضافة سؤال</button>
              </div>
              {questionsMsg && <div style={{ padding: "8px 12px", borderRadius: 8, background: questionsMsg.ok ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: questionsMsg.ok ? "#22c55e" : "#ef4444", fontSize: 13 }}>{questionsMsg.text}</div>}
              <button onClick={() => void saveQuestions()} disabled={questionsSaving} style={{ padding: "10px 20px", background: "#e91e63", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: questionsSaving ? 0.6 : 1 }}>
                {questionsSaving ? "جارٍ الحفظ..." : "💾 حفظ الأسئلة"}
              </button>
            </div>
          )}

          {/* REFERRAL LINKS */}
          {!myLoading && mySection === "links" && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "rgba(34,197,94,.1)", border: "1px solid rgba(34,197,94,.2)", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11, color: "#9a8a90", marginBottom: 4 }}>إجمالي العمولات</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#22c55e" }}>{myCommissionSummary.totalEarned.toFixed(2)} ج.م</div>
                </div>
                <div style={{ background: "rgba(245,197,66,.1)", border: "1px solid rgba(245,197,66,.2)", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 11, color: "#9a8a90", marginBottom: 4 }}>في الانتظار</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#f5c542" }}>{myCommissionSummary.pendingEarned.toFixed(2)} ج.م</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#9a8a90", background: "rgba(255,255,255,.04)", borderRadius: 8, padding: "8px 12px" }}>
                نسبة عمولتك: {myCommissionRate}{myCommissionType === "percentage" ? "%" : " ج.م"} لكل اشتراك عبر رابطك
              </div>
              <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 14, display: "grid", gap: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>إنشاء رابط إحالة جديد</div>
                <input style={inp} placeholder="تسمية اختيارية للرابط" value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} />
                <button onClick={() => void createLink()} disabled={linkCreating} style={{ padding: "8px 16px", background: "#e91e63", border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, cursor: "pointer", opacity: linkCreating ? 0.6 : 1, fontSize: 13 }}>
                  {linkCreating ? "جارٍ الإنشاء..." : "+ إنشاء رابط"}
                </button>
              </div>
              {linksMsg && <div style={{ padding: "8px 12px", borderRadius: 8, background: linksMsg.ok ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)", color: linksMsg.ok ? "#22c55e" : "#ef4444", fontSize: 13 }}>{linksMsg.text}</div>}
              {myLinks.length === 0 ? (
                <div style={{ color: "#9a8a90", fontSize: 13 }}>لا توجد روابط بعد</div>
              ) : (
                myLinks.map((link) => {
                  const url = `https://fitzoneland.com/register?nutritionRef=${link.token}`;
                  return (
                    <div key={link.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 14, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: "#fff" }}>{link.label ?? link.token}</div>
                          <div style={{ fontSize: 12, color: "#9a8a90" }}>{link.token} — {link.clickCount} اشتراك</div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => void toggleLink(link)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: link.isActive ? "rgba(239,68,68,.15)" : "rgba(34,197,94,.15)", color: link.isActive ? "#ef4444" : "#22c55e" }}>
                            {link.isActive ? "تعطيل" : "تفعيل"}
                          </button>
                          <button onClick={() => void deleteLink(link.id)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(255,255,255,.07)", color: "#ef4444", fontSize: 13 }}>🗑</button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.2)", borderRadius: 8, padding: "6px 10px" }}>
                        <span style={{ fontSize: 12, color: "#9a8a90", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{url}</span>
                        <button onClick={() => { void navigator.clipboard.writeText(url); setLinksMsg({ ok: true, text: "تم النسخ!" }); }} style={{ background: "none", border: "none", color: "#3b82f6", cursor: "pointer", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>📋 نسخ</button>
                      </div>
                      {!link.isActive && <div style={{ fontSize: 12, color: "#f5c542" }}>⚠ هذا الرابط معطل</div>}
                    </div>
                  );
                })
              )}
              {myCommissions.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 8 }}>سجل العمولات</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {myCommissions.slice(0, 20).map((c) => (
                      <div key={c.id} style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#fff" }}>{c.userMembership?.user?.name ?? "—"}</div>
                          <div style={{ fontSize: 12, color: "#9a8a90" }}>{new Date(c.createdAt).toLocaleDateString("ar-EG")}</div>
                        </div>
                        <div style={{ textAlign: "left" }}>
                          <div style={{ fontWeight: 800, color: "#22c55e", fontSize: 14 }}>{c.amount.toFixed(2)} ج.م</div>
                          <div style={{ fontSize: 12, color: c.status === "settled" ? "#9a8a90" : "#f5c542" }}>{c.status === "settled" ? "مسدد" : "في الانتظار"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Profiles Tab — admin only */}
      {tab === "profiles" && !isOwnProfile && (
        <>
          <button
            onClick={() => { setEditingProfile(null); setShowProfileForm(true); }}
            style={{ alignSelf: "flex-start", padding: "9px 20px", background: "#e91e63", border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            + إضافة دكتورة تغذية
          </button>

          {showProfileForm && (
            <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 20 }}>
              <div style={{ fontWeight: 700, color: "#fff", marginBottom: 14 }}>
                {editingProfile ? "تعديل ملف الدكتورة" : "إضافة دكتورة تغذية جديدة"}
              </div>
              <ProfileForm
                profile={editingProfile}
                staffUsers={staffUsers}
                onSave={() => { setShowProfileForm(false); setEditingProfile(null); load(); }}
                onClose={() => { setShowProfileForm(false); setEditingProfile(null); }}
              />
            </div>
          )}

          {loading ? (
            <div style={{ color: "#9a8a90", textAlign: "center", padding: 40 }}>جارٍ التحميل...</div>
          ) : profiles.length === 0 ? (
            <div style={{ color: "#9a8a90", textAlign: "center", padding: 40 }}>لا توجد ملفات دكتورة</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {profiles.map((p) => (
                <div key={p.id} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    {p.image ? <img src={p.image} alt={p.name} style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 52, height: 52, borderRadius: "50%", background: "rgba(233,30,99,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🥗</div>}
                    <div>
                      <div style={{ fontWeight: 800, color: "#fff", fontSize: 16 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: "#9a8a90" }}>{p.linkedUser?.email ?? ""}</div>
                      <div style={{ fontSize: 12, color: "#f5c542", marginTop: 4 }}>
                        كشف: {p.consultationFee} ج.م (عضو: {p.consultationFeeMember}) | إعادة: {p.followupFee} ج.م (عضو: {p.followupFeeMember})
                      </div>
                      <div style={{ fontSize: 12, color: "#9a8a90", marginTop: 2 }}>{p.slots.length} موعد | عمولة: {p.commissionRate}{p.commissionType === "fixed" ? " ج.م" : "%"}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: p.isActive ? "rgba(34,197,94,.15)" : "rgba(107,114,128,.15)", color: p.isActive ? "#22c55e" : "#6b7280", border: `1px solid ${p.isActive ? "#22c55e44" : "#6b728044"}` }}>
                      {p.isActive ? "نشط" : "غير نشط"}
                    </span>
                    <button
                      onClick={() => { setEditingProfile(p); setShowProfileForm(true); }}
                      style={{ padding: "6px 14px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, color: "#c9b9c1", cursor: "pointer", fontSize: 12 }}
                    >
                      تعديل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
