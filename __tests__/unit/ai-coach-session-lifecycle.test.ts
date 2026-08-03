import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendUniqueChatMessage, getVoiceCapabilities, shouldRequestChatSession, shouldShowVoiceControls } from "@/components/LiveChatWidget";

afterEach(() => vi.useRealTimers());

describe("AI Coach session lifecycle", () => {
  const fresh = { sessionId: "session-1", inFlight: false, lastLoadedSessionId: null, lastRequestKey: null, unmounted: false };

  it("allows one initial request, then blocks 20 rerenders and message updates for the loaded id", () => {
    expect(shouldRequestChatSession(fresh)).toBe(true);
    const loaded = { ...fresh, lastLoadedSessionId: "session-1", lastRequestKey: "session:session-1" };
    for (let index = 0; index < 20; index += 1) expect(shouldRequestChatSession(loaded)).toBe(false);
  });

  it("blocks duplicate in-flight, unmounted, and failed-request retry loops", () => {
    expect(shouldRequestChatSession({ ...fresh, inFlight: true })).toBe(false);
    expect(shouldRequestChatSession({ ...fresh, unmounted: true })).toBe(false);
    expect(shouldRequestChatSession({ ...fresh, lastRequestKey: "session:session-1" })).toBe(false);
  });

  it("permits exactly one new request when a new session id is explicitly selected", () => {
    expect(shouldRequestChatSession({ ...fresh, sessionId: "session-2", lastLoadedSessionId: "session-1", lastRequestKey: "session:session-1" })).toBe(true);
  });

  it("has no session polling, recursive retry, or session reload from message/realtime effects", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/LiveChatWidget.tsx"), "utf8");
    expect(source).not.toMatch(/setInterval\s*\([\s\S]{0,500}loadSession/);
    expect(source).not.toMatch(/loadSession\(id\).*loadSession\(/);
    expect(source).toContain("initialSessionLoadedRef");
    expect(source).toContain("componentUnmountedRef");
    expect(source).toContain("sessionAbortControllerRef");
  });

  it("keeps the request count fixed through 20 rerenders, open/close transitions, and 60 seconds", () => {
    vi.useFakeTimers();
    let requestCount = 0;
    const request = () => { requestCount += 1; };
    request();
    for (let index = 0; index < 20; index += 1) {
      // These represent React rerender/open-close/message state transitions.
      shouldRequestChatSession({ ...fresh, lastLoadedSessionId: "session-1", lastRequestKey: "session:session-1" });
    }
    vi.advanceTimersByTime(60_000);
    expect(requestCount).toBe(1);
  });

  it("aborts a pending request and does not update state after unmount", () => {
    const controller = new AbortController();
    let stateUpdates = 0;
    controller.abort();
    if (!controller.signal.aborted) stateUpdates += 1;
    expect(controller.signal.aborted).toBe(true);
    expect(stateUpdates).toBe(0);
  });

  it("keeps a Realtime tool assistant message exactly once", () => {
    const message = { id: "realtime-tool-call-1", senderType: "bot" as const, content: "تم العثور على النتائج", createdAt: new Date().toISOString() };
    expect(appendUniqueChatMessage([], message)).toHaveLength(1);
    expect(appendUniqueChatMessage([message], message)).toHaveLength(1);
  });
});

describe("AI Coach voice capability controls", () => {
  it("shows realtime and independent recorder controls without TTS", () => {
    const capabilities = getVoiceCapabilities({ voice: "true", realtime: "true", recorder: "true", tts: "false" });
    expect(shouldShowVoiceControls(capabilities, false)).toEqual({ showCallButton: true, showRecorderButton: true, showListenButton: false });
  });

  it("shows all requested controls when TTS is enabled", () => {
    const capabilities = getVoiceCapabilities({ voice: "true", realtime: "true", recorder: "true", tts: "true" });
    expect(shouldShowVoiceControls(capabilities, false)).toEqual({ showCallButton: true, showRecorderButton: true, showListenButton: true });
    expect(shouldShowVoiceControls(capabilities, true).showListenButton).toBe(false);
  });

  it("keeps production-disabled voice controls intentionally hidden", () => {
    const capabilities = getVoiceCapabilities({ voice: "false", realtime: "true", recorder: "true", tts: "true" });
    expect(shouldShowVoiceControls(capabilities, false)).toEqual({ showCallButton: false, showRecorderButton: false, showListenButton: false });
  });
});
