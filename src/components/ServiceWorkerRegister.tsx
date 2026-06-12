"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker — production only.
 *
 * In `next dev` a registered SW intercepts navigations and the RSC/HMR payloads,
 * which fights Fast Refresh and can wedge the page into a constant reload loop —
 * and it breaks visual editors like Onlook that drive the dev server. So in dev
 * we instead actively unregister any SW left over from a prior production visit
 * and drop its caches, then no-op.
 *
 * Browsers only allow registration on a secure context (https or localhost), so
 * over a plain http LAN IP it's a no-op regardless; full offline support kicks
 * in once the app is deployed over https.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Tear down any SW + caches from a previous prod build so dev (and Onlook)
      // get a clean, loop-free page.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
