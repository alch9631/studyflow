/**
 * Centralized rate-limit POLICY for every mutating entry point.
 *
 * This is the one place that decides "how many of action X per minute" so the
 * numbers are easy to find and tune. It does NOT implement a limiter — it reuses
 * the shared token bucket in `rateLimit.ts`. Categories group routes/actions by
 * cost so a pricey AI call and a cheap toggle don't share the same budget.
 *
 * Two surfaces, one policy:
 *  - API routes (`src/app/api/**`): call `enforceRateLimit(category, key)` and,
 *    on breach, return `rateLimitResponse()` — the standard 429 `{ error }` shape
 *    from apiError.ts (RATE_LIMITED).
 *  - Server actions: call `enforceRateLimit(category, key)`; on breach it throws
 *    `RateLimitError`, which actions catch + redirect with `?msg=rate-limited`
 *    (or let Next surface its message) exactly like the existing AI guards did.
 *
 * Keying: pass a STABLE per-user key (the resolved `userId`, or a course/owner id
 * for course-scoped AI work) so the limit is per-user, not global. The category
 * is prefixed automatically, so `userId` is enough — never reuse a raw id across
 * categories by hand.
 *
 * Dependency-light (rateLimit + apiError) so it's safe to import in any route or
 * action.
 */
import { rateLimit } from "./rateLimit";
import { rateLimited } from "./apiError";

/** Tunable per-category budgets. `max` tokens refill over `windowMs`. */
export interface RateLimitRule {
  /** Burst size / tokens available per window. */
  max: number;
  /** Refill window in milliseconds. */
  windowMs: number;
}

/**
 * Cost-based categories. Generous enough that a real student never trips them,
 * tight enough that a runaway script (or a stuck retry loop) can't hammer the
 * costly paths.
 */
export const RATE_LIMITS = {
  /** Anthropic-backed work (syllabus extract, optimize, progress, analyze). Pricey. */
  AI: { max: 8, windowMs: 60_000 },
  /** Create/import a course — heavier writes + (often) an AI follow-up. */
  COURSE_WRITE: { max: 20, windowMs: 60_000 },
  /** Everyday mutations: toggles, edits, assignments, lectures, grade, heal. */
  MUTATION: { max: 60, windowMs: 60_000 },
  /** Push subscribe/unsubscribe from the API. */
  PUSH: { max: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitCategory = keyof typeof RATE_LIMITS;

/**
 * Thrown by `enforceRateLimit` when a server action is over its budget. Server
 * actions catch this to redirect with `?msg=rate-limited`; if left to surface,
 * its message is user-readable. (API routes use `rateLimitResponse()` instead.)
 */
export class RateLimitError extends Error {
  readonly category: RateLimitCategory;
  constructor(category: RateLimitCategory, message?: string) {
    super(message ?? "Too many requests. Give it a minute and try again.");
    this.name = "RateLimitError";
    this.category = category;
  }
}

/**
 * Pure predicate: is this action within budget for `key` in `category`?
 * Returns true if allowed, false if over the limit. Reuses the shared bucket.
 * Prefer `enforceRateLimit` at call sites; use this when you need a boolean.
 */
export function checkRateLimit(category: RateLimitCategory, key: string): boolean {
  const rule = RATE_LIMITS[category];
  return rateLimit(`${category}:${key}`, rule.max, rule.windowMs);
}

/**
 * Enforce the limit for `category`/`key`. No-op when within budget; throws
 * `RateLimitError` when over it. The single guard both API routes and server
 * actions call before doing work.
 */
export function enforceRateLimit(category: RateLimitCategory, key: string): void {
  if (!checkRateLimit(category, key)) {
    throw new RateLimitError(category);
  }
}

/**
 * Standard 429 response for API routes — the shared `{ error: { code, message } }`
 * shape with code RATE_LIMITED. Use in a route's catch (or after a `checkRateLimit`
 * false) so every limited endpoint returns an identical, non-leaky body.
 */
export function rateLimitResponse(message?: string): Response {
  return rateLimited(message);
}
