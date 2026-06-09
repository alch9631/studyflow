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
  if (!config) return { configured: false, sent: 0, failed: 0, pruned: 0 };

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (subs.length === 0) return { configured: true, sent: 0, failed: 0, pruned: 0 };

  const json = JSON.stringify(payload);
  const expiredIds: string[] = [];
  let sent = 0;
  let failed = 0;

  // Fan out concurrently; isolate each send so one rejection can't sink the rest.
  await Promise.all(
    subs.map(async (s) => {
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

  return { configured: true, sent, failed, pruned };
}
