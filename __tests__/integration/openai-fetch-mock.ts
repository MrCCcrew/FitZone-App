import { vi } from "vitest";

const nativeFetch = globalThis.fetch;

vi.mock("server-only", () => ({}));

vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (new URL(url).hostname === "api.openai.com") {
    return new Response(JSON.stringify({ mocked: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  return nativeFetch(input, init);
}));
