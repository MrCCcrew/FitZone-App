import { describe, expect, it } from "vitest";

import { getClientIp } from "@/lib/rate-limit";

function requestWithHeaders(
  headers: Record<string, string>,
): Request {
  return new Request("https://fitzoneland.test/", {
    headers,
  });
}

describe("getClientIp trusted proxy precedence", () => {
  it("prefers Nginx-controlled x-real-ip over client-supplied x-forwarded-for", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "203.0.113.50, 198.51.100.10",
      "x-real-ip": "192.0.2.25",
    });

    expect(getClientIp(request)).toBe("192.0.2.25");
  });

  it("trims x-real-ip before returning it", () => {
    const request = requestWithHeaders({
      "x-real-ip": " 192.0.2.30 ",
    });

    expect(getClientIp(request)).toBe("192.0.2.30");
  });

  it("falls back to the first x-forwarded-for address when x-real-ip is absent", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "203.0.113.51, 198.51.100.11",
    });

    expect(getClientIp(request)).toBe("203.0.113.51");
  });

  it("returns unknown when neither proxy header exists", () => {
    const request = requestWithHeaders({});

    expect(getClientIp(request)).toBe("unknown");
  });
});