"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
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
      ? `${queued} change${queued === 1 ? "" : "s"} queued, ${
          offline ? "will sync when you reconnect" : "syncing…"
        }`
      : "showing last synced content";

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-gray-200 bg-gray-100 text-gray-700 motion-safe:animate-[toast-in_180ms_ease-out] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
    >
      <p className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{offline ? `Offline: ${queuedNote}` : queuedNote}</span>
      </p>
    </div>
  );
}
