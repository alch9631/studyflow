"use client";

import { useEffect } from "react";

/**
 * Drops every offline cache the service worker has built up.
 *
 * The SW keeps a "last synced" copy of the pages you've visited so /today and
 * /courses still render offline. Those entries are fully rendered, signed-in
 * pages keyed only by URL — there is no user in the key, and the Cache API
 * ignores `Cache-Control: no-store`. Signing out clears the session cookie but
 * leaves the caches untouched, so on a shared browser (family iPad, lab laptop)
 * the next student to sign in would be served the previous one's study plan the
 * moment they went offline.
 *
 * Mounting this on the sign-in screen closes that window: /login is the choke
 * point every session teardown passes through — an explicit sign-out redirects
 * here, and an expired session bounces here on the next request — so the caches
 * are emptied before a different account can be established.
 */
export default function PurgeOfflineCache() {
  useEffect(() => {
    // Purge directly: this works even when no service worker controls the page
    // yet (first load after install, or a hard refresh).
    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
    // Also tell the active worker, so a response still in flight when we purged
    // can't repopulate the cache behind us.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({ type: "purge-caches" });
    }
  }, []);

  return null;
}
