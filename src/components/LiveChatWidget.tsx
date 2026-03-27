"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  senderType: "user" | "bot" | "admin" | "staff" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: { membershipId?: string } | null;
};

type ChatSessionPayload = {
  id: string;
  messages: ChatMessage[];
  recommendedMembership?: { id: string; name: string; price: number } | null;
};

const STORAGE_KEY = "fitzone-live-chat-session";

export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);
  const [recommendedMembership, setRecommendedMembership] =
    useState<ChatSessionPayload["recommendedMembership"]>(null);

  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);

  const loadPresence = async () => {
    const res = await fetch("/api/chat/presence", { cache: "no-store" });
    const data = await res.json();
    setOnline(Boolean(data.online));
  };

  const loadSession = async (id: string) => {
    const res = await fetch(`/api/chat/session?sessionId=${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as ChatSessionPayload;
    setMessages(data.messages ?? []);
    setRecommendedMembership(data.recommendedMembership ?? null);
  };

  const ensureSession = async () => {
    if (sessionId) return sessionId;

    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      setSessionId(stored);
      await loadSession(stored);
      return stored;
    }

    const res = await fetch("/api/chat/session", { method: "POST" });
    const data = (await res.json()) as ChatSessionPayload;
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(STORAGE_KEY, data.id);
    }
    setSessionId(data.id);
    setMessages(data.messages ?? []);
    return data.id;
  };

  useEffect(() => {
    loadPresence().catch(() => {});
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null;
    if (stored) {
      setSessionId(stored);
      loadSession(stored).catch(() => {});
    }

    const interval = setInterval(() => {
      loadPresence().catch(() => {});
      if (stored || sessionId) {
        loadSession(stored || sessionId).catch(() => {});
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content) return;

    setLoading(true);
    const id = await ensureSession();
    const res = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: id,
        content,
        visitorName: name,
        visitorPhone: phone,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as ChatSessionPayload;
      setMessages(data.messages ?? []);
      setRecommendedMembership(data.recommendedMembership ?? null);
      setInput("");
    }

    setLoading(false);
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen((value) => !value);
          ensureSession().catch(() => {});
        }}
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 80,
          width: 64,
          height: 64,
          borderRadius: "999px",
          border: "none",
          background: "linear-gradient(135deg, #E63916, #FF6A3D)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(230,57,22,.35)",
        }}
      >
        Chat
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 96,
            right: 20,
            zIndex: 80,
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            background: "#0f0f10",
            border: "1px solid #2A2A2A",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 18px 50px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ padding: 16, borderBottom: "1px solid #2A2A2A", background: "#151515" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>مساعد فت زون</div>
                <div style={{ color: online ? "#4ade80" : "#9ca3af", fontSize: 12 }}>
                  {online ? "الدعم المباشر متاح الآن" : "الرد الآلي متاح الآن"}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}
              >
                ×
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderBottom: "1px solid #222",
              display: "grid",
              gap: 8,
              background: "#111",
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسمك"
              style={inputStyle}
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم الجوال"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => sendMessage("أريد ترشيح باقة مناسبة")}
                style={quickButtonStyle}
              >
                ترشيح باقة
              </button>
              <button
                onClick={() => sendMessage("أريد التحدث مع موظف")}
                style={quickButtonStyle}
              >
                موظف مباشر
              </button>
            </div>
          </div>

          <div style={{ height: 340, overflowY: "auto", padding: 14, background: "#0a0a0a" }}>
            {messages.map((message) => {
              const isUser = message.senderType === "user";
              const isSupport = message.senderType === "admin" || message.senderType === "staff";

              return (
                <div
                  key={`${message.id}-${lastMessageId}`}
                  style={{
                    display: "flex",
                    justifyContent: isUser ? "flex-start" : "flex-end",
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      maxWidth: "84%",
                      padding: "12px 14px",
                      borderRadius: 18,
                      background: isUser
                        ? "#1b1b1d"
                        : isSupport
                          ? "rgba(230,57,22,.14)"
                          : "rgba(200,162,0,.12)",
                      color: "#fff",
                      border: isUser
                        ? "1px solid #2A2A2A"
                        : isSupport
                          ? "1px solid rgba(230,57,22,.2)"
                          : "1px solid rgba(200,162,0,.2)",
                      lineHeight: 1.8,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>
                      {message.senderName ||
                        (isUser
                          ? "أنت"
                          : message.senderType === "bot"
                            ? "مساعد فت زون"
                            : "الدعم")}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
                  </div>
                </div>
              );
            })}

            {recommendedMembership && (
              <div
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 18,
                  background: "rgba(230,57,22,.08)",
                  border: "1px solid rgba(230,57,22,.2)",
                }}
              >
                <div style={{ color: "#fff", fontWeight: 800, marginBottom: 6 }}>
                  الباقة المقترحة
                </div>
                <div style={{ color: "#ddd", fontSize: 13 }}>
                  {recommendedMembership.name} - {recommendedMembership.price} ج.م
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              padding: 12,
              borderTop: "1px solid #222",
              background: "#111",
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك عن التخسيس أو اللياقة أو الباقة..."
              style={{ ...inputStyle, minHeight: 52, resize: "none", flex: 1 }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                border: "none",
                borderRadius: 16,
                background: "#E63916",
                color: "#fff",
                padding: "0 18px",
                fontWeight: 800,
                cursor: "pointer",
                opacity: loading || !input.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "..." : "إرسال"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#0a0a0a",
  color: "#fff",
  border: "1px solid #2A2A2A",
  borderRadius: 14,
  padding: "10px 12px",
  outline: "none",
  fontSize: 13,
};

const quickButtonStyle: CSSProperties = {
  background: "rgba(255,255,255,.06)",
  border: "1px solid #2A2A2A",
  color: "#ddd",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};
