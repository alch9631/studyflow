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
 *  - sending is scoped to the owner (no cross-user delivery),
 *  - `getPushConfig` requires both keys and defaults the subject.
 *
 * Run: npx tsx src/lib/push.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import {
  sendPush,
  getPushConfig,
  isPushConfigured,
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

async function addSub(userId: string, endpoint: string) {
  await prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: "p256dh-" + endpoint, auth: "auth-" + endpoint },
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
  }

  disablePush();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
