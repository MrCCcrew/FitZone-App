import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

describe("translation service", () => {
  beforeEach(() => {
    vi.resetModules();

    process.env.APP_ENV = "test";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses OpenAI as the primary translator", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "Suitable for people seeking hair and skin care.",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { translateArabicToEnglish } =
      await import("@/lib/translation-service");

    const result =
      await translateArabicToEnglish(
        "يناسب الباحثين عن العناية بالشعر والبشرة",
      );

    expect(result).toBe(
      "Suitable for people seeking hair and skin care.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(
      String(fetchMock.mock.calls[0]?.[0]),
    ).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
  });

  it("falls back to Google when OpenAI is rate limited", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "rate limited",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            [
              [
                "Suitable for hair care.",
                "مناسب للعناية بالشعر.",
              ],
            ],
          ]),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { translateArabicToEnglish } =
      await import("@/lib/translation-service");

    const result =
      await translateArabicToEnglish(
        "مناسب للعناية بالشعر.",
      );

    expect(result).toBe(
      "Suitable for hair care.",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(
      String(fetchMock.mock.calls[1]?.[0]),
    ).toContain(
      "translate.googleapis.com/translate_a/single",
    );

    expect(errorSpy).toHaveBeenCalled();
  });

  it("fails when both providers fail", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
        }),
      );

    vi.stubGlobal("fetch", fetchMock);

    vi.spyOn(
      console,
      "error",
    ).mockImplementation(() => {});

    const { translateArabicToEnglish } =
      await import("@/lib/translation-service");

    await expect(
      translateArabicToEnglish(
        "اختبار الترجمة",
      ),
    ).rejects.toThrow(
      "GOOGLE_TRANSLATION_HTTP_429",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("obeys staging external-side-effect guard", async () => {
    process.env.APP_ENV = "staging";
    process.env.ALLOW_EXTERNAL_SIDE_EFFECTS =
      "false";

    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const { translateArabicToEnglish } =
      await import("@/lib/translation-service");

    await expect(
      translateArabicToEnglish(
        "اختبار",
      ),
    ).rejects.toThrow(
      "[STAGING_SAFETY]",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
