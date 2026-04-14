"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, ChatSession, QuickReply } from "../types";

function formatTime(value: string) {
  return new Date(value).toLocaleString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function LiveChat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQRPanel, setShowQRPanel] = useState(false);
  const [newQRLabel, setNewQRLabel] = useState("");
  const [newQRContent, setNewQRContent] = useState("");
  const [savingQR, setSavingQR] = useState(false);

  const selected = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null,
    [selectedId, sessions],
  );

  const loadSessions = async () => {
    const res = await fetch("/api/chat/admin/sessions", { cache: "no-store" });
    const data = await res.json();
    setSessions(Array.isArray(data) ? data : []);
    if (!selectedId && Array.isArray(data) && data[0]?.id) setSelectedId(data[0].id);
    setLoading(false);
  };

  const loadQuickReplies = async () => {
    const res = await fetch("/api/chat/admin/quick-replies", { cache: "no-store" });
    const data = await res.json();
    setQuickReplies(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadSessions().catch(() => setLoading(false));
    loadQuickReplies().catch(() => {});
    const poll = setInterval(() => loadSessions().catch(() => {}), 25000);
    const presencePulse = setInterval(() => {
      fetch("/api/chat/admin/presence", { method: "POST" }).catch(() => {});
    }, 60000);
    fetch("/api/chat/admin/presence", { method: "POST" }).catch(() => {});
    return () => { clearInterval(poll); clearInterval(presencePulse); };
  }, []);

  const updateSession = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    await fetch("/api/chat/admin/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selected.id, ...payload }),
    });
    await loadSessions();
  };

  const deleteSession = async () => {
    if (!selected) return;
    if (!confirm("حذف هذه المحادثة نهائياً؟ لا يمكن التراجع.")) return;
    setDeleting(true);
    await fetch("/api/chat/admin/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selected.id }),
    });
    setSelectedId("");
    await loadSessions();
    setDeleting(false);
  };

  const sendReply = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    await fetch("/api/chat/admin/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selected.id, content: reply }),
    });
    setReply("");
    setSending(false);
    await loadSessions();
  };

  const addQuickReply = async () => {
    if (!newQRLabel.trim() || !newQRContent.trim()) return;
    setSavingQR(true);
    await fetch("/api/chat/admin/quick-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newQRLabel, content: newQRContent }),
    });
    setNewQRLabel("");
    setNewQRContent("");
    setSavingQR(false);
    await loadQuickReplies();
  };

  const deleteQuickReply = async (id: string) => {
    await fetch("/api/chat/admin/quick-replies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadQuickReplies();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">

      {/* ── Sessions sidebar ───────────────────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-white">الدردشة المباشرة</h2>
            <p className="text-xs text-gray-500">متابعة رسائل العملاء والرد اليدوي</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">Online</span>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-5 text-sm text-gray-500">جارٍ تحميل المحادثات...</div>
          ) : sessions.length === 0 ? (
            <div className="p-5 text-sm text-gray-500">لا توجد محادثات حالياً.</div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                className={`w-full border-b border-gray-800/60 px-5 py-4 text-right transition-colors ${
                  selected?.id === session.id ? "bg-red-950/30" : "hover:bg-gray-900"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-white">{session.visitorName || "زائر جديد"}</div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] ${
                    session.status === "resolved"
                      ? "bg-gray-800 text-gray-400"
                      : session.mode === "live"
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "bg-yellow-500/10 text-yellow-400"
                  }`}>
                    {session.status === "resolved" ? "مغلقة" : session.mode === "live" ? "لايف" : "بوت"}
                  </span>
                </div>
                <div className="line-clamp-2 text-xs text-gray-400">
                  {session.messages[session.messages.length - 1]?.content || "لا توجد رسائل بعد"}
                </div>
                <div className="mt-2 text-[11px] text-gray-600">{formatTime(session.lastMessageAt)}</div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ── Chat panel ────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-950">
        {!selected ? (
          <div className="p-8 text-sm text-gray-500">اختر محادثة من القائمة لعرض الرسائل.</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-white">{selected.visitorName || "زائر"}</h3>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>{selected.visitorPhone || "بدون رقم"}</span>
                  <span>{selected.mode === "live" ? "وضع: مباشر" : "وضع: بوت"}</span>
                  {selected.assignedTo?.name && <span>المسؤول: {selected.assignedTo.name}</span>}
                  {selected.recommendedMembership && (
                    <span className="text-yellow-400">
                      الباقة المقترحة: {selected.recommendedMembership.name} – {selected.recommendedMembership.price} ج.م
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateSession({ assignToMe: true, mode: "live", status: "live" })}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700"
                >
                  استلام المحادثة
                </button>
                <button
                  onClick={() => updateSession({ mode: "bot", status: "open" })}
                  className="rounded-xl bg-gray-800 px-3 py-2 text-sm font-bold text-gray-200 hover:bg-gray-700"
                >
                  إرجاع للبوت
                </button>
                <button
                  onClick={() => updateSession({ status: "resolved" })}
                  className="rounded-xl bg-emerald-600/20 px-3 py-2 text-sm font-bold text-emerald-400 hover:bg-emerald-600/30"
                >
                  إنهاء
                </button>
                <button
                  onClick={deleteSession}
                  disabled={deleting}
                  className="rounded-xl bg-red-950/60 px-3 py-2 text-sm font-bold text-red-400 hover:bg-red-900/60 disabled:opacity-50"
                >
                  {deleting ? "جارٍ الحذف..." : "🗑 حذف"}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="h-[40vh] space-y-3 overflow-y-auto bg-black/40 p-6">
              {selected.messages.map((message: ChatMessage) => {
                const isOperator = message.senderType === "admin" || message.senderType === "staff";
                const isUser = message.senderType === "user";
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                      isUser
                        ? "border border-gray-800 bg-gray-900 text-gray-200"
                        : isOperator
                          ? "border border-red-500/30 bg-red-600/15 text-white"
                          : message.senderType === "bot"
                            ? "border border-yellow-500/20 bg-yellow-500/10 text-yellow-50"
                            : "bg-gray-800 text-gray-300"
                    }`}>
                      <div className="mb-1 text-[11px] font-bold opacity-70">
                        {message.senderName || (isUser ? "العميل" : message.senderType === "bot" ? "مساعد فت زون" : "النظام")}
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className="mt-2 text-[10px] opacity-50">{formatTime(message.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick replies bar */}
            {quickReplies.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-t border-gray-800/60 bg-black/20 px-5 py-3">
                <span className="text-[11px] text-gray-600 shrink-0">ردود سريعة:</span>
                {quickReplies.map((qr) => (
                  <button
                    key={qr.id}
                    onClick={() => setReply(qr.content)}
                    className="rounded-full border border-gray-700 bg-gray-900 px-3 py-1 text-xs text-gray-300 hover:border-red-500/60 hover:text-white transition-colors"
                  >
                    {qr.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowQRPanel((v) => !v)}
                  className="rounded-full border border-dashed border-gray-700 px-3 py-1 text-xs text-gray-500 hover:border-gray-500 hover:text-white transition-colors"
                >
                  {showQRPanel ? "✕ إغلاق" : "⚙ إدارة"}
                </button>
              </div>
            )}

            {/* Quick replies management panel */}
            {(showQRPanel || quickReplies.length === 0) && (
              <div className="border-t border-gray-800/60 bg-black/30 px-5 py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-400">إدارة الردود السريعة</span>
                  {quickReplies.length > 0 && (
                    <button onClick={() => setShowQRPanel(false)} className="text-xs text-gray-600 hover:text-white">✕ إغلاق</button>
                  )}
                </div>

                {quickReplies.length > 0 && (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {quickReplies.map((qr) => (
                      <div key={qr.id} className="flex items-start gap-2 rounded-xl border border-gray-800 bg-gray-900/50 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white">{qr.label}</div>
                          <div className="text-[11px] text-gray-500 line-clamp-1">{qr.content}</div>
                        </div>
                        <button onClick={() => deleteQuickReply(qr.id)} className="shrink-0 text-xs text-red-500 hover:text-red-400">حذف</button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid gap-2">
                  <input
                    value={newQRLabel}
                    onChange={(e) => setNewQRLabel(e.target.value)}
                    placeholder="اسم الرد (مثال: ترحيب)"
                    className="rounded-xl border border-gray-800 bg-black px-3 py-2 text-xs text-white outline-none focus:border-red-600"
                  />
                  <textarea
                    value={newQRContent}
                    onChange={(e) => setNewQRContent(e.target.value)}
                    placeholder="نص الرد السريع..."
                    rows={2}
                    className="rounded-xl border border-gray-800 bg-black px-3 py-2 text-xs text-white outline-none focus:border-red-600 resize-none"
                  />
                  <button
                    onClick={addQuickReply}
                    disabled={savingQR || !newQRLabel.trim() || !newQRContent.trim()}
                    className="self-start rounded-xl bg-red-600/80 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 disabled:opacity-50"
                  >
                    {savingQR ? "جارٍ الحفظ..." : "+ إضافة رد سريع"}
                  </button>
                </div>
              </div>
            )}

            {/* Reply input */}
            <div className="border-t border-gray-800 p-5">
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="اكتب ردك هنا..."
                  className="min-h-20 flex-1 rounded-2xl border border-gray-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-red-600"
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="self-end rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {sending ? "جارٍ الإرسال..." : "إرسال"}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
