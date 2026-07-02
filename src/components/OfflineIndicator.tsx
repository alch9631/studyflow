"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "./i18n/I18nProvider";
import { pendingCount, subscribe } from "./lib/actionQueue";

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
  const t = useT();
  const [offline, setOffline] = useState(false);
  // Read the queue size straight from the store (server snapshot 0 keeps SSR
  // and the hydration render empty). Unlike a subscribe-in-effect, the mount
  // snapshot already includes toggles restored from storage before this
  // component subscribed (a reload while offline) — `subscribe` alone only
  // reports later changes, which left restored work invisible.
  const queued = useSyncExternalStore(subscribe, pendingCount, () => 0);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  // Show while offline, or briefly after reconnect until queued flips replay.
  if (!offline && queued === 0) return null;

  const queuedNote =
    queued > 0
      ? t.n(
          offline
            ? "offlineSync.bannerQueuedOffline"
            : "offlineSync.bannerQueuedSyncing",
          queued,
        )
      : t("offlineSync.bannerLastSynced");

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-gray-200 bg-gray-100 text-gray-700 motion-safe:animate-[toast-in_180ms_ease-out] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
    >
      <p className="mx-auto flex max-w-3xl items-center justify-center gap-2 px-4 py-2 text-sm font-medium">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {offline ? t("offlineSync.bannerOffline", { note: queuedNote }) : queuedNote}
        </span>
      </p>
    </div>
  );
}
