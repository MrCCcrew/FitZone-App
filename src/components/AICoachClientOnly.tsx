"use client";

import dynamic from "next/dynamic";
import AICoachErrorBoundary from "@/components/AICoachErrorBoundary";

// The coach owns browser session state and responsive window listeners. Keeping
// this isolated widget out of SSR guarantees its first browser render has no
// competing server markup to hydrate.
const LiveChatWidget = dynamic(() => import("@/components/LiveChatWidget"), {
  ssr: false,
  loading: () => null,
});

export default function AICoachClientOnly() {
  return (
    <AICoachErrorBoundary>
      <LiveChatWidget />
    </AICoachErrorBoundary>
  );
}
