import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinalRecording, createRealtimeToolOutputEvents, inspectLocalRecording, recorderMimeCandidates, selectSupportedRecorderMime, shouldShowMessageTts, stopMediaRecorder } from "@/components/LiveChatWidget";

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
