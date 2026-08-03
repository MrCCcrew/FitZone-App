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
  metadata?: { membershipId?: string; closeSession?: boolean; action?: { type: "navigate"; page: "shop"; anchor: "shop-products" }; structured?: { intent?: string; actions?: Array<{ type: "open_page"; label: string; url: "/" | "/login" | "/account" | "/store" | "/#memberships" | "/#offers" | "/#classes" | "/#blog" | "/#nutrition" | "/#partners" }> } } | null;
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

export function isClientVoiceDebugEnabled(value = process.env.NEXT_PUBLIC_AI_COACH_VOICE_DEBUG_ENABLED) {
  return value === "true";
}

export function logClientVoiceDebug(enabled: boolean, level: "info" | "error", event: string, details?: unknown) {
  if (!enabled) return;
  console[level](event, details);
}

export function selectSupportedRecorderMime(isSupported: (mime: string) => boolean) {
  return recorderMimeCandidates.find(isSupported) ?? "";
}

export function stopMediaRecorder(recorder: Pick<MediaRecorder, "state" | "stop"> | null) {
  if (recorder?.state === "recording") recorder.stop();
}

export function buildFinalRecording(chunks: Blob[], mime: string) {
  return new Blob(chunks.filter((chunk) => chunk.size > 0), { type: mime });
}

export function messageFingerprint(text: string) {
  let hash = 2166136261;
  for (const char of text.trim().toLowerCase()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `${text.trim().length}:${(hash >>> 0).toString(36)}`;
}

export function canSubmitMessage(input: { fingerprint: string; inFlightFingerprint: string | null; recent: { fingerprint: string; at: number } | null; now: number; cooldownMs?: number }) {
  return !input.inFlightFingerprint && !(input.recent?.fingerprint === input.fingerprint && input.now - input.recent.at < (input.cooldownMs ?? 1500));
}

export function shouldAutoPlayMessageTts(source: "typed" | "stt", realtimeActive: boolean) {
  return source === "stt" && !realtimeActive;
}

export function shouldReuseTtsAudio(activeMessageId: string | null, messageId: string) {
  return activeMessageId === messageId;
}

export function createRealtimeToolOutputEvents(callId: string, result: unknown) {
  return [
    { type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } },
    { type: "response.create" },
  ];
}

export function canStartRealtimeConnection(input: { enabled: boolean; state: string; connectionInFlight: boolean; sessionRequestInFlight: boolean; hasPeer: boolean; hasDataChannel: boolean; supported: boolean }) {
  return input.enabled && input.state === "idle" && !input.connectionInFlight && !input.sessionRequestInFlight && !input.hasPeer && !input.hasDataChannel && input.supported;
}

export const hasRealtimeResponseOutput = (audioStarted: boolean) => audioStarted;

export const shouldShowMessageTts = (realtimeCallActive: boolean) => !realtimeCallActive;

export type VoiceCapabilities = { voiceEnabled: boolean; realtimeEnabled: boolean; recorderEnabled: boolean; ttsEnabled: boolean };

/** Public build flags are capabilities, not session state. Keep them stable if a session request fails. */
export function getVoiceCapabilities(flags = {
  voice: process.env.NEXT_PUBLIC_AI_COACH_VOICE_ENABLED,
  realtime: process.env.NEXT_PUBLIC_AI_COACH_REALTIME_VOICE_ENABLED,
  recorder: process.env.NEXT_PUBLIC_AI_COACH_STT_ENABLED,
  tts: process.env.NEXT_PUBLIC_AI_COACH_TTS_ENABLED,
}): VoiceCapabilities {
  const voiceEnabled = flags.voice === "true";
  return {
    voiceEnabled,
    realtimeEnabled: voiceEnabled && flags.realtime === "true",
    recorderEnabled: voiceEnabled && flags.recorder === "true",
    ttsEnabled: voiceEnabled && flags.tts === "true",
  };
}

export function shouldShowVoiceControls(capabilities: VoiceCapabilities, realtimeCallActive: boolean) {
  return {
    showCallButton: capabilities.realtimeEnabled,
    showRecorderButton: capabilities.recorderEnabled,
    showListenButton: capabilities.ttsEnabled && shouldShowMessageTts(realtimeCallActive),
  };
}

export function shouldRequestChatSession(input: { sessionId: string; inFlight: boolean; lastLoadedSessionId: string | null; lastRequestKey: string | null; unmounted: boolean }) {
  const requestKey = `session:${input.sessionId}`;
  return Boolean(input.sessionId) && !input.unmounted && !input.inFlight && input.lastLoadedSessionId !== input.sessionId && input.lastRequestKey !== requestKey;
}

export function appendUniqueChatMessage(messages: ChatMessage[], message: ChatMessage) {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message];
}

function sessionIdHash(value: string) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

export type VoicePlatform = { isIOS: boolean; isSafari: boolean; isStandalonePWA: boolean };

export function detectVoicePlatform(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent, standalone = typeof navigator !== "undefined" && Boolean((navigator as Navigator & { standalone?: boolean }).standalone)) : VoicePlatform {
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  const isSafari = isIOS && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
  const isStandalonePWA = standalone || (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);
  return { isIOS, isSafari, isStandalonePWA };
}

export const realtimeMicrophoneConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
};

export function buildAiCoachShellStyle(isMobile: boolean): CSSProperties {
  return {
    position: "fixed",
    top: isMobile ? 0 : undefined,
    bottom: isMobile ? 0 : 20,
    insetInlineStart: isMobile ? 0 : undefined,
    insetInlineEnd: isMobile ? 0 : 20,
    zIndex: 1000,
    width: isMobile ? "100vw" : "clamp(360px, 30vw, 460px)",
    maxWidth: isMobile ? "100vw" : "calc(100vw - 40px)",
    height: isMobile ? "var(--ai-chat-viewport-height, 100dvh)" : "min(720px, calc(100dvh - 40px))",
    maxHeight: isMobile ? "none" : "calc(100dvh - 40px)",
    minHeight: 0,
    background: "#FFF5F8",
    border: "1px solid #F5D0DC",
    borderRadius: isMobile ? 0 : 24,
    overflow: "hidden",
    boxShadow: "0 18px 50px rgba(233,30,99,.15)",
    display: "flex",
    flexDirection: "column",
  };
}

export const realtimeTurnDetection = {
  type: "server_vad",
  threshold: 0.25,
  prefix_padding_ms: 500,
  silence_duration_ms: 900,
  create_response: true,
  // Keep the first release non-barge-in. Speaker echo must never cancel a reply.
  interrupt_response: false,
} as const;

// The ephemeral session already carries instructions, voice, audio output, tools, and tool_choice.
// This event updates only VAD, while retaining the required Realtime session discriminator.
export function buildRealtimeSessionUpdate() {
  return {
    type: "session.update" as const,
    session: {
      type: "realtime" as const,
      audio: { input: { turn_detection: realtimeTurnDetection } },
    },
  };
}

type RealtimeErrorDetails = {
  type?: string;
  code?: string;
  message?: string;
  param?: string;
};

export type RealtimeErrorKind = "fatal" | "recoverable" | "tool";

const realtimeEventLabels: Record<string, string> = {
  "session.created": "session.created",
  "session.updated": "session.updated",
  "input_audio_buffer.speech_started": "speech_started",
  "input_audio_buffer.speech_stopped": "speech_stopped",
  "input_audio_buffer.committed": "committed",
  "response.created": "response.created",
  "response.output_audio.delta": "response.audio",
  "response.audio.delta": "response.audio",
  "response.output_audio.done": "response.audio.done",
  "response.audio.done": "response.audio.done",
  "response.done": "response.done",
  error: "error",
};

export function realtimeEventLabel(type?: string) {
  return realtimeEventLabels[type ?? ""] ?? type ?? "unknown";
}

export function classifyRealtimeError(error?: RealtimeErrorDetails): RealtimeErrorKind {
  const type = error?.type?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  const message = error?.message?.toLowerCase() ?? "";
  const detail = [type, code, message, error?.param].filter(Boolean).join(" ");
  if (type === "tool_error" || /^(tool|function_call)[_.:-]/.test(code) || /\b(tool|function) call\b/.test(message)) return "tool";
  if (/(response.*active|already.*active|buffer.*empty|empty.*buffer|cancel.*race|already.*cancel)/.test(detail)) return "recoverable";
  return "fatal";
}

export async function unlockIOSAudio(audio: HTMLAudioElement, contextRef: { current: AudioContext | null }) {
  audio.muted = false;
  audio.volume = 1;
  if (!contextRef.current && typeof AudioContext !== "undefined") contextRef.current = new AudioContext();
  await contextRef.current?.resume().catch(() => {});
  await audio.play().catch(() => {});
}

/** Attach the Realtime remote track and attempt audible playback. No browser TTS fallback is used. */
export async function attachRealtimeRemoteAudio(audio: HTMLAudioElement, track: MediaStreamTrack, streams: readonly MediaStream[]) {
  audio.muted = false;
  audio.volume = 1;
  audio.srcObject = streams[0] ?? new MediaStream([track]);
  await audio.play();
}

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
  // Capabilities are intentionally independent from /api/chat/session payloads.
  const [sessionCapabilities] = useState<VoiceCapabilities>(() => getVoiceCapabilities());
  const { voiceEnabled, realtimeEnabled, recorderEnabled, ttsEnabled } = sessionCapabilities;
  const [realtimeState, setRealtimeState] = useState<"idle" | "connecting" | "initializing" | "listening" | "thinking" | "assistant_speaking" | "error">("idle");
  const realtimeStatusLabel = realtimeState === "connecting" || realtimeState === "initializing"
    ? t("جاري تهيئة المكالمة…", "Initializing call…")
    : realtimeState === "thinking"
      ? t("بفهم سؤالك…", "Understanding…")
      : realtimeState === "assistant_speaking"
        ? t("برد عليك…", "Responding…")
        : realtimeState === "error"
          ? t("تعذر إعداد المكالمة.", "Call setup failed.")
          : t("بسمعك…", "Listening…");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [ttsAutoplayBlocked, setTtsAutoplayBlocked] = useState(false);
  const [manualVoiceFallback, setManualVoiceFallback] = useState(false);
  const [voiceDebug, setVoiceDebug] = useState({ platform: "", pcState: "new", iceState: "new", dataChannelState: "closed", trackState: "none", trackMuted: false, remoteTrackReceived: false, remoteStreamTracksCount: 0, audioPaused: true, playResult: "", audioEvents: "", lastRealtimeEvent: "", lastErrorCode: "", lastErrorType: "" });
  const realtimeVoice = "marin" as const;
  const voiceDebugEnabled = isClientVoiceDebugEnabled();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRecordingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTtsMessageIdRef = useRef<string | null>(null);
  const messagesAreaRef = useRef<HTMLDivElement | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const retryAudioRef = useRef<{ blob: Blob; durationMs: number } | null>(null);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const activePeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeChannelRef = useRef<RTCDataChannel | null>(null);
  const activeDataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechStartedRef = useRef(false);
  const vadFallbackTimerRef = useRef<number | null>(null);
  const remoteAudioPlayAttemptRef = useRef(false);
  const realtimeEventSequenceRef = useRef<string[]>([]);
  const realtimeSessionReadyRef = useRef(false);
  const realtimeSessionUpdateSentRef = useRef(false);
  const realtimeVoiceSessionIdRef = useRef<string | null>(null);
  const realtimeHeartbeatTimerRef = useRef<number | null>(null);
  const sessionLimitTimerRef = useRef<number | null>(null);
  // These guards intentionally live in refs: React rerenders and StrictMode must not
  // turn one explicit click into more than one billed Realtime session.
  const connectionAttemptInFlightRef = useRef(false);
  const realtimeSessionRequestInFlightRef = useRef(false);
  const initialSessionLoadedRef = useRef(false);
  const sessionRequestInFlightRef = useRef(false);
  const lastSessionRequestKeyRef = useRef<string | null>(null);
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const componentUnmountedRef = useRef(false);
  const sessionAbortControllerRef = useRef<AbortController | null>(null);
  const newSessionRequestSequenceRef = useRef(0);
  const explicitUserConnectRef = useRef(false);
  const reconnectAttemptCount = useRef(0);
  const lastConnectionAttemptAt = useRef(0);
  const responseHasOutputRef = useRef(false);
  const assistantAudioStartedRef = useRef(false);
  const pendingUiActionsRef = useRef<CoachUiActionBatch | null>(null);
  const navigationPerformedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const voiceDiagnosticsRef = useRef({ pageMountCount: 0, sessionRequestCount: 0, peerConnectionCount: 0, responseCreateCount: 0, toolCallCount: 0, reconnectCount: 0, ttsRequestCount: 0, cleanupCount: 0 });
  const sessionDiagnosticsRef = useRef({ componentMountCount: 0, sessionFetchCount: 0, sessionFetchReason: "", sessionIdHash: "" });
  // Zero means "not enabled". The quota plan can set this public local-development
  // value later without changing the connection lifecycle.
  const maxSessionSeconds = Math.max(0, Number(process.env.NEXT_PUBLIC_AI_COACH_MAX_SESSION_SECONDS ?? 0) || 0);
  const warningBeforeEndSeconds = Math.min(Math.max(0, Number(process.env.NEXT_PUBLIC_AI_COACH_WARNING_BEFORE_END_SECONDS ?? 30) || 30), maxSessionSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [endReason, setEndReason] = useState<"user_ended" | "failed" | "limit_reached" | null>(null);
  const messageRequestInFlightRef = useRef<string | null>(null);
  const recentMessageFingerprintRef = useRef<{ fingerprint: string; at: number } | null>(null);

  const recordVoiceDiagnostic = (key: keyof typeof voiceDiagnosticsRef.current) => {
    voiceDiagnosticsRef.current[key] += 1;
    // Deliberately counters only: never log SDP, audio, transcript, keys, or PII.
    logClientVoiceDebug(voiceDebugEnabled, "info", "[AI_COACH_REALTIME_COUNTERS]", { ...voiceDiagnosticsRef.current });
  };

  useEffect(() => {
    recordVoiceDiagnostic("pageMountCount");
    componentUnmountedRef.current = false;
    sessionDiagnosticsRef.current.componentMountCount += 1;
    return () => {
      componentUnmountedRef.current = true;
      sessionAbortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!open || !isMobile) return;
    document.body.classList.add("fitzone-ai-coach-mobile-open");
    const viewport = window.visualViewport;
    const updateViewportHeight = () => document.documentElement.style.setProperty("--ai-chat-viewport-height", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
    updateViewportHeight();
    viewport?.addEventListener("resize", updateViewportHeight);
    viewport?.addEventListener("scroll", updateViewportHeight);
    return () => {
      document.body.classList.remove("fitzone-ai-coach-mobile-open");
      document.documentElement.style.removeProperty("--ai-chat-viewport-height");
      viewport?.removeEventListener("resize", updateViewportHeight);
      viewport?.removeEventListener("scroll", updateViewportHeight);
    };
  }, [open, isMobile]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      const track = realtimeStreamRef.current?.getAudioTracks()[0];
      const peer = realtimePeerRef.current;
      const channel = realtimeChannelRef.current;
      if (track && (track.readyState === "ended" || peer?.connectionState === "failed" || channel?.readyState === "closed")) {
        endRealtime();
        setError(t("انتهت المكالمة أثناء وجود التطبيق بالخلفية. ابدئي مكالمة جديدة.", "The call ended while the app was in the background. Start a new call."));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [lang]);

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
    const requestKey = `new:${++newSessionRequestSequenceRef.current}`;
    if (sessionRequestInFlightRef.current) return "";
    const controller = new AbortController();
    sessionAbortControllerRef.current?.abort();
    sessionAbortControllerRef.current = controller;
    const canUpdateState = () => !componentUnmountedRef.current && !controller.signal.aborted;
    sessionRequestInFlightRef.current = true;
    lastSessionRequestKeyRef.current = requestKey;
    sessionDiagnosticsRef.current.sessionFetchCount += 1;
    sessionDiagnosticsRef.current.sessionFetchReason = "new_chat";
    sessionDiagnosticsRef.current.sessionIdHash = "";
    logClientVoiceDebug(voiceDebugEnabled, "info", "[AI_COACH_SESSION_FETCH]", { ...sessionDiagnosticsRef.current });
    if (!canUpdateState()) return "";
    clearStoredSession();
    setMessages([]);
    setQuickActions([]);
    setRecommendedMembership(null);
    setStatus("open");
    setInput("");
    setError("");

    try {
      const res = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;

      if (!res.ok || !data?.id) {
        if (!canUpdateState()) return "";
        setError(data.error ?? t("تعذر بدء المحادثة الآن. حاول مرة أخرى بعد قليل.", "Unable to start the conversation right now. Please try again shortly."));
        return "";
      }

      if (canUpdateState()) applyPayload(data);
      lastLoadedSessionIdRef.current = data.id;
      if (name.trim() || phone.trim()) saveVisitorIdentity(name, phone);
      return data.id;
    } catch {
      if (canUpdateState()) setError(t("تعذر بدء المحادثة الآن.", "Unable to start the conversation right now."));
      return "";
    } finally {
      if (sessionAbortControllerRef.current === controller) sessionAbortControllerRef.current = null;
      sessionRequestInFlightRef.current = false;
    }
  };

  const loadPresence = async () => {
    const res = await fetch("/api/chat/presence", { cache: "no-store" });
    const data = await res.json().catch(() => ({ online: false }));
    setOnline(Boolean(data.online));
  };

  const loadSession = async (id: string, reason: "initial" | "invalid_session" = "initial") => {
    const validId = normalizeSessionId(id);
    if (!shouldRequestChatSession({ sessionId: validId, inFlight: sessionRequestInFlightRef.current, lastLoadedSessionId: lastLoadedSessionIdRef.current, lastRequestKey: lastSessionRequestKeyRef.current, unmounted: componentUnmountedRef.current })) return;

    const controller = new AbortController();
    sessionAbortControllerRef.current?.abort();
    sessionAbortControllerRef.current = controller;
    sessionRequestInFlightRef.current = true;
    lastSessionRequestKeyRef.current = `session:${validId}`;
    sessionDiagnosticsRef.current.sessionFetchCount += 1;
    sessionDiagnosticsRef.current.sessionFetchReason = reason;
    sessionDiagnosticsRef.current.sessionIdHash = sessionIdHash(validId);
    logClientVoiceDebug(voiceDebugEnabled, "info", "[AI_COACH_SESSION_FETCH]", { ...sessionDiagnosticsRef.current });

    try {
      const res = await fetch(`/api/chat/session?sessionId=${encodeURIComponent(validId)}&lang=${lang}`, { cache: "no-store", signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as ChatSessionPayload;
      if (componentUnmountedRef.current || controller.signal.aborted) return;
      if (!res.ok || !data?.id) {
        // Only a documented invalid/missing session clears local identity. No automatic retry.
        if (res.status === 404 || res.status === 410) clearStoredSession();
        if (open) setError(data.error ?? t("تعذر تحميل المحادثة الحالية.", "Unable to load the current conversation."));
        return;
      }
      lastLoadedSessionIdRef.current = validId;
      applyPayload(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError") && !componentUnmountedRef.current) {
        if (open) setError(t("تعذر تحميل المحادثة الحالية.", "Unable to load the current conversation."));
      }
    } finally {
      if (sessionAbortControllerRef.current === controller) sessionAbortControllerRef.current = null;
      sessionRequestInFlightRef.current = false;
    }
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
    if (initialSessionLoadedRef.current) return;
    initialSessionLoadedRef.current = true;
    loadPresence().catch(() => {});

    const storedId = normalizeSessionId(
      typeof window !== "undefined" ? window.sessionStorage.getItem(STORAGE_KEY) : null,
    );
    const storedVisitor = parseStoredVisitor(
      typeof window !== "undefined" ? window.sessionStorage.getItem(VISITOR_KEY) : null,
    );

    if (storedVisitor.name) setName(storedVisitor.name);
    if (storedVisitor.phone) setPhone(storedVisitor.phone);
    if (storedId) void loadSession(storedId);
  // Initial load is deliberate: opening/closing, language, messages, and loading state must not reload a session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (latest?.metadata?.closeSession) {
      clearStoredSession();
      setSessionId("");
      setStatus("resolved");
    }
  }, [messages]);
  useEffect(() => {
    const latest = messages[messages.length - 1];
    const action = latest?.metadata?.structured?.actions?.[0];
    if (latest?.metadata?.structured?.intent === "site_navigation" && action) openSafePage(action.url);
  }, [messages]);
  useEffect(() => { messageEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [messages, transcribing, error, realtimeState]);

  const openShop = () => {
    window.dispatchEvent(new CustomEvent("fitzone:ai-coach-navigate", {
      detail: { type: "navigate", page: "shop", anchor: "shop-products" },
    }));
  };

  const openSafePage = (url: "/" | "/login" | "/account" | "/store" | "/#memberships" | "/#offers" | "/#classes" | "/#blog" | "/#nutrition" | "/#partners") => {
    // Use a real URL so actions also work from /account and other pages that do not mount FitzoneApp's SPA handler.
    window.location.assign(url);
  };

  useEffect(() => {
    const action = messages[messages.length - 1]?.metadata?.action;
    if (action?.type === "navigate" && action.page === "shop" && action.anchor === "shop-products") openShop();
  }, [messages]);

  const sendMessage = async (preset?: string, source: "typed" | "stt" = "typed") => {
    const content = (preset ?? input).trim();
    if (!content || (source === "stt" && realtimeState !== "idle")) return null;
    const fingerprint = messageFingerprint(content);
    const recent = recentMessageFingerprintRef.current;
    if (!canSubmitMessage({ fingerprint, inFlightFingerprint: messageRequestInFlightRef.current, recent, now: Date.now() })) return null;
    messageRequestInFlightRef.current = fingerprint;
    recentMessageFingerprintRef.current = { fingerprint, at: Date.now() };

    setLoading(true);
    setError("");

    try {
      const id = await ensureSession();
      if (!id) return null;

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
        return null;
      }

      applyPayload(data);
      setInput("");
      if (shouldAutoPlayMessageTts(source, realtimeState !== "idle")) {
        const reply = [...(data.messages ?? [])].reverse().find((message) => message.senderType === "bot" && message.content.trim());
        if (reply) void playMessage(reply.id, true);
      }
      return data;
    } finally {
      messageRequestInFlightRef.current = null;
      setLoading(false);
    }
  };

  const clearRealtimeTimers = () => {
    if (vadFallbackTimerRef.current) window.clearTimeout(vadFallbackTimerRef.current);
    vadFallbackTimerRef.current = null;
    if (realtimeHeartbeatTimerRef.current) window.clearInterval(realtimeHeartbeatTimerRef.current);
    realtimeHeartbeatTimerRef.current = null;
    if (sessionLimitTimerRef.current) window.clearInterval(sessionLimitTimerRef.current);
    sessionLimitTimerRef.current = null;
  };
  const endRealtime = (reason: "user_ended" | "failed" | "limit_reached" = "user_ended") => {
    const peer = activePeerConnectionRef.current ?? realtimePeerRef.current;
    if (!peer && !realtimeStreamRef.current && !realtimeChannelRef.current && !realtimeVoiceSessionIdRef.current) return;
    recordVoiceDiagnostic("cleanupCount");
    explicitUserConnectRef.current = false;
    connectionAttemptInFlightRef.current = false;
    realtimeSessionRequestInFlightRef.current = false;
    pendingUiActionsRef.current = null;
    navigationPerformedRef.current = false;
    responseHasOutputRef.current = false;
    assistantAudioStartedRef.current = false;
    setEndReason(reason);
    const activeVoiceSessionId = realtimeVoiceSessionIdRef.current;
    const activeChatSessionId = sessionId;
    if (activeVoiceSessionId && activeChatSessionId) {
      void fetch("/api/chat/voice/realtime/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeChatSessionId, voiceSessionId: activeVoiceSessionId, reason }),
        keepalive: true,
      }).catch(() => {});
    }
    realtimeVoiceSessionIdRef.current = null;
    clearRealtimeTimers();
    peer?.close(); realtimePeerRef.current = null; activePeerConnectionRef.current = null;
    realtimeStreamRef.current?.getTracks().forEach((track) => track.stop()); realtimeStreamRef.current = null;
    realtimeChannelRef.current = null; activeDataChannelRef.current = null;
    realtimeAudioRef.current?.pause(); if (realtimeAudioRef.current) realtimeAudioRef.current.srcObject = null;
    speechStartedRef.current = false;
    realtimeEventSequenceRef.current = [];
    realtimeSessionReadyRef.current = false;
    realtimeSessionUpdateSentRef.current = false;
    remoteAudioPlayAttemptRef.current = false;
    setManualVoiceFallback(false);
    setRemainingSeconds(null);
    setRealtimeState("idle");
  };
  useEffect(() => () => { audioRef.current?.pause(); streamRef.current?.getTracks().forEach((track) => track.stop()); endRealtime(); }, []);
  useEffect(() => { if (!recording) return; const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [recording]);
  const stopPlayback = () => { audioRef.current?.pause(); audioRef.current = null; activeTtsMessageIdRef.current = null; };
  const stopRecording = () => stopMediaRecorder(recorderRef.current);
  const cancelRecording = () => { cancelledRecordingRef.current = true; chunksRef.current = []; stopRecording(); };
  const startRecording = async () => {
    if (!recorderEnabled || recording || transcribing || realtimeState !== "idle" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError(t("مش قادرين نستخدم التسجيل دلوقتي. اقفلي المكالمة الصوتية أو استني الطلب الحالي يخلص.", "Recording is unavailable while another voice request is active.")); return; }
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
        if (voiceDebugEnabled) {
          const header = new Uint8Array(await audio.slice(0, 12).arrayBuffer());
          const firstBytesSignature = Array.from(header).map((byte) => byte.toString(16).padStart(2, "0")).join("");
          logClientVoiceDebug(true, "info", "[VOICE_RECORDER]", { selectedRecorderMime: selectedRecorderMime || null, recorderMimeAfterCreation: recorder.mimeType || null, chunksCount: chunks.length, individualChunkSizes: chunks.map((chunk) => chunk.size), finalBlobSize: audio.size, finalBlobMime: audio.type, firstBytesSignature, ...local });
        }
        if (!audio.size || !local.canDecodeLocally) { setError(t("التسجيل اتعمل لكن صيغة الصوت مش متوافقة مع المتصفح. جربي تاني أو استخدمي المحادثة الصوتية المباشرة.", "Recording format is not compatible with this browser. Try again or use live voice.")); return; }
        await transcribeAudio(audio, Math.round(local.localAudioDuration! * 1000));
      };
      recorder.start();
    } catch { setError(t("مش قادرين نستخدم الميكروفون. فعّلي الإذن من إعدادات المتصفح وجربي تاني.", "Enable microphone permission and try again.")); }
  };
  const transcribeAudio = async (audio: Blob, durationMs: number) => { setTranscribing(true); setError(""); try { if (realtimeState !== "idle") return; const id = await ensureSession(); if (!id) return; const form = new FormData(); form.set("sessionId", id); form.set("audio", audio, `voice.${audio.type.includes("ogg") ? "ogg" : audio.type.includes("mp4") ? "m4a" : "webm"}`); form.set("durationMs", String(durationMs)); form.set("localeHint", lang); const response = await fetch("/api/chat/voice/transcribe", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) { retryAudioRef.current = data.errorCode === "STT_NETWORK_ERROR" || data.errorCode === "STT_TIMEOUT" ? { blob: audio, durationMs } : null; setError(data.error ?? t("معرفتش أفهم التسجيل المرة دي. تقدري تعيدي التسجيل أو تكتبي سؤالك.", "Unable to transcribe recording.")); return; } retryAudioRef.current = null; const transcript = typeof data.normalizedTranscript === "string" ? data.normalizedTranscript.trim() : ""; if (!transcript) { setError(t("الصوت اتسجل، بس الكلام مش واضح. جربي تاني.", "The recording was unclear. Please try again.")); return; } setInput(transcript); await sendMessage(transcript, "stt"); } finally { setTranscribing(false); } };
  const retryTranscription = () => { const retry = retryAudioRef.current; if (retry) transcribeAudio(retry.blob, retry.durationMs); };
  const playMessage = async (messageId: string, automatic = false) => { if (!ttsEnabled || realtimeState !== "idle") { if (!automatic && realtimeState !== "idle") setError(t("الصوت المباشر شغال دلوقتي.", "Live voice is active.")); return; } try { if (audioRef.current && shouldReuseTtsAudio(activeTtsMessageIdRef.current, messageId)) { await audioRef.current.play(); setTtsAutoplayBlocked(false); return; } stopPlayback(); setTtsAutoplayBlocked(false); const id = await ensureSession(); if (!id) return; recordVoiceDiagnostic("ttsRequestCount"); const response = await fetch("/api/chat/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, messageId }) }); const contentType = response.headers.get("content-type") ?? ""; const source = response.headers.get("x-ai-coach-audio-source") ?? "unknown"; if (voiceDebugEnabled) console.info("[AI_COACH_LISTEN]", { source, contentType, status: response.status }); if (!response.ok || !contentType.startsWith("audio/")) throw new Error("OPENAI_TTS_UNAVAILABLE"); const audio = new Audio(URL.createObjectURL(await response.blob())); audio.muted = false; audio.volume = 1; audioRef.current = audio; activeTtsMessageIdRef.current = messageId; audio.onended = () => { URL.revokeObjectURL(audio.src); activeTtsMessageIdRef.current = null; }; try { await audio.play(); } catch { if (automatic) { setTtsAutoplayBlocked(true); setError(t("الرد وصل، لكن تعذر تشغيل الصوت.", "The reply arrived, but audio could not play.")); return; } throw new Error("AUDIO_PLAY_BLOCKED"); } if (voiceDebugEnabled) console.info("[AI_COACH_LISTEN]", { source, play: "success" }); } catch (error) { if (voiceDebugEnabled) console.info("[AI_COACH_LISTEN]", { source: "openai-tts", play: "failed", name: error instanceof Error ? error.name : "unknown" }); setError(t("الرد وصل، لكن تعذر تشغيل الصوت.", "The reply arrived, but audio could not play.")); } };
  const startRealtime = async () => {
    if (!canStartRealtimeConnection({ enabled: realtimeEnabled, state: realtimeState, connectionInFlight: connectionAttemptInFlightRef.current, sessionRequestInFlight: realtimeSessionRequestInFlightRef.current, hasPeer: Boolean(activePeerConnectionRef.current), hasDataChannel: Boolean(activeDataChannelRef.current), supported: Boolean(window.RTCPeerConnection && navigator.mediaDevices?.getUserMedia) })) { setError(t("المحادثة المباشرة مش متاحة دلوقتي، تقدري تستخدمي التسجيل أو الكتابة.", "Live voice is unavailable. Use recording or text.")); return; }
    explicitUserConnectRef.current = true;
    connectionAttemptInFlightRef.current = true;
    lastConnectionAttemptAt.current = Date.now();
    setRealtimeState("connecting"); setError(""); stopPlayback(); stopRecording();
    const platform = detectVoicePlatform();
    const remoteAudio = realtimeAudioRef.current;
    if (!remoteAudio) { endRealtime("failed"); setRealtimeState("error"); setError(t("تعذر إعداد صوت المكالمة. ابدئي مكالمة جديدة.", "Unable to prepare call audio. Start a new call.")); return; }
    // Must happen before the first await so iOS Safari keeps the user gesture.
    void unlockIOSAudio(remoteAudio, audioContextRef);
    const peer = new RTCPeerConnection(); realtimePeerRef.current = peer; activePeerConnectionRef.current = peer; recordVoiceDiagnostic("peerConnectionCount");
    remoteAudioPlayAttemptRef.current = false;
    const microphonePromise = navigator.mediaDevices.getUserMedia({ audio: realtimeMicrophoneConstraints }).then((stream) => {
      if (realtimePeerRef.current !== peer || !explicitUserConnectRef.current) { stream.getTracks().forEach((track) => track.stop()); throw new Error("CONNECTION_CANCELLED"); }
      realtimeStreamRef.current = stream;
      return stream;
    });
    const setDebug = (values: Partial<typeof voiceDebug>) => voiceDebugEnabled && setVoiceDebug((current) => ({ ...current, ...values }));
    realtimeEventSequenceRef.current = [];
    realtimeSessionReadyRef.current = false;
    realtimeSessionUpdateSentRef.current = false;
    setDebug({ lastRealtimeEvent: "", lastErrorCode: "", lastErrorType: "" });
    setDebug({ platform: `${platform.isIOS ? "iOS" : "other"}${platform.isSafari ? " Safari" : ""}${platform.isStandalonePWA ? " PWA" : ""}`, pcState: peer.connectionState, iceState: peer.iceConnectionState });
    try {
      const id = await ensureSession(); if (!id) throw new Error();
      if (!explicitUserConnectRef.current || realtimeSessionRequestInFlightRef.current) throw new Error("CONNECTION_CANCELLED");
      realtimeSessionRequestInFlightRef.current = true; recordVoiceDiagnostic("sessionRequestCount");
      const tokenResponse = await fetch("/api/chat/voice/realtime/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, lang, voice: realtimeVoice }) });
      realtimeSessionRequestInFlightRef.current = false;
      const tokenData = await tokenResponse.json().catch(() => ({})) as { clientSecret?: string; voiceSessionId?: string };
      if (!tokenResponse.ok || !tokenData.clientSecret) throw new Error();
      realtimeVoiceSessionIdRef.current = typeof tokenData.voiceSessionId === "string" ? tokenData.voiceSessionId : null;
      const stream = await microphonePromise; realtimeStreamRef.current = stream;
      const microphoneTrack = stream.getAudioTracks()[0];
      if (!microphoneTrack) throw new Error();
      if (voiceDebugEnabled) console.info("[AI_COACH_REALTIME_MIC]", { readyState: microphoneTrack.readyState, enabled: microphoneTrack.enabled, muted: microphoneTrack.muted, ...microphoneTrack.getSettings() });
      setDebug({ trackState: microphoneTrack.readyState, trackMuted: microphoneTrack.muted });
      const playRemoteAudio = () => {
        remoteAudioPlayAttemptRef.current = true;
        remoteAudio.muted = false;
        remoteAudio.volume = 1;
        return remoteAudio.play().then(() => { setAutoplayBlocked(false); if (voiceDebugEnabled) console.info("[AI_COACH_VOICE] audio_played"); }).catch((error) => { remoteAudioPlayAttemptRef.current = false; setAutoplayBlocked(true); setError(t("تعذر تشغيل صوت المساعد. اضغطي لتشغيله مرة أخرى.", "Assistant audio could not play. Tap to try again.")); if (voiceDebugEnabled) console.info("[AI_COACH_VOICE] audio_play_blocked", { name: error instanceof Error ? error.name : "unknown" }); });
      };
      peer.ontrack = (event) => { const remoteStream = event.streams[0] ?? new MediaStream([event.track]); remoteAudio.srcObject = remoteStream; remoteAudio.muted = false; remoteAudio.volume = 1; setDebug({ remoteTrackReceived: event.track.kind === "audio", trackState: event.track.readyState, remoteStreamTracksCount: remoteStream.getAudioTracks().length, audioPaused: remoteAudio.paused }); void playRemoteAudio(); if (realtimeSessionReadyRef.current) setRealtimeState("assistant_speaking"); };
      peer.onconnectionstatechange = () => { setDebug({ pcState: peer.connectionState }); if (["failed", "disconnected"].includes(peer.connectionState)) { endRealtime("failed"); setError(t("انتهت المكالمة الصوتية. اضغطي اتصال لو حابة تبدأي من جديد.", "The call ended. Tap connect to start again.")); } };
      peer.oniceconnectionstatechange = () => setDebug({ iceState: peer.iceConnectionState });
      peer.addTrack(microphoneTrack, stream);
      const channel = peer.createDataChannel("oai-events");
      realtimeChannelRef.current = channel; activeDataChannelRef.current = channel;
      channel.onopen = () => {
        setDebug({ dataChannelState: channel.readyState });
        if (realtimeSessionUpdateSentRef.current) return;
        realtimeSessionUpdateSentRef.current = true;
        realtimeSessionReadyRef.current = false;
        setRealtimeState("initializing");
        channel.send(JSON.stringify(buildRealtimeSessionUpdate()));
      };
      channel.onclose = () => setDebug({ dataChannelState: channel.readyState });
      channel.onmessage = async (event) => {
        let data: { type?: string; name?: string; call_id?: string; arguments?: string; event_id?: string; error?: RealtimeErrorDetails } = {};
        try { data = JSON.parse(event.data); } catch { return; }
        const eventLabel = realtimeEventLabel(data.type);
        realtimeEventSequenceRef.current = [...realtimeEventSequenceRef.current, eventLabel].slice(-12);
        setDebug({ lastRealtimeEvent: eventLabel });
        if (data.type === "session.created") setRealtimeState("initializing");
        if (data.type === "session.updated") {
          realtimeSessionReadyRef.current = true;
          setRealtimeState("listening");
          const voiceSessionId = realtimeVoiceSessionIdRef.current;
          if (voiceSessionId && !realtimeHeartbeatTimerRef.current) {
            const heartbeat = () => fetch("/api/chat/voice/realtime/heartbeat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId: id, voiceSessionId }),
            }).then((response) => {
              if (!response.ok) endRealtime();
            }).catch(() => {});
            heartbeat();
            realtimeHeartbeatTimerRef.current = window.setInterval(heartbeat, 12_000);
          }
        }
        if (data.type === "response.function_call_arguments.done" && data.name && data.call_id && realtimeSessionReadyRef.current) {
          let args: Record<string, unknown> = {}; try { args = JSON.parse(data.arguments ?? "{}"); } catch { /* server rejects malformed args */ }
          const toolResponse = await fetch("/api/chat/voice/realtime/tool", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: id, voiceSessionId: realtimeVoiceSessionIdRef.current ?? undefined, name: data.name, arguments: args, lang }) });
          const toolData = await toolResponse.json().catch(() => ({})) as { result?: unknown; errorCode?: unknown };
          if (!toolResponse.ok && voiceDebugEnabled) {
            logClientVoiceDebug(true, "error", "[AI_COACH_REALTIME_TOOL_ERROR]", {
              status: toolResponse.status,
              errorCode: typeof toolData.errorCode === "string" ? toolData.errorCode : `TOOL_HTTP_${toolResponse.status}`,
              toolName: data.name,
              hasSessionId: Boolean(id),
              hasCallId: Boolean(data.call_id),
            });
          }
          recordVoiceDiagnostic("toolCallCount");
          const toolResult = toolData.result as { answer?: unknown } | undefined;
          const toolAnswer = typeof toolResult?.answer === "string" ? toolResult.answer.trim() : "";
          if (toolAnswer || !toolResponse.ok) {
            const toolMessage: ChatMessage = {
              id: `realtime-tool-${data.call_id}`,
              senderType: "bot",
              senderName: "AI Coach",
              content: toolAnswer || t("حصلت مشكلة أثناء تنفيذ الطلب الصوتي. جربي مرة ثانية.", "The voice request could not be completed. Please try again."),
              createdAt: new Date().toISOString(),
            };
            setMessages((current) => appendUniqueChatMessage(current, toolMessage));
          }
          // Navigation waits for the assistant's resulting audio to begin. It never creates a new call.
          pendingUiActionsRef.current = buildCoachUiActionsForToolResult(data.name, toolData.result);
          const functionResult = toolResponse.ok ? toolData.result ?? { allowed: false } : { allowed: false, answer: "Tool unavailable." };
          if (channel.readyState === "open") { setRealtimeState("thinking"); for (const responseEvent of createRealtimeToolOutputEvents(data.call_id, functionResult)) channel.send(JSON.stringify(responseEvent)); }
          // Tool results are applied through the Realtime response; never reload the full chat session here.
        }
        if (data.type === "input_audio_buffer.speech_started") {
          // With non-barge-in VAD a short detection while output is playing is commonly speaker echo.
          if (assistantAudioStartedRef.current) return;
          speechStartedRef.current = true;
          if (vadFallbackTimerRef.current) window.clearTimeout(vadFallbackTimerRef.current);
          setManualVoiceFallback(false);
          if (realtimeSessionReadyRef.current) setRealtimeState("listening");
        }
        if (data.type === "input_audio_buffer.speech_stopped" && realtimeSessionReadyRef.current) setRealtimeState("thinking");
        if (data.type === "response.created" && realtimeSessionReadyRef.current) { recordVoiceDiagnostic("responseCreateCount"); responseHasOutputRef.current = false; assistantAudioStartedRef.current = false; setRealtimeState("thinking"); }
        if ((data.type === "response.output_audio.delta" || data.type === "response.audio.delta") && realtimeSessionReadyRef.current) {
          responseHasOutputRef.current = true; assistantAudioStartedRef.current = true; setRealtimeState("assistant_speaking"); void playRemoteAudio();
          const action = pendingUiActionsRef.current;
          if (action && !navigationPerformedRef.current) { navigationPerformedRef.current = true; pendingUiActionsRef.current = null; void dispatchCoachUiActions(action); }
        }
        if (data.type === "response.done" && realtimeSessionReadyRef.current) {
          assistantAudioStartedRef.current = false;
          if (hasRealtimeResponseOutput(responseHasOutputRef.current)) setRealtimeState("listening");
          else { setRealtimeState("error"); setError(t("سمعتك، لكن حصلت مشكلة وأنا بجهز الرد. جربي مرة ثانية.", "I heard you, but had trouble preparing the reply. Please try again.")); }
        }
        if (data.type === "error") {
          const error = data.error;
          const kind = classifyRealtimeError(error);
          setDebug({ lastErrorCode: error?.code ?? "", lastErrorType: error?.type ?? "" });
          if (voiceDebugEnabled) {
            logClientVoiceDebug(true, "error", "[AI_COACH_REALTIME_ERROR]", {
              eventType: data.type,
              errorType: error?.type,
              errorCode: error?.code,
              errorMessage: error?.message,
              errorParam: error?.param,
              eventId: data.event_id,
            });
            logClientVoiceDebug(true, "info", "[AI_COACH_REALTIME_EVENT_SEQUENCE]", realtimeEventSequenceRef.current);
          }
          if (kind === "fatal") {
            endRealtime("failed");
            setRealtimeState("error");
            setError(error?.code === "missing_required_parameter" && error?.param === "session.type"
              ? t("تعذر إعداد المكالمة الصوتية. ابدئي مكالمة جديدة.", "Live voice configuration failed. Start a new call.")
              : t("حصلت مشكلة في المحادثة الصوتية. ابدئي مكالمة جديدة.", "There was a problem with live voice. Start a new call."));
          } else if (kind === "recoverable") {
            setRealtimeState("listening");
          } else {
            setRealtimeState("listening");
            setError(t("حصلت مشكلة أثناء تنفيذ طلب المساعدة، لكن المكالمة ما زالت مستمرة.", "A tool request failed, but the call is still active."));
          }
        }
      };
      const offer = await peer.createOffer(); await peer.setLocalDescription(offer);
      const answer = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${tokenData.clientSecret}`, "Content-Type": "application/sdp" }, body: offer.sdp });
      if (!answer.ok) throw new Error();
      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() }); setRealtimeState("initializing");
      sessionStartedAtRef.current = Date.now();
      if (maxSessionSeconds > 0) {
        sessionLimitTimerRef.current = window.setInterval(() => {
          const remaining = Math.max(0, maxSessionSeconds - Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
          setRemainingSeconds(remaining);
          if (remaining === warningBeforeEndSeconds) setError(t("وقت المحادثة الصوتية قرب يخلص.", "Your voice session is about to end."));
          if (remaining === 0) { setError(t("وقت المحادثة الصوتية المتاح خلص دلوقتي، تقدري تكملي بالكتابة أو التسجيل.", "Your voice session has ended. You can continue by text or recording.")); endRealtime("limit_reached"); }
        }, 1_000);
      }
      if (platform.isIOS) vadFallbackTimerRef.current = window.setTimeout(() => { if (microphoneTrack.readyState === "live" && !speechStartedRef.current) setManualVoiceFallback(true); }, 5_000);
    } catch { endRealtime("failed"); setError(t("المحادثة المباشرة مش متاحة دلوقتي، تقدري تستخدمي التسجيل أو الكتابة.", "Live voice is unavailable. Use recording or text.")); }
  };

  return (
    <>
      {!open && <button
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
      </button>}

      <style>{`@media (max-width: 768px) { .fitzone-ai-coach-mobile-open .mobile-bottom-nav { display: none !important; } .ai-coach-quick-actions { scrollbar-width: none; -ms-overflow-style: none; } .ai-coach-quick-actions::-webkit-scrollbar { display: none; } }`}</style>

      {open && (
        <div
          dir={lang === "ar" ? "rtl" : "ltr"}
          style={buildAiCoachShellStyle(isMobile)}
        >
          <audio ref={realtimeAudioRef} autoPlay playsInline controls={false} style={{ display: "none" }} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: "1 1 auto", height: "100%", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flexShrink: 0, padding: isMobile ? "calc(16px + env(safe-area-inset-top, 0px)) 16px 16px" : 16, borderBottom: "1px solid #F5D0DC", background: "linear-gradient(135deg, #E91E63, #F06292)" }}>
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
              flexShrink: 0,
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
              <div className="ai-coach-quick-actions" style={{ display: "flex", flexWrap: "nowrap", gap: 8, width: "100%", minWidth: 0, overflowX: "auto", overscrollBehaviorX: "contain", paddingInline: 4, paddingBottom: 2, scrollPaddingInline: 12 }}>
                {quickActions.map((item) => (
                  <button key={item.id} onClick={() => sendMessage(item.prompt)} style={{ ...quickButtonStyle, flex: "0 0 auto", whiteSpace: "nowrap" }}>
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
              flex: "1 1 auto",
              minHeight: 0,
              overflow: "hidden",
              padding: 0,
              background: "#FFF5F8",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div ref={messagesAreaRef} style={{ flex: "1 1 auto", minHeight: isMobile ? 0 : 220, overflowY: "auto", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", padding: 14 }}>
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
            {ttsEnabled && message.senderType === "bot" && shouldShowVoiceControls(sessionCapabilities, realtimeState !== "idle").showListenButton && <div style={{ display: "flex", gap: 6, marginTop: 8 }}><button aria-label="تشغيل الرد صوتيًا" onClick={() => playMessage(message.id)} style={quickButtonStyle}>▶ {t("اسمعي", "Play")}</button><button aria-label="إيقاف الصوت" onClick={stopPlayback} style={quickButtonStyle}>■ {t("إيقاف", "Stop")}</button></div>}
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
              flexShrink: 0,
              padding: isMobile ? "12px 12px calc(env(safe-area-inset-bottom, 0px) + 8px)" : 12,
              borderTop: "1px solid #F5D0DC",
              background: "#FFF0F5",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              position: "relative",
              zIndex: 1,
            }}
          >
            {recorderEnabled && (recording || transcribing) && <div style={{ width: "100%", fontSize: 12, color: "#E91E63" }}>{recording ? `${t("بتسمعك دلوقتي", "Listening")}… ${recordingSeconds}s` : t("جاري فهم كلامك…", "Understanding your voice…")}</div>}
            {realtimeEnabled && realtimeState !== "idle" && <div style={{ width: "100%", fontSize: 12, color: "#E91E63" }}>{realtimeStatusLabel}</div>}
            {realtimeEnabled && autoplayBlocked && <button onClick={() => { void realtimeAudioRef.current?.play().then(() => setAutoplayBlocked(false)); }} style={{ ...quickButtonStyle, width: "100%" }}>{t("اضغطي مرة واحدة لتشغيل صوت المساعد.", "Tap once to play assistant audio.")}</button>}
            {ttsEnabled && ttsAutoplayBlocked && <button onClick={() => { void audioRef.current?.play().then(() => { setTtsAutoplayBlocked(false); setError(""); }).catch(() => {}); }} style={{ ...quickButtonStyle, width: "100%" }}>{t("اضغطي لتشغيل الرد الصوتي", "Tap to play the voice reply")}</button>}
            {shouldShowVoiceControls(sessionCapabilities, realtimeState !== "idle").showCallButton && <button aria-label={realtimeState === "idle" ? "ابدئي محادثة صوتية" : "إنهاء المحادثة الصوتية"} title={realtimeState === "idle" ? "محادثة صوتية" : "إنهاء المحادثة"} onClick={realtimeState === "idle" ? startRealtime : () => endRealtime()} disabled={realtimeState === "connecting"} style={{ flex: "0 0 44px", width: 44, height: 52, border: "1px solid #F5D0DC", borderRadius: 14, background: realtimeState === "idle" ? "#fff" : "#BE185D", color: realtimeState === "idle" ? "#E91E63" : "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>{realtimeState === "connecting" ? <Loader2 size={18} className="animate-spin" /> : realtimeState === "idle" ? <Phone size={18} /> : <PhoneOff size={18} />}</button>}
            {shouldShowVoiceControls(sessionCapabilities, realtimeState !== "idle").showRecorderButton && <button aria-label={recording ? "إيقاف التسجيل" : "ابدئي تسجيل صوتي"} title={recording ? "إيقاف التسجيل" : "ابدئي تسجيل صوتي"} onClick={recording ? stopRecording : startRecording} disabled={loading || transcribing} style={{ flex: "0 0 44px", width: 44, height: 52, border: "1px solid #F5D0DC", borderRadius: 14, background: recording ? "#BE185D" : "#fff", color: recording ? "#fff" : "#E91E63", display: "grid", placeItems: "center", cursor: "pointer" }}>{transcribing ? <Loader2 size={18} className="animate-spin" /> : recording ? <Square size={17} fill="currentColor" /> : <Mic size={19} />}</button>}
            {realtimeEnabled && manualVoiceFallback && <button onClick={() => { realtimeStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; }); setManualVoiceFallback(false); }} style={{ ...quickButtonStyle, flex: "0 0 auto" }}>{t("ابدئي الكلام", "Start talking")}</button>}
            {voiceDebugEnabled && <div aria-label="AI Coach voice debug" style={{ position: "absolute", insetInline: 12, bottom: isMobile ? "calc(env(safe-area-inset-bottom, 0px) + 104px)" : 96, zIndex: 2, maxWidth: "calc(100% - 24px)", pointerEvents: "none", fontSize: 10, color: "#7A5B68", direction: "ltr", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{`platform=${voiceDebug.platform || "unknown"} · pc=${voiceDebug.pcState} · ice=${voiceDebug.iceState} · dc=${voiceDebug.dataChannelState} · track=${voiceDebug.trackState}/${voiceDebug.trackMuted ? "muted" : "unmuted"} · event=${voiceDebug.lastRealtimeEvent || "—"} · errorCode=${voiceDebug.lastErrorCode || "—"} · errorType=${voiceDebug.lastErrorType || "—"}`}</div>}
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
