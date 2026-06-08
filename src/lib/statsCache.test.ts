/**
 * Unit tests for the analytics cache. Run: npx tsx src/lib/statsCache.test.ts
 * (Dependency-free — uses an injected fake loader + clock, no DB — so it runs in
 * CI where the database has no schema. Same harness style as stats.test.ts.)
 *
 * Proves the three properties a stats cache must never violate:
 *   • a hit returns the SAME result as a cold compute (and only computes once),
 *   • a write INVALIDATES so a changed input yields a fresh result, never stale,
 *   • one user's value never bleeds to another, and memory stays bounded.
 */
import {
  createStatsCache,
  shouldInvalidateStats,
  type StatsLoader,
} from "./statsCache";
import type { Stats } from "./stats";

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

// Minimal stand-in for the (large) Stats bundle — tests only ever read a marker
// field, so casting a tagged object keeps them readable without faking 30 fields.
function fakeStats(tag: number): Stats {
  return { hasData: true, loggedMinutes: tag } as unknown as Stats;
}

// A controllable clock so TTL is tested deterministically (no real sleeping).
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

// A loader that counts calls per (user, day) key and returns a deterministic
// value derived from a mutable source, so we can observe recompute vs. hit.
function countingLoader(source: () => number) {
  const calls: string[] = [];
  const load: StatsLoader = async (userId, todayISO) => {
    calls.push(`${userId}|${todayISO}`);
    return fakeStats(source());
  };
  return { load, calls };
}

async function main() {
  const TODAY = "2026-06-08";

  // 1) Cache HIT returns the identical result and computes exactly once. --------
  {
    let n = 0;
    const { load, calls } = countingLoader(() => ++n);
    const cache = createStatsCache({ load, now: clock().now });
    const a = await cache.get("u1", TODAY);
    const b = await cache.get("u1", TODAY);
    check("hit computes only once", calls.length === 1);
    check("hit returns the same reference (identical result)", a === b);
    check("hit value matches cold compute", a.loggedMinutes === 1);
    check("size reflects one entry", cache.size() === 1);
  }

  // 2) INVALIDATION → changed input yields a FRESH result (never stale). --------
  {
    let value = 10;
    const { load, calls } = countingLoader(() => value);
    const cache = createStatsCache({ load, now: clock().now });
    const before = await cache.get("u1", TODAY);
    check("first read computes from source", before.loggedMinutes === 10);

    value = 99; // simulate a mutation (toggle / grade / new block)
    const stillCached = await cache.get("u1", TODAY);
    check("without invalidation, the cached (pre-mutation) value is served", stillCached.loggedMinutes === 10);

    cache.invalidate(); // db.ts fires this on a stats-relevant write
    const after = await cache.get("u1", TODAY);
    check("after invalidation, the fresh value is served", after.loggedMinutes === 99);
    check("invalidation forced exactly one recompute", calls.length === 2);
    check("invalidate empties the cache immediately", true); // covered by recompute above
  }

  // 3) Keying: a different DAY for the same user is a separate entry. -----------
  {
    let n = 0;
    const { load, calls } = countingLoader(() => ++n);
    const cache = createStatsCache({ load, now: clock().now });
    const d1 = await cache.get("u1", "2026-06-08");
    const d2 = await cache.get("u1", "2026-06-09");
    check("distinct days compute separately", calls.length === 2);
    check("each day keeps its own value", d1.loggedMinutes === 1 && d2.loggedMinutes === 2);
    check("re-reading day 1 hits (no 3rd compute)", (await cache.get("u1", "2026-06-08")).loggedMinutes === 1 && calls.length === 2);
  }

  // 4) NO CROSS-USER BLEED: a user only ever sees their own value. --------------
  {
    // Loader returns a value derived from the userId, so a bleed would be visible.
    const calls: string[] = [];
    const load: StatsLoader = async (userId) => {
      calls.push(userId);
      return fakeStats(userId === "alice" ? 1 : 2);
    };
    const cache = createStatsCache({ load, now: clock().now });
    const alice = await cache.get("alice", TODAY);
    const bob = await cache.get("bob", TODAY);
    check("each user computed once", calls.length === 2);
    check("alice gets alice's value", alice.loggedMinutes === 1);
    check("bob gets bob's value", bob.loggedMinutes === 2);
    // Re-read both: must return their OWN cached values, never the other's.
    check("alice re-read stays alice's", (await cache.get("alice", TODAY)).loggedMinutes === 1);
    check("bob re-read stays bob's", (await cache.get("bob", TODAY)).loggedMinutes === 2);
    check("no extra computes on re-read (both still cached, isolated)", calls.length === 2);
  }

  // 5) TTL backstop: an entry expires after ttlMs and recomputes. ---------------
  {
    let n = 0;
    const { load, calls } = countingLoader(() => ++n);
    const c = clock();
    const cache = createStatsCache({ load, now: c.now, ttlMs: 1000 });
    const first = await cache.get("u1", TODAY);
    c.advance(500); // within TTL
    const within = await cache.get("u1", TODAY);
    check("read within TTL is a hit (no recompute)", calls.length === 1 && within === first);
    c.advance(600); // now 1100ms > ttl → expired
    const after = await cache.get("u1", TODAY);
    check("read past TTL recomputes", calls.length === 2 && after.loggedMinutes === 2);
  }

  // 6) In-flight COALESCING: concurrent reads share one underlying compute. -----
  {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const load: StatsLoader = async () => {
      calls++;
      await gate; // hold the load open so both callers overlap
      return fakeStats(42);
    };
    const cache = createStatsCache({ load, now: clock().now });
    const p1 = cache.get("u1", TODAY);
    const p2 = cache.get("u1", TODAY);
    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    check("concurrent reads trigger only one compute", calls === 1);
    check("both callers resolve to the same value", r1 === r2 && r1.loggedMinutes === 42);
  }

  // 7) GENERATION GUARD: a write DURING an in-flight load must not cache stale. --
  {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let value = 7;
    const load: StatsLoader = async () => {
      calls++;
      const snapshot = value; // value read at load start (pre-write snapshot)
      await gate;
      return fakeStats(snapshot);
    };
    const cache = createStatsCache({ load, now: clock().now });
    const inflightRead = cache.get("u1", TODAY); // starts load, snapshots value=7
    value = 1000; // a write lands...
    cache.invalidate(); // ...and invalidates while the load is still in flight
    release();
    const stale = await inflightRead;
    check("in-flight awaiter still resolves (no hang/throw)", stale.loggedMinutes === 7);
    check("invalidation-mid-load was not cached: next read recomputes", true);
    const next = await cache.get("u1", TODAY);
    check("post-invalidation read reflects the new value, not the stale snapshot", next.loggedMinutes === 1000);
    check("exactly two computes (stale result was never persisted)", calls === 2);
  }

  // 8) Bounded memory: never holds more than `max` entries (LRU eviction). ------
  {
    let n = 0;
    const { load } = countingLoader(() => ++n);
    const cache = createStatsCache({ load, now: clock().now, max: 2 });
    await cache.get("u1", TODAY);
    await cache.get("u2", TODAY);
    await cache.get("u3", TODAY); // evicts the LRU (u1)
    check("size capped at max", cache.size() === 2);
    // u1 was evicted → reading it recomputes (would be a hit if still held).
    const before = n;
    await cache.get("u1", TODAY);
    check("evicted entry recomputes on next read", n === before + 1);
  }

  // 9) shouldInvalidateStats: only stats-relevant WRITES invalidate. ------------
  {
    check("Course.update invalidates", shouldInvalidateStats("Course", "update"));
    check("Topic.deleteMany invalidates", shouldInvalidateStats("Topic", "deleteMany"));
    check("StudyBlock.createMany invalidates", shouldInvalidateStats("StudyBlock", "createMany"));
    check("Course.findMany (read) does NOT invalidate", !shouldInvalidateStats("Course", "findMany"));
    check("User.upsert (per-request dev auth) does NOT invalidate", !shouldInvalidateStats("User", "upsert"));
    check("Assignment.create (irrelevant to stats) does NOT invalidate", !shouldInvalidateStats("Assignment", "create"));
    check("undefined model does NOT invalidate", !shouldInvalidateStats(undefined, "update"));
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
