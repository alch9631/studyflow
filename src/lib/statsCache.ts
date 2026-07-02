// Service-layer cache for the analytics bundle (`gatherStats`).
//
// WHY: `gatherStats` is the single genuinely expensive read in the app — it
// fetches a user's *entire* StudyBlock history plus every Course/Topic, then runs
// several O(n) passes (`computeStats`) to derive streaks, weekly/ due rollups,
// per-course pressure, grades and the "needs attention" list. The Insights page
// and the /api/stats route both trigger it, and a user typically reads these
// repeatedly between mutations. Recomputing from scratch on every read is waste.
//
// CORRECTNESS over cleverness — the three things a stats cache must never do:
//   1. Serve STALE data after a mutation. Handled by invalidation: any write to a
//      stats-relevant model (Course / Topic / StudyBlock) clears the cache (wired
//      in db.ts via a Prisma client extension, see `invalidateAllStats`). The
//      schema has no `updatedAt` on these tables, so a count/timestamp fingerprint
//      would miss the most common edits (toggling `completed`/`done`, logging
//      focus, entering a grade) — write-driven invalidation is the robust choice.
//   2. Leak ONE user's data to ANOTHER. The cache is keyed by `userId` (+ the
//      `todayISO` the result was computed for, since several metrics are
//      relative to "today"), so a lookup can only ever return the value computed
//      for that exact user+day. A test asserts no cross-user bleed.
//   3. Grow UNBOUNDED. Entries are bounded (LRU eviction past `max`) and expire
//      after a short TTL backstop, so even a missed invalidation self-heals fast.

import { gatherStats, type Stats } from "./stats";

/** Loads the analytics bundle for a user as-of `todayISO`. Defaults to the DB-backed `gatherStats`; injectable for tests. */
export type StatsLoader = (userId: string, todayISO: string) => Promise<Stats>;

export type StatsCacheOptions = {
  /** Freshness backstop in ms. A write invalidates immediately; this only bounds the blast radius of a *missed* invalidation. */
  ttlMs?: number;
  /** Max distinct (user, day) entries kept before LRU eviction. */
  max?: number;
  /** Override the loader (tests). */
  load?: StatsLoader;
  /** Override the clock (tests). */
  now?: () => number;
};

const DEFAULT_TTL_MS = 30_000; // 30s — short by design; invalidation does the real work.
const DEFAULT_MAX = 256;

// `userId` is carried on the entry so a per-user invalidation can drop exactly
// that user's days without re-parsing the composite key.
type Entry = { value: Stats; expires: number; userId: string };

// NUL byte can't appear in a cuid or an ISO date, so it's a collision-free
// separator. ONE constant shared by the key builder and the invalidation prefix
// match — if they drift apart, in-flight loads survive user-scoped invalidation.
const KEY_SEP = "\0";
const keyOf = (userId: string, todayISO: string): string => `${userId}${KEY_SEP}${todayISO}`;

export type StatsCache = {
  get(userId: string, todayISO: string): Promise<Stats>;
  /** Drop everything (the conservative fallback when a write's owner is unknown). */
  invalidate(): void;
  /** Drop only one user's entries (every cached day for that user). */
  invalidateUser(userId: string): void;
  /** Number of resolved entries currently held (diagnostics/tests). */
  size(): number;
  /** Number of per-user generation entries currently held (diagnostics/tests). */
  genCount(): number;
};

export function createStatsCache(opts: StatsCacheOptions = {}): StatsCache {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const max = opts.max ?? DEFAULT_MAX;
  const load = opts.load ?? gatherStats;
  const now = opts.now ?? Date.now;

  // Resolved values. Map preserves insertion order, so the first key is the
  // least-recently-used; a cache hit re-inserts to mark it most-recently-used.
  const fresh = new Map<string, Entry>();
  // De-dupes concurrent loads for the same key into a single underlying compute.
  const inflight = new Map<string, Promise<Stats>>();
  // Generation counters guard against a write landing mid-read: a load captures
  // the generations at start and only writes to `fresh` if neither changed by the
  // time it resolves — so pre-write data can never be cached for the next reader.
  //   • `allGen` bumps on a full invalidation (owner unknown → nuke everything).
  //   • `userGen` bumps per-userId on a scoped invalidation, so invalidating ONE
  //     user never blocks an unrelated user's in-flight load from caching.
  // A gen entry only matters while a load that captured it is still running, so
  // entries are pruned once a user has no loads in flight — the map is bounded
  // by CONCURRENT loads, never by lifetime user count.
  let allGen = 0;
  const userGen = new Map<string, number>();
  const genOf = (userId: string): number => userGen.get(userId) ?? 0;
  // Running loads per user (decremented in the load's `finally`). This — not the
  // `inflight` map — decides when pruning a gen is safe: `dropUser` removes the
  // inflight entry while the underlying load (holding a captured gen) still runs,
  // and resetting its gen to 0 mid-run could let pre-write data cache.
  const loadsInFlight = new Map<string, number>();

  function evictIfNeeded(): void {
    while (fresh.size > max) {
      const oldest = fresh.keys().next().value;
      if (oldest === undefined) break;
      fresh.delete(oldest);
    }
  }

  async function get(userId: string, todayISO: string): Promise<Stats> {
    const key = keyOf(userId, todayISO);

    const hit = fresh.get(key);
    if (hit) {
      if (hit.expires > now()) {
        fresh.delete(key); // re-insert → most-recently-used
        fresh.set(key, hit);
        return hit.value;
      }
      fresh.delete(key); // expired
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const startAllGen = allGen;
    const startUserGen = genOf(userId);
    loadsInFlight.set(userId, (loadsInFlight.get(userId) ?? 0) + 1);
    // Holder lets the load's `finally` self-reference its own promise (to avoid
    // clobbering a newer in-flight entry) without a use-before-assigned error.
    const holder: { p?: Promise<Stats> } = {};
    holder.p = (async () => {
      try {
        const value = await load(userId, todayISO);
        if (allGen === startAllGen && genOf(userId) === startUserGen) {
          // No invalidation touching this user occurred during the load → cache.
          fresh.set(key, { value, expires: now() + ttlMs, userId });
          evictIfNeeded();
        }
        return value;
      } finally {
        if (inflight.get(key) === holder.p) inflight.delete(key);
        const left = (loadsInFlight.get(userId) ?? 1) - 1;
        if (left <= 0) {
          // No load holds a captured gen for this user anymore → the gen entry
          // is dead weight; prune it so `userGen` never grows one-per-user.
          loadsInFlight.delete(userId);
          userGen.delete(userId);
        } else {
          loadsInFlight.set(userId, left);
        }
      }
    })();
    inflight.set(key, holder.p);
    return holder.p;
  }

  // Drop every fresh entry and in-flight load belonging to `userId`. In-flight
  // refs are dropped so the next reader starts a fresh load against post-write
  // data instead of joining one that began before the write.
  function dropUser(userId: string): void {
    for (const [k, entry] of fresh) if (entry.userId === userId) fresh.delete(k);
    for (const k of inflight.keys()) if (k.startsWith(userId + KEY_SEP)) inflight.delete(k);
  }

  function invalidate(): void {
    allGen++;
    fresh.clear();
    inflight.clear();
    // Every in-flight load is already blocked from caching by the allGen bump,
    // so the per-user gens carry no information anymore — drop them.
    userGen.clear();
  }

  function invalidateUser(userId: string): void {
    // The gen exists only to stop an in-flight load from caching pre-write data;
    // with none running there's nothing to guard — don't grow the map for a
    // user who may never load again.
    if (loadsInFlight.has(userId)) userGen.set(userId, genOf(userId) + 1);
    dropUser(userId);
  }

  return { get, invalidate, invalidateUser, size: () => fresh.size, genCount: () => userGen.size };
}

// ---- Process-wide default instance ------------------------------------------

// In dev, Next.js hot reloads re-evaluate this module while the Prisma client —
// whose extension calls the invalidation helpers below — survives on globalThis
// (see db.ts). Persist the cache the same way, so the surviving client's
// invalidations and the new module's readers hit the SAME instance; otherwise a
// write would clear a dead cache while reads serve stale data from the new one
// until the TTL backstop.
const globalForStats = globalThis as unknown as { statsCache?: StatsCache };

const statsCache = globalForStats.statsCache ?? createStatsCache();

if (process.env.NODE_ENV !== "production") globalForStats.statsCache = statsCache;

/** Cached analytics for a user as-of `todayISO` (drop-in for `gatherStats`). */
export function getStatsCached(userId: string, todayISO: string): Promise<Stats> {
  return statsCache.get(userId, todayISO);
}

/**
 * Clear the whole stats cache. The conservative fallback used by db.ts when a
 * stats-relevant write doesn't cheaply reveal its owner (e.g. a Topic/StudyBlock
 * update keyed only by row id, or a course update by id). Strictly correct — it
 * can never serve stale data — but it also evicts unrelated users, so we prefer
 * the scoped `invalidateUserStats` whenever the writer's userId is in the args.
 */
export function invalidateAllStats(): void {
  statsCache.invalidate();
}

/**
 * Clear just one user's cached analytics (every cached day for them). Called from
 * db.ts when a stats-relevant write carries its owner's userId in the args, so an
 * unrelated user's still-fresh cache survives the mutation.
 */
export function invalidateUserStats(userId: string): void {
  statsCache.invalidateUser(userId);
}

/** Models whose writes change analytics output and must invalidate the cache. */
export const STATS_RELEVANT_MODELS: ReadonlySet<string> = new Set([
  "Course",
  "Topic",
  "StudyBlock",
]);

/** Prisma operations that mutate data (vs. reads), used to gate invalidation. */
export const WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

/**
 * True when a Prisma op should invalidate the stats cache: a write to a
 * stats-relevant model. Pure (no DB), so db.ts's invalidation wiring is unit-
 * testable without a database connection.
 */
export function shouldInvalidateStats(model: string | undefined, operation: string): boolean {
  return model !== undefined && STATS_RELEVANT_MODELS.has(model) && WRITE_OPERATIONS.has(operation);
}

/** Pull a `userId` string off a Prisma `data`/`where`/`create`/`update` clause, if present. */
function userIdFromClause(clause: unknown): string | undefined {
  if (clause == null || typeof clause !== "object") return undefined;
  // `createMany` passes an array of rows — only scope when they all share one owner.
  if (Array.isArray(clause)) {
    let only: string | undefined;
    for (const row of clause) {
      const id = userIdFromClause(row);
      if (id === undefined) return undefined; // a row without userId → can't scope
      if (only === undefined) only = id;
      else if (only !== id) return undefined; // mixed owners → can't scope
    }
    return only;
  }
  const id = (clause as { userId?: unknown }).userId;
  return typeof id === "string" ? id : undefined;
}

/**
 * Best-effort owner of a stats-relevant write, read straight from the Prisma args
 * (no DB round-trip — so it stays cheap on the hot write path). Returns the
 * `userId` only when it's unambiguously present in `data`/`where`/`create`/
 * `update`; otherwise `undefined`, signalling db.ts to fall back to a full clear.
 *
 * This covers the common ownership-scoped course mutations — `course.create`
 * (data.userId) and the `updateMany`/`deleteMany({ where: { id, userId } })`
 * paths in ownership.ts — so those no longer evict every other user. Writes keyed
 * only by row id (a topic toggle, a logged StudyBlock) carry no userId and stay
 * on the safe full-clear path.
 */
export function statsWriteOwner(
  model: string | undefined,
  operation: string,
  args: unknown,
): string | undefined {
  if (!shouldInvalidateStats(model, operation)) return undefined;
  if (args == null || typeof args !== "object") return undefined;
  const a = args as { data?: unknown; where?: unknown; create?: unknown; update?: unknown };
  return (
    userIdFromClause(a.data) ??
    userIdFromClause(a.where) ??
    // upsert splits its payload across `create`/`update` rather than `data`.
    userIdFromClause(a.create) ??
    userIdFromClause(a.update)
  );
}
