import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifySttProviderStatus,
  createSttProviderFile,
  openAiSttProvider,
  SttProviderError,
} from "@/lib/ai-coach/voice/stt-provider";

const ebmlAudio = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88]);
const originalKey = process.env.OPENAI_API_KEY;
const originalModel = process.env.OPENAI_STT_MODEL;

function audioBlob() {
  return new Blob([ebmlAudio], { type: "audio/webm" });
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.OPENAI_STT_MODEL;
  else process.env.OPENAI_STT_MODEL = originalModel;
});

describe("OpenAI STT provider multipart request", () => {
  it("creates a real webm File without changing its bytes or size", async () => {
    const file = createSttProviderFile(ebmlAudio.buffer.slice(0), "recording");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("recording.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(ebmlAudio.byteLength);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(ebmlAudio);
  });

  it("posts multipart FormData to audio transcriptions without a manual content type", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "مواعيد كيك بوكس" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openAiSttProvider.transcribe({ audio: audioBlob(), filename: "capture.webm", localeHint: "ar" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    const file = form.get("file") as File;

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("capture.webm");
    expect(file.type).toBe("audio/webm");
    expect(file.size).toBe(ebmlAudio.byteLength);
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("ar");
    expect(result.rawTranscript).toBe("مواعيد كيك بوكس");
  });
});

describe("OpenAI STT provider error mapping", () => {
  it.each([
    [400, "STT_BAD_REQUEST"], [401, "STT_AUTH_ERROR"], [403, "STT_AUTH_ERROR"],
    [404, "STT_MODEL_INVALID"], [413, "STT_FILE_TOO_LARGE"], [415, "STT_UNSUPPORTED_MEDIA"],
    [429, "STT_RATE_LIMITED"], [500, "STT_PROVIDER_ERROR"],
  ] as const)("maps provider status %s to %s", (status, expected) => {
    expect(classifySttProviderStatus(status)).toBe(expected);
  });

  it("rejects malformed and empty successful responses", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));
    await expect(openAiSttProvider.transcribe({ audio: audioBlob(), filename: "capture.webm" }))
      .rejects.toMatchObject({ code: "STT_PROVIDER_ERROR" } satisfies Partial<SttProviderError>);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "   " }), { status: 200 })));
    const response = await openAiSttProvider.transcribe({ audio: audioBlob(), filename: "capture.webm" });
    expect(response.rawTranscript).toBe("");
  });
});
