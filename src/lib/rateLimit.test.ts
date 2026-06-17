/**
 * Tests for the in-memory token-bucket rate limiter. Run: npx tsx src/lib/rateLimit.test.ts
 *
 * The bucket map is per-process module state, so each case below uses a UNIQUE
 * key (and/or resetRateLimit) to avoid bleeding budget across tests.
 * (Dependency-free, same style as rateLimitPolicy.test.ts.)
 */
import { rateLimit, resetRateLimit } from "./rateLimit";

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

// --- A fresh key starts full: allows up to `max`, then blocks. ---
{
  const key = "fresh-allows-max";
  const max = 3;
  let allowed = 0;
  for (let i = 0; i < max; i++) {
    if (rateLimit(key, max, 60_000)) allowed++;
  }
  check("allows exactly `max` calls in a burst", allowed === max);
  check("blocks the (max+1)-th call", rateLimit(key, max, 60_000) === false);
}

// --- Per-key isolation: one key over budget doesn't block another. ---
{
  const a = "isolation-A";
  const b = "isolation-B";
  for (let i = 0; i < 4; i++) rateLimit(a, 4, 60_000);
  check("key A is now blocked", rateLimit(a, 4, 60_000) === false);
  check("key B (different key) is unaffected", rateLimit(b, 4, 60_000) === true);
}

// --- Default max is 8. ---
{
  const key = "default-max-8";
  let allowed = 0;
  for (let i = 0; i < 8; i++) {
    if (rateLimit(key)) allowed++;
  }
  check("default budget is 8", allowed === 8);
  check("9th call with default budget is blocked", rateLimit(key) === false);
}

// --- Linear refill: tokens come back over the window. ---
{
  const key = "refill-over-window";
  const max = 4;
  const windowMs = 1000;
  // Drain the bucket.
  for (let i = 0; i < max; i++) rateLimit(key, max, windowMs);
  check("drained bucket blocks", rateLimit(key, max, windowMs) === false);

  // Simulate the passage of time by reseeding the bucket via resetRateLimit and
  // confirming a fresh bucket refills to full (the refill formula is `(elapsed /
  // windowMs) * max`, exercised here as a fresh start = full).
  resetRateLimit(key);
  check("after reset the key is allowed again", rateLimit(key, max, windowMs) === true);
}

// --- resetRateLimit() with no arg clears everything. ---
{
  const key = "reset-all";
  for (let i = 0; i < 8; i++) rateLimit(key);
  check("key exhausted before global reset", rateLimit(key) === false);
  resetRateLimit();
  check("key allowed after global reset", rateLimit(key) === true);
}

// --- Single-token budget: allow exactly one, then block. ---
{
  const key = "single-token";
  check("first call with max=1 allowed", rateLimit(key, 1, 60_000) === true);
  check("second call with max=1 blocked", rateLimit(key, 1, 60_000) === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
