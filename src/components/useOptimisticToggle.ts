"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useToast } from "./Toast";
import { useT } from "./i18n/I18nProvider";
import { isNextControlFlow } from "./ToastForm";
import { haptics } from "./haptics";
import {
  fieldsToFormData,
  formDataToFields,
  hasPending,
  queueToggle,
  registerReplayAction,
  subscribe as subscribeQueue,
  subscribeReplayFailures,
  toggleKey,
} from "./lib/actionQueue";

/** Grace window (ms) during which the success toast offers an Undo. */
export const UNDO_GRACE_MS = 5000;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

type ServerAction = (formData: FormData) => void | Promise<void>;

export type UseOptimisticToggleArgs = {
  /** The boolean toggle server action (mark a session/topic done). */
  action: ServerAction;
  /**
   * Stable id for `action`, used to rebuild a queued offline toggle's replay
   * after a page reload (the closure itself can't be persisted).
   */
  actionId: string;
  /** Server truth for the toggled flag. The optimistic copy tracks this. */
  done: boolean;
  /** Green toast shown when the toggle lands on done (true). */
  doneMessage: string;
  /** Green toast shown when the toggle lands on not-done (false). */
  undoneMessage: string;
  /** Red toast shown if the action throws a real error (localized default). */
  errorMessage?: string;
  /**
   * The toggle form's plain fields (e.g. `{ blockId, revalidate }`). When set,
   * a flip for this target still sitting in the offline queue when the row
   * mounts (queued, persisted, then restored across a reload — or queued
   * before navigating away and back while offline) is shown immediately
   * instead of silently rendering server truth. Without it a second tap would
   * parity-cancel the restored flip the user can't even see.
   */
  fields?: Record<string, string>;
};

/**
 * The shared brain behind StudyFlow's optimistic done-toggles (a Today study
 * block, a course topic). It owns the optimistic flag, the success/undo/error
 * toasts, light haptics, and the in-flight guard — so both the tap affordance
 * (a `<form action>` submit) and the swipe gesture drive identical behaviour.
 *
 * `useOptimistic` discards the optimistic value once the action settles: on
 * success the revalidated `done` prop matches (no flicker); on failure (or a
 * thrown error) it snaps back to server truth — automatic rollback — and a red
 * toast explains why. Next's `redirect()` / `notFound()` signals pass through.
 *
 * Returns the current optimistic value plus `fire(formData, next, withUndo)`:
 *   - `next`     — the target state (true = done). A no-op if already there.
 *   - `withUndo` — attach an "Undo" action to the success toast (the undo
 *                  re-fires to `!next` without its own Undo, avoiding a loop).
 */
export function useOptimisticToggle({
  action,
  actionId,
  done,
  doneMessage,
  undoneMessage,
  errorMessage,
  fields,
}: UseOptimisticToggleArgs) {
  const { toast } = useToast();
  const t = useT();
  // Register the live action so a toggle persisted+restored across a reload has
  // something to replay against once this row mounts.
  useEffect(() => {
    registerReplayAction(actionId, action);
  }, [actionId, action]);
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [, startTransition] = useTransition();
  // While offline, the server `done` prop can't update, so `useOptimistic`
  // would snap the row back to server truth the moment the failed transition
  // settles. This sticky override keeps the queued state visible until the
  // replay lands. We tag it with the server value it was based on, so it
  // auto-expires (becomes inert) as soon as a revalidation moves `done` — no
  // effect/cleanup needed, and a later genuine server change still wins.
  const [override, setOverride] = useState<{ value: boolean; base: boolean } | null>(
    null,
  );
  // The queue key of this row's pending offline flip (if any) — lets us react
  // when its replay later fails for real.
  const [queuedKey, setQueuedKey] = useState<string | null>(null);

  // A flip for this target may already sit in the offline queue when this row
  // renders (queued, persisted, then restored across a reload — before this
  // row's own override state existed). Read it live from the queue store:
  // otherwise the row renders server truth, the queued change is invisible,
  // and a well-meaning second tap parity-cancels it while the toast still
  // claims it was saved. The server snapshot is `false` (SSR can't see the
  // queue), so hydration stays clean and the flip appears right after mount.
  const pendingKey = fields ? toggleKey(fieldsToFormData(fields)) : null;
  const hasQueuedFlip = useSyncExternalStore(
    subscribeQueue,
    () => (pendingKey ? hasPending(pendingKey) : false),
    () => false,
  );

  const effectiveDone =
    override && override.base === done
      ? override.value
      : hasQueuedFlip
        ? !done
        : optimisticDone;
  // Guard against a double-fire (a fast double-tap, or a swipe + the click it
  // would otherwise synthesise).
  const inFlight = useRef(false);

  // If the queued flip's replay genuinely fails on reconnect, drop the sticky
  // override so the row rolls back to server truth (OfflineQueueSync surfaces
  // the error toast) — otherwise the row keeps showing a change that never
  // saved until the next reload.
  useEffect(() => {
    const watchKey = queuedKey ?? pendingKey;
    if (!watchKey) return;
    return subscribeReplayFailures((key) => {
      if (key !== watchKey) return;
      setOverride(null);
      setQueuedKey(null);
    });
  }, [queuedKey, pendingKey]);

  // Latest-render `fire` for the success toast's Undo: the toast's click
  // handler outlives the render that created it, and re-entering that stale
  // closure would trip the parity guard (its captured `effectiveDone` already
  // equals the undo target) — turning every Undo into a no-op.
  const fireRef = useRef(fire);
  useEffect(() => {
    fireRef.current = fire;
  });

  // A hoisted declaration (not useCallback) so the success toast's Undo can
  // re-enter `fire` (via fireRef) to reverse itself. It's only ever called
  // from event handlers, so a fresh identity per render is fine.
  function fire(formData: FormData, next: boolean, withUndo: boolean) {
    if (inFlight.current) return;
    // Already in the target state (e.g. swiping "complete" on a done row).
    if (next === effectiveDone) return;
    inFlight.current = true;
    startTransition(async () => {
      setOptimisticDone(next);
      haptics.tap();
      try {
        await action(formData);
        setOverride(null); // server round-trip succeeded — clear any override
        toast(
          next ? doneMessage : undoneMessage,
          "success",
          withUndo
            ? {
                duration: UNDO_GRACE_MS,
                action: {
                  label: t("common.undo"),
                  onClick: () => fireRef.current(formData, !next, false),
                },
              }
            : undefined,
        );
      } catch (err) {
        if (isNextControlFlow(err)) throw err; // redirect / notFound — not a failure
        if (isOffline()) {
          // Stash the flip and keep it visible; it replays on reconnect. A
          // second offline tap on the same row cancels it out (parity) — no
          // double-submit — so mirror that in the sticky override AND in the
          // toast: never claim a canceled flip was saved.
          const key = toggleKey(formData);
          const stillQueued = queueToggle(key, () => action(formData), {
            actionId,
            fields: formDataToFields(formData),
          });
          setOverride(stillQueued ? { value: next, base: done } : null);
          setQueuedKey(stillQueued ? key : null);
          toast(
            t(stillQueued ? "offlineSync.queued" : "offlineSync.queueCanceled"),
            "info",
          );
          return; // not a real failure — don't roll back / rethrow
        }
        toast(errorMessage ?? t("common.genericError"), "error"); // optimistic value rolls back automatically
        throw err;
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { optimisticDone: effectiveDone, fire };
}
