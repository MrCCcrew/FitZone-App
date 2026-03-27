"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, ChatSession } from "../types";

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

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? sessions[0] ?? null,
    [selectedId, sessions],
  );

  const loadSessions = async () => {
    const res = await fetch("/api/chat/admin/sessions", { cache: "no-store" });
    const data = await res.json();
    setSessions(Array.isArray(data) ? data : []);
    if (!selectedId && Array.isArray(data) && data[0]?.id) {
      setSelectedId(data[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessions().catch(() => setLoading(false));
    const poll = setInterval(() => {
      loadSessions().catch(() => {});
      fetch("/api/chat/admin/presence", { method: "POST" }).catch(() => {});
    }, 10000);

    fetch("/api/chat/admin/presence", { method: "POST" }).catch(() => {});

    return () => clearInterval(poll);
  }, [selectedId]);

  const updateSession = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    await fetch("/api/chat/admin/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selected.id, ...payload }),
    });
    await loadSessions();
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

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <section className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-white">الدردشة المباشرة</h2>
            <p className="text-xs text-gray-500">متابعة رسائل العملاء والرد اليدوي عند الحاجة</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
            Online
          </span>
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
                  <div className="text-sm font-bold text-white">
                    {session.visitorName || "زائر جديد"}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      session.status === "resolved"
                        ? "bg-gray-800 text-gray-400"
                        : session.mode === "live"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-yellow-500/10 text-yellow-400"
                    }`}
                  >
                    {session.status === "resolved"
                      ? "مغلقة"
                      : session.mode === "live"
                        ? "لايف"
                        : "بوت"}
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

      <section className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-950">
        {!selected ? (
          <div className="p-8 text-sm text-gray-500">اختر محادثة من القائمة لعرض الرسائل.</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-800 px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-white">{selected.visitorName || "زائر"}</h3>
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>{selected.visitorPhone || "بدون رقم"}</span>
                  <span>
                    {selected.mode === "live" ? "وضع المحادثة: مباشر" : "وضع المحادثة: بوت"}
                  </span>
                  {selected.assignedTo?.name && <span>المسؤول: {selected.assignedTo.name}</span>}
                  {selected.recommendedMembership && (
                    <span className="text-yellow-400">
                      الباقة المقترحة: {selected.recommendedMembership.name} -{" "}
                      {selected.recommendedMembership.price} ج.م
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
              </div>
            </div>

            <div className="h-[52vh] space-y-3 overflow-y-auto bg-black/40 p-6">
              {selected.messages.map((message: ChatMessage) => {
                const isOperator = message.senderType === "admin" || message.senderType === "staff";
                const isUser = message.senderType === "user";

                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-7 ${
                        isUser
                          ? "border border-gray-800 bg-gray-900 text-gray-200"
                          : isOperator
                            ? "border border-red-500/30 bg-red-600/15 text-white"
                            : message.senderType === "bot"
                              ? "border border-yellow-500/20 bg-yellow-500/10 text-yellow-50"
                              : "bg-gray-800 text-gray-300"
                      }`}
                    >
                      <div className="mb-1 text-[11px] font-bold opacity-70">
                        {message.senderName ||
                          (isUser
                            ? "العميل"
                            : message.senderType === "bot"
                              ? "مساعد فت زون"
                              : "النظام")}
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className="mt-2 text-[10px] opacity-50">{formatTime(message.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-800 p-5">
              <div className="flex gap-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="اكتب ردك هنا..."
                  className="min-h-24 flex-1 rounded-2xl border border-gray-800 bg-black px-4 py-3 text-white outline-none focus:border-red-600"
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
