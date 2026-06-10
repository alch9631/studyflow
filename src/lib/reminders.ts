/**
 * Daily study-reminder trigger — the logic behind POST /api/reminders/run.
 *
 * A schedule (cron) hits the endpoint once a day; for every user who has a live
 * push subscription we look up today's planned study blocks and send a single
 * notification summarizing them ("N sessions, ~Xh planned"). Delivery rides on
 * the existing `sendPush` fan-out, so it inherits the same env gates: when VAPID
 * keys are unset nothing is delivered (the run reports `configured: false`) and
 * nothing throws.
 *
 * Two independent gates apply:
 *   - CRON_SECRET (checked at the route) authenticates the caller; unset = the
 *     trigger is disabled and the route is a clean no-op.
 *   - VAPID keys (checked inside `sendPush`) gate real delivery.
 *
 * Idempotent + safe to call repeatedly: it only ever reads the plan and emits a
 * notification. Re-running just re-notifies (push itself is not deduplicated by
 * the spec) — it never mutates plan/course/block data, so there is no state to
 * corrupt by calling it twice.
 *
 * The message builder is a pure function (tested in isolation); the runner takes
 * an injectable `PushSender` so tests exercise the real fan-out offline.
 */
import { prisma } from "./db";
import { sendPush, type PushPayload, type PushSender } from "./push";

/** A user's planned study load for a single day. */
export interface PlanSummary {
  /** Number of study/review blocks scheduled today. */
  sessions: number;
  /** Total planned minutes across those blocks. */
  minutes: number;
}

/** Roll a day's study blocks up into the counts the reminder message needs. */
export function summarizeBlocks(blocks: { minutes: number }[]): PlanSummary {
  let minutes = 0;
  for (const b of blocks) minutes += b.minutes;
  return { sessions: blocks.length, minutes };
}

/**
 * Render planned minutes as a compact "~Xh" string. Whole hours stay integer
 * (120 -> "~2h"), partial hours keep one decimal (90 -> "~1.5h"); sub-hour loads
 * fall back to minutes (45 -> "~45min") so the number never reads as "~0.8h".
 */
export function formatPlannedTime(minutes: number): string {
  if (minutes < 60) return `~${minutes}min`;
  const hours = minutes / 60;
  // Trim a trailing ".0" so 2.0 shows as "2", but keep 1.5 as "1.5".
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `~${label}h`;
}

/**
 * Build the reminder notification for a day's plan, or `null` when there is
 * nothing planned (so the caller skips silently rather than nagging "0 sessions").
 */
export function buildReminderPayload(summary: PlanSummary): PushPayload | null {
  if (summary.sessions <= 0 || summary.minutes <= 0) return null;
  const sessionLabel = summary.sessions === 1 ? "session" : "sessions";
  return {
    title: "Today's study plan",
    body: `${summary.sessions} ${sessionLabel}, ${formatPlannedTime(summary.minutes)} planned`,
    url: "/today",
  };
}

/** Outcome of a reminder run — JSON-friendly, never throws to the caller. */
export interface ReminderRunResult {
  /** false when VAPID keys are unset (delivery disabled); true otherwise. */
  configured: boolean;
  /** Distinct users that had at least one stored push subscription. */
  candidates: number;
  /** Users actually sent a reminder (had ≥1 planned session today). */
  notified: number;
  /** Users with subscriptions but nothing planned today (skipped, not sent). */
  skipped: number;
  /** Total subscription deliveries that succeeded across all users. */
  sent: number;
  /** Dead subscriptions (404/410) pruned during the run. */
  pruned: number;
  /**
   * Subscriptions skipped because they were bound to a stale VAPID key (created
   * while push was unconfigured, or before a key rotation). They await a
   * client-side re-sync rather than a delivery — see `subscriptionNeedsResync`.
   */
  stale: number;
}

/** UTC midnight-to-midnight window for an ISO date, matching the /today reads. */
function dayRange(todayISO: string): { start: Date; end: Date } {
  const start = new Date(todayISO + "T00:00:00Z");
  return { start, end: new Date(start.getTime() + 86400_000) };
}

/**
 * Send each subscribed user a push summarizing today's plan. Scoped per user via
 * `sendPush`, so one user's reminder can never reach another's devices. Users
 * with no planned sessions today are skipped (no empty notification).
 *
 * Returns a summary instead of throwing; a single user's delivery failure is
 * absorbed by `sendPush` and reflected in the counts, not propagated.
 */
export async function runDailyReminders(
  todayISO: string,
  sender?: PushSender,
): Promise<ReminderRunResult> {
  const { start, end } = dayRange(todayISO);

  // Distinct users with at least one subscription — the only candidates worth a
  // plan lookup. Avoids scanning users who could never receive a push.
  const subscribed = await prisma.pushSubscription.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });

  let configured = true;
  let notified = 0;
  let skipped = 0;
  let sent = 0;
  let pruned = 0;
  let stale = 0;

  for (const { userId } of subscribed) {
    const blocks = await prisma.studyBlock.findMany({
      where: { date: { gte: start, lt: end }, course: { userId } },
      select: { minutes: true },
    });
    const payload = buildReminderPayload(summarizeBlocks(blocks));
    if (!payload) {
      skipped++;
      continue;
    }
    const res = await sendPush(userId, payload, sender);
    configured = res.configured;
    sent += res.sent;
    pruned += res.pruned;
    stale += res.stale;
    // Count the user as notified when delivery is enabled (sends may still be 0
    // if every one of their endpoints was just pruned — the intent fired).
    if (res.configured) notified++;
    else skipped++;
  }

  return {
    configured,
    candidates: subscribed.length,
    notified,
    skipped,
    sent,
    pruned,
    stale,
  };
}

/**
 * Read the cron shared secret from env. Unset/blank means the trigger is
 * disabled (the route no-ops). Trimmed so trailing whitespace in a deploy var
 * can't silently break auth.
 */
export function getCronSecret(): string | null {
  return process.env.CRON_SECRET?.trim() || null;
}

/**
 * Constant-time-ish bearer check: the request's `Authorization: Bearer <token>`
 * must equal the configured secret. Returns false on any missing/!malformed
 * header. (Length-then-compare; secrets are short and server-side, so this is
 * not a timing-sensitive surface, but we avoid early-exit on the common path.)
 */
export function isAuthorizedCron(authHeader: string | null, secret: string): boolean {
  if (!authHeader) return false;
  const match = /^Bearer\s+(.+)$/.exec(authHeader.trim());
  if (!match) return false;
  const token = match[1].trim();
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
