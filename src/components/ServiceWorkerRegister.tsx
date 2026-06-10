"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker. Note: browsers only allow this on a
 * secure context (https or localhost) — so over a plain http LAN IP it's a
 * no-op, and full offline support activates once the app is deployed (https).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
