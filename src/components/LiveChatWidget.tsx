"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  senderType: "user" | "bot" | "admin" | "staff" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: { membershipId?: string; closeSession?: boolean } | null;
};

type ChatSessionPayload = {
  id: string;
  status?: "open" | "live" | "resolved";
  visitorName?: string | null;
  visitorPhone?: string | null;
  messages: ChatMessage[];
  recommendedMembership?: { id: string; name: string; price: number } | null;
  error?: string;
};

const STORAGE_KEY = "fitzone-live-chat-session";
const VISITOR_KEY = "fitzone-live-chat-visitor";

function normalizeSessionId(raw: string | null) {
  const value = raw?.trim();
  if (!value || value === "undefined" || value === "null") return "";
  return value;
}

function parseStoredVisitor(raw: string | null) {
  if (!raw) return { name: "", phone: "" };

  try {
    const parsed = JSON.parse(raw) as { name?: string; phone?: string };
    return {
      name: parsed.name?.trim() ?? "",
      phone: parsed.phone?.trim() ?? "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

export default function LiveChatWidget() {
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<"open" | "live" | "resolved">("open");
  const [recommendedMembership, setRecommendedMembership] =
    useState<ChatSessionPayload["recommendedMembership"]>(null);
  const [error, setError] = useState("");

  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);

  const clearStoredSession = () => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(VISITOR_KEY);
  };

  const saveVisitorIdentity = (visitorName: string, visitorPhone: string) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      VISITOR_KEY,
      JSON.stringify({
        name: visitorName.trim(),
        phone: visitorPhone.trim(),
      }),
    );
  };

  const applyPayload = (data: ChatSessionPayload) => {
    setSessionId(data.id);
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    setRecommendedMembership(data.recommendedMembership ?? null);
    setStatus(data.status ?? "open");
    setError(data.error ?? "");

    if (data.status === "resolved") {
      clearStoredSession();
      setSessionId("");
    } else if (typeof window !== "undefined" && data.id) {
      window.sessionStorage.setItem(STORAGE_KEY, data.id);
    }
  };

  const createFreshSession = async () => {
    clearStoredSession();
    setMessages([]);
    setRecommendedMembership(null);
    setStatus("open");
    setInput("");
    setError("");

    const res = await fetch("/api/chat/session", { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;

    if (!res.ok || !data?.id) {
      setError(data.error ?? "تعذر بدء المحادثة الآن. حاول مرة أخرى بعد قليل.");
      return "";
    }

    applyPayload(data);

    if (name.trim() || phone.trim()) {
      saveVisitorIdentity(name, phone);
    }

    return data.id;
  };

  const loadPresence = async () => {
    const res = await fetch("/api/chat/presence", { cache: "no-store" });
    const data = await res.json().catch(() => ({ online: false }));
    setOnline(Boolean(data.online));
  };

  const loadSession = async (id: string) => {
    const validId = normalizeSessionId(id);
    if (!validId) return;

    const res = await fetch(`/api/chat/session?sessionId=${validId}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;
    if (!res.ok || !data?.id) {
      clearStoredSession();
      if (open) setError(data.error ?? "تعذر تحميل المحادثة الحالية.");
      return;
    }

    applyPayload(data);
  };

  const ensureSession = async () => {
    const currentIdentity = {
      name: name.trim(),
      phone: phone.trim(),
    };

    const storedId = normalizeSessionId(
      typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
    );
    const storedVisitor = parseStoredVisitor(
      typeof window !== "undefined" ? window.sessionStorage.getItem(VISITOR_KEY) : null,
    );

    if (storedId) {
      const visitorChanged =
        (currentIdentity.name && storedVisitor.name && currentIdentity.name !== storedVisitor.name) ||
        (currentIdentity.phone && storedVisitor.phone && currentIdentity.phone !== storedVisitor.phone);

      if (visitorChanged) {
        return createFreshSession();
      }

      if (!sessionId) {
        await loadSession(storedId);
      }

      return storedId;
    }

    if (sessionId) return sessionId;
    return createFreshSession();
  };

  useEffect(() => {
    loadPresence().catch(() => {});

    const storedId = normalizeSessionId(
      typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
    );
    const storedVisitor = parseStoredVisitor(
      typeof window !== "undefined" ? window.sessionStorage.getItem(VISITOR_KEY) : null,
    );

    if (storedVisitor.name) setName(storedVisitor.name);
    if (storedVisitor.phone) setPhone(storedVisitor.phone);

    if (storedId) {
      loadSession(storedId).catch(() => {});
    }

    const interval = setInterval(() => {
      loadPresence().catch(() => {});
      const latest = normalizeSessionId(
        typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
      );
      if (latest) {
        loadSession(latest).catch(() => {});
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest?.metadata?.closeSession) {
      clearStoredSession();
      setSessionId("");
      setStatus("resolved");
    }
  }, [messages]);

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content) return;

    setLoading(true);
    setError("");

    try {
      const id = await ensureSession();
      if (!id) return;

      if (name.trim() || phone.trim()) {
        saveVisitorIdentity(name, phone);
      }

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

      const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;

      if (!res.ok) {
        setError(data.error ?? "تعذر إرسال الرسالة الآن.");
        return;
      }

      applyPayload(data);
      setInput("");
    } finally {
      setLoading(false);
    }
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
          background: "linear-gradient(135deg, #E91E63, #F06292)",
          color: "#fff",
          fontSize: 14,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(233,30,99,.35)",
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
            width: "min(380px, calc(100vw - 24px))",
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "calc(100vh - 116px)",
            background: "#FFF5F8",
            border: "1px solid #F5D0DC",
            borderRadius: 24,
            overflow: "hidden",
            boxShadow: "0 18px 50px rgba(233,30,99,.15)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: 16, borderBottom: "1px solid #F5D0DC", background: "linear-gradient(135deg, #E91E63, #F06292)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>مساعد فيت زون</div>
                <div style={{ color: online ? "#d4fce4" : "#ffe0ef", fontSize: 12 }}>
                  {online ? "الدعم المباشر متاح الآن" : "الرد الآلي متاح الآن"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => createFreshSession().catch(() => {})}
                  style={{
                    background: "rgba(255,255,255,.18)",
                    border: "1px solid rgba(255,255,255,.28)",
                    color: "#fff",
                    fontSize: 12,
                    borderRadius: 999,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  محادثة جديدة
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              borderBottom: "1px solid #F5D0DC",
              display: "grid",
              gap: 8,
              background: "#FFF0F5",
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك" style={inputStyle} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الجوال" style={inputStyle} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => sendMessage("أريد ترشيح باقة مناسبة")} style={quickButtonStyle}>
                ترشيح باقة
              </button>
              <button onClick={() => sendMessage("أريد التحدث مع موظف")} style={quickButtonStyle}>
                موظف مباشر
              </button>
            </div>
            {error && (
              <div
                style={{
                  background: "rgba(190,24,93,.08)",
                  border: "1px solid rgba(190,24,93,.2)",
                  color: "#BE185D",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.7,
                }}
              >
                {error}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 220,
              maxHeight: "calc(100vh - 360px)",
              overflowY: "auto",
              padding: 14,
              background: "#FFF5F8",
            }}
          >
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
                        ? "#FFFFFF"
                        : isSupport
                          ? "rgba(233,30,99,.12)"
                          : "rgba(233,30,99,.07)",
                      color: "#1A0812",
                      border: isUser
                        ? "1px solid #F5D0DC"
                        : isSupport
                          ? "1px solid rgba(233,30,99,.25)"
                          : "1px solid rgba(233,30,99,.15)",
                      lineHeight: 1.8,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 4 }}>
                      {message.senderName || (isUser ? "أنت" : message.senderType === "bot" ? "مساعد فيت زون" : "الدعم")}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
                  </div>
                </div>
              );
            })}

            {recommendedMembership && status !== "resolved" && (
              <div
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 18,
                  background: "rgba(233,30,99,.08)",
                  border: "1px solid rgba(233,30,99,.25)",
                }}
              >
                <div style={{ color: "#E91E63", fontWeight: 800, marginBottom: 6 }}>الباقة المقترحة</div>
                <div style={{ color: "#7A5B68", fontSize: 13 }}>
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
              borderTop: "1px solid #F5D0DC",
              background: "#FFF0F5",
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك عن اللياقة أو التغذية أو الباقة..."
              style={{ ...inputStyle, minHeight: 52, resize: "none", flex: 1 }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                border: "none",
                borderRadius: 16,
                background: "linear-gradient(135deg, #E91E63, #F06292)",
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
  background: "#FFFFFF",
  color: "#1A0812",
  border: "1px solid #F5D0DC",
  borderRadius: 14,
  padding: "10px 12px",
  outline: "none",
  fontSize: 13,
};

const quickButtonStyle: CSSProperties = {
  background: "rgba(233,30,99,.08)",
  border: "1px solid rgba(233,30,99,.2)",
  color: "#E91E63",
  borderRadius: 999,
  padding: "8px 12px",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};
