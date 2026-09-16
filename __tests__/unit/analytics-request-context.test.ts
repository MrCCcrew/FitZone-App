import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  delete process.env.ANALYTICS_TRUST_PROXY_GEO;
});
import {
  getAnalyticsRequestContext,
  parseAnalyticsUserAgent,
} from "@/lib/analytics/privacy";

describe("analytics request context", () => {
  it("detects common mobile browser/platform", () => {
    const result = parseAnalyticsUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    );

    expect(result).toEqual({
      deviceType: "mobile",
      browser: "Safari",
      operatingSystem: "iOS",
    });
  });

  it("detects desktop Chrome on Windows", () => {
    const result = parseAnalyticsUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36",
    );

    expect(result).toEqual({
      deviceType: "desktop",
      browser: "Chrome",
      operatingSystem: "Windows",
    });
  });

  it("ignores geo headers unless trusted-proxy mode is enabled", () => {
    const headers = new Headers({
      "user-agent":
        "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
      "cf-ipcountry": "kw",
      "x-country-code": "eg",
      "x-city": "Spoofed City",
    });

    const result = getAnalyticsRequestContext(headers);

    expect(result.countryCode).toBeUndefined();
    expect(result.city).toBeUndefined();
    expect(result.deviceType).toBe("mobile");
  });

  it("accepts infrastructure geo only after trusted-proxy mode is enabled", () => {
    process.env.ANALYTICS_TRUST_PROXY_GEO = "true";

    const result = getAnalyticsRequestContext(
      new Headers({
        "user-agent":
          "Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
        "cf-ipcountry": "kw",
      }),
    );

    expect(result.countryCode).toBe("KW");
    expect(result.deviceType).toBe("mobile");
    expect(result.browser).toBe("Chrome");
    expect(result.operatingSystem).toBe("Android");
  });

  it("does not derive geography when proxy headers are absent", () => {
    const result = getAnalyticsRequestContext(
      new Headers({
        "user-agent": "Mozilla/5.0",
      }),
    );

    expect(result.countryCode).toBeUndefined();
    expect(result.countryName).toBeUndefined();
    expect(result.region).toBeUndefined();
    expect(result.city).toBeUndefined();
  });
});
