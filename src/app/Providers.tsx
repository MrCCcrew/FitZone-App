"use client";

import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import { LanguageProvider } from "@/lib/language";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      {children}
      <PwaInstallPrompt />
    </LanguageProvider>
  );
}
