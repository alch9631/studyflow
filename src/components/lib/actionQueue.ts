/**
 * Offline action queue for StudyFlow's optimistic done-toggles.
 *
 * When a toggle (mark a Today session / a course topic done) fires while the
 * browser is offline, its server action rejects. Rather than drop the change we
 * stash a small "replay" thunk here and re-run it once connectivity returns.
 *
 * The replay trigger is the universally-supported `online` window event. The
 * thunks we replay are in-page server-action closures, which a Service Worker
 * can't drive, so the Background Sync API isn't applicable here — the `online`
 * fallback works in every browser. (Closures live in memory only, so a full
 * page reload while offline clears the queue; persisting them would need a
 * dedicated HTTP endpoint, which is out of scope for this presentation layer.)
 *
 * Toggles are *flips*, not idempotent writes, so duplicates for one target are
 * collapsed by **parity**: tapping the same row twice offline cancels out (no
 * queued work, no double-submit on reconnect); an odd number of taps leaves
 * exactly one flip to replay. Each target is keyed independently.
 */

export type ReplayTask = () => void | Promise<void>;

type QueuedToggle = { key: string; replay: ReplayTask };

const queue: QueuedToggle[] = [];
let draining = false;
let onReplayError: ((key: string, error: unknown) => void) | null = null;
const listeners = new Set<(count: number) => void>();

function notify() {
  for (const fn of listeners) fn(queue.length);
}

// Connectivity probe — overridable in tests, where there's no real navigator.
const defaultProbe = () =>
  typeof navigator === "undefined" ? true : navigator.onLine !== false;
let onlineProbe: () => boolean = defaultProbe;

/** Test seam: swap the connectivity probe (pass `null` to restore the default). */
export function __setConnectivityProbe(fn: (() => boolean) | null): void {
  onlineProbe = fn ?? defaultProbe;
}

function isOffline(): boolean {
  return !onlineProbe();
}

/** Build a stable, order-independent key from a toggle form's fields. */
export function toggleKey(formData: FormData): string {
  const parts: string[] = [];
  for (const [name, value] of formData.entries()) {
    parts.push(`${name}=${typeof value === "string" ? value : "(file)"}`);
  }
  return parts.sort().join("&");
}

/**
 * Queue (or cancel) a toggle replay for `key`. Returns whether a replay is now
 * pending for that key: `true` if this call queued one, `false` if it canceled
 * a previously-queued flip (the two flips cancel — parity).
 */
export function queueToggle(key: string, replay: ReplayTask): boolean {
  const idx = queue.findIndex((t) => t.key === key);
  if (idx >= 0) {
    queue.splice(idx, 1);
    notify();
    return false;
  }
  queue.push({ key, replay });
  notify();
  return true;
}

export function pendingCount(): number {
  return queue.length;
}

export function hasPending(key: string): boolean {
  return queue.some((t) => t.key === key);
}

/** Reset the queue (used by tests). */
export function clearQueue(): void {
  queue.length = 0;
  draining = false;
  notify();
}

/** Register the handler that surfaces a toast when a replay genuinely fails. */
export function setReplayErrorHandler(
  handler: ((key: string, error: unknown) => void) | null,
): void {
  onReplayError = handler;
}

/** Subscribe to queue-size changes; returns an unsubscribe fn. */
export function subscribe(listener: (count: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Replay queued toggles in FIFO order. Re-entrant calls are ignored — a single
 * drain runs at a time, so a reconnect storm can't double-submit. A replay that
 * throws because we've gone offline again is put back and the drain stops; any
 * other error is surfaced via {@link setReplayErrorHandler} and the item is
 * dropped (its optimistic state has already rolled back to server truth).
 */
export async function flushQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      notify();
      try {
        await item.replay();
      } catch (error) {
        if (isOffline()) {
          queue.unshift(item); // still offline — keep it for next reconnect
          notify();
          return;
        }
        onReplayError?.(item.key, error);
      }
    }
  } finally {
    draining = false;
  }
}

let boundHandler: (() => void) | null = null;

/**
 * Wire {@link flushQueue} to the browser coming back `online`, and flush once
 * now if we're already online with pending work. Idempotent; returns a cleanup
 * fn. A no-op (returns a no-op cleanup) outside the browser.
 */
export function startAutoReplay(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!boundHandler) {
    boundHandler = () => void flushQueue();
    window.addEventListener("online", boundHandler);
  }
  if (onlineProbe() && queue.length > 0) void flushQueue();
  return () => {
    if (boundHandler) {
      window.removeEventListener("online", boundHandler);
      boundHandler = null;
    }
  };
}
