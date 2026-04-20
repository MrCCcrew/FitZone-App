"use client";

import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import PushPromptModal from "@/components/PushPromptModal";
import { LanguageProvider } from "@/lib/language";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <PwaInstallPrompt />
      <PushPromptModal />
    </LanguageProvider>
  );
}
