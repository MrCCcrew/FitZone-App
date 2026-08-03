import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LiveChatWidget from "@/components/LiveChatWidget";
import FitZoneTour from "@/components/onboarding/FitZoneTour";
import { LanguageProvider } from "@/lib/language";

describe("AI Coach hydration safety", () => {
  it("renders a deterministic browser-free initial widget on the server", () => {
    const html = renderToString(
      <LanguageProvider>
        <LiveChatWidget />
      </LanguageProvider>,
    );

    expect(html).toContain('data-tour="ai-coach"');
    expect(html).toContain("AI Coach");
    expect(html).not.toContain("sessionStorage");
  });

  it("isolates the browser session widget from SSR and keeps message keys stable", () => {
    const wrapper = readFileSync(resolve(process.cwd(), "src/components/AICoachClientOnly.tsx"), "utf8");
    const widget = readFileSync(resolve(process.cwd(), "src/components/LiveChatWidget.tsx"), "utf8");

    expect(wrapper).toContain("ssr: false");
    expect(widget).toContain("key={message.id}");
    expect(widget).not.toContain("key={`${message.id}-${lastMessageId}`}");
  });

  it("keeps Site Tour markup identical before effects, even when browser dimensions exist", () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    const render = () => renderToString(
      <LanguageProvider>
        <FitZoneTour onNavigate={() => {}} onFinishNavigate={() => {}} onClose={() => {}} />
      </LanguageProvider>,
    );

    try {
      const serverMarkup = render();
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { innerWidth: 390, innerHeight: 844, location: { href: "http://localhost/" } },
      });
      const firstClientMarkup = render();

      expect(firstClientMarkup).toBe(serverMarkup);
      expect(firstClientMarkup).toContain("fitzone-tour__card--welcome");
      expect(firstClientMarkup).not.toContain('<div class="fitzone-tour__spotlight"');
    } finally {
      if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("does not derive initial AI Coach or Site Tour state from browser APIs", () => {
    const widget = readFileSync(resolve(process.cwd(), "src/components/LiveChatWidget.tsx"), "utf8");
    const tour = readFileSync(resolve(process.cwd(), "src/components/onboarding/FitZoneTour.tsx"), "utf8");
    const browserInitialState = /useState\s*\(\s*(?:\(\s*\)\s*=>\s*)?[^\n]*(?:localStorage|sessionStorage|window|navigator|MediaRecorder|Audio|matchMedia|Date\.now|Math\.random|randomUUID)/;

    expect(widget).not.toMatch(browserInitialState);
    expect(tour).not.toMatch(browserInitialState);
    expect(tour).not.toMatch(/typeof window[^\n]*\?[^\n]*:/);
  });
});
