/**
 * Route-level integration test: the push API endpoints enforce the shared rate
 * limit and return the standard 429 (RATE_LIMITED) shape on breach, while a fresh
 * budget still serves the normal success/validation path. Also covers the
 * key-rollover wiring: subscribe persists the VAPID key it bound to (the live key
 * when configured, "" when not), and the /api/push/check endpoint reports an
 * unconfigured-state subscription as needing a client re-sync once keys are set.
 *
 * Imports the real route handlers (they're just `(Request) => Response` functions)
 * and the real policy, so this exercises the actual wiring — not a re-implementation.
 *
 * Runs against an isolated throwaway test DB (see ./testDb) so it never touches
 * dev/prod data; getCurrentUserId upserts the dev user into that fresh DB.
 * Run: npx tsx src/lib/pushRoutes.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import { POST as subscribePOST } from "../app/api/push/subscribe/route";
import { POST as unsubscribePOST } from "../app/api/push/unsubscribe/route";
import { POST as checkPOST } from "../app/api/push/check/route";
import { getCurrentUserId } from "./devUser";
import { RATE_LIMITS, checkRateLimit } from "./rateLimitPolicy";

function enablePush() {
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
  process.env.VAPID_SUBJECT = "mailto:test@studyflow.local";
}
function disablePush() {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

/** Build a POST Request with a JSON body, like the browser push client sends. */
function jsonPost(body: unknown): Request {
  return new Request("http://localhost/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Drain the PUSH budget for the resolved user so the next call is over-limit. */
function drainPushBudget(userId: string) {
  for (let i = 0; i < RATE_LIMITS.PUSH.max; i++) checkRateLimit("PUSH", userId);
}

async function main() {
  const userId = await getCurrentUserId();

  // --- subscribe: fresh budget reaches validation (400 on missing fields), NOT 429.
  {
    const res = await subscribePOST(jsonPost({ endpoint: "https://example.com/p" }));
    check("subscribe with fresh budget is not rate-limited", res.status !== 429);
    check("subscribe with missing keys is a 400 (validation reached)", res.status === 400);
  }

  // --- subscribe: an oversized field is rejected by requireBodyString (400, not 429).
  {
    const res = await subscribePOST(
      jsonPost({ endpoint: "x".repeat(3000), keys: { p256dh: "k", auth: "a" } }),
    );
    check("subscribe with oversized endpoint is a 400 (requireBodyString)", res.status === 400);
  }

  // --- unsubscribe: missing endpoint hits validation (400) on a fresh budget.
  {
    const res = await unsubscribePOST(jsonPost({}));
    check("unsubscribe with missing endpoint is a 400 (validation reached)", res.status === 400);
  }

  // --- subscribe records the VAPID key the subscription was bound to, so a key
  //     rollover is detectable (created-configured vs created-unconfigured).
  {
    enablePush();
    const ep = "https://example.com/keyed";
    const res = await subscribePOST(
      jsonPost({ endpoint: ep, keys: { p256dh: "k", auth: "a" } }),
    );
    check("subscribe (configured) succeeds", res.status === 200);
    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint: ep },
      select: { vapidKey: true },
    });
    check("subscribe stores the live VAPID public key", row?.vapidKey === "test-public-key");
  }
  {
    disablePush();
    const ep = "https://example.com/unconfigured";
    const res = await subscribePOST(
      jsonPost({ endpoint: ep, keys: { p256dh: "k", auth: "a" } }),
    );
    check("subscribe (unconfigured) still succeeds (early registration)", res.status === 200);
    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint: ep },
      select: { vapidKey: true },
    });
    check('subscribe while unconfigured stores "" (flags a later rollover)', row?.vapidKey === "");
  }

  // --- subscribe honors a client-sent vapidKey (the key the browser ACTUALLY
  //     bound to, read off subscription.options.applicationServerKey) over the
  //     server's current key — env drift between the page build and the
  //     subscribe call must stay detectable, not get papered over.
  {
    enablePush();
    const ep = "https://example.com/client-bound";
    const res = await subscribePOST(
      jsonPost({ endpoint: ep, keys: { p256dh: "k", auth: "a" }, vapidKey: "older-baked-key" }),
    );
    check("subscribe (client-sent key) succeeds", res.status === 200);
    const row = await prisma.pushSubscription.findUnique({
      where: { endpoint: ep },
      select: { vapidKey: true },
    });
    check(
      "subscribe stores the client-sent key, not the server's",
      row?.vapidKey === "older-baked-key",
    );
  }

  // --- encoding differences are NOT a key rotation: the client re-encodes its
  //     bound key as unpadded base64url, so a padded/standard-base64 env key of
  //     the same bytes must compare equal — otherwise every healthy subscription
  //     would be flagged stale and loop the heal path forever.
  {
    process.env.VAPID_PUBLIC_KEY = "abc+def/ghi=";
    process.env.VAPID_PRIVATE_KEY = "test-private-key";
    const ep = "https://example.com/normalized";
    const res = await subscribePOST(
      jsonPost({ endpoint: ep, keys: { p256dh: "k", auth: "a" }, vapidKey: "abc-def_ghi" }),
    );
    check("subscribe (url-safe client key) succeeds", res.status === 200);
    const normRes = await checkPOST(jsonPost({ endpoint: ep }));
    const normBody = (await normRes.json()) as { needsResync?: boolean };
    check(
      "check treats base64 vs base64url of the same key as equal",
      normBody.needsResync === false,
    );
    enablePush(); // restore the standard test keys
  }

  // --- check: the re-validate endpoint flags an unconfigured-state subscription
  //     as needing a resync once keys are present, but not a current-key one.
  {
    enablePush();
    const staleRes = await checkPOST(jsonPost({ endpoint: "https://example.com/unconfigured" }));
    check("check returns 200 for a known endpoint", staleRes.status === 200);
    const staleBody = (await staleRes.json()) as { configured?: boolean; needsResync?: boolean };
    check("check reports configured:true when keys are set", staleBody.configured === true);
    check("check flags the unconfigured-state sub as needsResync", staleBody.needsResync === true);

    const freshRes = await checkPOST(jsonPost({ endpoint: "https://example.com/keyed" }));
    const freshBody = (await freshRes.json()) as { needsResync?: boolean };
    check("check does NOT flag a current-key sub", freshBody.needsResync === false);

    const clientRes = await checkPOST(jsonPost({ endpoint: "https://example.com/client-bound" }));
    const clientBody = (await clientRes.json()) as { needsResync?: boolean };
    check("check flags a client-bound outdated key as needsResync", clientBody.needsResync === true);

    const unknownRes = await checkPOST(jsonPost({ endpoint: "https://example.com/never-stored" }));
    const unknownBody = (await unknownRes.json()) as { needsResync?: boolean };
    check("check reports an unknown endpoint as not needing resync", unknownBody.needsResync === false);
  }

  // --- check: missing endpoint is a clean 400 (validation reached, not 429).
  {
    const res = await checkPOST(jsonPost({}));
    check("check with missing endpoint is a 400 (validation reached)", res.status === 400);
  }

  // --- subscribe: once the per-user PUSH budget is exhausted -> 429 RATE_LIMITED.
  {
    drainPushBudget(userId);
    const res = await subscribePOST(
      jsonPost({ endpoint: "https://example.com/p", keys: { p256dh: "k", auth: "a" } }),
    );
    check("subscribe returns 429 when over the PUSH budget", res.status === 429);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    check("subscribe 429 uses the RATE_LIMITED code", body.error?.code === "RATE_LIMITED");
    check("subscribe 429 carries a message", (body.error?.message?.length ?? 0) > 0);
  }

  // --- unsubscribe: shares the same per-user PUSH budget -> also 429 once drained.
  {
    // Budget already drained above (same userId + category); confirm enforcement.
    const res = await unsubscribePOST(jsonPost({ endpoint: "https://example.com/p" }));
    check("unsubscribe returns 429 when over the PUSH budget", res.status === 429);
    const body = (await res.json()) as { error?: { code?: string } };
    check("unsubscribe 429 uses the RATE_LIMITED code", body.error?.code === "RATE_LIMITED");
  }

  // --- check: shares the same per-user PUSH budget -> also 429 once drained.
  {
    const res = await checkPOST(jsonPost({ endpoint: "https://example.com/keyed" }));
    check("check returns 429 when over the PUSH budget", res.status === 429);
    const body = (await res.json()) as { error?: { code?: string } };
    check("check 429 uses the RATE_LIMITED code", body.error?.code === "RATE_LIMITED");
  }

  disablePush();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
