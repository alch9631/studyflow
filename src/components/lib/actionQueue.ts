/**
 * Offline action queue for StudyFlow's optimistic done-toggles.
 *
 * When a toggle (mark a Today session / a course topic done) fires while the
 * browser is offline, its server action rejects. Rather than drop the change we
 * stash a small "replay" descriptor here and re-run it once connectivity
 * returns.
 *
 * The replay trigger is the universally-supported `online` window event. The
 * thunks we replay are in-page server-action closures, which a Service Worker
 * can't drive, so the Background Sync API isn't applicable here — the `online`
 * fallback works in every browser.
 *
 * Persistence: closures can't be serialised, so each queued toggle also carries
 * a *descriptor* — a stable `actionId` plus the toggle form's plain fields —
 * which we mirror to `localStorage`. On reload we {@link restoreQueue} those
 * descriptors and rebuild the replay from an {@link registerReplayAction action
 * registry} the toggle components populate on mount, so a page reload while
 * offline no longer loses queued work. (Pure-thunk entries with no descriptor —
 * used by tests — stay in memory only.)
 *
 * Toggles are *flips*, not idempotent writes, so duplicates for one target are
 * collapsed by **parity**: tapping the same row twice offline cancels out (no
 * queued work, no double-submit on reconnect); an odd number of taps leaves
 * exactly one flip to replay. Each target is keyed independently, which also
 * makes restore idempotent — a key already queued is never added twice.
 */

export type ReplayTask = () => void | Promise<void>;
export type ServerAction = (formData: FormData) => void | Promise<void>;

/** Serialisable shape of a queued toggle, persisted across reloads. */
export type ToggleDescriptor = {
  /** Stable id of the server action, looked up in the replay registry. */
  actionId: string;
  /** The toggle form's plain string fields (file inputs are dropped). */
  fields: Record<string, string>;
};

type QueuedToggle = {
  key: string;
  replay: ReplayTask;
  /** Present when the toggle can be persisted + restored across reloads. */
  descriptor?: ToggleDescriptor;
};

/** Minimal slice of the Web Storage API we depend on (test-overridable). */
type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const STORAGE_KEY = "studyflow.offlineQueue.v1";

const queue: QueuedToggle[] = [];
/**
 * Items lifted out of the in-memory queue but not yet terminal — mid-replay,
 * or deferred within a drain until their action registers. Kept in persisted
 * storage so a reload during an in-flight replay can't silently lose the
 * change; dropped only once the replay lands (or genuinely fails).
 */
let held: QueuedToggle[] = [];
let draining = false;
let onReplayError: ((key: string, error: unknown) => void) | null = null;
const listeners = new Set<(count: number) => void>();
/** Per-key replay-failure listeners (rows roll back their sticky override). */
const failureListeners = new Set<(key: string, error: unknown) => void>();
/** Per-key replay-success listeners (rows clear their sticky override). */
const successListeners = new Set<(key: string) => void>();
/** Maps a descriptor's `actionId` back to the live server action to replay. */
const actionRegistry = new Map<string, ServerAction>();

function notify() {
  persist();
  for (const fn of listeners) fn(queue.length);
}

// --- persistence ----------------------------------------------------------

const STORAGE_UNSET = Symbol("storage-unset");
let storageOverride: StorageLike | null | typeof STORAGE_UNSET = STORAGE_UNSET;

/** Test seam: swap (or disable with `null`) the backing storage. */
export function __setStorage(storage: StorageLike | null): void {
  storageOverride = storage;
}

function getStorage(): StorageLike | null {
  if (storageOverride !== STORAGE_UNSET) return storageOverride;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // access can throw in private-mode / sandboxed contexts
  }
}

/** Mirror the persistable entries to storage; best-effort (quota/disabled). */
function persist(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    // `held` items are mid-replay/deferred, not terminal — keep them stored.
    const entries = [...held, ...queue]
      .filter((t): t is QueuedToggle & { descriptor: ToggleDescriptor } =>
        t.descriptor !== undefined,
      )
      .map((t) => ({ key: t.key, ...t.descriptor }));
    if (entries.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or unavailable — replay still works for this session.
  }
}

/** Build a FormData from a descriptor's plain string fields. */
export function fieldsToFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [name, value] of Object.entries(fields)) fd.set(name, value);
  return fd;
}

/** Build a replay that resolves its action from the registry at flush time. */
function buildReplay(descriptor: ToggleDescriptor): ReplayTask {
  return () => {
    const action = actionRegistry.get(descriptor.actionId);
    // Guarded by flushQueue (which holds entries whose action isn't registered
    // yet), so this is only a defensive backstop.
    if (!action) return Promise.reject(new Error("replay action not registered"));
    return action(fieldsToFormData(descriptor.fields));
  };
}

/** Extract a toggle form's plain string fields (skipping any file inputs). */
export function formDataToFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

/**
 * Register the live server action a descriptor's `actionId` refers to. Toggle
 * components call this on mount so restored toggles have something to replay.
 * A fresh registration may unblock toggles restored before their page mounted,
 * so it kicks off a flush when we're online with pending work.
 */
export function registerReplayAction(id: string, action: ServerAction): void {
  actionRegistry.set(id, action);
  if (onlineProbe() && queue.length > 0) void flushQueue();
}

/**
 * Rehydrate the queue from storage (e.g. after a reload while offline). Entries
 * already queued under the same key are skipped, so this is idempotent.
 */
export function restoreQueue(): void {
  const storage = getStorage();
  if (!storage) return;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(STORAGE_KEY); // corrupt — drop it
    return;
  }
  if (!Array.isArray(parsed)) return;
  let changed = false;
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry.key !== "string" ||
      typeof entry.actionId !== "string" ||
      typeof entry.fields !== "object" ||
      entry.fields === null
    ) {
      continue;
    }
    if (queue.some((t) => t.key === entry.key) || held.some((t) => t.key === entry.key))
      continue; // dedupe (queued or mid-replay)
    const descriptor: ToggleDescriptor = {
      actionId: entry.actionId,
      fields: entry.fields as Record<string, string>,
    };
    queue.push({ key: entry.key, descriptor, replay: buildReplay(descriptor) });
    changed = true;
  }
  if (changed) notify();
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

/**
 * Build a stable, order-independent key from a toggle form's fields.
 *
 * The explicit target field ("done") is excluded: opposite flips of the same
 * row must share a key so they parity-cancel, and a restored descriptor
 * (which persists the field) must match a live row's key (computed without it).
 */
export function toggleKey(formData: FormData): string {
  const parts: string[] = [];
  for (const [name, value] of formData.entries()) {
    if (name === "done") continue;
    parts.push(`${name}=${typeof value === "string" ? value : "(file)"}`);
  }
  return parts.sort().join("&");
}

/**
 * Queue (or cancel) a toggle replay for `key`. Returns whether a replay is now
 * pending for that key: `true` if this call queued one, `false` if it canceled
 * a previously-queued flip (the two flips cancel — parity).
 *
 * Pass `descriptor` to make the toggle survive a reload; without it the replay
 * lives in memory only.
 */
export function queueToggle(
  key: string,
  replay: ReplayTask,
  descriptor?: ToggleDescriptor,
): boolean {
  const idx = queue.findIndex((t) => t.key === key);
  if (idx >= 0) {
    queue.splice(idx, 1);
    notify();
    return false;
  }
  queue.push({ key, replay, descriptor });
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
  held = [];
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
 * Subscribe to genuine replay failures (the item is dropped from the queue).
 * Unlike {@link setReplayErrorHandler} — the single global toast — this fans
 * out to every listener, so the toggle that queued the flip can roll its
 * sticky optimistic override back to server truth. Returns an unsubscribe fn.
 */
export function subscribeReplayFailures(
  listener: (key: string, error: unknown) => void,
): () => void {
  failureListeners.add(listener);
  return () => {
    failureListeners.delete(listener);
  };
}

/**
 * Subscribe to successful replays of queued toggles. Lets the optimistic layer
 * drop its sticky per-key override the moment the queued flip actually lands
 * (server truth revalidates right after), instead of holding the override
 * forever and having it reactivate whenever `done` later returns to its base.
 * Returns an unsubscribe fn.
 */
export function subscribeReplaySuccess(
  listener: (key: string) => void,
): () => void {
  successListeners.add(listener);
  return () => {
    successListeners.delete(listener);
  };
}

/**
 * Replay queued toggles in FIFO order. Re-entrant calls are ignored — a single
 * drain runs at a time, so a reconnect storm can't double-submit. A replay that
 * throws because we've gone offline again is put back and the drain stops; any
 * other error is surfaced via {@link setReplayErrorHandler} and the item is
 * dropped (its optimistic state has already rolled back to server truth).
 *
 * A restored toggle whose action hasn't registered yet (its page isn't mounted)
 * is held aside and re-queued, not failed — it replays once that page mounts
 * and {@link registerReplayAction registers} the action.
 */
export async function flushQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  const deferred: QueuedToggle[] = [];
  try {
    while (queue.length > 0) {
      const item = queue.shift()!;
      // The item leaves the in-memory queue but stays in persisted storage
      // (via `held`) until its replay lands — a reload during the in-flight
      // request must not silently lose the change.
      held.push(item);
      notify();
      if (item.descriptor && !actionRegistry.has(item.descriptor.actionId)) {
        deferred.push(item); // can't replay yet — keep for when it registers
        continue;
      }
      try {
        await item.replay();
        held = held.filter((t) => t !== item);
        persist(); // replay landed — now safe to drop it from storage
        for (const fn of successListeners) fn(item.key);
      } catch (error) {
        held = held.filter((t) => t !== item);
        if (isOffline()) {
          queue.unshift(item); // still offline — keep it for next reconnect
          notify();
          return;
        }
        persist(); // genuinely failed — dropped (listeners roll the UI back)
        onReplayError?.(item.key, error);
        for (const fn of failureListeners) fn(item.key, error);
      }
    }
  } finally {
    if (deferred.length > 0) {
      held = held.filter((t) => !deferred.includes(t));
      queue.unshift(...deferred);
      notify();
    }
    draining = false;
  }
  // Work queued or registered mid-drain hit the `draining` guard and would
  // otherwise stall until the next `online` event — run another drain now if
  // anything replayable is waiting. (Items whose action still isn't
  // registered don't count: re-flushing them would just loop the deferral.)
  if (
    onlineProbe() &&
    queue.some((t) => !t.descriptor || actionRegistry.has(t.descriptor.actionId))
  ) {
    void flushQueue();
  }
}

let boundHandler: (() => void) | null = null;

/**
 * Restore any persisted toggles, wire {@link flushQueue} to the browser coming
 * back `online`, and flush once now if we're already online with pending work.
 * Idempotent; returns a cleanup fn. A no-op (returns a no-op cleanup) outside
 * the browser.
 */
export function startAutoReplay(): () => void {
  if (typeof window === "undefined") return () => {};
  restoreQueue(); // bring back toggles persisted before a reload
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
