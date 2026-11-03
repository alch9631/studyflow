import assert from "node:assert/strict";
import { MobileQueryCache, clearSessionCache, sessionCache } from "../../apps/mobile/src/query-cache";
import { api } from "../../apps/mobile/src/api";
import { startDemoSession, endDemoSession } from "../../apps/mobile/src/demo";
import { fullSwipeSide } from "../../apps/mobile/src/swipe-action";

let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); console.log(`  ✓ ${name}`); passed++; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function main() {
  await check("revisiting a fresh tab reuses its data and concurrent loads share one request", async () => {
    const cache = new MobileQueryCache(); const request = deferred<string>(); let calls = 0;
    const fetcher = () => { calls++; return request.promise; };
    const first = cache.load("today", fetcher); const second = cache.load("today", fetcher);
    assert.equal(first, second); request.resolve("plan"); await first;
    await cache.load("today", fetcher); assert.equal(calls, 1); assert.equal(cache.snapshot("today").data, "plan");
  });
  await check("stale revalidation and manual refresh keep cached content visible", async () => {
    let now = 1_000; const cache = new MobileQueryCache(() => now, 100);
    await cache.load("courses", async () => ["one"]); now += 101;
    const request = deferred<string[]>(); const refresh = cache.load("courses", () => request.promise);
    assert.deepEqual(cache.snapshot("courses").data, ["one"]); assert.equal(cache.snapshot("courses").loading, true);
    request.resolve(["one", "two"]); await refresh;
    await cache.load("courses", async () => ["three"], true);
    assert.deepEqual(cache.snapshot("courses").data, ["three"]);
  });
  await check("a failed refresh retains data and exposes an error, then permits retry", async () => {
    const cache = new MobileQueryCache(); await cache.load("today", async () => "saved");
    await assert.rejects(cache.load("today", async () => { throw new Error("Offline"); }, true));
    assert.equal(cache.snapshot("today").data, "saved"); assert.equal(cache.snapshot("today").error?.message, "Offline");
    assert.equal(cache.snapshot("today").loading, false);
    await cache.load("today", async () => "updated", true); assert.equal(cache.snapshot("today").error, null);
  });
  await check("calendar weeks and course identities cannot display each other's results", async () => {
    const cache = new MobileQueryCache(); await cache.load("calendar?week=2026-11-02", async () => "first week");
    assert.equal(cache.snapshot("calendar?week=2026-11-09").data, null);
    await cache.load("calendar?week=2026-11-09", async () => "second week");
    assert.equal(cache.snapshot("calendar?week=2026-11-02").data, "first week");
    await cache.load("courses/one", async () => "first course"); assert.equal(cache.snapshot("courses/two").data, null);
  });
  await check("a response started before a mutation cannot overwrite refreshed data", async () => {
    const cache = new MobileQueryCache(); const request = deferred<string>();
    const old = cache.load("today", () => request.promise); cache.invalidate();
    await cache.load("today", async () => "edited plan"); request.resolve("old plan"); await old;
    assert.equal(cache.snapshot("today").data, "edited plan");
  });
  await check("clearing a signed-out session prevents late requests from restoring its data", async () => {
    const cache = new MobileQueryCache(); const request = deferred<string>();
    const old = cache.load("today", () => request.promise); cache.clear(); request.resolve("private"); await old;
    assert.equal(cache.snapshot("today").data, null);
  });
  await check("server and session identities isolate cached account data", async () => {
    const first = sessionCache("https://one.test", "first"); await first.load("courses", async () => "private");
    assert.equal(sessionCache("https://one.test", "second").snapshot("courses").data, null);
    assert.equal(sessionCache("https://two.test", "first").snapshot("courses").data, null);
    clearSessionCache("https://one.test", "first");
    assert.notEqual(sessionCache("https://one.test", "first"), first);
  });
  await check("a day rollover refreshes Today even inside the freshness window", async () => {
    let now = new Date(2026, 10, 3, 23, 59, 59).getTime(); const cache = new MobileQueryCache(() => now);
    await cache.load("today", async () => "yesterday"); now += 2_000;
    await cache.load("today", async () => "today"); assert.equal(cache.snapshot("today").data, "today");
  });
  await check("bounded cache evicts old unobserved pages and retains mounted tab data", async () => {
    const cache = new MobileQueryCache(Date.now, 60_000, 2); const unmount = cache.subscribe("today", () => {});
    await cache.load("today", async () => "plan");
    await cache.load("courses/one", async () => "old"); await cache.load("courses/two", async () => "new");
    assert.equal(cache.snapshot("today").data, "plan"); assert.equal(cache.snapshot("courses/one").data, null); unmount();
  });
  await check("prefetch updates only its own screen while invalidation still notifies every tab", async () => {
    const cache = new MobileQueryCache(); let today = 0; let courses = 0;
    cache.subscribe("today", () => today++); cache.subscribe("courses", () => courses++);
    await cache.load("courses/one", async () => "prefetched detail");
    assert.equal(today, 0); assert.equal(courses, 0);
    await cache.load("courses", async () => ["one"]);
    assert.equal(today, 0); assert.equal(courses, 2);
    cache.invalidate(); assert.equal(today, 1); assert.equal(courses, 3);
    cache.clear(); assert.equal(today, 2); assert.equal(courses, 4);
  });
  await check("short swipes reveal actions and deliberate full swipes trigger the matching side", () => {
    assert.equal(fullSwipeSide(88, 360, true, true), null);
    assert.equal(fullSwipeSide(-150, 360, true, true), null);
    assert.equal(fullSwipeSide(234, 360, true, true), "leading");
    assert.equal(fullSwipeSide(-234, 360, true, true), "trailing");
    // A drag that returns below the threshold before release does not commit.
    assert.equal(fullSwipeSide(100, 360, true, true), null);
  });
  await check("full swipes require a laid-out row and an action on the swiped side", () => {
    assert.equal(fullSwipeSide(300, 0, true, true), null);
    assert.equal(fullSwipeSide(300, 360, false, true), null);
    assert.equal(fullSwipeSide(-300, 360, true, false), null);
    assert.equal(fullSwipeSide(150, 200, true, true), null);
    assert.equal(fullSwipeSide(160, 200, true, true), "leading");
  });
  await check("API mutations invalidate other tabs while failed edits preserve fresh data", async () => {
    const session = startDemoSession(); const cache = sessionCache(session.server, session.token); let reads = 0;
    const read = () => { reads++; return api(session.server, session.token, "courses"); };
    await cache.load("courses", read);
    await assert.rejects(api(session.server, session.token, "actions/deleteCourse", { method: "POST", body: { fields: { courseId: "foreign" } } }));
    await cache.load("courses", read); assert.equal(reads, 1);
    await api(session.server, session.token, "actions/saveBlockNote", { method: "POST", body: { fields: { blockId: "demo-study", body: "Saved" } } });
    await cache.load("courses", read); assert.equal(reads, 2);
    clearSessionCache(session.server, session.token); endDemoSession(session.token);
  });
  console.log(`\n${passed} mobile cache checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
