"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import SwipeRow from "./SwipeRow";
import { useOptimisticToggle } from "./useOptimisticToggle";

/**
 * A boolean *toggle* server-action form (mark a session done, tick a topic) with
 * optimistic UI, success/undo/error toasts, and light haptics — all supplied by
 * {@link useOptimisticToggle}. It flips a client-side optimistic copy of `done`
 * the instant you tap, then awaits the server round-trip in the background;
 * `useOptimistic` rolls back automatically if the action fails.
 *
 * The checkbox/label markup stays in the calling page: pass a render function as
 * `children` and style it from the (optimistic) `done` value.
 *
 * Optional `swipe`: when set, the whole control becomes swipeable — swipe right
 * to complete, swipe left to reopen — reusing the exact same toggle + Undo toast
 * as the tap. Gestures are additive and degrade gracefully; the button keeps
 * working everywhere.
 */

type ServerAction = (formData: FormData) => void | Promise<void>;

export default function OptimisticToggleForm({
  action,
  actionId,
  done,
  doneMessage,
  undoneMessage,
  errorMessage = "Something went wrong — please try again.",
  swipe,
  children,
  className,
  ...formProps
}: Omit<ComponentProps<"form">, "action" | "children"> & {
  action: ServerAction;
  /** Stable id for `action`, so an offline toggle can replay after a reload. */
  actionId: string;
  /** Server truth for the toggled flag. The optimistic copy tracks this. */
  done: boolean;
  /** Green toast shown when the toggle lands on done (true). */
  doneMessage: string;
  /** Green toast shown when the toggle lands on not-done (false). */
  undoneMessage: string;
  /** Red toast shown if the action throws a real error. */
  errorMessage?: string;
  /** Enable swipe-to-complete / swipe-to-reopen with these panel labels. */
  swipe?: { completeLabel: string; reopenLabel: string };
  /** Renders the checkbox + label, given the current (optimistic) done state. */
  children: (done: boolean) => ReactNode;
}) {
  const { optimisticDone, fire } = useOptimisticToggle({
    action,
    actionId,
    done,
    doneMessage,
    undoneMessage,
    errorMessage,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const formData = () => new FormData(formRef.current ?? undefined);

  const body = children(optimisticDone);

  return (
    <form
      ref={formRef}
      action={(fd) => fire(fd, !optimisticDone, true)}
      className={swipe ? undefined : className}
      {...formProps}
    >
      {swipe ? (
        <SwipeRow
          contentClassName={className}
          right={
            optimisticDone
              ? undefined
              : {
                  label: swipe.completeLabel,
                  icon: "✓",
                  tone: "success",
                  onTrigger: () => fire(formData(), true, true),
                }
          }
          left={
            optimisticDone
              ? {
                  label: swipe.reopenLabel,
                  icon: "↩",
                  tone: "neutral",
                  onTrigger: () => fire(formData(), false, true),
                }
              : undefined
          }
        >
          {body}
        </SwipeRow>
      ) : (
        body
      )}
    </form>
  );
}
