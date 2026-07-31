import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LiveChatWidget from "@/components/LiveChatWidget";
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
});
