/**
 * Tests for the daily study-reminder trigger.
 *
 * Two layers, both offline:
 *  - Pure message builder (summarizeBlocks / formatPlannedTime /
 *    buildReminderPayload) and the bearer-auth helpers — no DB, no network.
 *  - The real `runDailyReminders` fan-out and the real POST route handler,
 *    against an isolated throwaway test DB with delivery MOCKED (a fake
 *    PushSender), covering: no-op when VAPID unset, per-user scoping, skipping
 *    users with nothing planned, pruning a dead subscription, and the route's
 *    CRON_SECRET gate (disabled / 401 / authorized).
 *
 * Run: npx tsx src/lib/reminders.test.ts
 */
import "./testDb"; // MUST be first: points ./db at the test DB before it loads.
import { prisma } from "./db";
import {
  summarizeBlocks,
  formatPlannedTime,
  buildReminderPayload,
  runDailyReminders,
  getCronSecret,
  isAuthorizedCron,
} from "./reminders";
import { POST as runPOST } from "../app/api/reminders/run/route";
import type { PushSender, PushTarget } from "./push";

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

/** A fake sender that records every delivery and can fail a given endpoint. */
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

const TODAY = "2026-06-09";
const dayStart = (iso: string) => new Date(iso + "T12:00:00Z");

async function makeUser(email: string): Promise<string> {
  const u = await prisma.user.create({ data: { email, name: email } });
  return u.id;
}

async function addSub(userId: string, endpoint: string) {
  await prisma.pushSubscription.create({
    data: { userId, endpoint, p256dh: "p256dh-" + endpoint, auth: "auth-" + endpoint },
  });
}

let endpointSeq = 0;

/** Create a course + one study block for `userId` on `iso`. */
async function addBlock(userId: string, iso: string, minutes: number) {
  const course = await prisma.course.create({
    data: { name: "Course " + endpointSeq++, examDate: dayStart("2026-07-01"), userId },
  });
  await prisma.studyBlock.create({
    data: {
      date: dayStart(iso),
      topicTitle: "Topic",
      minutes,
      courseId: course.id,
      topicId: "t-" + endpointSeq,
    },
  });
}

function postReq(authHeader?: string): Request {
  return new Request("http://localhost/api/reminders/run", {
    method: "POST",
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

async function main() {
  // ---------- Pure message builder ----------
  check("summarizeBlocks sums minutes and counts sessions", (() => {
    const s = summarizeBlocks([{ minutes: 60 }, { minutes: 30 }, { minutes: 30 }]);
    return s.sessions === 3 && s.minutes === 120;
  })());
  check("summarizeBlocks of [] is zero", (() => {
    const s = summarizeBlocks([]);
    return s.sessions === 0 && s.minutes === 0;
  })());

  check("formatPlannedTime: whole hours have no decimal", formatPlannedTime(120) === "~2h");
  check("formatPlannedTime: partial hours keep one decimal", formatPlannedTime(90) === "~1.5h");
  check("formatPlannedTime: sub-hour falls back to minutes", formatPlannedTime(45) === "~45min");
  check("formatPlannedTime: exactly 60 is ~1h", formatPlannedTime(60) === "~1h");
  check("formatPlannedTime: 59min stays in minutes", formatPlannedTime(59) === "~59min");
  check("formatPlannedTime: just over an hour keeps one decimal", formatPlannedTime(61) === "~1.0h");
  check("formatPlannedTime: 150min is ~2.5h", formatPlannedTime(150) === "~2.5h");
  check("formatPlannedTime: a long day stays whole hours", formatPlannedTime(600) === "~10h");
  check("formatPlannedTime: 1 minute is ~1min", formatPlannedTime(1) === "~1min");

  check("buildReminderPayload pluralizes sessions", (() => {
    const p = buildReminderPayload({ sessions: 3, minutes: 120 });
    return p?.body === "3 sessions, ~2h planned" && p?.url === "/today";
  })());
  check("buildReminderPayload uses singular for one session", (() => {
    const p = buildReminderPayload({ sessions: 1, minutes: 45 });
    return p?.body === "1 session, ~45min planned";
  })());
  check(
    "buildReminderPayload returns null with no sessions (skip, no nag)",
    buildReminderPayload({ sessions: 0, minutes: 0 }) === null,
  );
  check(
    "buildReminderPayload returns null when minutes are zero",
    buildReminderPayload({ sessions: 2, minutes: 0 }) === null,
  );
  check("buildReminderPayload summarizes a heavy many-session day", (() => {
    // 8 blocks totalling 7.5h — exercises the plural + decimal-hours path together.
    const p = buildReminderPayload(summarizeBlocks(Array(8).fill({ minutes: 56 })));
    return p?.body === "8 sessions, ~7.5h planned" && p?.title === "Today's study plan";
  })());
  check("buildReminderPayload renders a whole-hour many-session day cleanly", (() => {
    const p = buildReminderPayload(summarizeBlocks(Array(6).fill({ minutes: 30 })));
    return p?.body === "6 sessions, ~3h planned";
  })());

  // ---------- Bearer-auth helpers ----------
  check("isAuthorizedCron accepts a matching Bearer token", isAuthorizedCron("Bearer s3cret", "s3cret"));
  check("isAuthorizedCron rejects a wrong token", !isAuthorizedCron("Bearer nope", "s3cret"));
  check("isAuthorizedCron rejects a missing header", !isAuthorizedCron(null, "s3cret"));
  check("isAuthorizedCron rejects a non-Bearer scheme", !isAuthorizedCron("Basic s3cret", "s3cret"));
  check("isAuthorizedCron tolerates surrounding whitespace", isAuthorizedCron("  Bearer  s3cret ", "s3cret"));

  delete process.env.CRON_SECRET;
  check("getCronSecret is null when CRON_SECRET unset", getCronSecret() === null);
  process.env.CRON_SECRET = "  topsecret  ";
  check("getCronSecret trims the configured secret", getCronSecret() === "topsecret");
  delete process.env.CRON_SECRET;

  // ---------- runDailyReminders: no-op when VAPID unset ----------
  {
    disablePush();
    const u = await makeUser("noconfig@studyflow.local");
    await addSub(u, "https://push.example/nc-1");
    await addBlock(u, TODAY, 120);
    const sender = fakeSender();
    const res = await runDailyReminders(TODAY, sender);
    check("run reports configured:false when VAPID unset", res.configured === false);
    check("run sends nothing when unconfigured", res.sent === 0 && sender.calls.length === 0);
  }

  // ---------- runDailyReminders: happy path + scoping + skip-empty ----------
  {
    enablePush();
    // user A: 2 sessions today (90 + 30 = 120 min), one subscription
    const a = await makeUser("alice@studyflow.local");
    await addSub(a, "https://push.example/a-1");
    await addBlock(a, TODAY, 90);
    await addBlock(a, TODAY, 30);
    // user B: a subscription but NOTHING planned today (only a future block)
    const b = await makeUser("bob@studyflow.local");
    await addSub(b, "https://push.example/b-1");
    await addBlock(b, "2026-06-20", 60);
    // user C: a plan today but NO subscription -> not a candidate
    const c = await makeUser("carol@studyflow.local");
    await addBlock(c, TODAY, 60);

    const sender = fakeSender();
    const res = await runDailyReminders(TODAY, sender);

    check("run only considers users with a subscription", res.candidates >= 2);
    check("run notifies the user who has a plan today (Alice)", res.notified >= 1);
    check("run delivers exactly one push to Alice's single subscription", res.sent >= 1);
    const aliceCall = sender.calls.find((c) => c.target.endpoint === "https://push.example/a-1");
    check("Alice's push summarizes today's plan", (() => {
      if (!aliceCall) return false;
      const p = JSON.parse(aliceCall.payload) as { body: string };
      return p.body === "2 sessions, ~2h planned";
    })());
    check(
      "Bob (no plan today) is skipped, not pushed",
      sender.calls.every((c) => c.target.endpoint !== "https://push.example/b-1"),
    );
    check(
      "Carol (no subscription) is never contacted",
      sender.calls.every((c) => !c.target.endpoint.includes("carol")),
    );
  }

  // ---------- runDailyReminders: prunes a dead (410) subscription ----------
  {
    enablePush();
    const d = await makeUser("dave@studyflow.local");
    const gone = "https://push.example/d-gone";
    await addSub(d, gone);
    await addBlock(d, TODAY, 120);
    const sender = fakeSender({ [gone]: 410 });
    const res = await runDailyReminders(TODAY, sender);
    check("run prunes a 410 Gone subscription", res.pruned >= 1);
    const stillThere = await prisma.pushSubscription.findUnique({ where: { endpoint: gone } });
    check("the dead subscription is deleted from the store", stillThere === null);
  }

  // ---------- Route: CRON_SECRET gate ----------
  {
    delete process.env.CRON_SECRET;
    const res = await runPOST(postReq("Bearer anything"));
    const body = (await res.json()) as { disabled?: boolean; ok?: boolean };
    check("route is a 200 no-op when CRON_SECRET is unset", res.status === 200);
    check("route reports disabled:true when unset", body.disabled === true);
  }
  {
    process.env.CRON_SECRET = "cron-secret-token";
    const res = await runPOST(postReq("Bearer wrong-token"));
    check("route returns 401 on a bad token", res.status === 401);
    const body = (await res.json()) as { error?: { code?: string } };
    check("route 401 uses the UNAUTHORIZED code", body.error?.code === "UNAUTHORIZED");
  }
  {
    process.env.CRON_SECRET = "cron-secret-token";
    const res = await runPOST(postReq("Bearer cron-secret-token"));
    check("route returns 200 with a valid token", res.status === 200);
    const body = (await res.json()) as { ok?: boolean; candidates?: number };
    check("route 200 carries the run summary", body.ok === true && typeof body.candidates === "number");
  }
  {
    process.env.CRON_SECRET = "cron-secret-token";
    const res = await runPOST(postReq());
    check("route returns 401 when the header is missing", res.status === 401);
  }

  delete process.env.CRON_SECRET;
  disablePush();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().then(() => process.exit(0));
