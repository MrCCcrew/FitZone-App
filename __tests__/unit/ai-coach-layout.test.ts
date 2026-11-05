import { describe, expect, it } from "vitest";
import { buildAiCoachShellStyle } from "@/components/LiveChatWidget";

describe("AI Coach responsive shell layout", () => {
  it.each([1366, 1440, 1920])("keeps desktop %ipx viewports as a floating panel", () => {
    const style = buildAiCoachShellStyle(false);
    expect(style).toMatchObject({
      position: "fixed",
      bottom: 20,
      insetInlineEnd: 20,
      width: "clamp(360px, 30vw, 460px)",
      height: "min(720px, calc(100dvh - 40px))",
      maxHeight: "calc(100dvh - 40px)",
      borderRadius: 24,
      overflow: "hidden",
    });
    expect(style.top).toBeUndefined();
  });

  it.each(["360x800", "390x844", "412x915", "430x932"])("uses a full viewport shell for mobile %s", () => {
    const style = buildAiCoachShellStyle(true);
    expect(style).toMatchObject({
      position: "fixed",
      top: 0,
      bottom: 0,
      insetInlineStart: 0,
      insetInlineEnd: 0,
      zIndex: 1000,
      width: "100vw",
      height: "var(--ai-chat-viewport-height, 100dvh)",
      maxHeight: "none",
      borderRadius: 0,
    });
  });
});
