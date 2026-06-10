"use client";

import { useEffect, useState } from "react";
import { subscribe } from "./lib/actionQueue";

/**
 * Slim banner shown while the browser is offline. Paired with the service
 * worker's data cache (public/sw.js): when offline, visited pages render their
 * last-synced content, and this strip tells the user that's what they're seeing.
 *
 * It also reports how many changes are waiting in the offline action queue
 * (src/components/lib/actionQueue) so a queued toggle is never invisible — the
 * count survives a moment past reconnect, while the queued flips replay.
 *
 * Renders nothing on the server and on the first client paint (matching SSR, so
 * no hydration mismatch); the real online/offline state is read on mount.
 */
export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const unsubscribe = subscribe(setQueued);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      unsubscribe();
    };
  }, []);

  // Show while offline, or briefly after reconnect until queued flips replay.
  if (!offline && queued === 0) return null;

  const queuedNote =
    queued > 0
      ? `${queued} change${queued === 1 ? "" : "s"} queued — ${
          offline ? "will sync when you reconnect" : "syncing…"
        }`
      : "showing last synced content";

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-300 bg-amber-50 text-amber-800 motion-safe:animate-[toast-in_180ms_ease-out] dark:border-amber-900 dark:bg-amber-950/70 dark:text-amber-200"
    >
      <p className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
        <WifiOffIcon />
        <span>{offline ? `Offline — ${queuedNote}` : queuedNote}</span>
      </p>
    </div>
  );
}

function WifiOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="2" y1="2" x2="22" y2="22" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
      <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
      <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
      <path d="M5 13a10 10 0 0 1 5.24-2.76" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  );
}
