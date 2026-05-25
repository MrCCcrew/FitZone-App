"use client";

import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import PushPromptModal from "@/components/PushPromptModal";
import PullToRefresh from "@/components/PullToRefresh";
import { LanguageProvider } from "@/lib/language";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <PullToRefresh />
      <PwaInstallPrompt />
      <PushPromptModal />
    </LanguageProvider>
  );
}
