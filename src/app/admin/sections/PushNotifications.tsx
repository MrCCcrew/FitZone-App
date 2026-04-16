"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Campaign = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  audience: string;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
  createdBy: string;
};

type StatsData = {
  totalSubs: number;
  campaigns: Campaign[];
};

type SubscriberUser = {
  id: string;
  name: string | null;
  email: string | null;
  subscriptionCount: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AUDIENCE_LABELS: Record<string, string> = {
  all:      "جميع المشتركين",
  active:   "الأعضاء النشطين",
  inactive: "الأعضاء غير النشطين",
  selected: "مستخدمون محددون",
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  done:    { bg: "rgba(34,197,94,.15)",  color: "#4ade80", label: "نجح" },
  partial: { bg: "rgba(234,179,8,.15)",  color: "#facc15", label: "جزئي" },
  failed:  { bg: "rgba(239,68,68,.15)",  color: "#f87171", label: "فشل" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("ar-EG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PushNotifications() {
  const [stats, setStats]   = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [title, setTitle]         = useState("");
  const [body, setBody]           = useState("");
  const [url, setUrl]             = useState("");
  const [audience, setAudience]   = useState<"all" | "active" | "inactive" | "selected">("all");
  const [sending, setSending]     = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; sent?: number; failed?: number; cleaned?: number; error?: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting]     = useState(false);

  // Selected users
  const [subscribers, setSubscribers]   = useState<SubscriberUser[]>([]);
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  const [userSearch, setUserSearch]     = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  const loadStats = () => {
    setLoading(true);
    fetch("/api/push/campaigns")
      .then((r) => r.json())
      .then((d: StatsData) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadStats(); }, []);

  // Load subscribed users when audience = selected
  useEffect(() => {
    if (audience !== "selected") return;
    setLoadingUsers(true);
    fetch("/api/push/subscribers")
      .then((r) => r.json())
      .then((d: { users?: SubscriberUser[] }) => setSubscribers(d.users ?? []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, [audience]);

  const toggleUser = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title || "اختبار FitZone", body: body || "هذه رسالة اختبار", url, audience: "all", test: true }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      setTestResult({ ok: !!d.ok, error: d.error });
    } catch {
      setTestResult({ ok: false, error: "فشل الاتصال بالخادم" });
    } finally {
      setTesting(false);
    }
  }

  async function sendNow() {
    if (!title.trim() || !body.trim()) {
      setSendResult({ ok: false, error: "العنوان والنص مطلوبان" });
      return;
    }
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || "/",
          audience,
          selectedUserIds: audience === "selected" ? selectedIds : undefined,
        }),
      });
      const d = await res.json() as { ok?: boolean; sent?: number; failed?: number; cleaned?: number; error?: string };
      setSendResult({ ok: !!d.ok, sent: d.sent, failed: d.failed, cleaned: d.cleaned, error: d.error });
      if (d.ok) {
        setTitle(""); setBody(""); setUrl(""); setAudience("all"); setSelectedIds([]);
        setTimeout(loadStats, 800);
      }
    } catch {
      setSendResult({ ok: false, error: "فشل الاتصال بالخادم" });
    } finally {
      setSending(false);
    }
  }

  const filteredSubscribers = subscribers.filter(
    (u) =>
      !userSearch ||
      u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email?.toLowerCase().includes(userSearch.toLowerCase()),
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 0 48px" }}>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 16, marginBottom: 32 }}>
        <StatCard label="إجمالي المشتركين"    value={loading ? "..." : String(stats?.totalSubs ?? 0)}  icon="🔔" color="#e91e63" />
        <StatCard label="حملات أُرسلت"        value={loading ? "..." : String(stats?.campaigns.length ?? 0)} icon="📤" color="#3b82f6" />
        <StatCard label="إجمالي وصلت"        value={loading ? "..." : String(stats?.campaigns.reduce((s, c) => s + c.sentCount, 0) ?? 0)} icon="✅" color="#22c55e" />
        <StatCard label="فشلت / منتهية"      value={loading ? "..." : String(stats?.campaigns.reduce((s, c) => s + c.failedCount, 0) ?? 0)} icon="❌" color="#f97316" />
      </div>

      {/* Compose form */}
      <Section title="إرسال إشعار جديد" icon="✍️">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Title */}
          <Field label="العنوان *">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: عرض حصري لأعضاء FitZone!"
              maxLength={100}
              style={inputStyle}
            />
            <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "left", marginTop: 3 }}>{title.length}/100</div>
          </Field>

          {/* Body */}
          <Field label="نص الإشعار *">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="نص موجز يظهر في الإشعار..."
              rows={3}
              maxLength={200}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ fontSize: 11, color: "#9ca3af", textAlign: "left", marginTop: 3 }}>{body.length}/200</div>
          </Field>

          {/* URL */}
          <Field label="رابط عند النقر (اختياري)">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="مثال: /offers أو https://..."
              style={inputStyle}
            />
          </Field>

          {/* Audience */}
          <Field label="الجمهور المستهدف">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["all", "active", "inactive", "selected"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAudience(a)}
                  style={{
                    padding: "7px 16px",
                    borderRadius: 8,
                    border: `1.5px solid ${audience === a ? "#e91e63" : "rgba(255,255,255,.15)"}`,
                    background: audience === a ? "rgba(233,30,99,.18)" : "rgba(255,255,255,.05)",
                    color: audience === a ? "#e91e63" : "#9ca3af",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>
          </Field>

          {/* Selected users picker */}
          {audience === "selected" && (
            <Field label={`اختر المستخدمين ${selectedIds.length > 0 ? `(${selectedIds.length} محدد)` : ""}`}>
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="ابحث بالاسم أو البريد..."
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              {loadingUsers ? (
                <div style={{ color: "#9ca3af", fontSize: 13 }}>جاري التحميل...</div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                  {filteredSubscribers.length === 0 && (
                    <div style={{ color: "#6b7280", fontSize: 13 }}>لا توجد نتائج</div>
                  )}
                  {filteredSubscribers.map((u) => (
                    <label
                      key={u.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        background: selectedIds.includes(u.id) ? "rgba(233,30,99,.12)" : "rgba(255,255,255,.04)",
                        border: `1px solid ${selectedIds.includes(u.id) ? "rgba(233,30,99,.35)" : "rgba(255,255,255,.1)"}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                        style={{ accentColor: "#e91e63" }}
                      />
                      <div>
                        <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{u.name ?? "—"}</div>
                        <div style={{ color: "#9ca3af", fontSize: 11 }}>{u.email}</div>
                      </div>
                      <span style={{ marginRight: "auto", fontSize: 11, color: "#6b7280" }}>
                        {u.subscriptionCount} جهاز
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Field>
          )}

          {/* Feedback messages */}
          {testResult && (
            <Msg ok={testResult.ok}>
              {testResult.ok ? "✅ تم إرسال رسالة الاختبار إلى جهازك" : `❌ ${testResult.error ?? "فشل الاختبار"}`}
            </Msg>
          )}
          {sendResult && (
            <Msg ok={sendResult.ok}>
              {sendResult.ok
                ? `✅ أُرسل بنجاح — وصل: ${sendResult.sent} · فشل: ${sendResult.failed} · حُذف منتهي: ${sendResult.cleaned}`
                : `❌ ${sendResult.error ?? "حدث خطأ"}`}
            </Msg>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            <button
              onClick={sendTest}
              disabled={testing || sending}
              style={{ ...btnStyle, background: "rgba(59,130,246,.18)", borderColor: "rgba(59,130,246,.4)", color: "#60a5fa" }}
            >
              {testing ? "⏳ جاري الإرسال..." : "🧪 اختبار على جهازي"}
            </button>
            <button
              onClick={sendNow}
              disabled={sending || testing || !title.trim() || !body.trim() || (audience === "selected" && selectedIds.length === 0)}
              style={{ ...btnStyle, background: "rgba(233,30,99,.18)", borderColor: "rgba(233,30,99,.45)", color: "#e91e63" }}
            >
              {sending ? "⏳ جاري الإرسال..." : "📤 إرسال الآن"}
            </button>
            <button
              onClick={loadStats}
              style={{ ...btnStyle, background: "rgba(255,255,255,.05)", borderColor: "rgba(255,255,255,.15)", color: "#9ca3af" }}
            >
              🔄 تحديث الإحصائيات
            </button>
          </div>
        </div>
      </Section>

      {/* Campaign logs */}
      <Section title="سجل الحملات" icon="📋">
        {loading ? (
          <div style={{ color: "#9ca3af", textAlign: "center", padding: "24px 0" }}>جاري التحميل...</div>
        ) : !stats?.campaigns.length ? (
          <div style={{ color: "#6b7280", textAlign: "center", padding: "24px 0", fontSize: 14 }}>
            لم يتم إرسال أي حملة بعد.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                  {["العنوان", "الجمهور", "وصل", "فشل", "الحالة", "أُرسل في", "بواسطة"].map((h) => (
                    <th key={h} style={{ textAlign: "right", padding: "8px 12px", color: "#9ca3af", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.campaigns.map((c) => {
                  const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.done;
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ color: "#fff", fontWeight: 600 }}>{c.title}</div>
                        <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{c.body.slice(0, 60)}{c.body.length > 60 ? "…" : ""}</div>
                        {c.url && c.url !== "/" && (
                          <div style={{ color: "#60a5fa", fontSize: 10, marginTop: 2 }}>{c.url}</div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#d4b8c8", whiteSpace: "nowrap" }}>{AUDIENCE_LABELS[c.audience] ?? c.audience}</td>
                      <td style={{ padding: "10px 12px", color: "#4ade80", fontWeight: 700 }}>{c.sentCount}</td>
                      <td style={{ padding: "10px 12px", color: c.failedCount > 0 ? "#f87171" : "#6b7280", fontWeight: 700 }}>{c.failedCount}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, background: st.bg, color: st.color, fontWeight: 700, fontSize: 11 }}>
                          {st.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>{fmt(c.createdAt)}</td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 12 }}>{c.createdBy}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

// ─── Small reusable UI ────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <span>{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#c9b9c1", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Msg({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      background: ok ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
      border: `1px solid ${ok ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
      color: ok ? "#4ade80" : "#f87171",
    }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,.06)",
  border: "1px solid rgba(255,255,255,.15)",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: 10,
  border: "1.5px solid",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  transition: "opacity .2s",
  opacity: 1,
};
