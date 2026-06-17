// StudyFlow service worker.
//
// Two caches with distinct jobs:
//   • CACHE       — the app shell + static assets (network-first, cache fallback).
//   • DATA_CACHE  — the last-seen *content* of pages you've visited (full-document
//                   navigations and Next.js RSC payloads). This is what lets
//                   /today, /courses and a course detail page render their most
//                   recent content while offline, instead of the bare offline page.
//
// Strategy for page content: network-first when online (so you always get fresh
// data, no stale-cache surprises), falling back to the last-synced copy from
// DATA_CACHE when the network is unreachable. The UI shows an "offline — showing
// last synced" banner in that state (see components/OfflineIndicator).
const CACHE = "studyflow-v2";
const DATA_CACHE = "studyflow-data-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// A page-content request is either a full-document navigation or a Next.js RSC
// fetch (client-side navigation / prefetch). Both are the "data" we keep offline.
function isNavigation(req) {
  return req.mode === "navigate";
}
function isRSC(req) {
  return req.headers.get("RSC") === "1";
}

// Stable cache key for page content. RSC fetches append a per-build `?_rsc=hash`
// that changes constantly, so we strip it (else an offline navigation's fresh
// hash would never match what we stored). We also tag RSC entries with `__rsc=1`
// so an RSC payload and the full HTML document for the same path don't collide.
function contentCacheKey(req) {
  const url = new URL(req.url);
  url.hash = "";
  if (isRSC(req)) {
    url.searchParams.delete("_rsc");
    url.searchParams.set("__rsc", "1");
  }
  return url.toString();
}

// Cap on how many page-content entries we keep offline. DATA_CACHE would
// otherwise grow once per distinct route visited (and per RSC variant), so we
// evict the oldest entries (cache keys are returned in insertion order) once we
// exceed the cap.
const DATA_CACHE_MAX = 50;

// Trim DATA_CACHE down to DATA_CACHE_MAX entries, deleting the oldest first.
async function trimDataCache() {
  try {
    const c = await caches.open(DATA_CACHE);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - DATA_CACHE_MAX; i++) {
      await c.delete(keys[i]);
    }
  } catch {}
}

// Network-first for page content, falling back to the last-synced copy offline.
async function networkFirstContent(req) {
  const key = contentCacheKey(req);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const copy = res.clone();
      caches
        .open(DATA_CACHE)
        .then((c) => c.put(key, copy))
        .then(() => trimDataCache())
        .catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(key);
    if (cached) return cached;
    // Nothing cached for this route yet — show the offline shell for full
    // navigations; RSC fetches just get a 504 so the client keeps the prior view.
    if (isNavigation(req)) {
      const offline = await caches.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("", { status: 504, statusText: "offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Page content (navigations + RSC) → dedicated last-synced data cache.
  if (isNavigation(req) || isRSC(req)) {
    event.respondWith(networkFirstContent(req));
    return;
  }

  // Everything else (static assets, etc.): network-first, stashing a copy of
  // successful same-origin responses for offline use.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          return new Response("", { status: 504, statusText: "offline" });
        })
      )
  );
});

// --- Web push (study reminders) ---
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "StudyFlow";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url || "/today" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
