// Minimal in-memory token-bucket rate limiter. Per-process — fine for a single
// instance (dev / one server); swap for a shared store (e.g. Redis/Upstash) once
// the app runs on multiple instances. Protects the costly AI/upload actions.

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();

/**
 * Returns true if the action is allowed, false if the key is over its limit.
 * `max` tokens refill linearly over `windowMs`.
 */
export function rateLimit(key: string, max = 8, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: max, updated: now };
  b.tokens = Math.min(max, b.tokens + ((now - b.updated) / windowMs) * max);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/**
 * Drop all buckets (or just one key). Test-only: the buckets are per-process
 * module state, so tests use this to start from a known-empty slate. Not used by
 * application code.
 */
export function resetRateLimit(key?: string): void {
  if (key === undefined) buckets.clear();
  else buckets.delete(key);
}
