/**
 * Route-level integration test: the push API endpoints enforce the shared rate
 * limit and return the standard 429 (RATE_LIMITED) shape on breach, while a fresh
 * budget still serves the normal success/validation path.
 *
 * Imports the real route handlers (they're just `(Request) => Response` functions)
 * and the real policy, so this exercises the actual wiring — not a re-implementation.
 *
 * Runs against an isolated throwaway test DB (see ./testDb) so it never touches
 * dev/prod data; getCurrentUserId upserts the dev user into that fresh DB.
 * Run: npx tsx src/lib/pushRoutes.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { POST as subscribePOST } from "../app/api/push/subscribe/route";
import { POST as unsubscribePOST } from "../app/api/push/unsubscribe/route";
import { getCurrentUserId } from "./devUser";
import { RATE_LIMITS, checkRateLimit } from "./rateLimitPolicy";

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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
