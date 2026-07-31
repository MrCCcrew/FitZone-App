"use client";

import { useEffect, useRef } from "react";

const enabled = process.env.NODE_ENV === "production" && process.env.HYDRATION_AUTH_DEBUG === "true";

export type HydrationServerSnapshot = {
  hasSession: boolean;
  role: string | null;
  lang: string;
  dir: string;
  currentPage: string;
  heroSlideIds: string[];
  offerIds: string[];
  membershipIds: string[];
  conditionalComponents: string[];
};

function readFirstClientSnapshot(snapshot: HydrationServerSnapshot): HydrationServerSnapshot {
  return { ...snapshot, lang: document.documentElement.lang, dir: document.documentElement.dir };
}

function differences(server: HydrationServerSnapshot, client: HydrationServerSnapshot) {
  const fields: Array<keyof HydrationServerSnapshot> = ["lang", "dir", "currentPage", "heroSlideIds", "offerIds", "membershipIds", "conditionalComponents"];
  return fields.filter((field) => JSON.stringify(server[field]) !== JSON.stringify(client[field]));
}

export default function HydrationAuthDebugProbe({ snapshot }: { snapshot: HydrationServerSnapshot }) {
  const firstClientSnapshot = useRef<HydrationServerSnapshot | null>(null);
  if (enabled && firstClientSnapshot.current == null && typeof document !== "undefined") {
    // Captured during the first client render, before effects change language or page data.
    firstClientSnapshot.current = readFirstClientSnapshot(snapshot);
  }

  useEffect(() => {
    if (!enabled || !firstClientSnapshot.current) return;
    console.debug("[Hydration auth debug]", {
      component: "HydrationAuthDebugProbe",
      phase: "first-client",
      serverSnapshot: snapshot,
      firstClientSnapshot: firstClientSnapshot.current,
      differences: differences(snapshot, firstClientSnapshot.current),
    });
  }, [snapshot]);

  if (!enabled) return null;
  return <script id="fitzone-hydration-server-snapshot" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(snapshot).replace(/</g, "\\u003c") }} />;
}
