"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useToast } from "./Toast";
import { isNextControlFlow } from "./ToastForm";
import { haptics } from "./haptics";
import { queueToggle, toggleKey } from "./lib/actionQueue";

/** Grace window (ms) during which the success toast offers an Undo. */
export const UNDO_GRACE_MS = 5000;

/** Toast shown when a toggle is stashed for replay because we're offline. */
const OFFLINE_QUEUED_MESSAGE =
  "Saved offline — we'll sync this when you're back online.";

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

type ServerAction = (formData: FormData) => void | Promise<void>;

export type UseOptimisticToggleArgs = {
  /** The boolean toggle server action (mark a session/topic done). */
  action: ServerAction;
  /** Server truth for the toggled flag. The optimistic copy tracks this. */
  done: boolean;
  /** Green toast shown when the toggle lands on done (true). */
  doneMessage: string;
  /** Green toast shown when the toggle lands on not-done (false). */
  undoneMessage: string;
  /** Red toast shown if the action throws a real error. */
  errorMessage?: string;
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
  done,
  doneMessage,
  undoneMessage,
  errorMessage = "Something went wrong — please try again.",
}: UseOptimisticToggleArgs) {
  const { toast } = useToast();
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
  const effectiveDone =
    override && override.base === done ? override.value : optimisticDone;
  // Guard against a double-fire (a fast double-tap, or a swipe + the click it
  // would otherwise synthesise).
  const inFlight = useRef(false);

  // A hoisted declaration (not useCallback) so the success toast's Undo can
  // re-enter `fire` to reverse itself. It's only ever called from event
  // handlers, so a fresh identity per render is fine.
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
                  label: "Undo",
                  onClick: () => fire(formData, !next, false),
                },
              }
            : undefined,
        );
      } catch (err) {
        if (isNextControlFlow(err)) throw err; // redirect / notFound — not a failure
        if (isOffline()) {
          // Stash the flip and keep it visible; it replays on reconnect. A
          // second offline tap on the same row cancels it out (parity) — no
          // double-submit — so mirror that in the sticky override.
          const stillQueued = queueToggle(toggleKey(formData), () =>
            action(formData),
          );
          setOverride(stillQueued ? { value: next, base: done } : null);
          toast(OFFLINE_QUEUED_MESSAGE, "info");
          return; // not a real failure — don't roll back / rethrow
        }
        toast(errorMessage, "error"); // optimistic value rolls back automatically
        throw err;
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { optimisticDone: effectiveDone, fire };
}
