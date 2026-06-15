"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "framer-motion";
import { haptics } from "./haptics";
import { useT } from "./i18n/I18nProvider";
import { isOverlayOpen } from "./lib/overlayOpen";

/**
 * Pull-to-refresh for a scrollable page. When the page is scrolled to the very
 * top and the user drags down past the threshold, it calls
 * `router.refresh()` (re-runs the server component / re-fetches data) and shows
 * a brief spinner. Touch-only and fully additive: on desktop / non-touch it
 * renders just its children, and it never blocks normal vertical scrolling
 * (it only engages while already at scrollTop 0 and pulling *down*).
 *
 * `prefers-reduced-motion` keeps the behaviour but skips the rubber-band easing.
 */

const THRESHOLD = 72; // px pull needed to trigger a refresh
const MAX = 96; // px the indicator can travel
const SPINNER_MS = 650; // minimum spinner dwell so the refresh reads as deliberate

export default function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const t = useT();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startY = useRef<number | null>(null);
  const active = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    // Coarse-pointer (touch) only — a mouse user has no use for pull-to-refresh
    // and we don't want to fight trackpad overscroll.
    if (typeof window === "undefined") return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse) return;

    function resetGesture() {
      startY.current = null;
      active.current = false;
      pullRef.current = 0;
      setPull(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      // A sheet/dialog is open — leave its own scrolling alone and never refresh
      // the page behind it.
      if (isOverlayOpen()) return;
      if (window.scrollY > 0) return; // only from the very top
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      active.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null || refreshingRef.current) return;
      // If a dialog opened mid-gesture (or one was already open), bail out and
      // drop any pull state so we never preventDefault() a sheet's own scroll.
      if (isOverlayOpen()) {
        resetGesture();
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        // Pulling up / scrolling — not our gesture.
        if (!active.current) startY.current = null;
        return;
      }
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      if (!active.current) {
        if (dy < 8) return; // small slop before engaging
        active.current = true;
      }
      // Engaged: take over so the browser doesn't also overscroll.
      if (e.cancelable) e.preventDefault();
      const eased = reduce ? Math.min(dy, MAX) : Math.min(dy * 0.5, MAX);
      pullRef.current = eased;
      setPull(eased);
    }

    function onTouchEnd() {
      if (startY.current === null) return;
      const shouldRefresh = active.current && pullRef.current >= THRESHOLD;
      startY.current = null;
      active.current = false;
      if (shouldRefresh) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPull(0);
        pullRef.current = 0;
        haptics.commit();
        router.refresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, SPINNER_MS);
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [router, reduce]);

  const indicatorShown = pull > 0 || refreshing;
  const progress = Math.min(pull / THRESHOLD, 1);

  return (
    <>
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center"
        style={{
          transform: `translateY(${refreshing ? MAX * 0.6 : pull}px)`,
          opacity: indicatorShown ? 1 : 0,
          transition:
            pull > 0 && !refreshing
              ? "none" // following the finger
              : "transform 200ms ease-out, opacity 200ms ease-out", // snap back / spin
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <span
          className="mt-2 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-brand-ink shadow-md dark:border-gray-800 dark:bg-gray-900"
          role={refreshing ? "status" : undefined}
        >
          {refreshing ? (
            <span className="sr-only">{t("common.refreshing")}</span>
          ) : null}
          <svg
            viewBox="0 0 24 24"
            className={`h-5 w-5 ${refreshing ? "motion-safe:animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {refreshing ? (
              <path d="M21 12a9 9 0 1 1-6.2-8.5" />
            ) : (
              <>
                <path d="M12 5v14" />
                <path d="m5 12 7 7 7-7" />
              </>
            )}
          </svg>
        </span>
      </div>
      {children}
    </>
  );
}
