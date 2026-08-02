import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinalRecording, buildRealtimeSessionUpdate, classifyRealtimeError, createRealtimeToolOutputEvents, detectVoicePlatform, inspectLocalRecording, realtimeEventLabel, realtimeMicrophoneConstraints, realtimeTurnDetection, recorderMimeCandidates, selectSupportedRecorderMime, shouldShowMessageTts, stopMediaRecorder } from "@/components/LiveChatWidget";

afterEach(() => vi.unstubAllGlobals());

describe("Press-to-Talk recorder assembly", () => {
  it("selects the first browser-supported recorder MIME candidate", () => {
    expect(selectSupportedRecorderMime((mime) => mime === "audio/ogg;codecs=opus")).toBe("audio/ogg;codecs=opus");
    expect(selectSupportedRecorderMime(() => false)).toBe("");
    expect(recorderMimeCandidates[0]).toBe("audio/webm;codecs=opus");
  });

  it("stops normally without requesting an additional data chunk", () => {
    const recorder = { state: "recording" as const, stop: vi.fn(), requestData: vi.fn() };
    stopMediaRecorder(recorder);
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(recorder.requestData).not.toHaveBeenCalled();
  });

  it("ignores empty chunks when building one final blob", async () => {
    const finalBlob = buildFinalRecording([new Blob([]), new Blob([new Uint8Array([1, 2, 3])])], "audio/webm");
    expect(finalBlob.type).toBe("audio/webm");
    expect(finalBlob.size).toBe(3);
  });
});

describe("Realtime playback routing", () => {
  it("uses iOS-safe microphone constraints and explicit server VAD", () => {
    expect(realtimeMicrophoneConstraints).toEqual({ echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 });
    expect(realtimeMicrophoneConstraints).not.toHaveProperty("sampleRate");
    expect(realtimeTurnDetection).toEqual({ type: "server_vad", threshold: 0.25, prefix_padding_ms: 500, silence_duration_ms: 900, create_response: true, interrupt_response: true });
  });

  it("identifies iPhone Safari without treating iOS Chrome as Safari", () => {
    expect(detectVoicePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile/15E148 Safari/604.1")).toMatchObject({ isIOS: true, isSafari: true });
    expect(detectVoicePlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) CriOS/120.0 Mobile/15E148 Safari/604.1")).toMatchObject({ isIOS: true, isSafari: false });
  });

  it("returns function output under the original call id before requesting a response", () => {
    expect(createRealtimeToolOutputEvents("call_123", { allowed: true })).toEqual([
      { type: "conversation.item.create", item: { type: "function_call_output", call_id: "call_123", output: JSON.stringify({ allowed: true }) } },
      { type: "response.create" },
    ]);
  });

  it("hides normal TTS controls while a realtime call is active", () => {
    expect(shouldShowMessageTts(true)).toBe(false);
    expect(shouldShowMessageTts(false)).toBe(true);
  });

  it("classifies only expected Realtime races as recoverable", () => {
    expect(realtimeEventLabel("input_audio_buffer.committed")).toBe("committed");
    expect(classifyRealtimeError({ code: "response_already_active" })).toBe("recoverable");
    expect(classifyRealtimeError({ message: "The input audio buffer is empty" })).toBe("recoverable");
    expect(classifyRealtimeError({ type: "tool_error" })).toBe("tool");
    expect(classifyRealtimeError({ code: "invalid_session" })).toBe("fatal");
    expect(classifyRealtimeError({ code: "missing_required_parameter", param: "session.type" })).toBe("fatal");
  });

  it("sends the required Realtime session discriminator after the data channel opens", () => {
    const event = buildRealtimeSessionUpdate();
    expect(event.type).toBe("session.update");
    expect(event.session.type).toBe("realtime");
    expect(event.session.audio.input.turn_detection).toEqual(realtimeTurnDetection);
  });
});

describe("Local recording decode guard", () => {
  it("accepts decodable local audio and always revokes the object URL", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: revoke });
    class DecodableAudio { duration = 1.5; onloadedmetadata: (() => void) | null = null; oncanplaythrough: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onloadedmetadata?.()); } load() {} }
    vi.stubGlobal("Audio", DecodableAudio);
    await expect(inspectLocalRecording(new Blob(["audio"], { type: "audio/webm" }), 100)).resolves.toEqual({ canDecodeLocally: true, localAudioDuration: 1.5 });
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("rejects a local decode failure and still cleans up", async () => {
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:bad"), revokeObjectURL: revoke });
    class BrokenAudio { duration = Number.NaN; onloadedmetadata: (() => void) | null = null; oncanplaythrough: (() => void) | null = null; onerror: (() => void) | null = null; set src(_value: string) { queueMicrotask(() => this.onerror?.()); } load() {} }
    vi.stubGlobal("Audio", BrokenAudio);
    await expect(inspectLocalRecording(new Blob(["broken"], { type: "audio/webm" }), 100)).resolves.toEqual({ canDecodeLocally: false, localAudioDuration: null });
    expect(revoke).toHaveBeenCalledWith("blob:bad");
  });
});
