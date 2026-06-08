"use client";

import {
  useOptimistic,
  useRef,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useToast } from "./Toast";
import { isNextControlFlow } from "./ToastForm";

/** Grace window (ms) during which the success toast offers an Undo. */
const UNDO_GRACE_MS = 5000;

/**
 * Like {@link ToastForm}, but for a boolean *toggle* server action (mark a
 * session done, tick a topic). It flips a client-side optimistic copy of the
 * `done` flag the instant the form submits — so the checkbox and its label react
 * immediately — then awaits the server round-trip in the background.
 *
 * `useOptimistic` discards the optimistic value once the action settles: on
 * success the revalidated `done` prop matches, so nothing flickers; on failure
 * (or a thrown error) it snaps back to the server truth — automatic rollback —
 * and a red toast explains why. Next's `redirect()` / `notFound()` signals are
 * let through untouched, exactly as ToastForm handles them.
 *
 * The label/checkbox markup stays in the calling page: pass a render function
 * as `children` and style it from the supplied (optimistic) `done` value.
 *
 * After a successful toggle the green toast carries an "Undo" action for a short
 * grace window. Pressing it re-submits the same server action (which flips the
 * flag back), with the same optimistic flip + rollback — so an accidental tap is
 * one click to reverse instead of a hunt-and-re-toggle.
 */

type ServerAction = (formData: FormData) => void | Promise<void>;

export default function OptimisticToggleForm({
  action,
  done,
  doneMessage,
  undoneMessage,
  errorMessage = "Something went wrong — please try again.",
  children,
  ...formProps
}: Omit<ComponentProps<"form">, "action" | "children"> & {
  action: ServerAction;
  /** Server truth for the toggled flag. The optimistic copy tracks this. */
  done: boolean;
  /** Green toast shown when the toggle lands on done (true). */
  doneMessage: string;
  /** Green toast shown when the toggle lands on not-done (false). */
  undoneMessage: string;
  /** Red toast shown if the action throws a real error. */
  errorMessage?: string;
  /** Renders the checkbox + label, given the current (optimistic) done state. */
  children: (done: boolean) => ReactNode;
}) {
  const { toast } = useToast();
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [, startTransition] = useTransition();
  // Guard against a double-fire if React replays the action.
  const inFlight = useRef(false);

  // Re-runs the toggle to revert it. The server action flips the current value,
  // so resubmitting the same payload lands back on `revertTo`. Runs inside a
  // transition so the optimistic flip is valid; this toast carries no Undo,
  // avoiding an endless undo-of-undo.
  function undo(formData: FormData, revertTo: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    startTransition(async () => {
      setOptimisticDone(revertTo);
      try {
        await action(formData);
        toast(revertTo ? doneMessage : undoneMessage, "success");
      } catch (err) {
        if (isNextControlFlow(err)) throw err;
        toast(errorMessage, "error"); // optimistic value rolls back automatically
        throw err;
      } finally {
        inFlight.current = false;
      }
    });
  }

  async function wrapped(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = !optimisticDone;
    setOptimisticDone(next); // flip instantly — feels like a native tap
    try {
      await action(formData);
      toast(next ? doneMessage : undoneMessage, "success", {
        duration: UNDO_GRACE_MS,
        action: {
          label: "Undo",
          onClick: () => undo(formData, !next),
        },
      });
    } catch (err) {
      if (isNextControlFlow(err)) throw err; // redirect / notFound — not a failure
      toast(errorMessage, "error"); // optimistic value rolls back automatically
      throw err;
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <form action={wrapped} {...formProps}>
      {children(optimisticDone)}
    </form>
  );
}
