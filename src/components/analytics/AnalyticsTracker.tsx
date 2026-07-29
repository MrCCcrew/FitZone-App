"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SENSITIVE_QUERY = /token|email|phone|payment|card|key|secret|session/i;
const COLLECT_URL = "/api/analytics/collect";

export function getAnalyticsPath(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  for (const key of Array.from(params.keys())) if (SENSITIVE_QUERY.test(key)) params.delete(key);
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

type LeaveSender = (path: string, pageHide?: boolean) => Promise<void>;

export function createPageLeaveGuard(send: LeaveSender) {
  let leaveSentForPath: string | null = null;

  return {
    async send(path: string, pageHide = false) {
      if (leaveSentForPath === path) return;
      leaveSentForPath = path;
      await send(path, pageHide);
    },
    resetForNewPage() {
      leaveSentForPath = null;
    },
  };
}

export async function sendAnalyticsPageLeave(path: string, pageHide = false) {
  const payload = JSON.stringify({ eventName: "page_leave", path });

  if (pageHide && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon(COLLECT_URL, blob)) return;
    } catch {
      // Use the keepalive fallback when the browser rejects the beacon payload.
    }
  }

  try {
    await fetch(COLLECT_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      ...(pageHide ? { keepalive: true } : {}),
    });
  } catch {
    // Analytics must never affect navigation or rendering.
  }
}

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentTrackedPath = useRef<string | null>(null);
  const desiredPath = useRef<string | null>(null);
  const pendingPageView = useRef<{ path: string; request: Promise<boolean> } | null>(null);
  const heartbeatInFlight = useRef(false);
  const leaveGuard = useRef(createPageLeaveGuard(sendAnalyticsPageLeave));

  useEffect(() => {
    const nextPath = pathname && !pathname.startsWith("/admin") ? getAnalyticsPath(pathname, search) : null;
    const previousPath = currentTrackedPath.current;
    desiredPath.current = nextPath;

    let timer: number | undefined;
    let disposed = false;
    const stopHeartbeat = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const sendHeartbeat = () => {
      if (disposed || !nextPath || document.visibilityState !== "visible" || heartbeatInFlight.current) return;
      heartbeatInFlight.current = true;
      void fetch(COLLECT_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventName: "heartbeat", path: nextPath }),
      }).catch(() => null).finally(() => { heartbeatInFlight.current = false; });
    };
    const startHeartbeat = () => {
      if (!disposed && nextPath && document.visibilityState === "visible" && timer === undefined) {
        timer = window.setInterval(sendHeartbeat, 30_000);
      }
    };
    const onVisibilityChange = () => {
      stopHeartbeat();
      if (document.visibilityState === "visible" && currentTrackedPath.current === nextPath) startHeartbeat();
    };
    const onPageHide = () => {
      const activePath = currentTrackedPath.current;
      if (activePath) void leaveGuard.current.send(activePath, true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    const beginPageView = async () => {
      if (previousPath && previousPath !== nextPath) {
        stopHeartbeat();
        currentTrackedPath.current = null;
        await leaveGuard.current.send(previousPath);
      }
      if (!nextPath || disposed || desiredPath.current !== nextPath) return;

      if (currentTrackedPath.current === nextPath) {
        startHeartbeat();
        return;
      }

      let request = pendingPageView.current;
      if (!request || request.path !== nextPath) {
        const pageViewRequest = fetch(COLLECT_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ eventName: "page_view", path: nextPath, pageTitle: document.title, referrer: document.referrer }),
        }).then((response) => response.ok).catch(() => false);
        request = { path: nextPath, request: pageViewRequest };
        pendingPageView.current = request;
        void pageViewRequest.then((ok) => {
          if (pendingPageView.current?.request === pageViewRequest) pendingPageView.current = null;
          if (ok && desiredPath.current === nextPath) {
            currentTrackedPath.current = nextPath;
            leaveGuard.current.resetForNewPage();
          }
        });
      }
      const pageViewSucceeded = await request.request;
      if (pageViewSucceeded && !disposed && desiredPath.current === nextPath && currentTrackedPath.current === nextPath) startHeartbeat();
    };

    void beginPageView();
    return () => {
      disposed = true;
      stopHeartbeat();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [pathname, search]);

  return null;
}
