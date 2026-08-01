"use client";

import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/language";
import { Loader2, Mic, Phone, PhoneOff, Send, Square } from "lucide-react";
import {
  actionsFromNavigationTarget,
  COACH_UI_ACTION_EVENT,
  COACH_UI_ACTION_RESULT_EVENT,
  type CoachUiActionBatch,
  type CoachUiActionResult,
} from "@/lib/ai-coach/ui-action-dispatcher";

type ChatMessage = {
  id: string;
  senderType: "user" | "bot" | "admin" | "staff" | "system";
  senderName?: string | null;
  content: string;
  createdAt: string;
  metadata?: { membershipId?: string; closeSession?: boolean; action?: { type: "navigate"; page: "shop"; anchor: "shop-products" }; structured?: { actions?: Array<{ type: "open_page"; label: string; url: "/" | "/login" | "/account" | "/store" | "/#memberships" | "/#offers" | "/#classes" }> } } | null;
};

type QuickAction = {
  id: string;
  label: string;
  prompt: string;
};

type ChatSessionPayload = {
  id: string;
  status?: "open" | "live" | "resolved";
  visitorName?: string | null;
  visitorPhone?: string | null;
  messages: ChatMessage[];
  recommendedMembership?: { id: string; name: string; price: number } | null;
  quickActions?: QuickAction[];
  error?: string;
};

const STORAGE_KEY = "fitzone-live-chat-session";
const VISITOR_KEY = "fitzone-live-chat-visitor";
export const recorderMimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"] as const;

export function selectSupportedRecorderMime(isSupported: (mime: string) => boolean) {
  return recorderMimeCandidates.find(isSupported) ?? "";
}

export function stopMediaRecorder(recorder: Pick<MediaRecorder, "state" | "stop"> | null) {
  if (recorder?.state === "recording") recorder.stop();
}

export function buildFinalRecording(chunks: Blob[], mime: string) {
  return new Blob(chunks.filter((chunk) => chunk.size > 0), { type: mime });
}

export function createRealtimeToolOutputEvents(callId: string, result: unknown) {
  return [
    { type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } },
    { type: "response.create" },
  ];
}

export const shouldShowMessageTts = (realtimeCallActive: boolean) => !realtimeCallActive;

type RealtimeInteractiveResult = {
  navigationTarget?: { page?: string | null; sectionId?: string | null } | null;
  data?: Array<Record<string, unknown>>;
};

export function buildCoachUiActionsForToolResult(toolName: string, value: unknown): CoachUiActionBatch | null {
  const result = value as RealtimeInteractiveResult | undefined;
  const target = result?.navigationTarget;
  const rows = Array.isArray(result?.data) ? result.data : [];
  const ids = rows.map((row) => typeof row.id === "string" ? row.id : "").filter(Boolean);
  const action = actionsFromNavigationTarget(target, {});
  if (!action) return null;

  const section = target?.sectionId;
  if (toolName === "searchTrainers" && ids.length) {
    action.actions.splice(2, 0, { type: "setTrainerFilter", trainerIds: ids }, { type: "highlightItems", itemType: "trainer", ids });
  } else if (toolName === "searchGoals" && ids.length) {
    action.actions.splice(2, 0, { type: "highlightItems", itemType: "goal", ids });
    const memberships = Array.isArray(rows[0]?.memberships) ? rows[0].memberships : [];
    const membershipIds = memberships.map((membership) => typeof (membership as Record<string, unknown>).id === "string" ? (membership as Record<string, unknown>).id as string : "").filter(Boolean);
    if (rows.length === 1 && membershipIds.length) {
      action.actions[1] = { type: "navigateToPage", page: "memberships" };
      action.actions[2] = { type: "openSection", sectionId: "memberships" };
      action.actions[action.actions.length - 1] = { type: "scrollToSection", sectionId: "memberships" };
      action.actions.splice(3, 0, { type: "setGoalFilter", goalId: ids[0] }, { type: "setMembershipResults", membershipIds }, { type: "highlightItems", itemType: "membership", ids: membershipIds });
    }
  } else if (toolName === "searchTrialClasses" && ids.length) {
    action.actions.splice(2, 0, { type: "setClassFilter", classIds: rows.map((row) => typeof row.classId === "string" ? row.classId : "").filter(Boolean), trialOnly: true }, { type: "highlightItems", itemType: "class", ids });
  } else if (toolName === "searchOffers" && ids.length) {
    const activeIds = rows.filter((row) => row.status === "active" || row.status === "available_without_expiry" || row.state === "active").map((row) => typeof row.id === "string" ? row.id : "").filter(Boolean);
    if (activeIds.length) action.actions.splice(2, 0, { type: "highlightItems", itemType: "offer", ids: activeIds });
  } else if (toolName === "getNutritionDoctor" && ids.length) {
    action.actions.splice(2, 0, { type: "highlightItems", itemType: "nutrition", ids });
  } else if ((toolName === "searchMemberships" || toolName === "searchPackages") && ids.length) {
    action.actions.splice(2, 0, { type: "setMembershipResults", membershipIds: ids }, { type: "highlightItems", itemType: "membership", ids });
  } else if (section === "shop-products" && ids.length) {
    action.actions.splice(2, 0, { type: "setProductFilters", productIds: ids }, { type: "highlightItems", itemType: "product", ids });
  }
  return action;
}

export function dispatchCoachUiActions(batch: CoachUiActionBatch): Promise<CoachUiActionResult> {
  if (typeof window === "undefined") return Promise.resolve({ requestId: "server", status: "navigation_blocked", completed: false });
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent<CoachUiActionResult>).detail;
      if (detail?.requestId !== requestId) return;
      window.removeEventListener(COACH_UI_ACTION_RESULT_EVENT, onResult);
      window.clearTimeout(timeout);
      resolve(detail);
    };
    // Only a safety escape hatch: navigation itself waits for the rendered section.
    const timeout = window.setTimeout(() => {
      window.removeEventListener(COACH_UI_ACTION_RESULT_EVENT, onResult);
      resolve({ requestId, status: "ui_action_failed", completed: false });
    }, 3_000);
    window.addEventListener(COACH_UI_ACTION_RESULT_EVENT, onResult);
    window.dispatchEvent(new CustomEvent(COACH_UI_ACTION_EVENT, { detail: { requestId, batch } }));
  });
}

export async function inspectLocalRecording(blob: Blob, timeoutMs = 4_000): Promise<{ canDecodeLocally: boolean; localAudioDuration: number | null }> {
  if (typeof Audio === "undefined" || typeof URL === "undefined") return { canDecodeLocally: false, localAudioDuration: null };
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve) => {
      const audio = new Audio();
      const finish = (canDecodeLocally: boolean) => {
        audio.onloadedmetadata = null; audio.oncanplaythrough = null; audio.onerror = null;
        resolve({ canDecodeLocally, localAudioDuration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null });
      };
      const timer = globalThis.setTimeout(() => finish(false), timeoutMs);
      const valid = () => { globalThis.clearTimeout(timer); finish(Number.isFinite(audio.duration) && audio.duration > 0); };
      audio.onloadedmetadata = valid; audio.oncanplaythrough = valid; audio.onerror = () => { globalThis.clearTimeout(timer); finish(false); };
      audio.src = url; audio.load();
    });
  } finally { URL.revokeObjectURL(url); }
}

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
  const { lang } = useLang();
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [input, setInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(false);
  const [status, setStatus] = useState<"open" | "live" | "resolved">("open");
  const [recommendedMembership, setRecommendedMembership] =
    useState<ChatSessionPayload["recommendedMembership"]>(null);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [gymPhone, setGymPhone] = useState("");
  const voiceEnabled = process.env.NEXT_PUBLIC_AI_COACH_VOICE_ENABLED === "true";
  const realtimeEnabled = process.env.NEXT_PUBLIC_AI_COACH_REALTIME_VOICE_ENABLED === "true";
  const [realtimeState, setRealtimeState] = useState<"idle" | "connecting" | "listening" | "thinking" | "assistant_speaking" | "error">("idle");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const realtimeVoice = "marin" as const;
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRecordingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const messagesAreaRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const retryAudioRef = useRef<{ blob: Blob; durationMs: number } | null>(null);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    fetch("/api/site-content?sections=contact", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { contact?: { phone?: string } }) => {
        if (d.contact?.phone) setGymPhone(d.contact.phone.trim());
      })
      .catch(() => {});
  }, []);

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
    setQuickActions(Array.isArray(data.quickActions) ? data.quickActions : []);
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
    setQuickActions([]);
    setRecommendedMembership(null);
    setStatus("open");
    setInput("");
    setError("");

    const res = await fetch("/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang }),
    });
    const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;

    if (!res.ok || !data?.id) {
      setError(data.error ?? t("تعذر بدء المحادثة الآن. حاول مرة أخرى بعد قليل.", "Unable to start the conversation right now. Please try again shortly."));
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

    const res = await fetch(`/api/chat/session?sessionId=${validId}&lang=${lang}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;
    if (!res.ok || !data?.id) {
      clearStoredSession();
      if (open) setError(data.error ?? t("تعذر تحميل المحادثة الحالية.", "Unable to load the current conversation."));
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

      if (visitorChanged) return createFreshSession();
      if (!sessionId) await loadSession(storedId);
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
    if (storedId) loadSession(storedId).catch(() => {});

    const interval = setInterval(() => {
      loadPresence().catch(() => {});
      const latest = normalizeSessionId(
        typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
      );
      if (latest) loadSession(latest).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [open, lang]);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest?.metadata?.closeSession) {
      clearStoredSession();
      setSessionId("");
      setStatus("resolved");
    }
  }, [messages]);
  useEffect(() => { const area = messagesAreaRef.current; if (!area) return; const nearBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 96; if (nearBottom) messageEndRef.current?.scrollIntoView({ block: "end" }); }, [messages, transcribing, error]);

  const openShop = () => {
    window.dispatchEvent(new CustomEvent("fitzone:ai-coach-navigate", {
      detail: { type: "navigate", page: "shop", anchor: "shop-products" },
    }));
  };

  const openSafePage = (url: "/" | "/login" | "/account" | "/store" | "/#memberships" | "/#offers" | "/#classes") => window.location.assign(url);

  useEffect(() => {
    const action = messages[messages.length - 1]?.metadata?.action;
    if (action?.type === "navigate" && action.page === "shop" && action.anchor === "shop-products") openShop();
  }, [messages]);

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content) return;

    setLoading(true);
    setError("");

    try {
      const id = await ensureSession();
      if (!id) return;

      if (name.trim() || phone.trim()) saveVisitorIdentity(name, phone);

      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: id,
          content,
          visitorName: name,
          visitorPhone: phone,
          lang,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;
      if (!res.ok) {
        setError(data.error ?? t("تعذر إرسال الرسالة الآن.", "Unable to send the message right now."));
        return;
      }

      applyPayload(data);
      setInput("");
    } finally {
      setLoading(false);
    }
  };

  const endRealtime = () => {
    realtimePeerRef.current?.close(); realtimePeerRef.current = null;
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop()); realtimeStreamRef.current = null;
    realtimeAudioRef.current?.pause(); if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null; realtimeAudioRef.current = null;
    setRealtimeState("idle");
  };
  useEffect(() => () => { audioRef.current?.pause(); streamRef.current?.getTracks().forEach((track) => track.stop()); endRealtime(); }, []);
  useEffect(() => { if (!recording) return; const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [recording]);
  const stopPlayback = () => { audioRef.current?.pause(); audioRef.current = null; };
  const stopRecording = () => stopMediaRecorder(recorderRef.current);
  const cancelRecording = () => { cancelledRecordingRef.current = true; chunksRef.current = []; stopRecording(); };
  const startRecording = async () => {
    if (!voiceEnabled || recording || transcribing || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError(t("مش قادرين نستخدم الميكروفون. فعّلي الإذن من إعدادات المتصفح وجربي تاني.", "Microphone recording is unavailable.")); return; }
    try {
      stopPlayback(); const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream; chunksRef.current = []; cancelledRecordingRef.current = false;
      const selectedRecorderMime = selectSupportedRecorderMime((mime) => MediaRecorder.isTypeSupported(mime)); const recorder = selectedRecorderMime ? new MediaRecorder(stream, { mimeType: selectedRecorderMime }) : new MediaRecorder(stream); recorderRef.current = recorder; startedAtRef.current = Date.now(); setRecordingSeconds(0); setRecording(true);
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        setRecording(false); stream.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        if (cancelledRecordingRef.current) { cancelledRecordingRef.current = false; chunksRef.current = []; return; }
        const chunks = chunksRef.current; chunksRef.current = [];
        const audio = buildFinalRecording(chunks, recorder.mimeType || selectedRecorderMime || "audio/webm");
        const local = await inspectLocalRecording(audio);
        if (process.env.NODE_ENV === "development") {
          const header = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
          const firstBytesSignature = Array.from(header).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          console.info("[VOICE_RECORDER]", { selectedRecorderMime: selectedRecorderMime || null, recorderMimeAfterCreation: recorder.mimeType || null, chunksCount: chunks.length, individualChunkSizes: chunks.map((chunk) => chunk.size), finalBlobSize: audio.size, finalBlobMime: audio.type, firstBytesSignature, ...local });
        }
        if (!audio.size || !local.canDecodeLocally) { setError(t("التسجيل اتعمل لكن صيغة الصوت مش متوافقة مع المتصفح. جربي تاني أو استخدمي المحادثة الصوتية المباشرة.", "Recording format is not compatible with this browser. Try again or use live voice.")); return; }
        await transcribeAudio(audio, Math.round(local.localAudioDuration! * 1000));
      };
      recorder.start();
    } catch { setError(t("مش قادرين نستخدم الميكروفون. فعّلي الإذن من إعدادات المتصفح وجربي تاني.", "Enable microphone permission and try again.")); }
  };
  const transcribeAudio = async (audio: Blob, durationMs: number) => { setTranscribing(true); setError(""); try { const id = await ensureSession(); if (!id) return; const form = new FormData(); form.set("sessionId", id); form.set("audio", audio, `voice.${audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm"}`); form.set("durationMs", String(durationMs)); form.set("localeHint", lang); const response = await fetch("/api/chat/voice/transcribe", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) { retryAudioRef.current = data.errorCode === "STT_NETWORK_ERROR" || data.errorCode === "STT_TIMEOUT" ? { blob: audio, durationMs } : null; setError(data.error ?? t("معرفتش أفهم التسجيل المرة دي. تقدري تعيدي التسجيل أو تكتبي سؤالك.", "Unable to transcribe recording.")); return; } retryAudioRef.current = null; setInput(data.normalizedTranscript); } finally { setTranscribing(false); } };
  const retryTranscription = () => { const retry = retryAudioRef.current; if (retry) transcribeAudio(retry.blob, retry.durationMs); };
  const playMessage = async (messageId: string) => { if (realtimeState !== "idle") { setError(t("الصوت المباشر شغال دلوقتي.", "Live voice is active.")); return; } try { stopPlayback(); const id = await ensureSession(); if (!id) return; const response = await fetch("/api/chat/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, messageId }) }); if (!response.ok) throw new Error(); const audio = new Audio(URL.createObjectURL(await response.blob())); audioRef.current = audio; audio.onended = () => URL.revokeObjectURL(audio.src); await audio.play(); } catch { setError(t("الرد النصي جاهز، لكن تشغيل الصوت مش متاح دلوقتي.", "The text reply is ready, but audio is unavailable.")); } };
  const startRealtime = async () => {
    if (!realtimeEnabled || realtimeState !== "idle" || !window.RTCPeerConnection || !navigator.mediaDevices?.getUserMedia) { setError(t("المحادثة المباشرة مش متاحة دلوقتي، تقدري تستخدمي التسجيل أو الكتابة.", "Live voice is unavailable. Use recording or text.")); return; }
    setRealtimeState("connecting"); setError(""); stopPlayback(); stopRecording();
    try {
      const id = await ensureSession(); if (!id) throw new Error();
      const tokenResponse = await fetch("/api/chat/voice/realtime/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, lang, voice: realtimeVoice }) });
      const tokenData = await tokenResponse.json().catch(() => ({})) as { clientSecret?: string };
      if (!tokenResponse.ok || !tokenData.clientSecret) throw new Error();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); realtimeStreamRef.current = stream;
      const peer = new RTCPeerConnection(); realtimePeerRef.current = peer;
      const remoteAudio = new Audio(); remoteAudio.autoplay = true; remoteAudio.setAttribute("playsinline", ""); realtimeAudioRef.current = remoteAudio;
      const playRemoteAudio = () => remoteAudio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
      peer.ontrack = (event) => { remoteAudio.srcObject = event.streams[0] ?? null; void playRemoteAudio(); setRealtimeState("assistant_speaking"); };
      peer.onconnectionstatechange = () => { if (["failed", "disconnected", "closed"].includes(peer.connectionState)) endRealtime(); };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = async (event) => {
        let data: { type?: string; name?: string; call_id?: string; arguments?: string } = {};
        try { data = JSON.parse(event.data); } catch { return; }
        if (data.type === "response.function_call_arguments.done" && data.name && data.call_id) {
          let args: Record<string, unknown> = {}; try { args = JSON.parse(data.arguments ?? "{}"); } catch { /* server rejects malformed args */ }
          const toolResponse = await fetch("/api/chat/voice/realtime/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, name: data.name, arguments: args, lang }) });
          const toolData = await toolResponse.json().catch(() => ({})) as { result?: unknown };
          const uiActions = buildCoachUiActionsForToolResult(data.name, toolData.result);
          const uiResult = uiActions ? await dispatchCoachUiActions(uiActions) : null;
          const functionResult = uiResult && !uiResult.completed
            ? { ...(toolData.result as Record<string, unknown>), uiActionStatus: uiResult.status, spokenSummary: "لقيتلك النتائج، لكن مقدرتش أفتح القسم تلقائيًا." }
            : toolData.result ?? { allowed: false };
          if (channel.readyState === "open") { setRealtimeState("thinking"); for (const responseEvent of createRealtimeToolOutputEvents(data.call_id, functionResult)) channel.send(JSON.stringify(responseEvent)); }
          loadSession(id).catch(() => {});
        }
        if (data.type === "input_audio_buffer.speech_started") { remoteAudio.pause(); setRealtimeState("listening"); }
        if (data.type === "response.created") { setRealtimeState("assistant_speaking"); void playRemoteAudio(); }
        if (data.type === "response.audio.delta") { setRealtimeState("assistant_speaking"); void playRemoteAudio(); }
        if (data.type === "response.done") setRealtimeState("listening");
      };
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${tokenData.clientSecret}`, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!answer.ok) throw new Error();
      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() }); setRealtimeState("listening");
    } catch { endRealtime(); setError(t("المحادثة المباشرة مش متاحة دلوقتي، تقدري تستخدمي التسجيل أو الكتابة.", "Live voice is unavailable. Use recording or text.")); }
  };

  return (
    <>
      <button
        data-tour="ai-coach"
        onClick={() => {
          setOpen((value) => { if (value) endRealtime(); return !value; });
          ensureSession().catch(() => {});
        }}
        style={{
          position: "fixed",
          bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom, 0px))" : 20,
          right: 20,
          zIndex: 80,
          width: 68,
          height: 68,
          borderRadius: "999px",
          border: "none",
          background: "linear-gradient(135deg, #E91E63, #F06292)",
          color: "#fff",
          fontSize: 12,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(233,30,99,.35)",
        }}
      >
        AI Coach
      </button>

      {open && (
        <div
          dir={lang === "ar" ? "rtl" : "ltr"}
          style={{
            position: "fixed",
            bottom: isMobile ? "calc(156px + env(safe-area-inset-bottom, 0px))" : 96,
            top: isMobile ? 70 : 112,
            right: 20,
            zIndex: 80,
            width: isMobile ? "calc(100vw - 40px)" : "min(390px, calc(100vw - 24px))",
            maxWidth: "calc(100vw - 24px)",
            height: isMobile ? "calc(100dvh - 226px)" : "min(720px, calc(100dvh - 132px))",
            maxHeight: isMobile ? "calc(100dvh - 226px)" : "min(720px, calc(100dvh - 132px))",
            minHeight: 0,
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
                <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>AI Coach</div>
                <div style={{ color: online ? "#d4fce4" : "#ffe0ef", fontSize: 12 }}>
                  {online ? t("الدعم المباشر متاح الآن", "Live support is available now") : t("الرد الآلي متاح الآن", "AI coach is available now")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {gymPhone && (
                  <a
                    href={`tel:${gymPhone}`}
                    style={{
                      background: "rgba(255,255,255,.18)",
                      border: "1px solid rgba(255,255,255,.28)",
                      color: "#fff",
                      fontSize: 12,
                      borderRadius: 999,
                      padding: "6px 10px",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    📞 {t("اتصال", "Call")}
                  </a>
                )}
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
                  {t("محادثة جديدة", "New chat")}
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("اسمك", "Your name")} style={inputStyle} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("رقم الجوال", "Phone number")} style={inputStyle} />
            {quickActions.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {quickActions.map((item) => (
                  <button key={item.id} onClick={() => sendMessage(item.prompt)} style={quickButtonStyle}>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
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
                {voiceEnabled && retryAudioRef.current && <button onClick={retryTranscription} style={{ ...quickButtonStyle, marginTop: 8 }}>إعادة المحاولة</button>}
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              padding: 0,
              background: "#FFF5F8",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div ref={messagesAreaRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14 }}>
            {messages.map((message) => {
              const isUser = message.senderType === "user";
              const isSupport = message.senderType === "admin" || message.senderType === "staff";

              return (
                <div
                  key={message.id}
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
                      background: isUser ? "#FFFFFF" : isSupport ? "rgba(233,30,99,.12)" : "rgba(233,30,99,.07)",
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
                      {message.senderName || (isUser ? t("أنت", "You") : message.senderType === "bot" ? "AI Coach" : t("الدعم", "Support"))}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
                    {voiceEnabled && message.senderType === "bot" && shouldShowMessageTts(realtimeState !== "idle") && <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button aria-label="تشغيل الرد صوتيًا" onClick={() => playMessage(message.id)} style={quickButtonStyle}>▶ {t("اسمعي", "Play")}</button><button aria-label="إيقاف الصوت" onClick={stopPlayback} style={quickButtonStyle}>■ {t("إيقاف", "Stop")}</button></div>}
                    {message.metadata?.action?.page === "shop" && (
                      <button onClick={openShop} style={{ ...quickButtonStyle, marginTop: 8 }}>فتح المتجر</button>
                    )}
                    {message.metadata?.structured?.actions?.map((action) => (
                      <button key={`${message.id}-${action.url}`} onClick={() => openSafePage(action.url)} style={{ ...quickButtonStyle, marginTop: 8, marginInlineEnd: 6 }}>
                        {action.label}
                      </button>
                    ))}
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
                <div style={{ color: "#E91E63", fontWeight: 800, marginBottom: 6 }}>
                  {t("الباقة المقترحة", "Recommended membership")}
                </div>
                <div style={{ color: "#7A5B68", fontSize: 13 }}>
                  {recommendedMembership.name} - {recommendedMembership.price} {lang === "ar" ? "ج.م" : "EGP"}
                </div>
              </div>
            )}
            <div ref={messageEndRef} />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              flexShrink: 0,
              gap: 8,
              padding: 12,
              borderTop: "1px solid #F5D0DC",
              background: "#FFF0F5",
            }}
          >
            {voiceEnabled && (recording || transcribing) && <div style={{ width: "100%", fontSize: 12, color: "#E91E63" }}>{recording ? `${t("بتسمعك دلوقتي", "Listening")}… ${recordingSeconds}s` : t("جاري فهم كلامك…", "Understanding your voice…")}</div>}
            {realtimeEnabled && realtimeState !== "idle" && <div style={{ width: "100%", fontSize: 12, color: "#E91E63" }}>{realtimeState === "connecting" ? t("جاري الاتصال…", "Connecting…") : realtimeState === "thinking" ? t("بفهم سؤالك…", "Understanding…") : realtimeState === "assistant_speaking" ? t("برد عليك…", "Responding…") : t("بسمعك…", "Listening…")}</div>}
            {realtimeEnabled && autoplayBlocked && <button onClick={() => { void realtimeAudioRef.current?.play().then(() => setAutoplayBlocked(false)); }} style={{ ...quickButtonStyle, width: "100%" }}>{t("اضغطي مرة واحدة لتشغيل صوت المساعد.", "Tap once to play assistant audio.")}</button>}
            {realtimeEnabled && <button aria-label={realtimeState === "idle" ? "ابدئي محادثة صوتية" : "إنهاء المحادثة الصوتية"} title={realtimeState === "idle" ? "محادثة صوتية" : "إنهاء المحادثة"} onClick={realtimeState === "idle" ? startRealtime : endRealtime} disabled={realtimeState === "connecting"} style={{ flex: "0 0 44px", width: 44, height: 52, border: "1px solid #F5D0DC", borderRadius: 14, background: realtimeState === "idle" ? "#fff" : "#BE185D", color: realtimeState === "idle" ? "#E91E63" : "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>{realtimeState === "connecting" ? <Loader2 size={18} className="animate-spin" /> : realtimeState === "idle" ? <Phone size={18} /> : <PhoneOff size={18} />}</button>}
            {voiceEnabled && <div style={{ width: "100%", fontSize: 10, color: "#7A5B68" }}>{t("الصوت بيتحوّل لنص علشان AI Coach يفهم سؤالك. التسجيل مش بيتحفظ بشكل دائم.", "Voice is converted to text. Recordings are not stored permanently.")}</div>}
            {voiceEnabled && <button aria-label={recording ? "إيقاف التسجيل" : "ابدئي تسجيل صوتي"} title={recording ? "إيقاف التسجيل" : "ابدئي تسجيل صوتي"} onClick={recording ? stopRecording : startRecording} disabled={loading || transcribing} style={{ flex: "0 0 44px", width: 44, height: 52, border: "1px solid #F5D0DC", borderRadius: 14, background: recording ? "#BE185D" : "#fff", color: recording ? "#fff" : "#E91E63", display: "grid", placeItems: "center", cursor: "pointer" }}>{transcribing ? <Loader2 size={18} className="animate-spin" /> : recording ? <Square size={17} fill="currentColor" /> : <Mic size={19} />}</button>}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("اكتبي سؤالك عن اللياقة أو التغذية أو الباقة...", "Ask about fitness, nutrition, membership, schedule, or support...")}
              style={{ ...inputStyle, width: "auto", minWidth: 0, minHeight: 52, maxHeight: 120, resize: "vertical", flex: "1 1 180px" }}
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
                flex: "0 0 auto",
                minWidth: 64,
                fontWeight: 800,
                cursor: "pointer",
                opacity: loading || !input.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "..." : t("إرسال", "Send")}
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
