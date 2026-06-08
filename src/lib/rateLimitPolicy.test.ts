/**
 * Tests for the centralized rate-limit policy. Run: npx tsx src/lib/rateLimitPolicy.test.ts
 *
 * The underlying bucket (rateLimit.ts) is per-process module state, so each case
 * below uses a UNIQUE key to avoid bleeding budget across tests.
 */
import {
  RATE_LIMITS,
  RateLimitError,
  checkRateLimit,
  enforceRateLimit,
  rateLimitResponse,
  type RateLimitCategory,
} from "./rateLimitPolicy";

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
/** True if `fn` throws a RateLimitError. */
function throwsRateLimit(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof RateLimitError;
  }
}

async function main() {
  // --- Policy shape: every category has a sane positive budget + window. ---
  const categories = Object.keys(RATE_LIMITS) as RateLimitCategory[];
  check("at least the four known categories exist", categories.length >= 4);
  check(
    "every rule has positive max + window",
    categories.every(
      (c) =>
        Number.isInteger(RATE_LIMITS[c].max) &&
        RATE_LIMITS[c].max > 0 &&
        RATE_LIMITS[c].windowMs > 0,
    ),
  );
  check("AI is the tightest budget (costliest path)", RATE_LIMITS.AI.max <= RATE_LIMITS.MUTATION.max);
  check("MUTATION has the most generous budget", RATE_LIMITS.MUTATION.max >= RATE_LIMITS.PUSH.max);

  // --- checkRateLimit: allows up to `max`, blocks the next call (same key). ---
  {
    const key = "test-success-allows";
    const max = RATE_LIMITS.AI.max;
    let allowed = 0;
    for (let i = 0; i < max; i++) {
      if (checkRateLimit("AI", key)) allowed++;
    }
    check("allows exactly `max` calls in a burst", allowed === max);
    check("blocks the (max+1)-th call", checkRateLimit("AI", key) === false);
  }

  // --- Per-key isolation: one user over budget doesn't block another. ---
  {
    const a = "user-A-isolation";
    const b = "user-B-isolation";
    for (let i = 0; i < RATE_LIMITS.MUTATION.max; i++) checkRateLimit("MUTATION", a);
    check("user A is now blocked", checkRateLimit("MUTATION", a) === false);
    check("user B (different key) is unaffected", checkRateLimit("MUTATION", b) === true);
  }

  // --- Per-category isolation: same id in two categories has separate budgets. ---
  {
    const id = "same-id-two-categories";
    for (let i = 0; i < RATE_LIMITS.PUSH.max; i++) checkRateLimit("PUSH", id);
    check("PUSH budget for id is exhausted", checkRateLimit("PUSH", id) === false);
    check("AI budget for the SAME id is still fresh", checkRateLimit("AI", id) === true);
  }

  // --- enforceRateLimit: no-op under budget, throws RateLimitError over it. ---
  {
    const key = "enforce-throws";
    check("enforce does not throw on first call", !throwsRateLimit(() => enforceRateLimit("AI", key)));
    // Drain the remaining budget.
    for (let i = 0; i < RATE_LIMITS.AI.max; i++) checkRateLimit("AI", key);
    check("enforce throws RateLimitError once over budget", throwsRateLimit(() => enforceRateLimit("AI", key)));
  }

  // --- RateLimitError carries category + a user-readable default message. ---
  {
    let err: unknown;
    try {
      const key = "error-shape";
      for (let i = 0; i < RATE_LIMITS.AI.max; i++) checkRateLimit("AI", key);
      enforceRateLimit("AI", key);
    } catch (e) {
      err = e;
    }
    check("error is a RateLimitError", err instanceof RateLimitError);
    check("error records its category", err instanceof RateLimitError && err.category === "AI");
    check("error has a non-empty message", err instanceof Error && err.message.length > 0);
  }

  // --- rateLimitResponse: the standard 429 RATE_LIMITED shape for API routes. ---
  {
    const res = rateLimitResponse();
    check("rateLimitResponse status is 429", res.status === 429);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    check("rateLimitResponse code is RATE_LIMITED", body.error?.code === "RATE_LIMITED");
    check("rateLimitResponse has a message", (body.error?.message?.length ?? 0) > 0);
  }
  {
    const res = rateLimitResponse("Slow down on push registrations.");
    const body = (await res.json()) as { error?: { message?: string } };
    check("rateLimitResponse accepts a custom message", body.error?.message === "Slow down on push registrations.");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
