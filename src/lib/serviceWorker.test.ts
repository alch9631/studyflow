/**
 * Service-worker cache-safety tests.
 *
 * public/sw.js is plain JS shipped as a static asset, so it never passes through
 * tsc or the bundler. It is also the one place in the app that stores rendered,
 * signed-in content on disk — under keys that carry no user discriminator. That
 * combination is worth a real functional check, so we execute the actual file in
 * a stubbed ServiceWorkerGlobalScope and drive its listeners.
 *
 * Covers:
 *   • authenticated /api/* responses are never intercepted (and so never cached)
 *   • ordinary page navigations still get the offline treatment
 *   • a "purge-caches" message empties every cache, so one student's offline
 *     pages can't be served to the next one who signs in on the same browser
 *
 * Run: npx tsx src/lib/serviceWorker.test.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const ORIGIN = "https://studyflow.example";

type Listener = (event: unknown) => unknown;

/** Load public/sw.js into a fake worker scope and hand back its hooks. */
function loadServiceWorker() {
  const listeners: Record<string, Listener[]> = {};
  /** name -> (key -> body). Mirrors Cache Storage closely enough to assert on. */
  const store = new Map<string, Map<string, string>>();

  const makeCache = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      put: async (key: unknown, res: { body?: string }) => {
        entries.set(String((key as { url?: string })?.url ?? key), res?.body ?? "");
      },
      keys: async () => [...entries.keys()],
      delete: async (key: unknown) => entries.delete(String(key)),
      match: async (key: unknown) => {
        const hit = entries.get(String(key));
        return hit === undefined ? undefined : { body: hit, ok: true };
      },
    };
  };

  const caches = {
    open: async (name: string) => makeCache(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (key: unknown) => {
      for (const entries of store.values()) {
        const hit = entries.get(String(key));
        if (hit !== undefined) return { body: hit, ok: true };
      }
      return undefined;
    },
  };

  /** Records every request the worker actually put on the network. */
  const networked: string[] = [];
  const fetchStub = async (req: { url: string }) => {
    networked.push(req.url);
    return {
      ok: true,
      status: 200,
      body: `body-of:${req.url}`,
      clone() {
        return { ok: true, status: 200, body: `body-of:${req.url}` };
      },
    };
  };

  const self = {
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
    location: { origin: ORIGIN },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: { showNotification: async () => {} },
  };

  const sandbox = {
    self,
    caches,
    fetch: fetchStub,
    URL,
    Response: class {
      status: number;
      body: string;
      constructor(body: string, init?: { status?: number }) {
        this.body = body;
        this.status = init?.status ?? 200;
      }
    },
    console,
  };

  const code = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
  runInContext(code, createContext(sandbox));

  return { listeners, store, networked };
}

/** Fire the worker's fetch listener; report whether it took over the response. */
async function dispatchFetch(
  sw: ReturnType<typeof loadServiceWorker>,
  req: { url: string; method?: string; mode?: string; headers?: Record<string, string> },
) {
  const request = {
    method: req.method ?? "GET",
    mode: req.mode ?? "no-cors",
    url: req.url,
    headers: { get: (h: string) => req.headers?.[h] ?? null },
  };
  let responded: unknown = undefined;
  let handled = false;
  const event = {
    request,
    respondWith: (r: unknown) => {
      handled = true;
      responded = r;
    },
  };
  for (const fn of sw.listeners.fetch ?? []) fn(event);
  if (handled) await responded; // let the caching side-effects settle
  // Give the fire-and-forget `caches.open(...).then(put)` chain a turn to run.
  await new Promise((r) => setTimeout(r, 0));
  return handled;
}

async function main() {
  console.log("\n=== service worker cache safety ===\n");

  // ── Authenticated API traffic is never cached ─────────────────────────────
  {
    const sw = loadServiceWorker();
    const apiHandled = await dispatchFetch(sw, { url: `${ORIGIN}/api/stats` });
    check("an /api GET is not intercepted by the worker", apiHandled === false);

    // The most sensitive case: a full-document navigation to the data export.
    const exportHandled = await dispatchFetch(sw, {
      url: `${ORIGIN}/api/export`,
      mode: "navigate",
    });
    check("a navigation to /api/export is not intercepted", exportHandled === false);

    const cached = [...sw.store.values()].flatMap((m) => [...m.keys()]);
    check(
      "no /api response reaches any cache",
      cached.every((k) => !k.includes("/api/")),
      `cached: ${JSON.stringify(cached)}`,
    );
  }

  // ── Ordinary page content still works offline ─────────────────────────────
  {
    const sw = loadServiceWorker();
    const handled = await dispatchFetch(sw, { url: `${ORIGIN}/today`, mode: "navigate" });
    check("a page navigation is still handled by the worker", handled === true);
    const cached = [...sw.store.values()].flatMap((m) => [...m.keys()]);
    check(
      "page content is still cached for offline use",
      cached.some((k) => k.includes("/today")),
      `cached: ${JSON.stringify(cached)}`,
    );

    // An RSC payload is cached under its own key, not the document's.
    await dispatchFetch(sw, { url: `${ORIGIN}/courses?_rsc=abc123`, headers: { RSC: "1" } });
    const keys = [...sw.store.values()].flatMap((m) => [...m.keys()]);
    check(
      "an RSC payload is cached under a distinct __rsc key",
      keys.some((k) => k.includes("/courses") && k.includes("__rsc=1")),
      `cached: ${JSON.stringify(keys)}`,
    );
    check(
      "the volatile _rsc build hash is stripped from the key",
      keys.every((k) => !k.includes("_rsc=abc123")),
    );
  }

  // ── Signing out empties every cache ───────────────────────────────────────
  {
    const sw = loadServiceWorker();
    await dispatchFetch(sw, { url: `${ORIGIN}/today`, mode: "navigate" });
    await dispatchFetch(sw, { url: `${ORIGIN}/courses`, mode: "navigate" });
    const before = [...sw.store.values()].reduce((n, m) => n + m.size, 0);
    check("cached pages exist before the purge", before > 0, `entries: ${before}`);

    const waits: unknown[] = [];
    for (const fn of sw.listeners.message ?? []) {
      fn({ data: { type: "purge-caches" }, waitUntil: (p: unknown) => waits.push(p) });
    }
    check("the purge message is handled (waitUntil called)", waits.length === 1);
    await Promise.all(waits);

    const after = [...sw.store.values()].reduce((n, m) => n + m.size, 0);
    check(
      "every cached page is gone after a purge",
      after === 0 && sw.store.size === 0,
      `caches=${sw.store.size} entries=${after}`,
    );
  }

  // ── An unrelated message must not wipe the caches ──────────────────────────
  {
    const sw = loadServiceWorker();
    await dispatchFetch(sw, { url: `${ORIGIN}/today`, mode: "navigate" });
    for (const fn of sw.listeners.message ?? []) {
      fn({ data: { type: "something-else" }, waitUntil: () => {} });
    }
    await new Promise((r) => setTimeout(r, 0));
    const after = [...sw.store.values()].reduce((n, m) => n + m.size, 0);
    check("an unrelated message leaves the cache intact", after > 0, `entries: ${after}`);
    // A message with no data at all must not throw either.
    let threw = false;
    try {
      for (const fn of sw.listeners.message ?? []) fn({ waitUntil: () => {} });
    } catch {
      threw = true;
    }
    check("a message with no data does not throw", threw === false);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
