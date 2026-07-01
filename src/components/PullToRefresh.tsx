"use client";
import { useEffect, useRef, useState } from "react";

// ─── Pull-to-Refresh for PWA / mobile ─────────────────────────────────────
// Triggers a full page reload when the user pulls down from the top of the page.
// Only activates at scrollY ≈ 0 and only for vertical pulls (ignores horizontal swipes).

const THRESHOLD_RAW = 72;   // raw px of downward drag that triggers the reload
const DAMPING       = 0.48; // visual resistance factor (smaller = harder to pull)
const MAX_VISUAL    = 80;   // max visual pull distance in px
const INDICATOR_TOP = 34;   // px: how far to translate so circle becomes visible at threshold

// Returns true when any full-screen modal overlay is currently open
const isModalOpen = (): boolean => {
  const els = document.querySelectorAll<HTMLElement>("[style]");
  for (const el of els) {
    const s = el.style;
    const zIdx = parseInt(s.zIndex || "0", 10);
    const isFullScreen = s.inset === "0px" || (s.top === "0px" && s.left === "0px" && s.right === "0px" && s.bottom === "0px");
    if (s.position === "fixed" && isFullScreen && zIdx > 100) return true;
  }
  return false;
};

export default function PullToRefresh() {
  const [pull, setPull]           = useState(0);   // visual pull distance (px)
  const [refreshing, setRefreshing] = useState(false);

  const pullRef      = useRef(0);
  const startY       = useRef(0);
  const startX       = useRef(0);
  const active       = useRef(false);
  const direction    = useRef<"v" | "h" | null>(null); // lock swipe direction

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 4) return;
      if (isModalOpen()) return;          // disable PTR when any overlay is open
      startY.current    = e.touches[0].clientY;
      startX.current    = e.touches[0].clientX;
      active.current    = true;
      direction.current = null;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (window.scrollY > 4 || isModalOpen()) { active.current = false; setPull(0); return; }

      const rawY = e.touches[0].clientY - startY.current;
      const rawX = e.touches[0].clientX - startX.current;

      // Lock direction once we have a clear intent
      if (!direction.current && (Math.abs(rawY) > 6 || Math.abs(rawX) > 6)) {
        direction.current = Math.abs(rawY) >= Math.abs(rawX) ? "v" : "h";
      }

      if (direction.current === "h") { active.current = false; return; }
      if (direction.current !== "v" || rawY <= 0) { setPull(0); pullRef.current = 0; return; }

      const visual = Math.min(MAX_VISUAL, rawY * DAMPING);
      pullRef.current = visual;
      setPull(visual);
      e.preventDefault(); // stop page scroll while we're handling PTR
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;

      if (pullRef.current >= THRESHOLD_RAW * DAMPING) {
        // Triggered → hold indicator then reload
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 650);
      } else {
        // Not enough — snap back
        pullRef.current = 0;
        setPull(0);
      }
    };

    document.addEventListener("touchstart",  onStart, { passive: true });
    document.addEventListener("touchmove",   onMove,  { passive: false });
    document.addEventListener("touchend",    onEnd);
    document.addEventListener("touchcancel", onEnd);

    return () => {
      document.removeEventListener("touchstart",  onStart);
      document.removeEventListener("touchmove",   onMove);
      document.removeEventListener("touchend",    onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // Hide completely when nothing is happening
  if (pull === 0 && !refreshing) return null;

  const progress  = Math.min(1, pull / (THRESHOLD_RAW * DAMPING));
  const triggered = progress >= 1 || refreshing;

  // translateY: starts negative (hidden), reaches 0 at threshold
  const translateY = pull - INDICATOR_TOP;

  return (
    <>
      <style>{`@keyframes ptr-spin { to { transform: rotate(360deg) } }`}</style>

      {/* Backdrop tint that fades in gently */}
      <div
        aria-hidden
        style={{
          position:       "fixed",
          inset:          0,
          zIndex:         99998,
          background:     "rgba(0,0,0,0.08)",
          opacity:        Math.min(1, progress * 0.85),
          pointerEvents:  "none",
          transition:     "opacity 0.1s",
        }}
      />

      {/* Indicator circle */}
      <div
        aria-hidden
        style={{
          position:       "fixed",
          top:            0,
          left:           0,
          right:          0,
          zIndex:         99999,
          display:        "flex",
          justifyContent: "center",
          paddingTop:     8,
          pointerEvents:  "none",
          transform:      `translateY(${translateY}px)`,
          transition:     refreshing ? "none" : "transform 0.06s linear",
        }}
      >
        <div
          style={{
            width:          40,
            height:         40,
            borderRadius:   "50%",
            background:     "linear-gradient(135deg,#e91e63,#c2185b)",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            boxShadow:      "0 4px 20px rgba(233,30,99,.5)",
            opacity:        Math.min(1, Math.max(0, progress * 2 - 0.4)),
            transform:      `scale(${0.45 + 0.55 * progress})`,
            transition:     "transform 0.12s, opacity 0.12s",
          }}
        >
          {triggered ? (
            /* Spinning loader */
            <div
              style={{
                width:        20,
                height:       20,
                border:       "2.5px solid rgba(255,255,255,0.28)",
                borderTop:    "2.5px solid #fff",
                borderRadius: "50%",
                animation:    "ptr-spin 0.65s linear infinite",
              }}
            />
          ) : (
            /* Arrow that rotates as the user pulls */
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              style={{
                transform:  `rotate(${Math.round(progress * 180)}deg)`,
                transition: "transform 0.1s",
              }}
            >
              <path
                d="M12 5v14M5 12l7 7 7-7"
                stroke="#fff"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </div>
    </>
  );
}
