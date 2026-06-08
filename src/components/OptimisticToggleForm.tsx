"use client";

import { useOptimistic, useRef, type ComponentProps, type ReactNode } from "react";
import { useToast } from "./Toast";
import { isNextControlFlow } from "./ToastForm";

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
  // Guard against a double-fire if React replays the action.
  const inFlight = useRef(false);

  async function wrapped(formData: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    const next = !optimisticDone;
    setOptimisticDone(next); // flip instantly — feels like a native tap
    try {
      await action(formData);
      toast(next ? doneMessage : undoneMessage, "success");
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
