"use client";

import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <PwaInstallPrompt />
    </>
  );
}
