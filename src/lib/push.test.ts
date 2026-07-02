/**
 * Unit/integration test for the env-gated web-push helper.
 *
 * Exercises the real `sendPush` + `getPushConfig` against an isolated throwaway
 * test DB, with the network delivery MOCKED (a fake `PushSender`) so no real push
 * is ever sent. Covers:
 *  - no-op when VAPID keys are unset (configured:false, nothing sent),
 *  - happy path delivers one payload per stored subscription,
 *  - a 410/404 from the Push service prunes that dead subscription,
 *  - a transient failure is counted but the subscription is kept,
 *  - a malformed error with no statusCode is kept (counted failed, never crashes),
 *  - a multi-subscription fan-out reports success/prune/fail in a single call,
 *  - sending is scoped to the owner (no cross-user delivery),
 *  - `getPushConfig` requires both keys and defaults the subject,
 *  - key rollover: a subscription registered while push was unconfigured (or
 *    against a rotated key) is skipped (counted `stale`, never sent, kept) until
 *    the client re-subscribes, and `subscriptionNeedsResync` /
 *    `isSubscriptionResyncNeeded` detect that state owner-scoped.
 *
 * Run: npx tsx src/lib/push.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import {
  sendPush,
  getPushConfig,
  isPushConfigured,
  getVapidPublicKey,
  subscriptionNeedsResync,
  isSubscriptionResyncNeeded,
  type PushSender,
  type PushTarget,
} from "./push";

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

/** Set the VAPID env so push is "configured" for a block of assertions. */
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

/** A fake sender that records calls and can be told to fail with a status code. */
function fakeSender(
  failFor: Record<string, number> = {},
): PushSender & { calls: Array<{ target: PushTarget; payload: string }> } {
  const calls: Array<{ target: PushTarget; payload: string }> = [];
  return {
    calls,
    async send(target, payload) {
      calls.push({ target, payload });
      const status = failFor[target.endpoint];
      if (status) {
        const err = new Error(`mock push failure ${status}`) as Error & { statusCode: number };
        err.statusCode = status;
        throw err;
      }
    },
  };
}

async function makeUser(email: string): Promise<string> {
  const u = await prisma.user.create({ data: { email, name: email } });
  return u.id;
}

async function addSub(userId: string, endpoint: string, vapidKey?: string | null) {
  await prisma.pushSubscription.create({
    data: {
      userId,
      endpoint,
      p256dh: "p256dh-" + endpoint,
      auth: "auth-" + endpoint,
      vapidKey: vapidKey === undefined ? null : vapidKey,
    },
  });
}

async function main() {
  // --- getPushConfig: requires BOTH keys, defaults the subject ---
  disablePush();
  check("getPushConfig is null when keys are unset", getPushConfig() === null);
  check("isPushConfigured is false when keys are unset", isPushConfigured() === false);

  process.env.VAPID_PUBLIC_KEY = "only-public";
  check("getPushConfig is null with only the public key", getPushConfig() === null);
  disablePush();

  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  const cfgNoSubject = getPushConfig();
  check("getPushConfig resolves when both keys present", cfgNoSubject !== null);
  check(
    "getPushConfig defaults subject to a mailto: when unset",
    cfgNoSubject?.subject.startsWith("mailto:") === true,
  );
  disablePush();

  // --- no-op when unconfigured: nothing sent, no throw ---
  const userId = await makeUser("owner@studyflow.local");
  await addSub(userId, "https://push.example/owner-1");
  {
    disablePush();
    const sender = fakeSender();
    const res = await sendPush(userId, { title: "Hi" }, sender);
    check("sendPush reports configured:false when keys unset", res.configured === false);
    check("sendPush sends nothing when unconfigured", res.sent === 0);
    check("unconfigured sendPush never calls the sender", sender.calls.length === 0);
  }

  // --- happy path: one delivery per subscription, payload is the JSON ---
  {
    enablePush();
    await addSub(userId, "https://push.example/owner-2");
    const sender = fakeSender();
    const res = await sendPush(userId, { title: "Study now", body: "Algebra", url: "/today" }, sender);
    check("sendPush configured:true when keys set", res.configured === true);
    check("sendPush delivers to all of the user's subscriptions", res.sent === 2);
    check("sendPush prunes nothing on success", res.pruned === 0);
    check("sendPush calls the sender once per subscription", sender.calls.length === 2);
    const payload = JSON.parse(sender.calls[0].payload) as { title: string; body: string; url: string };
    check("sendPush serializes the payload as JSON", payload.title === "Study now" && payload.url === "/today");
  }

  // --- pruning: a 410 Gone deletes that subscription, a 404 too ---
  {
    enablePush();
    const goneEndpoint = "https://push.example/owner-1";
    const sender = fakeSender({ [goneEndpoint]: 410 });
    const before = await prisma.pushSubscription.count({ where: { userId } });
    const res = await sendPush(userId, { title: "x" }, sender);
    check("sendPush prunes a 410 Gone subscription", res.pruned === 1);
    check("sendPush still counts the live deliveries", res.sent === before - 1);
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: goneEndpoint } });
    check("the 410 subscription is deleted from the store", stillThere === null);
  }

  // --- transient failure: counted as failed, NOT pruned ---
  {
    enablePush();
    const flaky = "https://push.example/owner-2";
    const sender = fakeSender({ [flaky]: 500 });
    const res = await sendPush(userId, { title: "y" }, sender);
    check("sendPush counts a 500 as failed", res.failed === 1);
    check("sendPush does NOT prune a transient failure", res.pruned === 0);
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: flaky } });
    check("the transiently-failed subscription is kept", stillThere !== null);
  }

  // --- 404 Not Found is also "gone": prunes the subscription like a 410 ---
  {
    enablePush();
    const u404 = await makeUser("gone404@studyflow.local");
    const dead = "https://push.example/dead-404";
    await addSub(u404, dead);
    const sender = fakeSender({ [dead]: 404 });
    const res = await sendPush(u404, { title: "x" }, sender);
    check("sendPush prunes a 404 Not Found subscription", res.pruned === 1);
    check("sendPush counts no live delivery when the only sub is 404", res.sent === 0);
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: dead } });
    check("the 404 subscription is deleted from the store", stillThere === null);
  }

  // --- malformed delivery error (no statusCode): kept, counted failed, no crash ---
  {
    enablePush();
    const uMalformed = await makeUser("malformed@studyflow.local");
    const weird = "https://push.example/weird";
    await addSub(uMalformed, weird);
    // A sender that throws a plain Error with NO statusCode (e.g. a malformed
    // endpoint, DNS failure, or a non-WebPushError thrown mid-send).
    const sender: PushSender & { calls: number } = {
      calls: 0,
      async send() {
        this.calls++;
        throw new Error("totally malformed, no statusCode here");
      },
    };
    const res = await sendPush(uMalformed, { title: "x" }, sender);
    check("sendPush treats a statusCode-less error as a transient failure", res.failed === 1);
    check("sendPush does NOT prune on an unknown (non-Gone) error", res.pruned === 0);
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: weird } });
    check("a malformed-error subscription is kept (not silently dropped)", stillThere !== null);
    check("the malformed send was attempted exactly once", sender.calls === 1);
  }

  // --- multi-subscription fan-out: success + prune + fail all in ONE call ---
  {
    enablePush();
    const fan = await makeUser("fanout@studyflow.local");
    const ok1 = "https://push.example/fan-ok-1";
    const ok2 = "https://push.example/fan-ok-2";
    const gone = "https://push.example/fan-gone";
    const flaky = "https://push.example/fan-flaky";
    await addSub(fan, ok1);
    await addSub(fan, ok2);
    await addSub(fan, gone);
    await addSub(fan, flaky);
    const sender = fakeSender({ [gone]: 410, [flaky]: 503 });
    const res = await sendPush(fan, { title: "fan", body: "out" }, sender);
    check("fan-out reaches every one of the user's subscriptions", sender.calls.length === 4);
    check("fan-out counts both healthy deliveries", res.sent === 2);
    check("fan-out prunes the one Gone subscription", res.pruned === 1);
    check("fan-out counts the one transient failure", res.failed === 1);
    const goneGone = await prisma.pushSubscription.findUnique({ where: { endpoint: gone } });
    check("only the Gone subscription is removed by the fan-out", goneGone === null);
    const flakyKept = await prisma.pushSubscription.findUnique({ where: { endpoint: flaky } });
    check("the transiently-failed subscription survives the fan-out", flakyKept !== null);
    const remaining = await prisma.pushSubscription.count({ where: { userId: fan } });
    check("fan-out leaves the 3 non-Gone subscriptions in place", remaining === 3);
  }

  // --- ownership: sending for one user never touches another's devices ---
  {
    enablePush();
    const otherId = await makeUser("other@studyflow.local");
    await addSub(otherId, "https://push.example/other-1");
    const sender = fakeSender();
    const res = await sendPush(otherId, { title: "z" }, sender);
    check("sendPush is scoped to the target user's subscriptions", res.sent === 1);
    check(
      "sendPush only contacts the target user's endpoint",
      sender.calls.length === 1 && sender.calls[0].target.endpoint === "https://push.example/other-1",
    );
  }

  // --- no subscriptions: configured but a clean empty result ---
  {
    enablePush();
    const emptyId = await makeUser("empty@studyflow.local");
    const sender = fakeSender();
    const res = await sendPush(emptyId, { title: "none" }, sender);
    check("sendPush on a user with no subscriptions sends nothing", res.sent === 0);
    check("sendPush with no subscriptions is still configured:true", res.configured === true);
    check("sendPush with no subscriptions reports no stale subs", res.stale === 0);
  }

  // --- getVapidPublicKey mirrors the configured key / null when unset ---
  {
    disablePush();
    check("getVapidPublicKey is null when keys unset", getVapidPublicKey() === null);
    enablePush();
    check(
      "getVapidPublicKey returns the configured public key",
      getVapidPublicKey() === "test-public-key",
    );
    disablePush();
  }

  // --- subscriptionNeedsResync: the pure key-rollover predicate ---
  {
    const KEY = "test-public-key";
    check(
      "needsResync is false when push is unconfigured (no key to resync to)",
      subscriptionNeedsResync("", null) === false &&
        subscriptionNeedsResync("old", null) === false,
    );
    check(
      "needsResync is false for a legacy/unknown (null) stored key",
      subscriptionNeedsResync(null, KEY) === false,
    );
    check(
      "needsResync is TRUE for a sub created while unconfigured (stored \"\")",
      subscriptionNeedsResync("", KEY) === true,
    );
    check(
      "needsResync is TRUE for a sub bound to a rotated (different) key",
      subscriptionNeedsResync("old-key", KEY) === true,
    );
    check(
      "needsResync is false when the stored key matches the current key",
      subscriptionNeedsResync(KEY, KEY) === false,
    );
  }

  // --- ROLLOVER: a sub registered while UNCONFIGURED is skipped (not sent, not
  //     pruned) once keys are added, until the client re-subscribes. ---
  {
    enablePush();
    const rollover = await makeUser("rollover@studyflow.local");
    const stale = "https://push.example/rollover-stale"; // created unconfigured -> ""
    const fresh = "https://push.example/rollover-fresh"; // bound to the live key
    await addSub(rollover, stale, ""); // the unconfigured-state subscription
    await addSub(rollover, fresh, "test-public-key");
    const sender = fakeSender();
    const res = await sendPush(rollover, { title: "rollover" }, sender);
    check("rollover: the stale (unconfigured-state) sub is reported", res.stale === 1);
    check("rollover: the fresh sub still gets delivered", res.sent === 1);
    check("rollover: a stale sub is NOT a transient failure", res.failed === 0);
    check(
      "rollover: the stale sub is never contacted (no guaranteed-reject send)",
      sender.calls.every((c) => c.target.endpoint !== stale),
    );
    check(
      "rollover: only the fresh sub is contacted",
      sender.calls.length === 1 && sender.calls[0].target.endpoint === fresh,
    );
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: stale } });
    check("rollover: the stale sub is KEPT (heals on re-subscribe, not dropped)", stillThere !== null);
  }

  // --- ROLLOVER healed: re-binding the sub to the live key makes it deliver. ---
  {
    enablePush();
    const healed = await makeUser("healed@studyflow.local");
    const ep = "https://push.example/healed-1";
    await addSub(healed, ep, ""); // started unconfigured
    // The client re-subscribes once push is configured: vapidKey -> live key.
    await prisma.pushSubscription.update({
      where: { endpoint: ep },
      data: { vapidKey: "test-public-key" },
    });
    const sender = fakeSender();
    const res = await sendPush(healed, { title: "healed" }, sender);
    check("rollover heal: a re-synced sub delivers normally", res.sent === 1 && res.stale === 0);
  }

  // --- ROLLOVER while still unconfigured: nothing is stale (can't resync yet). ---
  {
    disablePush();
    const pending = await makeUser("pending@studyflow.local");
    await addSub(pending, "https://push.example/pending-1", "");
    const sender = fakeSender();
    const res = await sendPush(pending, { title: "pending" }, sender);
    check("unconfigured: a \"\"-key sub is not yet stale (no key to resync to)", res.stale === 0);
    check("unconfigured: sendPush is still a clean configured:false no-op", res.configured === false);
  }

  // --- isSubscriptionResyncNeeded: owner-scoped DB-backed check ---
  {
    enablePush();
    const checker = await makeUser("checker@studyflow.local");
    const staleEp = "https://push.example/check-stale";
    const freshEp = "https://push.example/check-fresh";
    await addSub(checker, staleEp, ""); // created unconfigured
    await addSub(checker, freshEp, "test-public-key");
    check(
      "isSubscriptionResyncNeeded is true for the unconfigured-state sub",
      (await isSubscriptionResyncNeeded(checker, staleEp)) === true,
    );
    check(
      "isSubscriptionResyncNeeded is false for a current-key sub",
      (await isSubscriptionResyncNeeded(checker, freshEp)) === false,
    );
    // An endpoint the server has no row for is an orphan (e.g. a subscribe
    // whose save failed): report it as needing a resync so the client
    // re-subscribes + re-saves instead of claiming "reminders on" forever.
    check(
      "isSubscriptionResyncNeeded is TRUE for an unknown endpoint (orphan heals by re-saving)",
      (await isSubscriptionResyncNeeded(checker, "https://push.example/nope")) === true,
    );
    // Ownership: another user's row is invisible — the endpoint reads exactly
    // like any unknown endpoint (needs resync), so the check leaks nothing
    // about other users' subscriptions (stale or fresh).
    const intruder = await makeUser("intruder@studyflow.local");
    check(
      "isSubscriptionResyncNeeded treats another user's endpoint as unknown (no probe)",
      (await isSubscriptionResyncNeeded(intruder, staleEp)) === true,
    );
    disablePush();
    check(
      "isSubscriptionResyncNeeded is false when push is unconfigured",
      (await isSubscriptionResyncNeeded(checker, staleEp)) === false,
    );
  }

  disablePush();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
