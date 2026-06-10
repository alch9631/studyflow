/**
 * Web-push sending — env-gated, safe no-op when unconfigured.
 *
 * Sending real notifications needs VAPID keys (an application-server keypair the
 * Push API authenticates against). They live in env, NOT in the DB:
 *
 *   VAPID_PUBLIC_KEY   base64url public key (also exposed to the browser as
 *                      NEXT_PUBLIC_VAPID_PUBLIC_KEY so it can subscribe)
 *   VAPID_PRIVATE_KEY  base64url private key — server-only, never sent to a client
 *   VAPID_SUBJECT      a mailto: or https: contact URL (web-push spec requirement)
 *
 * When the keypair is unset the whole feature is a no-op: `getPushConfig()`
 * returns null, `sendPush` returns `{ configured: false }` without touching the
 * network or throwing, and the status endpoint reports "not configured". Storing
 * subscriptions (subscribe/unsubscribe routes) still works so a client can
 * register early; nothing is delivered until the keys are present.
 *
 * Key rollover: a browser subscription is cryptographically bound to the VAPID
 * public key it was created with, so a subscription registered while push was
 * unconfigured (or against an old key before a rotation) can never receive
 * pushes signed by the *current* key. We persist that key per subscription
 * (`vapidKey`) and expose `subscriptionNeedsResync` / `isSubscriptionResyncNeeded`
 * so the client can detect the rollover on load and re-subscribe; `sendPush`
 * skips such zombies instead of firing a guaranteed-reject delivery at them.
 *
 * The sender is injectable so route/helper tests can mock delivery (no real
 * network) — the default lazily loads the `web-push` lib only on the real path.
 */
import { prisma } from "./db";

/** The notification payload the service worker's `push` handler understands. */
export interface PushPayload {
  title: string;
  body?: string;
  /** Path opened on notification click (defaults to /today in the SW). */
  url?: string;
}

/** Resolved VAPID application-server credentials. */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** A single stored subscription, in the shape the Push API / web-push expects. */
export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Pluggable delivery seam. The default implementation talks to the real Push
 * service via `web-push`; tests inject a fake to assert behaviour offline.
 * A failed send should reject with an error carrying a numeric `statusCode`
 * (web-push's `WebPushError` does), so `sendPush` can prune dead subscriptions.
 */
export interface PushSender {
  send(target: PushTarget, payload: string, config: VapidConfig): Promise<void>;
}

/** Outcome of a `sendPush` fan-out — frontend-friendly, never throws to caller. */
export interface SendPushResult {
  /** false when VAPID keys are unset (feature disabled); true otherwise. */
  configured: boolean;
  /** Subscriptions that accepted the push. */
  sent: number;
  /** Subscriptions that failed for a transient/other reason (kept for retry). */
  failed: number;
  /** Dead subscriptions (404/410) deleted during this send. */
  pruned: number;
  /**
   * Subscriptions skipped because they were bound to a different VAPID key than
   * the one now configured (created while push was unconfigured, or pre-rotation).
   * Delivering to them would be rejected, so we don't even try — the client must
   * re-subscribe (see `subscriptionNeedsResync`). Kept in place, not pruned, so a
   * re-subscribe can refresh them rather than the user silently losing reminders.
   */
  stale: number;
}

/**
 * Resolve VAPID config from env. Returns null when either key is missing — the
 * signal that push is disabled and every caller should no-op. Read fresh each
 * call (env lookups are cheap) so config can change without a process restart in
 * tests. The subject falls back to a valid mailto: so a misconfigured-but-keyed
 * deploy still satisfies the web-push spec instead of throwing.
 */
export function getPushConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@studyflow.local";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/** True when VAPID keys are present and pushes can actually be delivered. */
export function isPushConfigured(): boolean {
  return getPushConfig() !== null;
}

/**
 * The currently-configured VAPID public key, or null when push is unconfigured.
 * This is the application-server key new browser subscriptions are bound to, and
 * the value we persist on each `PushSubscription.vapidKey` so a later key change
 * (or first-time setup) is detectable as a rollover.
 */
export function getVapidPublicKey(): string | null {
  return getPushConfig()?.publicKey ?? null;
}

/**
 * Decide whether a stored subscription must be re-synced (re-subscribed) by the
 * client because the key it was registered against no longer matches the deploy.
 *
 * Pure so it's trivially unit-testable. The rollover this guards against: a
 * subscription created while VAPID keys were unset (stored `""`) — or against an
 * old key before a rotation — can never receive pushes signed by the *current*
 * key, so the browser must create a fresh subscription.
 *
 *   - push unconfigured (`currentKey === null`) -> false: nothing to resync to.
 *   - `storedKey === null` (legacy/unknown, pre-dates the column) -> false: we
 *     have no evidence it's stale and won't disrupt a working subscription.
 *   - otherwise stale iff the stored key differs from the current one (covers
 *     both the unconfigured `""` case and a real key rotation).
 */
export function subscriptionNeedsResync(
  storedKey: string | null,
  currentKey: string | null,
): boolean {
  if (currentKey === null) return false;
  if (storedKey === null) return false;
  return storedKey !== currentKey;
}

/**
 * Does the current user's stored subscription for `endpoint` need a client-side
 * re-sync? Backs the re-validate-on-load check (POST /api/push/check). Scoped to
 * the owner so it can never probe another user's subscriptions; an unknown or
 * unowned endpoint is reported as not-stale (the normal subscribe flow handles
 * brand-new subscriptions).
 */
export async function isSubscriptionResyncNeeded(
  userId: string,
  endpoint: string,
): Promise<boolean> {
  const currentKey = getVapidPublicKey();
  if (currentKey === null) return false;
  const sub = await prisma.pushSubscription.findFirst({
    where: { endpoint, userId },
    select: { vapidKey: true },
  });
  return subscriptionNeedsResync(sub?.vapidKey ?? null, currentKey);
}

/** A dead-subscription HTTP status from the Push service — safe to prune. */
function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410;
}

/**
 * Default sender: delivers via the real `web-push` library. Imported lazily so
 * the dependency (and its native-ish crypto setup) is only touched when push is
 * actually configured and sending — never on the no-op path or in tests.
 */
const defaultSender: PushSender = {
  async send(target, payload, config) {
    const webpush = (await import("web-push")).default;
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: target.keys },
      payload,
    );
  },
};

/**
 * Send `payload` to every push subscription owned by `userId`, pruning any that
 * the Push service reports as gone (404/410). Scoped to the user's own rows, so
 * one user can never push to another's devices.
 *
 * Returns a summary instead of throwing: when push is unconfigured it reports
 * `configured: false` and does nothing; per-subscription failures are counted,
 * not propagated, so one dead endpoint can't abort the rest of the fan-out.
 */
export async function sendPush(
  userId: string,
  payload: PushPayload,
  sender: PushSender = defaultSender,
): Promise<SendPushResult> {
  const config = getPushConfig();
  if (!config) return { configured: false, sent: 0, failed: 0, pruned: 0, stale: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true, vapidKey: true },
  });
  if (subs.length === 0) return { configured: true, sent: 0, failed: 0, pruned: 0, stale: 0 };

  const json = JSON.stringify(payload);
  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;
  let stale = 0;

  // Fan out concurrently; isolate each send so one rejection can't sink the rest.
  await Promise.all(
    subs.map(async (s) => {
      // Skip subscriptions bound to a different VAPID key than the live one — a
      // guaranteed-reject send (key-rollover zombie). Counted, kept in place, and
      // healed when the client re-subscribes (refreshing `vapidKey`).
      if (subscriptionNeedsResync(s.vapidKey, config.publicKey)) {
        stale++;
        return;
      }
      try {
        await sender.send(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          config,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (isGoneStatus(status)) expiredIds.push(s.id);
        else failed++;
      }
    }),
  );

  let pruned = 0;
  if (expiredIds.length > 0) {
    const res = await prisma.pushSubscription.deleteMany({
      where: { id: { in: expiredIds } },
    });
    pruned = res.count;
  }

  return { configured: true, sent, failed, pruned, stale };
}
