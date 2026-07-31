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

// Authenticated API responses must NEVER reach a cache. They are per-user and
// often the rawest data we hold (`/api/export` is a full data dump; `/api/blocks`,
// `/api/stats`, `/api/push/status` are all session-scoped), the Cache API ignores
// `Cache-Control: no-store` and `Vary: Cookie`, and our cache keys carry no user
// discriminator — so a stored entry would be replayed to whoever uses this browser
// next. We let these requests pass straight through to the network instead.
function isApiRequest(req) {
  try {
    const url = new URL(req.url);
    return url.origin === self.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

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

  // Session-scoped API data: straight to the network, never cached (see above).
  // This also covers a full-page navigation to something like /api/export, which
  // would otherwise be stored as "page content" below.
  if (isApiRequest(req)) return;

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

// --- Session teardown -------------------------------------------------------
// DATA_CACHE holds fully rendered, signed-in pages (course names, exam dates,
// notes, the whole study plan) keyed only by URL. Those entries must not outlive
// the session that produced them: on a shared browser profile the next person to
// sign in would, the moment they lose connectivity, be served the PREVIOUS user's
// /today or /courses from cache. Nothing else evicts them — signing out clears the
// session cookie, not the Cache Storage — so the client asks us to purge when a
// session ends (see components/PurgeOfflineCache, mounted on the sign-in screen).
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "purge-caches") return;
  const done = caches
    .keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .catch(() => {});
  if (typeof event.waitUntil === "function") event.waitUntil(done);
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
      // Prefer a window already on the target route — just focus it.
      const samePath = (c) => {
        try {
          return new URL(c.url).pathname === url;
        } catch {
          return false;
        }
      };
      const onTarget = clients.find((c) => "focus" in c && samePath(c));
      if (onTarget) return onTarget.focus();
      // Otherwise focus an existing window AND navigate it to the reminder's target
      // (focusing alone would leave the user wherever they were, ignoring the URL).
      const open = clients.find((c) => "focus" in c);
      if (open) {
        const focused = open.focus();
        if ("navigate" in open) {
          return Promise.resolve(focused)
            .then(() => open.navigate(url))
            .catch(() => open);
        }
        return focused;
      }
      return self.clients.openWindow(url);
    })
  );
});
